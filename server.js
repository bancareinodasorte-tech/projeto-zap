const express=require('express');
const crypto=require('crypto');
const pino=require('pino');
const QRCode=require('qrcode');
const NodeCache=require('node-cache');
const {default:makeWASocket,DisconnectReason,Browsers,initAuthCreds,BufferJSON,proto}=require('@whiskeysockets/baileys');

const app=express();
app.use(express.json({limit:'15mb'}));
app.use(express.urlencoded({extended:true,limit:'15mb'}));
app.use(express.static(__dirname));

const PORT=process.env.PORT||10000;
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_KEY||process.env.SUPABASE_ANON_KEY||'';
const CRON_SECRET=String(process.env.CRON_SECRET||'');
const STORAGE_BUCKET='projeto-zap-campanhas';
const BOT_DEFAULT={
  enabled:true,
  pix_key:'',
  pix_name:'REINO DA SORTE',
  trigger_keywords:['quero','comprar','compra','bilhete','bilhetes','pedido','reservar','garantir'],
  order_prompt:'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:',
  thank_you_message:'🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀'
};
const TERMINAL=new Set(['COMPRA_REALIZADA','NAO_INTERESSADO','SEM_RESPOSTA','DESCADASTRADO']);
const PURCHASE_PHRASES=['pagamento confirmado','compra confirmada','obrigado pela compra','obrigada pela compra','agradecemos sua compra','compra realizada','pagamento recebido'];
const NEGATIVE=['não quero','nao quero','sem interesse','não tenho interesse','nao tenho interesse','pare','sair'];
let sock=null,connected=false,starting=false,qrDataUrl='',connectedNumber='',connectedName='',lastError='',lastConnectionAt=null,restartTimer=null,generation=0,runnerBusy=false;
const msgRetryCounterCache=new NodeCache({stdTTL:3600,checkperiod:600,useClones:false});
const recentMessageCache=new NodeCache({stdTTL:86400,checkperiod:1800,useClones:false,maxKeys:5000});

const digits=v=>String(v||'').replace(/\D/g,'');
const nowIso=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const lower=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function normalizeBR(v){let n=digits(v);if(n.startsWith('00'))n=n.slice(2);if(!n.startsWith('55')&&(n.length===10||n.length===11))n='55'+n;return n}
function validBRPhone(v){return /^55\d{10,11}$/.test(normalizeBR(v))}
const safeJson=v=>JSON.parse(JSON.stringify(v,BufferJSON.replacer));
const restoreJson=v=>JSON.parse(JSON.stringify(v),BufferJSON.reviver);

async function sb(path,opt={}){
  if(!SUPABASE_URL||!SUPABASE_KEY) throw new Error('Supabase não configurado no Render.');
  const r=await fetch(SUPABASE_URL+path,{...opt,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',...(opt.headers||{})}});
  const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(data?.message||data?.error||data?.details||`Supabase ${r.status}`);
  return data;
}
async function authRead(id){const x=await sb(`/rest/v1/zap_auth?select=value&id=eq.${encodeURIComponent(id)}&limit=1`);return x?.[0]?.value?restoreJson(x[0].value):null}
async function authWrite(id,value){return sb('/rest/v1/zap_auth?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id,value:safeJson(value),updated_at:nowIso()})})}
async function authDelete(id){return sb(`/rest/v1/zap_auth?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'})}
async function authClear(){return sb('/rest/v1/zap_auth?id=not.is.null',{method:'DELETE'})}
async function rememberRetryMessage(msg){
  const id=String(msg?.key?.id||'');
  if(!id||!msg?.message)return;
  recentMessageCache.set(id,msg.message);
  await authWrite(`retry-${id}`,{message:msg.message,remoteJid:String(msg?.key?.remoteJid||''),saved_at:nowIso()}).catch(()=>{});
}
async function getStoredMessage(key){
  const id=String(key?.id||'');if(!id)return undefined;
  const mem=recentMessageCache.get(id);if(mem)return mem;
  const db=await authRead(`retry-${id}`).catch(()=>null);
  if(db?.message){recentMessageCache.set(id,db.message);return db.message}
  return undefined;
}
async function useSupabaseAuthState(){
  const creds=(await authRead('creds'))||initAuthCreds();
  return {state:{creds,keys:{get:async(type,ids)=>{const out={};await Promise.all(ids.map(async id=>{let v=await authRead(`${type}-${id}`);if(type==='app-state-sync-key'&&v)v=proto.Message.AppStateSyncKeyData.fromObject(v);out[id]=v}));return out},set:async data=>{for(const cat of Object.keys(data||{}))for(const id of Object.keys(data[cat]||{})){const v=data[cat][id];if(v)await authWrite(`${cat}-${id}`,v);else await authDelete(`${cat}-${id}`)}}}},saveCreds:()=>authWrite('creds',creds)};
}
async function closeSocket(clear=false){generation++;try{sock?.ws?.close?.()}catch{}sock=null;connected=false;starting=false;if(clear){connectedNumber='';connectedName='';qrDataUrl=''}}
function scheduleRestart(ms=2200){clearTimeout(restartTimer);restartTimer=setTimeout(()=>startWhatsApp(false).catch(e=>lastError=e.message),ms)}
async function startWhatsApp(force=false){
  if(starting)return;if(sock&&!force)return;starting=true;if(force)await closeSocket(false);const myGen=++generation;
  try{
    const {state,saveCreds}=await useSupabaseAuthState();
    sock=makeWASocket({auth:state,printQRInTerminal:false,logger:pino({level:'silent'}),browser:Browsers.ubuntu('Google Chrome'),markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,generateHighQualityLinkPreview:false,msgRetryCounterCache,getMessage:getStoredMessage});
    const s=sock;
    s.ev.on('creds.update',saveCreds);
    s.ev.on('connection.update',async u=>{
      if(myGen!==generation)return;const {connection,lastDisconnect,qr}=u;
      if(qr){qrDataUrl=await QRCode.toDataURL(qr,{margin:2,width:440});connected=false;lastError=''}
      if(connection==='open'){
        connected=true;starting=false;qrDataUrl='';connectedNumber=digits(s.user?.id?.split(':')?.[0]||s.user?.id||'');connectedName=String(s.user?.name||s.user?.verifiedName||'Reino da Sorte');lastConnectionAt=nowIso();lastError='';
        setTimeout(()=>runDueCampaigns().catch(()=>{}),1200);
      }
      if(connection==='close'){
        connected=false;starting=false;const code=Number(lastDisconnect?.error?.output?.statusCode||lastDisconnect?.error?.statusCode||0);const loggedOut=code===DisconnectReason.loggedOut||code===401;
        lastError=loggedOut?'Sessão encerrada no WhatsApp.':String(lastDisconnect?.error?.message||`Conexão encerrada (${code||'sem código'}).`);
        try{s?.ws?.close?.()}catch{}if(sock===s)sock=null;
        if(loggedOut){await authClear().catch(()=>{});connectedNumber='';connectedName='';qrDataUrl=''}else scheduleRestart(code===515?900:2200);
      }
    });
    s.ev.on('messages.upsert',async ({messages,type})=>{if(type!=='notify'&&type!=='append')return;for(const m of messages||[])if(m?.message){await rememberRetryMessage(m).catch(()=>{});await processMessage(m).catch(e=>console.log('Mensagem:',e.message))}});
  }catch(e){lastError=e.message;sock=null;connected=false;starting=false;scheduleRestart(3500);throw e}
}
async function ensureConnected(timeout=25000){if(connected&&sock)return true;if(!starting&&!sock)await startWhatsApp(false).catch(()=>{});const end=Date.now()+timeout;while(Date.now()<end){if(connected&&sock)return true;await sleep(500)}return false}

function msgText(m){const x=m?.message||{};return String(x.conversation||x.extendedTextMessage?.text||x.imageMessage?.caption||x.videoMessage?.caption||x.documentMessage?.caption||'').trim()}
function msgType(m){const x=m?.message||{};if(x.imageMessage)return'image';if(x.documentMessage)return String(x.documentMessage?.mimetype||'').includes('pdf')?'pdf':'document';if(x.videoMessage)return'video';if(x.audioMessage)return'audio';return'text'}
function jidToPhone(jid){const s=String(jid||'');if(!s.endsWith('@s.whatsapp.net'))return'';const n=normalizeBR(s.split('@')[0]);return validBRPhone(n)?n:''}
async function resolveMessagePhone(m){
  const k=m?.key||{};
  for(const cand of [k.remoteJidAlt,k.participantPn,k.participantAlt,k.senderPn,k.remoteJid]){const p=jidToPhone(cand);if(p)return p}
  const raw=String(k.remoteJid||'');
  if(raw.endsWith('@lid')){
    try{const fn=sock?.signalRepository?.lidMapping?.getPNForLID;if(typeof fn==='function'){const pn=await fn.call(sock.signalRepository.lidMapping,raw);const p=jidToPhone(pn)||normalizeBR(pn);if(validBRPhone(p))return p}}catch{}
    try{const rows=await sb(`/rest/v1/pz_jid_map?lid_jid=eq.${encodeURIComponent(raw)}&select=phone&limit=1`);if(validBRPhone(rows?.[0]?.phone))return normalizeBR(rows[0].phone)}catch{}
  }
  const stanza=String(m?.message?.extendedTextMessage?.contextInfo?.stanzaId||m?.message?.imageMessage?.contextInfo?.stanzaId||m?.message?.documentMessage?.contextInfo?.stanzaId||'');
  if(stanza){try{const rows=await sb(`/rest/v1/pz_recipients?meta_message_id=eq.${encodeURIComponent(stanza)}&select=phone&order=created_at.desc&limit=1`);if(validBRPhone(rows?.[0]?.phone))return normalizeBR(rows[0].phone)}catch{}}
  return '';
}
async function rememberLid(phone,lid){if(!validBRPhone(phone)||!String(lid||'').endsWith('@lid'))return;await sb('/rest/v1/pz_jid_map?on_conflict=phone',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({phone:normalizeBR(phone),lid_jid:String(lid),updated_at:nowIso()})}).catch(()=>{})}

async function getBotSettings(){
  const rows=await sb('/rest/v1/pz_settings?key=eq.bot&select=value&limit=1').catch(()=>[]);
  const v=rows?.[0]?.value||{};return {...BOT_DEFAULT,...v,trigger_keywords:Array.isArray(v.trigger_keywords)?v.trigger_keywords:BOT_DEFAULT.trigger_keywords};
}
async function saveBotSettings(v){
  const body={key:'bot',value:{...BOT_DEFAULT,...v},updated_at:nowIso()};
  await sb('/rest/v1/pz_settings?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
  return body.value;
}
function isBuyIntent(text,settings){const t=lower(text);if(NEGATIVE.some(x=>t.includes(lower(x))))return false;return (settings.trigger_keywords||BOT_DEFAULT.trigger_keywords).some(k=>t.includes(lower(k)))}
function isPurchasePhrase(t){return PURCHASE_PHRASES.some(p=>lower(t).includes(lower(p)))}
function parseOrder(text,fallbackPhone){
  const lines=String(text||'').split(/\n|;/).map(s=>s.trim()).filter(Boolean);let name='',qty=0,contact='';
  for(const line of lines){let m=line.match(/^nome\s*[:\-]\s*(.+)$/i);if(m)name=m[1].trim();m=line.match(/^(quantidade|qtd|bilhetes?)\s*[:\-]\s*(\d{1,4})/i);if(m)qty=Number(m[2]);m=line.match(/^(contato|telefone|whatsapp)\s*[:\-]\s*(.+)$/i);if(m)contact=normalizeBR(m[2])}
  if(!qty){const q=String(text||'').match(/\b(\d{1,4})\s*(bilhete|bilhetes|unidade|unidades)\b/i)||String(text||'').match(/\bquero\s+(\d{1,4})\b/i);if(q)qty=Number(q[1])}
  if(!contact)contact=normalizeBR(fallbackPhone);return{name,qty,contact};
}
async function findContact(phone){const rows=await sb(`/rest/v1/pz_contacts?phone=eq.${encodeURIComponent(normalizeBR(phone))}&select=*&limit=1`);return rows?.[0]||null}
async function upsertContact(phone,name=''){const n=normalizeBR(phone);let c=await findContact(n);if(c)return c;const rows=await sb('/rest/v1/pz_contacts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({phone:n,name:name||`Cliente ${n.slice(-4)}`,group_name:'NOVOS',status:'ATIVO',opt_in:true,opt_out:false})});return rows?.[0]||null}
async function latestRecipient(phone){const rows=await sb(`/rest/v1/pz_recipients?phone=eq.${encodeURIComponent(normalizeBR(phone))}&select=*&order=created_at.desc&limit=20`);return (rows||[]).find(r=>!TERMINAL.has(r.status))||null}
async function getOrder(recipientId){const rows=await sb(`/rest/v1/pz_orders?recipient_id=eq.${encodeURIComponent(recipientId)}&select=*&order=created_at.desc&limit=1`).catch(()=>[]);return rows?.[0]||null}
async function upsertOrder(recipient,campaign,data={}){
  const existing=await getOrder(recipient.id),unit=Number(campaign?.unit_price||existing?.unit_price||0),qty=Math.max(0,Number(data.qty||existing?.quantity||0));
  const body={recipient_id:recipient.id,campaign_id:recipient.campaign_id,contact_id:recipient.contact_id||null,phone:recipient.phone,name:String(data.name||existing?.name||recipient.name||''),quantity:qty,unit_price:unit,total_amount:Number((qty*unit).toFixed(2)),contact_phone:normalizeBR(data.contact||existing?.contact_phone||recipient.phone),status:String(data.status||existing?.status||'COLETANDO_DADOS'),updated_at:nowIso()};
  if(existing){await sb(`/rest/v1/pz_orders?id=eq.${existing.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});return {...existing,...body}}
  const rows=await sb('/rest/v1/pz_orders',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});return rows?.[0]||body;
}

// IMPORTANTE: envio direto para PN. Não converte o destinatário para LID.
// Esse é o mesmo padrão estável usado antes e evita mensagens "Aguardando mensagem" no destinatário.
function normalizeLid(v){const x=String(v||'').trim();if(!x)return'';if(x.endsWith('@lid'))return x;const d=digits(x);return d?`${d}@lid`:''}
async function directJid(phone){
  const n=normalizeBR(phone);if(!validBRPhone(n))throw new Error('Telefone inválido.');
  const pn=`${n}@s.whatsapp.net`;let lid='';
  try{const rows=await sb(`/rest/v1/pz_jid_map?phone=eq.${encodeURIComponent(n)}&select=lid_jid&limit=1`);lid=normalizeLid(rows?.[0]?.lid_jid)}catch{}
  if(!lid){try{const fn=sock?.signalRepository?.lidMapping?.getLIDForPN;if(typeof fn==='function')lid=normalizeLid(await fn.call(sock.signalRepository.lidMapping,pn))}catch{}}
  let ex=null;
  try{ex=await sock.onWhatsApp(pn);if(ex?.[0]?.exists===false)throw new Error('Número não encontrado no WhatsApp.');if(!lid)lid=normalizeLid(ex?.[0]?.lid)}catch(e){if(String(e.message||'').includes('Número não encontrado'))throw e}
  if(lid)await rememberLid(n,lid).catch(()=>{});
  return {n,pn,lid:lid||null,jid:lid||ex?.[0]?.jid||pn};
}
async function sendText(phone,text){
  if(!sock||!connected)throw new Error('WhatsApp não conectado.');
  const {n,jid,pn,lid}=await directJid(phone);const r=await sock.sendMessage(jid,{text:String(text||'').trim()});await rememberRetryMessage(r).catch(()=>{});return{to:n,id:r?.key?.id||null,jid,pn,lid};
}
async function sendImageText(phone,url,text){
  if(!sock||!connected)throw new Error('WhatsApp não conectado.');
  const {n,jid,pn,lid}=await directJid(phone);const r=await fetch(url);if(!r.ok)throw new Error('Não foi possível carregar a imagem.');const image=Buffer.from(await r.arrayBuffer());const out=await sock.sendMessage(jid,{image,caption:String(text||'').trim()});await rememberRetryMessage(out).catch(()=>{});return{to:n,id:out?.key?.id||null,jid,pn,lid};
}
async function botSend(phone,text){if(!text)return;const out=await sendText(phone,text);await sb('/rest/v1/pz_messages',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({phone:normalizeBR(phone),meta_message_id:out.id||crypto.randomUUID(),direction:'OUT',message_type:'text',body:text,status:'sent',raw_payload:{source:'BOT'},created_at:nowIso()})}).catch(()=>{})}
async function recordPurchase(recipient,source='MANUAL',notes=''){
  await sb('/rest/v1/pz_purchases',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({contact_id:recipient.contact_id||null,campaign_id:recipient.campaign_id||null,recipient_id:recipient.id,phone:recipient.phone,name:recipient.name||'',source,notes,created_at:nowIso()})}).catch(()=>{});
  await sb(`/rest/v1/pz_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'COMPRA_REALIZADA',purchase_at:nowIso(),next_action_at:null,updated_at:nowIso()})});
}
async function handleInboundBot(recipient,campaign,contact,text,type){
  const settings=await getBotSettings();if(!settings.enabled||campaign?.auto_bot_enabled===false)return;const status=String(recipient.status||'');
  if(['image','pdf','document'].includes(type)&&['AGUARDANDO_PAGAMENTO','PEDIDO_CONFIRMADO'].includes(status)){
    await upsertOrder(recipient,campaign,{status:'COMPROVANTE_RECEBIDO'});
    await sb(`/rest/v1/pz_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'POSSIVEL_PAGAMENTO',possible_payment_at:nowIso(),last_inbound_preview:`[${type}] possível comprovante`,last_inbound_type:type,next_action_at:null,updated_at:nowIso()})});return;
  }
  if(type!=='text')return;
  if(['ENVIADA','ENTREGUE','LIDA','RESPONDEU','EM_NEGOCIACAO'].includes(status)&&isBuyIntent(text,settings)){
    await upsertOrder(recipient,campaign,{status:'AGUARDANDO_DADOS'});
    await sb(`/rest/v1/pz_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'AGUARDANDO_DADOS',responded_at:recipient.responded_at||nowIso(),last_inbound_preview:text,updated_at:nowIso()})});
    await botSend(recipient.phone,settings.order_prompt);return;
  }
  if(status==='AGUARDANDO_DADOS'){
    const d=parseOrder(text,recipient.phone);if(!d.qty||d.qty<1){await botSend(recipient.phone,'Não consegui identificar a quantidade. Responda assim:\nNome: Seu nome\nQuantidade: 10\nContato: seu WhatsApp');return}
    const order=await upsertOrder(recipient,campaign,{...d,status:'AGUARDANDO_PAGAMENTO'});
    await sb(`/rest/v1/pz_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'AGUARDANDO_PAGAMENTO',last_inbound_preview:`Pedido: ${order.quantity} bilhete(s)`,updated_at:nowIso()})});
    const total=Number(order.total_amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});let pix=`✅ Pedido recebido!\nNome: ${order.name||contact?.name||'Cliente'}\nQuantidade: ${order.quantity}\nTotal: ${total}`;
    pix+=settings.pix_key?`\n\nPIX: ${settings.pix_key}${settings.pix_name?`\nFavorecido: ${settings.pix_name}`:''}`:'\n\nAguarde a chave PIX do atendimento.';
    pix+='\n\nApós pagar, envie aqui a foto ou PDF do comprovante.';await botSend(recipient.phone,pix);
  }
}
async function processMessage(m){
  const rawJid=String(m.key?.remoteJid||'');if(!rawJid||rawJid.endsWith('@g.us')||rawJid==='status@broadcast'||rawJid.endsWith('@broadcast'))return;
  const fromMe=Boolean(m.key?.fromMe),text=msgText(m),type=msgType(m),phone=await resolveMessagePhone(m);if(!phone){console.log('Mensagem sem telefone resolvido:',rawJid);return}
  if(rawJid.endsWith('@lid'))await rememberLid(phone,rawJid);
  const id=String(m.key?.id||crypto.randomUUID());const dup=await sb(`/rest/v1/pz_messages?meta_message_id=eq.${encodeURIComponent(id)}&select=id&limit=1`).catch(()=>[]);if(dup?.length)return;
  const contact=await upsertContact(phone,m.pushName||''),recipient=await latestRecipient(phone);
  await sb('/rest/v1/pz_messages',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({phone,contact_id:contact?.id||null,campaign_id:recipient?.campaign_id||null,recipient_id:recipient?.id||null,meta_message_id:id,direction:fromMe?'OUT':'IN',message_type:type,body:text||null,status:fromMe?'sent':'received',raw_payload:{key:m.key||null,pushName:m.pushName||null},created_at:nowIso()})}).catch(()=>{});
  if(!recipient)return;
  if(fromMe){
    if(isPurchasePhrase(text)){await recordPurchase(recipient,'AUTO_FRASE',text);return}
    if(['image','pdf','document'].includes(type)&&['PAGAMENTO_APROVADO','AGUARDANDO_BILHETES'].includes(recipient.status)){
      await recordPurchase(recipient,'BILHETES_ENVIADOS',`Mídia enviada pelo operador: ${type}`);const settings=await getBotSettings();await botSend(recipient.phone,settings.thank_you_message).catch(()=>{});return;
    }
    return;
  }
  const campaignRows=await sb(`/rest/v1/pz_campaigns?id=eq.${recipient.campaign_id}&select=*&limit=1`).catch(()=>[]),campaign=campaignRows?.[0]||null;
  const payment=['image','pdf','document'].includes(type)&&['AGUARDANDO_PAGAMENTO','PEDIDO_CONFIRMADO'].includes(recipient.status);
  const baseStatus=payment?'POSSIVEL_PAGAMENTO':(['AGUARDANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(recipient.status)?recipient.status:'RESPONDEU');
  await sb(`/rest/v1/pz_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:baseStatus,responded_at:recipient.responded_at||nowIso(),possible_payment_at:payment?nowIso():recipient.possible_payment_at||null,last_inbound_preview:text||`[${type}]`,last_inbound_type:type,next_action_at:null,updated_at:nowIso()})});
  await handleInboundBot({...recipient,status:baseStatus,responded_at:recipient.responded_at||nowIso()},campaign,contact,text,type).catch(e=>console.log('Bot:',e.message));
}

async function ensureBucket(){const r=await fetch(`${SUPABASE_URL}/storage/v1/bucket/${STORAGE_BUCKET}`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});if(r.ok)return;const c=await fetch(`${SUPABASE_URL}/storage/v1/bucket`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({id:STORAGE_BUCKET,name:STORAGE_BUCKET,public:true,file_size_limit:6291456,allowed_mime_types:['image/jpeg','image/png','image/webp']})});if(!c.ok&&!String(await c.text()).toLowerCase().includes('already'))throw new Error('Não foi possível preparar o armazenamento de imagens.')}
async function uploadImage(dataUrl){if(!dataUrl)return null;const m=String(dataUrl).match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);if(!m)throw new Error('Imagem inválida.');const mime=m[1].toLowerCase()==='image/jpg'?'image/jpeg':m[1].toLowerCase(),ext=mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg',buf=Buffer.from(m[2],'base64');if(buf.length>6*1024*1024)throw new Error('Imagem maior que 6 MB.');await ensureBucket();const object=`${Date.now()}-${crypto.randomUUID()}.${ext}`;const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${object}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':mime,'x-upsert':'false'},body:buf});if(!r.ok)throw new Error(`Falha ao salvar imagem (${r.status}).`);return`${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${object}`}

async function campaignSummary(id){const rows=await sb(`/rest/v1/pz_recipients?campaign_id=eq.${id}&select=status`);const c={total:0,pendentes:0,enviados:0,responderam:0,compras:0,falhas:0};for(const r of rows||[]){c.total++;if(['PENDENTE','REENVIO_AGENDADO'].includes(r.status))c.pendentes++;if(['ENVIADA','ENTREGUE','LIDA'].includes(r.status))c.enviados++;if(['RESPONDEU','AGUARDANDO_DADOS','AGUARDANDO_PAGAMENTO','POSSIVEL_PAGAMENTO','PAGAMENTO_APROVADO','AGUARDANDO_BILHETES','EM_NEGOCIACAO'].includes(r.status))c.responderam++;if(r.status==='COMPRA_REALIZADA')c.compras++;if(r.status==='FALHA')c.falhas++}return c}
async function maybeFinalizeCampaign(c){const rows=await sb(`/rest/v1/pz_recipients?campaign_id=eq.${c.id}&select=status,next_action_at`);const active=(rows||[]).some(r=>['PENDENTE','REENVIO_AGENDADO'].includes(r.status)||(['ENVIADA','ENTREGUE','LIDA'].includes(r.status)&&c.retry_enabled&&r.next_action_at));if(!active&&c.status==='EM_EXECUCAO')await sb(`/rest/v1/pz_campaigns?id=eq.${c.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FINALIZADA',finished_at:nowIso(),updated_at:nowIso()})})}
async function runDueCampaigns(){
  if(runnerBusy)return{busy:true};runnerBusy=true;let sent=0,failed=0;
  try{
    if(!await ensureConnected(20000))return{connected:false,sent:0};
    const camps=await sb('/rest/v1/pz_campaigns?status=in.(AGENDADA,EM_EXECUCAO)&select=*&order=created_at.asc&limit=50');
    for(const c of camps||[]){
      if(c.status==='AGENDADA'&&c.schedule_at&&new Date(c.schedule_at)>new Date())continue;
      if(c.status==='AGENDADA')await sb(`/rest/v1/pz_campaigns?id=eq.${c.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'EM_EXECUCAO',started_at:nowIso(),updated_at:nowIso()})});
      const due=await sb(`/rest/v1/pz_recipients?campaign_id=eq.${c.id}&status=in.(PENDENTE,REENVIO_AGENDADO,ENVIADA,ENTREGUE,LIDA)&next_action_at=lte.${encodeURIComponent(nowIso())}&select=*&order=next_action_at.asc&limit=1000`);
      for(const r of due||[]){
        if(['ENVIADA','ENTREGUE','LIDA'].includes(r.status)&&!c.retry_enabled)continue;
        if((r.attempt_count||0)>=(r.max_attempts||1)){await sb(`/rest/v1/pz_recipients?id=eq.${r.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'SEM_RESPOSTA',next_action_at:null,updated_at:nowIso()})});continue}
        try{
          const msgs=Array.isArray(c.messages)?c.messages:[],text=String(msgs[Math.min(Number(r.selected_message)||0,Math.max(0,msgs.length-1))]||msgs[0]||'').trim();
          const out=c.image_url?await sendImageText(r.phone,c.image_url,text):await sendText(r.phone,text);const attempts=(r.attempt_count||0)+1;
          let next=null;if(c.retry_enabled&&attempts<(r.max_attempts||1))next=new Date(Date.now()+(Number(c.retry_hours)||24)*3600000).toISOString();
          await sb(`/rest/v1/pz_recipients?id=eq.${r.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ENVIADA',attempt_count:attempts,meta_message_id:out.id,sent_at:nowIso(),next_action_at:next,error_text:null,updated_at:nowIso()})});sent++;
        }catch(e){failed++;const attempts=(r.attempt_count||0)+1,retry=attempts<(r.max_attempts||1);await sb(`/rest/v1/pz_recipients?id=eq.${r.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:retry?'REENVIO_AGENDADO':'FALHA',attempt_count:attempts,next_action_at:retry?new Date(Date.now()+15*60000).toISOString():null,error_text:e.message,updated_at:nowIso()})}).catch(()=>{})}
        await sleep(Math.floor((Math.max(3,Number(c.interval_min)||6)+Math.random()*Math.max(1,(Number(c.interval_max)||12)-(Number(c.interval_min)||6)))*1000));
      }
      await maybeFinalizeCampaign({...c,status:'EM_EXECUCAO'});
    }
    return{connected:true,sent,failed};
  }finally{runnerBusy=false}
}

app.get('/health',(req,res)=>res.json({ok:true,service:'projeto-zap',version:'5.7.2',connected,runnerBusy}));
app.get('/api/whatsapp/status',(req,res)=>res.json({ok:true,connected,starting,number:connectedNumber||null,name:connectedName||null,qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null,lastError:lastError||null,lastConnectionAt}));
app.post('/api/whatsapp/connect',async(req,res)=>{try{await startWhatsApp(Boolean(req.body?.force));res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/pairing-code',async(req,res)=>{try{const phone=normalizeBR(req.body?.phone);if(!validBRPhone(phone))return res.status(400).json({error:'Telefone inválido.'});if(!sock)await startWhatsApp(false);if(connected)return res.json({ok:true,connected:true});await sleep(800);res.json({ok:true,code:await sock.requestPairingCode(phone)})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/disconnect',async(req,res)=>{try{try{await sock?.logout?.()}catch{}await closeSocket(true);await authClear().catch(()=>{});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/test',async(req,res)=>{try{if(!await ensureConnected())throw new Error('WhatsApp não conectado.');res.json({ok:true,...await sendText(req.body?.phone,req.body?.message||'Teste Projeto Zap V5.7.2 ✅')})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/settings/bot',async(req,res)=>{try{res.json({ok:true,settings:await getBotSettings()})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/settings/bot',async(req,res)=>{try{const s={enabled:req.body?.enabled!==false,pix_key:String(req.body?.pix_key||''),pix_name:String(req.body?.pix_name||'REINO DA SORTE'),trigger_keywords:Array.isArray(req.body?.trigger_keywords)?req.body.trigger_keywords.map(String).filter(Boolean):BOT_DEFAULT.trigger_keywords,order_prompt:String(req.body?.order_prompt||BOT_DEFAULT.order_prompt),thank_you_message:String(req.body?.thank_you_message||BOT_DEFAULT.thank_you_message)};res.json({ok:true,settings:await saveBotSettings(s)})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/dashboard',async(req,res)=>{try{const [contacts,camps,returns,purchases]=await Promise.all([sb('/rest/v1/pz_contacts?select=id'),sb('/rest/v1/pz_campaigns?select=*&order=created_at.desc&limit=100'),sb('/rest/v1/pz_recipients?status=in.(RESPONDEU,AGUARDANDO_DADOS,AGUARDANDO_PAGAMENTO,POSSIVEL_PAGAMENTO,PAGAMENTO_APROVADO,AGUARDANDO_BILHETES,EM_NEGOCIACAO)&select=id'),sb('/rest/v1/pz_purchases?select=id')]);res.json({ok:true,stats:{contacts:contacts?.length||0,campaigns:camps?.length||0,scheduled:(camps||[]).filter(c=>c.status==='AGENDADA').length,active:(camps||[]).filter(c=>c.status==='EM_EXECUCAO').length,returns:returns?.length||0,purchases:purchases?.length||0},next:(camps||[]).filter(c=>c.status==='AGENDADA').sort((a,b)=>String(a.schedule_at).localeCompare(String(b.schedule_at))).slice(0,5)})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/contacts',async(req,res)=>{try{const q=String(req.query.q||'').trim(),group=String(req.query.group||'').trim();let path='/rest/v1/pz_contacts?select=*&order=created_at.desc&limit=1000';if(group)path+=`&group_name=eq.${encodeURIComponent(group)}`;const rows=await sb(path);res.json({ok:true,contacts:q?(rows||[]).filter(x=>`${x.name||''} ${x.phone||''}`.toLowerCase().includes(q.toLowerCase())):rows})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/contacts',async(req,res)=>{try{const phone=normalizeBR(req.body?.phone);if(!validBRPhone(phone))return res.status(400).json({error:'Telefone inválido.'});const rows=await sb('/rest/v1/pz_contacts?on_conflict=phone',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({phone,name:String(req.body?.name||`Cliente ${phone.slice(-4)}`),group_name:String(req.body?.group_name||'NOVOS'),status:'ATIVO',opt_in:req.body?.opt_in!==false,opt_out:false,updated_at:nowIso()})});res.json({ok:true,contact:rows?.[0]})}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/contacts/:id',async(req,res)=>{try{await sb(`/rest/v1/pz_contacts?id=eq.${req.params.id}`,{method:'DELETE'});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/campaigns',async(req,res)=>{try{const rows=await sb('/rest/v1/pz_campaigns?select=*&order=created_at.desc&limit=200');for(const c of rows||[])c.summary=await campaignSummary(c.id);res.json({ok:true,campaigns:rows})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/campaigns',async(req,res)=>{try{
  const name=String(req.body?.name||'').trim(),messages=(req.body?.messages||[]).map(String).map(s=>s.trim()).filter(Boolean);if(!name||!messages.length)return res.status(400).json({error:'Informe nome e ao menos uma mensagem.'});
  const contacts=Array.isArray(req.body?.contact_ids)?req.body.contact_ids:[];if(!contacts.length)return res.status(400).json({error:'Selecione ao menos um contato.'});
  const image_url=req.body?.image_data?await uploadImage(req.body.image_data):null,schedule_at=req.body?.schedule_at?new Date(req.body.schedule_at).toISOString():nowIso();
  const rows=await sb('/rest/v1/pz_campaigns',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({name,messages,image_url,schedule_at,status:new Date(schedule_at)>new Date()?'AGENDADA':'EM_EXECUCAO',interval_min:Number(req.body?.interval_min)||6,interval_max:Number(req.body?.interval_max)||12,retry_enabled:Boolean(req.body?.retry_enabled),retry_hours:Number(req.body?.retry_hours)||24,max_attempts:Math.max(1,Number(req.body?.max_attempts)||1),unit_price:Number(req.body?.unit_price)||0,auto_bot_enabled:req.body?.auto_bot_enabled!==false,created_at:nowIso(),updated_at:nowIso()})});
  const c=rows?.[0];const selected=await sb(`/rest/v1/pz_contacts?id=in.(${contacts.join(',')})&select=*`);let idx=0;for(const ct of selected||[]){await sb('/rest/v1/pz_recipients',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({campaign_id:c.id,contact_id:ct.id,phone:ct.phone,name:ct.name||'',status:'PENDENTE',selected_message:idx++%messages.length,attempt_count:0,max_attempts:Math.max(1,Number(req.body?.max_attempts)||1),next_action_at:schedule_at,created_at:nowIso(),updated_at:nowIso()})})}
  setTimeout(()=>runDueCampaigns().catch(()=>{}),500);res.json({ok:true,campaign:c});
}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/campaigns/:id/run',async(req,res)=>{try{await sb(`/rest/v1/pz_campaigns?id=eq.${req.params.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'EM_EXECUCAO',schedule_at:nowIso(),updated_at:nowIso()})});await sb(`/rest/v1/pz_recipients?campaign_id=eq.${req.params.id}&status=eq.PENDENTE`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({next_action_at:nowIso(),updated_at:nowIso()})});res.json({ok:true,result:await runDueCampaigns()})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/campaigns/:id/pause',async(req,res)=>{try{await sb(`/rest/v1/pz_campaigns?id=eq.${req.params.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAUSADA',updated_at:nowIso()})});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/campaigns/:id',async(req,res)=>{try{await sb(`/rest/v1/pz_recipients?campaign_id=eq.${req.params.id}`,{method:'DELETE'});await sb(`/rest/v1/pz_campaigns?id=eq.${req.params.id}`,{method:'DELETE'});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/campaigns/:id/recipients',async(req,res)=>{try{res.json({ok:true,recipients:await sb(`/rest/v1/pz_recipients?campaign_id=eq.${req.params.id}&select=*&order=created_at.asc`)})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/returns',async(req,res)=>{try{const rows=await sb('/rest/v1/pz_recipients?status=in.(RESPONDEU,AGUARDANDO_DADOS,AGUARDANDO_PAGAMENTO,POSSIVEL_PAGAMENTO,PAGAMENTO_APROVADO,AGUARDANDO_BILHETES,EM_NEGOCIACAO)&select=*&order=responded_at.desc.nullslast,updated_at.desc&limit=500');res.json({ok:true,returns:rows})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/returns/:id/approve-payment',async(req,res)=>{try{await sb(`/rest/v1/pz_recipients?id=eq.${req.params.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAGAMENTO_APROVADO',updated_at:nowIso()})});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/returns/:id/mark-purchase',async(req,res)=>{try{const rows=await sb(`/rest/v1/pz_recipients?id=eq.${req.params.id}&select=*&limit=1`);if(!rows?.[0])return res.status(404).json({error:'Atendimento não encontrado.'});await recordPurchase(rows[0],'MANUAL',String(req.body?.notes||''));res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/purchases',async(req,res)=>{try{res.json({ok:true,purchases:await sb('/rest/v1/pz_purchases?select=*&order=created_at.desc&limit=500')})}catch(e){res.status(500).json({error:e.message})}});

app.post('/api/runner',async(req,res)=>{try{res.json({ok:true,result:await runDueCampaigns()})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/cron/run',async(req,res)=>{if(CRON_SECRET&&req.headers['x-cron-secret']!==CRON_SECRET)return res.status(401).json({error:'Não autorizado'});try{res.json({ok:true,result:await runDueCampaigns()})}catch(e){res.status(500).json({error:e.message})}});
app.get('/',(req,res)=>res.sendFile(__dirname+'/index.html'));
app.listen(PORT,()=>{console.log(`Projeto Zap V5.7.2 online na porta ${PORT}`);startWhatsApp(false).catch(()=>{});setInterval(()=>runDueCampaigns().catch(()=>{}),60000)});
