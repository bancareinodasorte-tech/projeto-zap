const express=require('express');
const pino=require('pino');
const QRCode=require('qrcode');
const {default:makeWASocket,DisconnectReason,fetchLatestBaileysVersion,initAuthCreds,BufferJSON,proto,delay,Browsers}=require('@whiskeysockets/baileys');
const path=require('path');

const app=express();
app.use(express.json({limit:'6mb'}));
const PORT=process.env.PORT||3000;
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

function digits(v){return String(v||'').replace(/\D/g,'')}
function normalizeBR(v){let n=digits(v);if(n.startsWith('00'))n=n.slice(2);if(!n.startsWith('55')&&(n.length===10||n.length===11))n='55'+n;return n}
function validBR(v){return /^55\d{10,11}$/.test(normalizeBR(v))}
async function sb(pathname,opt={},service=true){const key=service?SUPABASE_SERVICE_ROLE_KEY:SUPABASE_ANON_KEY;if(!SUPABASE_URL||!key)throw Error('Supabase não configurado.');const r=await fetch(SUPABASE_URL+pathname,{...opt,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d;try{d=t?JSON.parse(t):null}catch{d=t}if(!r.ok)throw Error(d?.message||d?.details||`Supabase ${r.status}`);return d}

let sock=null,starting=false,connected=false,qrDataUrl='',connectedNumber='',lastError='',lastConnectionAt=null;
async function authRead(id){const rows=await sb(`/rest/v1/zap_auth?select=value&id=eq.${encodeURIComponent(id)}&limit=1`);const row=Array.isArray(rows)?rows[0]:null;return row?JSON.parse(JSON.stringify(row.value),BufferJSON.reviver):null}
async function authWrite(id,value){const safe=JSON.parse(JSON.stringify(value,BufferJSON.replacer));await sb('/rest/v1/zap_auth?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id,value:safe,updated_at:new Date().toISOString()})})}
async function authDelete(id){await sb(`/rest/v1/zap_auth?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'})}
async function authClearAll(){await sb('/rest/v1/zap_auth?id=not.is.null',{method:'DELETE'})}
async function authState(){const creds=(await authRead('creds'))||initAuthCreds();return{state:{creds,keys:{get:async(type,ids)=>{const data={};await Promise.all(ids.map(async id=>{let v=await authRead(`${type}-${id}`);if(type==='app-state-sync-key'&&v)v=proto.Message.AppStateSyncKeyData.fromObject(v);data[id]=v}));return data},set:async data=>{const jobs=[];for(const cat of Object.keys(data))for(const id of Object.keys(data[cat]))jobs.push(data[cat][id]?authWrite(`${cat}-${id}`,data[cat][id]):authDelete(`${cat}-${id}`));await Promise.all(jobs)}}},saveCreds:()=>authWrite('creds',creds)}}
async function closeSocket(target=sock){
  if(!target)return;
  try{target?.ws?.close?.()}catch{}
  if(sock===target){
    sock=null;
    connected=false;
    connectedNumber='';
  }
}
async function waitForSocket(ms=1800){
  const started=Date.now();
  while(Date.now()-started<ms){
    if(sock)return sock;
    await delay(100);
  }
  throw Error('Não foi possível iniciar a conexão do WhatsApp.');
}

const campaignJobs=new Map();
function markResponded(phone){const n=normalizeBR(phone);for(const job of campaignJobs.values()){const item=job.items.find(x=>x.phone===n&&['pending','sent'].includes(x.status));if(item){item.status='responded';item.respondedAt=new Date().toISOString();job.responded=(job.responded||0)+1}}}

let socketEpoch=0;
let reconnectTimer=null;
let pairingMode=null;

function clearReconnectTimer(){
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
}

function scheduleReconnect(ms=1200,reason='reconnect'){
  clearReconnectTimer();
  reconnectTimer=setTimeout(()=>{
    reconnectTimer=null;
    startWhatsApp(true,false,reason).catch(e=>{lastError=e.message});
  },ms);
}

async function startWhatsApp(force=false,resetAuth=false,reason='manual'){
  if(starting)return;
  if(sock&&!force)return;
  starting=true;
  lastError='';
  const myEpoch=++socketEpoch;
  try{
    clearReconnectTimer();
    const oldSock=sock;
    if(oldSock)await closeSocket(oldSock);

    // Limpa credenciais somente ANTES de iniciar uma sessão realmente nova.
    // Nunca limpa durante o restart 515 exigido pelo WhatsApp após o pareamento.
    if(resetAuth){
      await authClearAll();
      qrDataUrl='';
      connectedNumber='';
    }

    const {state,saveCreds}=await authState();
    const {version}=await fetchLatestBaileysVersion();
    const current=makeWASocket({
      version,
      auth:state,
      printQRInTerminal:false,
      logger:pino({level:'silent'}),
      // WEB_BROWSER: evita o fingerprint Desktop WIN32/DARWIN rejeitado pelo WA atual.
      browser:Browsers.ubuntu('Chrome'),
      markOnlineOnConnect:false,
      syncFullHistory:false,
      shouldSyncHistoryMessage:()=>false,
      generateHighQualityLinkPreview:false,
      connectTimeoutMs:60000,
      defaultQueryTimeoutMs:60000,
      keepAliveIntervalMs:20000,
      retryRequestDelayMs:250
    });
    sock=current;

    current.ev.on('creds.update',async()=>{
      try{await saveCreds()}catch(e){lastError=`Falha ao salvar sessão: ${e.message}`}
    });

    current.ev.on('connection.update',async u=>{
      if(myEpoch!==socketEpoch || sock!==current)return;
      const {connection,lastDisconnect,qr}=u;

      if(qr){
        qrDataUrl=await QRCode.toDataURL(qr,{margin:2,width:520});
        connected=false;
        lastError='';
      }

      if(connection==='open'){
        clearReconnectTimer();
        connected=true;
        pairingMode=null;
        qrDataUrl='';
        connectedNumber=digits(current.user?.id?.split(':')?.[0]||current.user?.id||'');
        lastConnectionAt=new Date().toISOString();
        lastError='';
        return;
      }

      if(connection==='close'){
        connected=false;
        const err=lastDisconnect?.error;
        const code=Number(err?.output?.statusCode||err?.statusCode||0);
        const message=String(err?.message||'Conexão encerrada.');
        const loggedOut=code===DisconnectReason.loggedOut || code===401;
        const restartRequired=code===515 || /restart required/i.test(message);
        const retryable=[408,428,440,500,503,515].includes(code) || restartRequired;

        // Crucial: o 515 depois do QR/código é parte do fluxo de pareamento.
        // As credenciais recém-salvas devem ser preservadas e reutilizadas.
        await closeSocket(current);

        if(loggedOut){
          pairingMode=null;
          qrDataUrl='';
          lastError='Sessão encerrada pelo WhatsApp. Gere um novo QR Code.';
          return;
        }

        if(restartRequired){
          lastError='Finalizando pareamento...';
          scheduleReconnect(900,'restart-515');
          return;
        }

        if(retryable){
          lastError=`Reconectando${code?` (${code})`:''}...`;
          scheduleReconnect(1800,`retry-${code||'network'}`);
          return;
        }

        lastError=message;
      }
    });

    current.ev.on('messages.upsert',async({messages,type})=>{
      if(type!=='notify')return;
      for(const m of messages||[]){
        if(!m?.message||m.key?.fromMe)continue;
        const remote=String(m.key?.remoteJid||'');
        if(remote.endsWith('@g.us')||remote==='status@broadcast')continue;
        markResponded(remote.split('@')[0]);
      }
    });
  }catch(e){
    lastError=e.message;
    const current=sock;
    if(current)await closeSocket(current);
    throw e;
  }finally{
    starting=false;
  }
}
async function sendText(to,text){if(!sock||!connected)throw Error('WhatsApp ainda não está conectado.');const n=normalizeBR(to);if(!validBR(n))throw Error('Telefone inválido. Use DDD + número.');const jid=`${n}@s.whatsapp.net`;const ex=await sock.onWhatsApp(jid);if(!ex?.length)throw Error('Número não encontrado no WhatsApp.');const target=ex[0].jid;const r=await sock.sendMessage(target,{text:String(text||'').trim()});return{id:r?.key?.id||null,to:n}}

app.get('/health',(req,res)=>res.json({ok:true,service:'projeto-zap-v5.4.2',connector:'baileys',connected,phoneIdRequired:false}));
app.get('/api/whatsapp/status',(req,res)=>res.json({ok:true,connector:'baileys',connected,starting,number:connectedNumber||null,qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null,lastError:lastError||null,lastConnectionAt}));
app.post('/api/whatsapp/connect',async(req,res)=>{
  try{
    if(connected)return res.json({ok:true,connected:true});
    pairingMode='qr';
    // Nova tentativa manual: limpa credenciais antigas uma única vez.
    await startWhatsApp(true,true,'new-qr');
    await waitForSocket(2500);
    const until=Date.now()+9000;
    while(!qrDataUrl && !connected && Date.now()<until)await delay(250);
    if(connected)return res.json({ok:true,connected:true});
    if(!qrDataUrl)return res.status(503).json({error:lastError||'QR Code ainda não foi gerado. Aguarde alguns segundos e tente novamente.'});
    res.json({ok:true,qrAvailable:true});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/whatsapp/pairing-code',async(req,res)=>{
  try{
    const phone=normalizeBR(req.body?.phone);
    if(!validBR(phone))return res.status(400).json({error:'Telefone inválido. Use DDD + número.'});
    if(connected)return res.json({ok:true,connected:true,message:'WhatsApp já conectado.'});
    pairingMode='code';
    await startWhatsApp(true,true,'new-pairing-code');
    const current=await waitForSocket(2500);

    // O socket precisa iniciar o fluxo de conexão antes do requestPairingCode.
    const until=Date.now()+6000;
    while(sock===current && !qrDataUrl && !connected && Date.now()<until)await delay(200);
    if(sock!==current)throw Error('A conexão reiniciou antes de gerar o código. Toque em Gerar código novamente.');
    const code=await current.requestPairingCode(phone);
    res.json({ok:true,code});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/whatsapp/send-test' ,async(req,res)=>{try{const d=await sendText(req.body?.to,String(req.body?.text||'Teste Projeto Zap V5.4 ✅'));res.json({ok:true,...d})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/logout',async(req,res)=>{try{if(sock)try{await sock.logout()}catch{}await closeSocket();await authClearAll();qrDataUrl='';lastError='';res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.post('/api/campaign/start',async(req,res)=>{try{if(!connected)return res.status(409).json({error:'Conecte o WhatsApp primeiro.'});const recipients=Array.isArray(req.body?.recipients)?req.body.recipients:[];const variations=(Array.isArray(req.body?.variations)?req.body.variations:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,5);const intervalSec=Math.max(15,Math.min(300,Number(req.body?.intervalSec||20)));if(!variations.length)return res.status(400).json({error:'Informe ao menos 1 mensagem.'});const eligible=recipients.filter(r=>r&&r.consent===true&&validBR(r.phone)).slice(0,20);if(!eligible.length)return res.status(400).json({error:'Nenhum contato autorizado e válido selecionado.'});const id=`c_${Date.now()}`;const job={id,name:String(req.body?.name||'Campanha'),status:'running',createdAt:new Date().toISOString(),intervalSec,total:eligible.length,sent:0,failed:0,responded:0,paused:false,cancelled:false,items:eligible.map(r=>({phone:normalizeBR(r.phone),name:r.name||'',status:'pending'}))};campaignJobs.set(id,job);res.json({ok:true,id,total:job.total});(async()=>{for(let i=0;i<job.items.length;i++){const item=job.items[i];while(job.paused&&!job.cancelled)await delay(1000);if(job.cancelled)break;if(item.status==='responded')continue;try{const text=variations[i%variations.length];await sendText(item.phone,text);item.status='sent';item.sentAt=new Date().toISOString();job.sent++}catch(e){item.status='failed';item.error=e.message;job.failed++}if(i<job.items.length-1)await delay(intervalSec*1000)}job.status=job.cancelled?'cancelled':'completed';job.finishedAt=new Date().toISOString()})().catch(()=>{})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/campaign/:id',(req,res)=>{const j=campaignJobs.get(req.params.id);if(!j)return res.status(404).json({error:'Campanha não encontrada.'});res.json({ok:true,job:j})});
app.post('/api/campaign/:id/pause',(req,res)=>{const j=campaignJobs.get(req.params.id);if(!j)return res.status(404).json({error:'Campanha não encontrada.'});j.paused=true;j.status='paused';res.json({ok:true})});
app.post('/api/campaign/:id/resume',(req,res)=>{const j=campaignJobs.get(req.params.id);if(!j)return res.status(404).json({error:'Campanha não encontrada.'});j.paused=false;j.status='running';res.json({ok:true})});
app.post('/api/campaign/:id/cancel',(req,res)=>{const j=campaignJobs.get(req.params.id);if(!j)return res.status(404).json({error:'Campanha não encontrada.'});j.cancelled=true;j.paused=false;j.status='cancelled';res.json({ok:true})});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/manifest.webmanifest',(req,res)=>res.sendFile(path.join(__dirname,'manifest.webmanifest')));
app.get('/sw.js',(req,res)=>res.sendFile(path.join(__dirname,'sw.js')));

app.listen(PORT,async()=>{console.log(`Projeto Zap V5.4.2 online na porta ${PORT}`);try{await startWhatsApp(false,false,'startup')}catch(e){console.log('WhatsApp aguardando:',e.message)}});
