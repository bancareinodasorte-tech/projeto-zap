const express=require('express');
const crypto=require('crypto');
const pino=require('pino');
const QRCode=require('qrcode');
const {default:makeWASocket,DisconnectReason,fetchLatestBaileysVersion,initAuthCreds,BufferJSON,proto}=require('@whiskeysockets/baileys');

const app=express();
app.use(express.json({limit:'40mb'}));
app.use((req,res,next)=>{if(/\.(?:js|css|html|webmanifest)$/.test(req.path)||req.path==='/'||req.path==='/sw.js')res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');next()});
app.use(express.static(__dirname,{extensions:['html']}));

const PORT=process.env.PORT||3000;
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||'*';
const SCHEDULER_INTERVAL_MS=Math.max(15000,Number(process.env.SCHEDULER_INTERVAL_MS||30000));

app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin',FRONTEND_ORIGIN);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});

const nowIso=()=>new Date().toISOString();
const digits=v=>String(v||'').replace(/\D/g,'');
function normalizeBR(v){let n=digits(v);if(n.startsWith('00'))n=n.slice(2);if(!n.startsWith('55')&&(n.length===10||n.length===11))n='55'+n;return n}
const tailPhone=v=>digits(v).slice(-11);
const safeText=v=>String(v??'').trim();

async function sb(path,opt={},service=true){
  const key=service?SUPABASE_SERVICE_ROLE_KEY:SUPABASE_ANON_KEY;
  if(!SUPABASE_URL||!key) throw new Error('Supabase não configurado.');
  const r=await fetch(SUPABASE_URL+path,{...opt,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(opt.headers||{})}});
  const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(data?.message||data?.details||data?.hint||`Supabase ${r.status}`);
  return data;
}
const OWNER_ENV=String(process.env.PROJETO_ZAP_OWNER_ID||process.env.DEFAULT_OWNER_ID||'').trim();
let resolvedOwnerId='';
const isUuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
async function resolveOwnerId(){
  if(isUuid(OWNER_ENV))return OWNER_ENV;
  if(isUuid(resolvedOwnerId))return resolvedOwnerId;
  try{const saved=await authRead('app-owner-id');if(isUuid(saved)){resolvedOwnerId=saved;return resolvedOwnerId}}catch{}
  for(const table of ['pz_contacts','pz_campaigns','pz_orders']){
    try{const rows=await sb(`/rest/v1/${table}?select=owner_id&owner_id=not.is.null&limit=1`);const id=rows?.[0]?.owner_id;if(isUuid(id)){resolvedOwnerId=id;break}}catch{}
  }
  if(!isUuid(resolvedOwnerId))resolvedOwnerId=crypto.randomUUID();
  try{await authWrite('app-owner-id',resolvedOwnerId)}catch{}
  return resolvedOwnerId;
}
async function verifyUser(req,res,next){
  try{req.user={id:await resolveOwnerId(),email:null,mode:'single-operator'};next()}
  catch(e){res.status(500).json({error:'Não foi possível iniciar a sessão interna do Projeto Zap.'})}
}
app.get('/api/auth/config',(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({mode:'single-operator',loginRequired:false})});
app.get('/api/auth/me',verifyUser,(req,res)=>res.json({id:req.user.id,email:null,mode:'single-operator'}));

// ---------- WhatsApp: mantém a base estável aprovada ----------
let sock=null,starting=false,connected=false,qrDataUrl='',connectedNumber='',lastError='',lastConnectionAt=null;
async function authRead(id){const rows=await sb(`/rest/v1/zap_auth?select=value&id=eq.${encodeURIComponent(id)}&limit=1`);const row=Array.isArray(rows)?rows[0]:null;return row?JSON.parse(JSON.stringify(row.value),BufferJSON.reviver):null}
async function authWrite(id,value){const safe=JSON.parse(JSON.stringify(value,BufferJSON.replacer));await sb('/rest/v1/zap_auth?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id,value:safe,updated_at:nowIso()})})}
async function authDelete(id){await sb(`/rest/v1/zap_auth?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'})}
async function authClearAll(){await sb('/rest/v1/zap_auth?id=not.is.null',{method:'DELETE'})}
async function useSupabaseAuthState(){const creds=(await authRead('creds'))||initAuthCreds();return{state:{creds,keys:{get:async(type,ids)=>{const data={};await Promise.all(ids.map(async id=>{let value=await authRead(`${type}-${id}`);if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);data[id]=value}));return data},set:async(data)=>{const tasks=[];for(const category of Object.keys(data))for(const id of Object.keys(data[category])){const value=data[category][id];tasks.push(value?authWrite(`${category}-${id}`,value):authDelete(`${category}-${id}`))}await Promise.all(tasks)}}},saveCreds:()=>authWrite('creds',creds)}}
async function closeSocket(){try{sock?.ws?.close?.()}catch{}sock=null;connected=false;connectedNumber=''}

async function startWhatsApp(force=false){
  if(starting)return;if(sock&&!force)return;starting=true;if(force)await closeSocket();
  try{
    const {state,saveCreds}=await useSupabaseAuthState();const {version}=await fetchLatestBaileysVersion();
    sock=makeWASocket({version,auth:state,printQRInTerminal:false,logger:pino({level:'silent'}),browser:['Projeto Zap','Chrome','5.8.4'],markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,generateHighQualityLinkPreview:false});
    sock.ev.on('creds.update',saveCreds);
    sock.ev.on('connection.update',async update=>{
      const {connection,lastDisconnect,qr}=update;
      if(qr){qrDataUrl=await QRCode.toDataURL(qr,{margin:2,width:420});connected=false;lastError=''}
      if(connection==='open'){connected=true;qrDataUrl='';connectedNumber=digits(sock.user?.id?.split(':')?.[0]||sock.user?.id||'');lastConnectionAt=nowIso();lastError=''}
      if(connection==='close'){
        connected=false;const code=lastDisconnect?.error?.output?.statusCode||lastDisconnect?.error?.statusCode||0;const loggedOut=code===DisconnectReason.loggedOut;lastError=loggedOut?'WhatsApp desconectado pelo usuário.':String(lastDisconnect?.error?.message||'Conexão encerrada.');await closeSocket();if(!loggedOut)setTimeout(()=>startWhatsApp(false).catch(()=>{}),2500)
      }
    });
    sock.ev.on('messages.upsert',async({messages,type})=>{
      if(type!=='notify')return;
      for(const m of messages||[]){
        if(!m?.message)continue;const remote=String(m.key?.remoteJid||'');if(remote.endsWith('@g.us')||remote==='status@broadcast')continue;
        const from=digits(remote.split('@')[0]);
        if(m.key?.fromMe){await handleOutboundMirror(from,m).catch(()=>{});continue}
        await handleInboundBaileys(from,m).catch(e=>console.error('inbound',e.message));
      }
    });
  }catch(e){lastError=e.message;await closeSocket();throw e}finally{starting=false}
}

async function waExists(to){const n=normalizeBR(to);if(!/^55\d{10,11}$/.test(n))throw new Error('Telefone inválido. Use DDD + número.');const jid=`${n}@s.whatsapp.net`;const exists=await sock.onWhatsApp(jid);return {n,jid:exists?.[0]?.jid||jid}}
async function sendText(to,text){if(!sock||!connected)throw new Error('WhatsApp ainda não está conectado.');const {n,jid}=await waExists(to);const r=await sock.sendMessage(jid,{text:safeText(text)});return{id:r?.key?.id||null,to:n}}
function dataUrlToBuffer(dataUrl){const m=String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('Imagem inválida.');return{mime:m[1],buffer:Buffer.from(m[2],'base64')}}
async function sendImage(to,dataUrl,caption=''){if(!sock||!connected)throw new Error('WhatsApp ainda não está conectado.');const {n,jid}=await waExists(to);const {mime,buffer}=dataUrlToBuffer(dataUrl);if(!mime.startsWith('image/'))throw new Error('Arquivo da campanha não é uma imagem.');const r=await sock.sendMessage(jid,{image:buffer,caption:safeText(caption)});return{id:r?.key?.id||null,to:n}}

// ---------- helpers de dados ----------
async function findContactByPhone(from,ownerId=null){const q=ownerId?`&owner_id=eq.${encodeURIComponent(ownerId)}`:'';const rows=await sb(`/rest/v1/pz_contacts?select=id,owner_id,phone,name,group_name,status&limit=10000${q}`);const tail=tailPhone(from);return(rows||[]).find(c=>tailPhone(c.phone)===tail)||null}
async function latestActiveRecipient(contactId){if(!contactId)return null;const rows=await sb(`/rest/v1/pz_campaign_recipients?contact_id=eq.${encodeURIComponent(contactId)}&recipient_status=in.(ATIVO,RESPONDEU,PEDIDO,AGUARDANDO_COMPROVANTE)&select=*&order=created_at.desc&limit=1`);return rows?.[0]||null}
async function logEvent(recipient,type,source='baileys',extra={}){if(!recipient)return;try{await sb('/rest/v1/pz_campaign_events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:recipient.owner_id,recipient_id:recipient.id,campaign_id:recipient.campaign_id,contact_id:recipient.contact_id,event_type:type,event_source:source,payload:extra})})}catch{}}
async function getBotSettings(ownerId){try{return (await authRead(`settings-${ownerId}`))||null}catch{return null}}
async function getCampaign(id){const rows=await sb(`/rest/v1/pz_campaigns?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);return rows?.[0]||null}
async function getOrCreateOrder(recipient,contact){let rows=await sb(`/rest/v1/pz_orders?recipient_id=eq.${encodeURIComponent(recipient.id)}&status=not.eq.CONCLUIDA&select=*&order=created_at.desc&limit=1`);if(rows?.[0])return rows[0];rows=await sb('/rest/v1/pz_orders',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:recipient.owner_id,campaign_id:recipient.campaign_id,recipient_id:recipient.id,contact_id:contact.id,phone:contact.phone,customer_name:contact.name||null,status:'COLETA_PEDIDO'})});return rows?.[0]}
function extractMessage(raw){const m=raw.message||{};const text=m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.documentMessage?.caption||'';if(m.imageMessage)return{type:'image',text,mime:m.imageMessage.mimetype||'image/jpeg',fileName:null};if(m.documentMessage)return{type:'document',text,mime:m.documentMessage.mimetype||'',fileName:m.documentMessage.fileName||''};return{type:'text',text,mime:'text/plain',fileName:null}}
function parseOrderText(text){const t=safeText(text);let name=null,qty=null,contact=null;const nm=t.match(/nome\s*[:\-]\s*([^\n]+)/i);const qm=t.match(/(?:quantidade|qtd|bilhetes?)\s*[:\-]?\s*(\d{1,4})/i);const cm=t.match(/(?:contato|telefone|whatsapp)\s*[:\-]?\s*([+\d\s().-]{8,})/i);if(nm)name=nm[1].trim();if(qm)qty=Number(qm[1]);if(cm)contact=normalizeBR(cm[1]);if(!qty){const only=t.match(/^\s*(?:quero\s+)?(\d{1,4})(?:\s*bilhetes?)?\s*$/i);if(only)qty=Number(only[1])}return{name,qty,contact}}

async function handleInboundBaileys(from,raw){
  const contact=await findContactByPhone(from);if(!contact)return;
  const recipient=await latestActiveRecipient(contact.id);const parsed=extractMessage(raw);const ownerId=contact.owner_id;
  await sb('/rest/v1/pz_whatsapp_messages',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:ownerId,contact_id:contact.id,campaign_id:recipient?.campaign_id||null,recipient_id:recipient?.id||null,wa_message_id:String(raw?.key?.id||crypto.randomUUID()),direction:'IN',message_type:parsed.type,body:parsed.text||null,mime_type:parsed.mime||null,file_name:parsed.fileName||null,status:'RECEBIDA',phone:normalizeBR(from),raw_payload:{key:raw.key||null}})});
  if(!recipient)return;
  const n=nowIso();await sb(`/rest/v1/pz_campaign_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({recipient_status:'RESPONDEU',responded_at:n,updated_at:n})});
  await sb(`/rest/v1/pz_campaign_deliveries?recipient_id=eq.${recipient.id}&status=eq.AGENDADA`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'CANCELADA_RESPOSTA',updated_at:n})});await logEvent(recipient,'RESPONDEU');
  const settings=await getBotSettings(ownerId);if(!settings?.bot_enabled)return;
  const campaign=await getCampaign(recipient.campaign_id);const triggers=String(settings.trigger_words||'quero,comprar,compra,bilhete').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);const text=(parsed.text||'').toLowerCase();
  let order=await getOrCreateOrder(recipient,contact);
  if(parsed.type==='image'||(parsed.type==='document'&&(parsed.mime==='application/pdf'||/\.pdf$/i.test(parsed.fileName||'')))){
    await sb(`/rest/v1/pz_orders?id=eq.${order.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'COMPROVANTE_RECEBIDO',proof_type:parsed.type,proof_received_at:n,updated_at:n})});
    await sb(`/rest/v1/pz_campaign_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({recipient_status:'AGUARDANDO_CONFERENCIA',updated_at:n})});
    await sendText(contact.phone,'✅ Comprovante recebido. A Reino da Sorte fará a conferência do pagamento e dará continuidade ao seu pedido.').catch(()=>{});await logEvent(recipient,'COMPROVANTE_RECEBIDO');return;
  }
  const parsedOrder=parseOrderText(parsed.text);
  if(order.status==='COLETA_PEDIDO'&&(triggers.some(w=>text.includes(w))||parsedOrder.qty)){
    if(!parsedOrder.qty){await sendText(contact.phone,settings.order_prompt||'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:');return}
  }
  if(parsedOrder.qty){
    const unit=Number(campaign?.unit_price||3);const amount=Number((unit*parsedOrder.qty).toFixed(2));const customer=parsedOrder.name||order.customer_name||contact.name||'Cliente';
    await sb(`/rest/v1/pz_orders?id=eq.${order.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({customer_name:customer,quantity:parsedOrder.qty,contact_phone:parsedOrder.contact||contact.phone,unit_price:unit,total_amount:amount,status:'AGUARDANDO_COMPROVANTE',updated_at:n})});
    await sb(`/rest/v1/pz_campaign_recipients?id=eq.${recipient.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({recipient_status:'AGUARDANDO_COMPROVANTE',updated_at:n})});
    const pix=`🍀 *REINO DA SORTE*\nPedido: ${parsedOrder.qty} bilhete(s)\nValor: R$ ${amount.toFixed(2).replace('.',',')}\n\nPIX: ${settings.pix_key||''}\nFavorecido: ${settings.pix_name||''}\n\nApós o pagamento, envie aqui a foto ou PDF do comprovante.`;await sendText(contact.phone,pix);await logEvent(recipient,'PEDIDO_CRIADO',{quantity:parsedOrder.qty,total:amount});
  }
}
async function handleOutboundMirror(from,raw){
  const contact=await findContactByPhone(from);if(!contact)return;try{const p=extractMessage(raw);await sb('/rest/v1/pz_whatsapp_messages',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:contact.owner_id,contact_id:contact.id,wa_message_id:String(raw?.key?.id||crypto.randomUUID()),direction:'OUT',message_type:p.type,body:p.text||null,mime_type:p.mime||null,file_name:p.fileName||null,status:'ENVIADA',phone:normalizeBR(from),raw_payload:{key:raw.key||null}})})}catch{}
}

// ---------- agenda e campanhas ----------
async function selectTargetContacts(ownerId,mode,group,selectedIds=[]){
  let rows=await sb(`/rest/v1/pz_contacts?owner_id=eq.${encodeURIComponent(ownerId)}&status=eq.ATIVO&select=*&order=name.asc&limit=10000`);rows=rows||[];const ids=new Set(selectedIds||[]);
  if(mode==='group')return rows.filter(c=>c.group_name===group);if(mode==='manual')return rows.filter(c=>ids.has(c.id));if(mode==='exclude')return rows.filter(c=>!ids.has(c.id));return rows;
}
async function activateCampaign(ownerId,campaignId){
  const campaigns=await sb(`/rest/v1/pz_campaigns?id=eq.${encodeURIComponent(campaignId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*&limit=1`);const c=campaigns?.[0];if(!c)throw new Error('Campanha não encontrada.');
  const steps=await sb(`/rest/v1/pz_campaign_steps?campaign_id=eq.${encodeURIComponent(c.id)}&select=*&order=step_index.asc`);if(!steps?.length)throw new Error('Campanha sem etapas.');
  const contacts=await selectTargetContacts(ownerId,c.target_mode,c.target_group,c.selected_contact_ids||[]);if(!contacts.length)throw new Error('Nenhum contato elegível selecionado.');
  await sb(`/rest/v1/pz_campaign_deliveries?campaign_id=eq.${c.id}`,{method:'DELETE'});await sb(`/rest/v1/pz_campaign_recipients?campaign_id=eq.${c.id}`,{method:'DELETE'});
  const recs=await sb('/rest/v1/pz_campaign_recipients',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(contacts.map(ct=>({owner_id:ownerId,campaign_id:c.id,contact_id:ct.id,phone:ct.phone,recipient_status:'ATIVO'})))});
  const start=new Date(c.start_at);if(Number.isNaN(start.getTime()))throw new Error('Data do primeiro envio inválida.');let cumulative=0;const deliveries=[];
  for(const r of recs||[]){cumulative=0;for(const s of steps){if(s.step_index===1)cumulative=0;else cumulative+=Number(s.delay_minutes||0);const scheduled=new Date(start.getTime()+cumulative*60000).toISOString();deliveries.push({owner_id:ownerId,campaign_id:c.id,recipient_id:r.id,contact_id:r.contact_id,step_id:s.id,step_index:s.step_index,scheduled_at:scheduled,status:'AGENDADA'})}}
  for(let i=0;i<deliveries.length;i+=500)await sb('/rest/v1/pz_campaign_deliveries',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(deliveries.slice(i,i+500))});
  await sb(`/rest/v1/pz_campaigns?id=eq.${c.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'AGENDADA',activated_at:nowIso(),updated_at:nowIso()})});return{contacts:contacts.length,deliveries:deliveries.length};
}
let schedulerBusy=false;
async function processDueDeliveries(limit=30){
  if(schedulerBusy)return{processed:0,busy:true};schedulerBusy=true;let processed=0;
  try{
    if(!connected)return{processed:0,connected:false};const due=await sb(`/rest/v1/pz_campaign_deliveries?status=eq.AGENDADA&scheduled_at=lte.${encodeURIComponent(nowIso())}&select=*&order=scheduled_at.asc&limit=${limit}`);
    for(const d of due||[]){
      const rec=(await sb(`/rest/v1/pz_campaign_recipients?id=eq.${d.recipient_id}&select=*&limit=1`))?.[0];if(!rec||rec.recipient_status!=='ATIVO'){await sb(`/rest/v1/pz_campaign_deliveries?id=eq.${d.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'CANCELADA_ESTADO',updated_at:nowIso()})});continue}
      const contact=(await sb(`/rest/v1/pz_contacts?id=eq.${d.contact_id}&select=*&limit=1`))?.[0];const step=(await sb(`/rest/v1/pz_campaign_steps?id=eq.${d.step_id}&select=*&limit=1`))?.[0];if(!contact||!step)continue;
      try{const sent=step.image_data_url?await sendImage(contact.phone,step.image_data_url,step.message):await sendText(contact.phone,step.message);const n=nowIso();await sb(`/rest/v1/pz_campaign_deliveries?id=eq.${d.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'ENVIADA',sent_at:n,wa_message_id:sent.id,updated_at:n})});await sb(`/rest/v1/pz_campaign_recipients?id=eq.${rec.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({last_sent_at:n,last_step_index:d.step_index,updated_at:n})});await sb('/rest/v1/pz_whatsapp_messages',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:rec.owner_id,contact_id:rec.contact_id,campaign_id:rec.campaign_id,recipient_id:rec.id,wa_message_id:sent.id,direction:'OUT',message_type:step.image_data_url?'image':'text',body:step.message,status:'ENVIADA',phone:contact.phone})});await logEvent(rec,'ENVIO',{step:d.step_index});processed++}catch(e){await sb(`/rest/v1/pz_campaign_deliveries?id=eq.${d.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FALHA',error_text:e.message,updated_at:nowIso()})})}
    }
    const campaigns=await sb('/rest/v1/pz_campaigns?status=in.(AGENDADA,EM_EXECUCAO)&select=id');for(const c of campaigns||[]){const pending=await sb(`/rest/v1/pz_campaign_deliveries?campaign_id=eq.${c.id}&status=eq.AGENDADA&select=id&limit=1`);if(!pending?.length)await sb(`/rest/v1/pz_campaigns?id=eq.${c.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'FINALIZADA',updated_at:nowIso()})})}
    return{processed};
  }finally{schedulerBusy=false}
}
setInterval(()=>processDueDeliveries().catch(e=>console.error('scheduler',e.message)),SCHEDULER_INTERVAL_MS).unref();

// ---------- API ----------
app.get('/health',(req,res)=>res.json({ok:true,service:'projeto-zap-v5.8.3',connector:'baileys',connected}));
app.get('/api/whatsapp/status',verifyUser,(req,res)=>res.json({ok:true,connected,starting,number:connectedNumber||null,qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null,lastError:lastError||null,lastConnectionAt}));
app.post('/api/whatsapp/connect',verifyUser,async(req,res)=>{try{await startWhatsApp(Boolean(req.body?.force));res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/pairing-code',verifyUser,async(req,res)=>{try{const phone=normalizeBR(req.body?.phone);if(!/^55\d{10,11}$/.test(phone))return res.status(400).json({error:'Telefone inválido.'});if(!sock)await startWhatsApp(false);if(connected)return res.json({ok:true,connected:true});const code=await sock.requestPairingCode(phone);res.json({ok:true,code})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/send-test',verifyUser,async(req,res)=>{try{const d=await sendText(req.body?.to,req.body?.text||'Teste Projeto Zap V5.8.3 ✅');res.json({ok:true,...d})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/whatsapp/logout',verifyUser,async(req,res)=>{try{if(sock)try{await sock.logout()}catch{}await closeSocket();await authClearAll();qrDataUrl='';lastError='';res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/dashboard',verifyUser,async(req,res)=>{try{const oid=req.user.id;const [contacts,campaigns,returns,orders]=await Promise.all([sb(`/rest/v1/pz_contacts?owner_id=eq.${oid}&select=id,status`),sb(`/rest/v1/pz_campaigns?owner_id=eq.${oid}&select=id,status,start_at,name&order=created_at.desc`),sb(`/rest/v1/pz_campaign_recipients?owner_id=eq.${oid}&recipient_status=in.(RESPONDEU,PEDIDO,AGUARDANDO_COMPROVANTE,AGUARDANDO_CONFERENCIA)&select=id`),sb(`/rest/v1/pz_orders?owner_id=eq.${oid}&select=id,status`)]);res.json({contacts:(contacts||[]).length,campaigns:(campaigns||[]).length,scheduled:(campaigns||[]).filter(x=>x.status==='AGENDADA').length,running:(campaigns||[]).filter(x=>x.status==='EM_EXECUCAO').length,returns:(returns||[]).length,purchases:(orders||[]).filter(x=>x.status==='CONCLUIDA').length,next:(campaigns||[]).filter(x=>['RASCUNHO','AGENDADA'].includes(x.status)).sort((a,b)=>String(a.start_at).localeCompare(String(b.start_at))).slice(0,5)})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/contacts',verifyUser,async(req,res)=>{try{const rows=await sb(`/rest/v1/pz_contacts?owner_id=eq.${req.user.id}&select=*&order=name.asc&limit=10000`);res.json(rows||[])}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/contacts',verifyUser,async(req,res)=>{try{const phone=normalizeBR(req.body.phone);if(!/^55\d{10,11}$/.test(phone))return res.status(400).json({error:'Número inválido.'});const payload={owner_id:req.user.id,name:safeText(req.body.name)||phone,phone,group_name:safeText(req.body.group_name)||'NOVOS',status:req.body.status||'ATIVO',notes:safeText(req.body.notes)||'',updated_at:nowIso()};const existing=await sb(`/rest/v1/pz_contacts?owner_id=eq.${req.user.id}&phone=eq.${encodeURIComponent(phone)}&select=id&limit=1`);let rows;if(existing?.[0]){rows=await sb(`/rest/v1/pz_contacts?id=eq.${existing[0].id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)})}else{rows=await sb('/rest/v1/pz_contacts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)})}res.json(rows?.[0]||payload)}catch(e){res.status(500).json({error:e.message})}});
app.patch('/api/contacts/:id',verifyUser,async(req,res)=>{try{const patch={};for(const k of ['name','group_name','status'])if(k in req.body)patch[k]=safeText(req.body[k]);if('notes' in req.body)patch.notes=safeText(req.body.notes)||'';if(req.body.phone)patch.phone=normalizeBR(req.body.phone);patch.updated_at=nowIso();await sb(`/rest/v1/pz_contacts?id=eq.${req.params.id}&owner_id=eq.${req.user.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/contacts/:id',verifyUser,async(req,res)=>{try{await sb(`/rest/v1/pz_contacts?id=eq.${req.params.id}&owner_id=eq.${req.user.id}`,{method:'DELETE'});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/contacts/import',verifyUser,async(req,res)=>{try{const input=Array.isArray(req.body.contacts)?req.body.contacts:[];if(!input.length)return res.status(400).json({error:'Nenhum contato recebido.'});if(input.length>10000)return res.status(400).json({error:'Máximo de 10.000 contatos por importação.'});const valid=[],seen=new Set();let invalid=0,duplicates=0;for(const c of input){const phone=normalizeBR(c.phone);if(!/^55\d{10,11}$/.test(phone)){invalid++;continue}if(seen.has(phone)){duplicates++;continue}seen.add(phone);valid.push({owner_id:req.user.id,name:safeText(c.name)||phone,phone,group_name:safeText(c.group_name)||'IMPORTADOS',status:'ATIVO',notes:'',updated_at:nowIso()})}const existingRows=await sb(`/rest/v1/pz_contacts?owner_id=eq.${req.user.id}&select=phone&limit=10000`);const existingPhones=new Set((existingRows||[]).map(x=>normalizeBR(x.phone)));const fresh=valid.filter(x=>!existingPhones.has(x.phone));duplicates+=valid.length-fresh.length;for(let i=0;i<fresh.length;i+=500)await sb('/rest/v1/pz_contacts',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(fresh.slice(i,i+500))});res.json({ok:true,received:input.length,valid:fresh.length,invalid,duplicates})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/campaigns',verifyUser,async(req,res)=>{try{const rows=await sb(`/rest/v1/pz_campaigns?owner_id=eq.${req.user.id}&select=*&order=created_at.desc`);for(const c of rows||[]){c.steps=await sb(`/rest/v1/pz_campaign_steps?campaign_id=eq.${c.id}&select=id,step_index,delay_minutes,message,image_name,image_data_url&order=step_index.asc`);const stats=await sb(`/rest/v1/pz_campaign_deliveries?campaign_id=eq.${c.id}&select=status`);c.stats=(stats||[]).reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{})}res.json(rows||[])}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/campaigns',verifyUser,async(req,res)=>{try{const b=req.body||{};if(!safeText(b.name))return res.status(400).json({error:'Informe o nome da campanha.'});if(!b.start_at||Number.isNaN(new Date(b.start_at).getTime()))return res.status(400).json({error:'Informe a data/hora do primeiro envio.'});const steps=Array.isArray(b.steps)?b.steps:[];if(!steps.length)return res.status(400).json({error:'Crie pelo menos uma mensagem.'});const cr=await sb('/rest/v1/pz_campaigns',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:req.user.id,name:safeText(b.name),unit_price:Number(b.unit_price||3),start_at:new Date(b.start_at).toISOString(),target_mode:b.target_mode||'all',target_group:b.target_group||null,selected_contact_ids:b.selected_contact_ids||[],status:'RASCUNHO'})});const c=cr?.[0];const payload=steps.map((s,i)=>({owner_id:req.user.id,campaign_id:c.id,step_index:i+1,delay_minutes:i===0?0:Math.max(1,Number(s.delay_minutes||60)),message:safeText(s.message),image_data_url:s.image_data_url||null,image_name:s.image_name||null}));await sb('/rest/v1/pz_campaign_steps',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});if(b.activate){const r=await activateCampaign(req.user.id,c.id);return res.json({ok:true,campaign:c,activated:r})}res.json({ok:true,campaign:c})}catch(e){res.status(500).json({error:e.message})}});
app.patch('/api/campaigns/:id',verifyUser,async(req,res)=>{try{const id=req.params.id;const current=(await sb(`/rest/v1/pz_campaigns?id=eq.${encodeURIComponent(id)}&owner_id=eq.${req.user.id}&select=*&limit=1`))?.[0];if(!current)return res.status(404).json({error:'Campanha não encontrada.'});if(current.status!=='RASCUNHO')return res.status(400).json({error:'Somente campanhas em rascunho podem ser editadas.'});const b=req.body||{};if(!safeText(b.name))return res.status(400).json({error:'Informe o nome da campanha.'});if(!b.start_at||Number.isNaN(new Date(b.start_at).getTime()))return res.status(400).json({error:'Informe a data/hora do primeiro envio.'});const steps=Array.isArray(b.steps)?b.steps:[];if(!steps.length)return res.status(400).json({error:'Crie pelo menos uma mensagem.'});await sb(`/rest/v1/pz_campaigns?id=eq.${id}&owner_id=eq.${req.user.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({name:safeText(b.name),unit_price:Number(b.unit_price||3),start_at:new Date(b.start_at).toISOString(),target_mode:b.target_mode||'all',target_group:b.target_group||null,selected_contact_ids:b.selected_contact_ids||[],updated_at:nowIso()})});await sb(`/rest/v1/pz_campaign_steps?campaign_id=eq.${id}`,{method:'DELETE'});const payload=steps.map((st,i)=>({owner_id:req.user.id,campaign_id:id,step_index:i+1,delay_minutes:i===0?0:Math.max(1,Number(st.delay_minutes||60)),message:safeText(st.message),image_data_url:st.image_data_url||null,image_name:st.image_name||null}));await sb('/rest/v1/pz_campaign_steps',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});if(b.activate){const r=await activateCampaign(req.user.id,id);return res.json({ok:true,activated:r})}res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/campaigns/:id/activate',verifyUser,async(req,res)=>{try{res.json({ok:true,...await activateCampaign(req.user.id,req.params.id)})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/campaigns/:id/pause',verifyUser,async(req,res)=>{try{await sb(`/rest/v1/pz_campaigns?id=eq.${req.params.id}&owner_id=eq.${req.user.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAUSADA',updated_at:nowIso()})});await sb(`/rest/v1/pz_campaign_deliveries?campaign_id=eq.${req.params.id}&status=eq.AGENDADA`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAUSADA',updated_at:nowIso()})});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/campaigns/:id',verifyUser,async(req,res)=>{try{await sb(`/rest/v1/pz_campaigns?id=eq.${req.params.id}&owner_id=eq.${req.user.id}`,{method:'DELETE'});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/scheduler/run',verifyUser,async(req,res)=>{try{res.json({ok:true,...await processDueDeliveries(100)})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/returns',verifyUser,async(req,res)=>{try{const recs=await sb(`/rest/v1/pz_campaign_recipients?owner_id=eq.${req.user.id}&recipient_status=in.(RESPONDEU,PEDIDO,AGUARDANDO_COMPROVANTE,AGUARDANDO_CONFERENCIA,COMPRA_REALIZADA)&select=*&order=updated_at.desc&limit=1000`);const contacts=await sb(`/rest/v1/pz_contacts?owner_id=eq.${req.user.id}&select=id,name,phone`);const campaigns=await sb(`/rest/v1/pz_campaigns?owner_id=eq.${req.user.id}&select=id,name`);const orders=await sb(`/rest/v1/pz_orders?owner_id=eq.${req.user.id}&select=*&order=created_at.desc`);const cm=Object.fromEntries((contacts||[]).map(x=>[x.id,x]));const cam=Object.fromEntries((campaigns||[]).map(x=>[x.id,x]));res.json((recs||[]).map(r=>({...r,contact:cm[r.contact_id]||null,campaign:cam[r.campaign_id]||null,order:(orders||[]).find(o=>o.recipient_id===r.id)||null})))}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/orders',verifyUser,async(req,res)=>{try{const rows=await sb(`/rest/v1/pz_orders?owner_id=eq.${req.user.id}&select=*&order=created_at.desc`);res.json(rows||[])}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/orders/:id/confirm-payment',verifyUser,async(req,res)=>{try{const o=(await sb(`/rest/v1/pz_orders?id=eq.${req.params.id}&owner_id=eq.${req.user.id}&select=*&limit=1`))?.[0];if(!o)return res.status(404).json({error:'Pedido não encontrado.'});const n=nowIso();await sb(`/rest/v1/pz_orders?id=eq.${o.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'PAGAMENTO_CONFIRMADO',payment_confirmed_at:n,updated_at:n})});await sb(`/rest/v1/pz_campaign_recipients?id=eq.${o.recipient_id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({recipient_status:'PEDIDO',updated_at:n})});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/orders/:id/complete',verifyUser,async(req,res)=>{try{const o=(await sb(`/rest/v1/pz_orders?id=eq.${req.params.id}&owner_id=eq.${req.user.id}&select=*&limit=1`))?.[0];if(!o)return res.status(404).json({error:'Pedido não encontrado.'});const s=await getBotSettings(req.user.id);if(req.body.send_message!==false)await sendText(o.phone,s?.final_message||'🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀');const n=nowIso();await sb(`/rest/v1/pz_orders?id=eq.${o.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'CONCLUIDA',completed_at:n,updated_at:n})});await sb(`/rest/v1/pz_campaign_recipients?id=eq.${o.recipient_id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({recipient_status:'COMPRA_REALIZADA',updated_at:n})});await sb(`/rest/v1/pz_campaign_deliveries?recipient_id=eq.${o.recipient_id}&status=in.(AGENDADA,PAUSADA)`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'CANCELADA_COMPRA',updated_at:n})});res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/settings',verifyUser,async(req,res)=>{try{res.json((await getBotSettings(req.user.id))||{})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/settings',verifyUser,async(req,res)=>{try{const b=req.body||{};const payload={bot_enabled:Boolean(b.bot_enabled),pix_key:safeText(b.pix_key),pix_name:safeText(b.pix_name),trigger_words:safeText(b.trigger_words)||'quero,comprar,compra,bilhete',order_prompt:safeText(b.order_prompt)||'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:',final_message:safeText(b.final_message)||'🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀',updated_at:nowIso()};await authWrite(`settings-${req.user.id}`,payload);res.json(payload)}catch(e){res.status(500).json({error:e.message})}});

app.get('/',(req,res)=>res.sendFile(__dirname+'/index.html'));
app.listen(PORT,async()=>{console.log(`Projeto Zap V5.8.3 online na porta ${PORT}`);try{await startWhatsApp(false)}catch(e){console.log('WhatsApp aguardando configuração:',e.message)}});
