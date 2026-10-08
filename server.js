const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  BufferJSON,
  initAuthCreds,
  proto,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname, { etag: false, maxAge: 0 }));

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const OFFICE_WA_DEFAULT = String(process.env.OFFICE_WHATSAPP || '5588994943632').replace(/\D/g, '');
const PUBLIC_URL = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

function nowISO(){ return new Date().toISOString(); }
function digits(v){ return String(v || '').replace(/\D/g, ''); }
function cleanText(v){ return String(v || '').replace(/\u0000/g, '').trim(); }
function validBRPhone(v){ return /^55\d{10,11}$/.test(digits(v)); }
function normalizeBR(v){
  let n = digits(v);
  if(!n) return '';
  if(n.startsWith('00')) n = n.slice(2);
  if(!n.startsWith('55')) n = '55' + n;
  return n;
}
function shortCode(){ return crypto.randomBytes(4).toString('hex').toUpperCase(); }
async function uniqueCampaignCode(){
  for(let i=0;i<20;i++){
    const code=shortCode();
    const byCode=await one('rds10_campaigns',`select=id&code=eq.${encodeURIComponent(code)}`);
    const byLegacy=await one('rds10_campaigns',`select=id&short_code=eq.${encodeURIComponent(code)}`).catch(()=>null);
    if(!byCode && !byLegacy) return code;
  }
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}
function orderCode(){ return 'RDS-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }
function money(v){ return Number(v || 0).toFixed(2).replace('.', ','); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function sb(path, opt={}){
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase não configurado no Render.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
  const r = await fetch(SUPABASE_URL + path, {
    ...opt,
    signal:controller.signal,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if(!r.ok) throw new Error(data?.message || data?.details || data?.hint || `Supabase ${r.status}`);
  return data;
  }catch(e){
    if(e?.name==='AbortError') throw new Error('Supabase demorou mais de 12 segundos para responder.');
    throw e;
  }finally{clearTimeout(timeout);}
}
async function insert(table, row, returning='representation'){
  return sb(`/rest/v1/${table}`, { method:'POST', headers:{Prefer:`return=${returning}`}, body:JSON.stringify(row) });
}
async function patch(table, filter, row){
  return sb(`/rest/v1/${table}?${filter}`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row) });
}
async function del(table, filter){
  return sb(`/rest/v1/${table}?${filter}`, { method:'DELETE', headers:{Prefer:'return=minimal'} });
}
async function one(table, query){
  const rows = await sb(`/rest/v1/${table}?${query}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function list(table, query='select=*'){
  const rows = await sb(`/rest/v1/${table}?${query}`);
  return Array.isArray(rows) ? rows : [];
}

// ---------------- WhatsApp / Baileys ----------------
let sock = null, starting = false, connected = false, qrDataUrl = '', connectedNumber = '', lastError = '', lastConnectionAt = null, qrUpdatedAt = null, qrExpiresAt = null, waManualDisconnect = false, waControlLoaded = false, waReconnectAttempts = 0, waLastDisconnectCode = 0, waLastEventAt = null;
const messageCache = new Map(); // key.id -> full message, usado para reenvio/recuperação de mensagem
const retryCounterCache = new Map(); // mantém o ciclo de retry de descriptografia durante reconexões do socket
const signalLogger = pino({level:'silent'});
const lidToPn = new Map();
let lastInboundAt = 0;

async function authRead(id){
  const row = await one('zap_auth', `select=value&id=eq.${encodeURIComponent(id)}`);
  return row ? JSON.parse(JSON.stringify(row.value), BufferJSON.reviver) : null;
}
async function authWrite(id, value){
  const safe = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  await sb('/rest/v1/zap_auth?on_conflict=id', { method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify({ id, value:safe, updated_at:nowISO() }) });
}
async function authDelete(id){ await del('zap_auth', `id=eq.${encodeURIComponent(id)}`); }
async function loadWaControl(){
  if(waControlLoaded) return waManualDisconnect;
  waControlLoaded=true;
  try{
    const row=await one('zap_auth','select=value&id=eq.rds_whatsapp_control');
    waManualDisconnect=Boolean(row?.value?.manualDisconnect);
  }catch{}
  return waManualDisconnect;
}
async function setWaManualDisconnect(value){
  waManualDisconnect=Boolean(value);
  waControlLoaded=true;
  try{
    await authWrite('rds_whatsapp_control',{manualDisconnect:waManualDisconnect,updated_at:nowISO()});
  }catch{}
}
async function clearWaAuthState(){
  try{
    const rows=await list('zap_auth','select=id&limit=5000');
    for(const row of rows||[]){
      if(row?.id && row.id!=='rds_whatsapp_control') await authDelete(row.id).catch(()=>{});
    }
  }catch{}
}
async function useSupabaseAuthState(){
  const creds = (await authRead('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async(type, ids) => {
          const data = {};
          await Promise.all(ids.map(async id => {
            let value = await authRead(`${type}-${id}`);
            if(type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }));
          return data;
        },
        set: async(data) => {
          const tasks = [];
          for(const category of Object.keys(data || {})){
            for(const id of Object.keys(data[category] || {})){
              const value = data[category][id];
              tasks.push(value ? authWrite(`${category}-${id}`, value) : authDelete(`${category}-${id}`));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => authWrite('creds', creds)
  };
}
function rememberMessage(m){
  const id = m?.key?.id;
  if(!id) return;
  messageCache.set(id, m);
  if(messageCache.size > 1500){
    const first = messageCache.keys().next().value;
    messageCache.delete(first);
  }
}
async function recoverSentMessage(key){
  const id = key?.id;
  if(!id) return undefined;
  const cached = messageCache.get(id)?.message;
  if(cached) return cached;
  // Retry após restart/deploy: recupera mensagens de texto já registradas no Supabase.
  // O WhatsApp/Baileys usa getMessage quando um dispositivo pede nova tentativa de descriptografia.
  try{
    const row = await one('rds10_messages', `select=body,message_type&wa_message_id=eq.${encodeURIComponent(id)}&direction=eq.OUT&order=created_at.desc&limit=1`);
    if(row?.message_type === 'text' && cleanText(row.body)) return proto.Message.fromObject({ conversation: cleanText(row.body) });
  }catch{}
  return undefined;
}
const retryCache = {
  get: key => retryCounterCache.get(key),
  set: (key,value) => { retryCounterCache.set(key,value); if(retryCounterCache.size>3000) retryCounterCache.delete(retryCounterCache.keys().next().value); },
  del: key => retryCounterCache.delete(key),
  flushAll: () => retryCounterCache.clear()
};
function pnJidFromKey(m){
  const key = m?.key || {};
  const candidates = [
    key.senderPn, key.remoteJidAlt, key.participantAlt,
    m?.senderPn, m?.remoteJidAlt, m?.participantAlt,
    key.remoteJid, key.participant
  ].filter(Boolean).map(String);
  for(const jid of candidates){
    if(jid.endsWith('@s.whatsapp.net')) return jid;
  }
  return '';
}
function resolveInboundIdentity(m){
  const remote = String(m?.key?.remoteJid || '');
  const pnJid = pnJidFromKey(m);
  let phone = pnJid ? digits(pnJid.split('@')[0]) : '';
  if(phone && !phone.startsWith('55')) phone = normalizeBR(phone);
  if(remote.endsWith('@lid') && phone) lidToPn.set(remote, phone);
  if(!phone && remote.endsWith('@lid') && lidToPn.has(remote)) phone = lidToPn.get(remote);
  if(!phone && remote.endsWith('@s.whatsapp.net')) phone = normalizeBR(remote.split('@')[0]);
  return { remoteJid:remote, phone:validBRPhone(phone) ? phone : '', lid:remote.endsWith('@lid') ? remote : '' };
}
function unwrapMessageContent(m){
  let x = m?.message || {};
  for(let i=0;i<8;i++){
    const next =
      x.ephemeralMessage?.message ||
      x.viewOnceMessage?.message ||
      x.viewOnceMessageV2?.message ||
      x.viewOnceMessageV2Extension?.message ||
      x.documentWithCaptionMessage?.message ||
      x.deviceSentMessage?.message ||
      x.editedMessage?.message ||
      x.keepInChatMessage?.message;
    if(!next || next===x) break;
    x=next;
  }
  return x;
}
function extractInbound(m){
  const x = unwrapMessageContent(m);
  const text = cleanText(
    x.conversation ||
    x.extendedTextMessage?.text ||
    x.imageMessage?.caption ||
    x.videoMessage?.caption ||
    x.documentMessage?.caption ||
    x.buttonsResponseMessage?.selectedDisplayText ||
    x.buttonsResponseMessage?.selectedButtonId ||
    x.listResponseMessage?.title ||
    x.listResponseMessage?.singleSelectReply?.selectedRowId ||
    x.templateButtonReplyMessage?.selectedDisplayText ||
    x.interactiveResponseMessage?.body?.text ||
    x.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    x.pollUpdateMessage?.name ||
    x.reactionMessage?.text ||
    ''
  );
  let type = 'text';
  let media = false;
  if(x.imageMessage){ type='image'; media=true; }
  else if(x.documentMessage){ type='document'; media=true; }
  else if(x.videoMessage){ type='video'; media=true; }
  else if(x.audioMessage){ type='audio'; media=true; }
  else if(x.stickerMessage){ type='sticker'; media=true; }
  else if(x.pollCreationMessageV3 || x.pollCreationMessage){ type='poll'; }
  else if(x.reactionMessage){ type='reaction'; }
  return { text, type, media, rawKeys:Object.keys(x) };
}
async function closeSocket(){ try{ sock?.ws?.close?.(); }catch{} sock=null; connected=false; connectedNumber=''; qrDataUrl=''; qrUpdatedAt=null; qrExpiresAt=null; }

async function logHistoryMessages(messages=[]){
  const rows=[];
  for(const m of messages||[]){
    if(!m?.key?.id) continue;
    const identity=resolveInboundIdentity(m);
    if(!identity.phone) continue;
    const extracted=extractInbound(m);
    const ts=Number(m.messageTimestamp||0);
    const createdAt=ts>0 ? new Date(ts*1000).toISOString() : nowISO();
    rows.push({
      phone:identity.phone,
      lid:identity.lid||null,
      direction:m.key?.fromMe?'OUT':'IN',
      message_type:extracted.type||'text',
      body:extracted.text||null,
      status:m.key?.fromMe?'ENVIADA':'RECEBIDA',
      wa_message_id:m.key.id,
      raw_payload:{
        remoteJid:m.key?.remoteJid||null,
        fromMe:Boolean(m.key?.fromMe),
        history:true,
        media:Boolean(extracted.media),
        createdAt,
        rawMessage: extracted.media ? JSON.parse(JSON.stringify(m, BufferJSON.replacer)) : null
      },
      created_at:createdAt
    });
  }
  // Deduplicate inside the sync batch.
  const unique=[...new Map(rows.map(x=>[x.wa_message_id,x])).values()];
  for(let i=0;i<unique.length;i+=100){
    const batch=unique.slice(i,i+100);
    try{
      await insert('rds10_messages',batch,'minimal');
    }catch(e){
      // A replayed history chunk may contain messages already persisted.
      // Fall back to one-by-one only for this small failed batch.
      for(const row of batch){
        try{
          const exists=await one('rds10_messages',`select=id&wa_message_id=eq.${encodeURIComponent(row.wa_message_id)}`);
          if(!exists) await insert('rds10_messages',row,'minimal');
        }catch{}
      }
    }
  }
  return unique.length;
}
async function persistHistoryContacts(contacts=[]){
  // Histórico do WhatsApp pode ser exibido na aba WhatsApp, mas nunca cria clientes no CRM.
  return 0;
}
async function persistHistorySet(data={}){
  try{
    for(const mapping of data.lidPnMappings||[]){
      const lid=String(mapping?.lid||mapping?.lidJid||mapping?.lidUser||'');
      const pn=String(mapping?.pn||mapping?.pnJid||mapping?.phoneNumber||'');
      if(lid && pn){
        const n=normalizeBR(pn.replace(/@s\\.whatsapp\\.net$/,'').replace(/@s\\.whatsapp\\.net$/,''));
        if(validBRPhone(n)) lidToPn.set(lid.includes('@')?lid:`${lid}@lid`,n);
      }
    }
    const contactsSaved=await persistHistoryContacts(data.contacts||[]);
    const messagesSaved=await logHistoryMessages(data.messages||[]);
    console.log('[RDS WA] histórico sincronizado',{chats:(data.chats||[]).length,contacts:contactsSaved,messages:messagesSaved,isLatest:Boolean(data.isLatest),progress:data.progress,syncType:String(data.syncType||'')});
  }catch(e){
    console.error('[RDS WA] falha ao persistir histórico:',e.message);
  }
}

async function startWhatsApp(force=false){
  await loadWaControl();
  if(waManualDisconnect && !force) return;
  if(starting) return;
  if(sock && !force) return;
  starting = true;
  if(force){ await setWaManualDisconnect(false); await closeSocket(); }
  try{
    const { state, saveCreds } = await useSupabaseAuthState();
    const { version } = await fetchLatestBaileysVersion();
    // O cache do Signal evita leituras concorrentes/repetidas no banco durante a
    // negociação das chaves dos vários dispositivos do mesmo contato.
    const stableAuth = { ...state, keys: makeCacheableSignalKeyStore(state.keys, signalLogger) };
    sock = makeWASocket({
      version,
      auth: stableAuth,
      printQRInTerminal:false,
      logger:pino({level:'silent'}),
      browser:['CANAL DE VENDAS RDS','Chrome','10.3'],
      markOnlineOnConnect:false,
      syncFullHistory:true,
      shouldSyncHistoryMessage:()=>true,
      generateHighQualityLinkPreview:false,
      maxMsgRetryCount:12,
      retryRequestDelayMs:350,
      msgRetryCounterCache: retryCache,
      getMessage: recoverSentMessage
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;
      if(qr){ qrDataUrl = await QRCode.toDataURL(qr,{margin:2,width:520}); qrUpdatedAt=nowISO(); qrExpiresAt=new Date(Date.now()+60000).toISOString(); connected=false; lastError=''; waLastEventAt=nowISO(); console.log('[RDS WA] QR disponível; expira em 60s'); }
      if(connection === 'open'){
        connected = true; qrDataUrl=''; qrUpdatedAt=null; qrExpiresAt=null;
        connectedNumber = normalizeBR(String(sock.user?.id || '').split(':')[0].split('@')[0]);
        lastConnectionAt = nowISO(); lastError=''; waReconnectAttempts=0; waLastDisconnectCode=0; waLastEventAt=nowISO();
        console.log('[RDS WA] conexão aberta', connectedNumber || 'sem número');
        await setWaManualDisconnect(false);
        try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
      }
      if(connection === 'close'){
        connected=false;
        const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 0;
        const loggedOut = code === DisconnectReason.loggedOut;
        const manual = waManualDisconnect;
        waLastDisconnectCode=Number(code||0); waLastEventAt=nowISO(); qrDataUrl=''; qrUpdatedAt=null; qrExpiresAt=null;
        lastError = loggedOut ? (manual ? 'Conexão encerrada manualmente.' : 'O WhatsApp encerrou/revogou este dispositivo. Será necessário vincular novamente.') : cleanText(lastDisconnect?.error?.message || 'Conexão encerrada.');
        console.warn('[RDS WA] conexão fechada', {code,loggedOut,manual,message:lastError});
        await closeSocket();
        if(!manual){
          if(loggedOut) await clearWaAuthState();
          waReconnectAttempts=Math.min(waReconnectAttempts+1,8);
          const delay=Math.min(30000,1500*Math.pow(2,waReconnectAttempts-1));
          console.log('[RDS WA] nova tentativa automática em '+delay+'ms');
          setTimeout(()=>startWhatsApp(false).catch(e=>console.error('[RDS WA] reconexão:',e.message)), delay);
        }
      }
    });
    sock.ev.on('messaging-history.set', async history => {
      await persistHistorySet(history||{});
    });
    sock.ev.on('messages.upsert', async ({messages, type, requestId}) => {
      // 'notify' inclui mensagens novas recebidas enquanto o dispositivo estava
      // online e também notificações pendentes entregues após uma reconexão.
      // Não descartamos requestId: o próprio Baileys informa que ele pode
      // representar mensagens que estavam pendentes enquanto o telefone estava
      // indisponível.
      if(type !== 'notify') return;
      console.log('[RDS WA] messages.upsert', {type,requestId:requestId||null,count:(messages||[]).length});
      for(const m of messages || []){
        rememberMessage(m);
        if(!m?.message || m.key?.fromMe) continue;
        const remote = String(m.key?.remoteJid || '');
        if(remote.endsWith('@g.us') || remote === 'status@broadcast' || remote.endsWith('@broadcast')) continue;
        lastInboundAt = Date.now();
        await handleInbound(m).catch(async e => {
          console.error('INBOUND', e.message);
          try{ await addAlert('ERRO_ENTRADA', e.message, { remoteJid:remote }); }catch{}
        });
      }
    });
    sock.ev.on('messages.update', updates => {
      for(const u of updates || []){
        if(u?.key?.id && messageCache.has(u.key.id)){
          const old = messageCache.get(u.key.id);
          messageCache.set(u.key.id, {...old, update:u.update});
        }
      }
    });
  }catch(e){ lastError=e.message; await closeSocket(); throw e; }
  finally{ starting=false; }
}

async function ensureTargetJid(phone){
  if(!sock || !connected) throw new Error('WhatsApp não está conectado.');
  const n = normalizeBR(phone);
  if(!validBRPhone(n)) throw new Error('Telefone inválido para envio.');
  const pn = `${n}@s.whatsapp.net`;
  const found = await sock.onWhatsApp(pn);
  if(!found?.[0]?.exists) throw new Error('Número não possui WhatsApp ou não pôde ser validado.');
  const jid = found[0].jid || pn;
  if(found[0].lid) lidToPn.set(String(found[0].lid), n);
  return { phone:n, jid };
}
async function sendToJid(jid, content){
  if(!sock || !connected) throw new Error('WhatsApp não está conectado.');
  const r = await sock.sendMessage(jid, content);
  rememberMessage(r);
  try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
  return r;
}
async function sendTextPhone(phone, text){
  const { phone:n, jid } = await ensureTargetJid(phone);
  const body = cleanText(text);
  if(!body) throw new Error('Mensagem vazia bloqueada.');
  const r = await sendToJid(jid,{text:body});
  await logMessage({phone:n,direction:'OUT',type:'text',body,status:'ENVIADA',waId:r?.key?.id,raw:{jid,rawMessage:r ? JSON.parse(JSON.stringify(r, BufferJSON.replacer)) : null}});
  return {id:r?.key?.id,phone:n,jid};
}
async function replyInbound(identity, text){
  const body = cleanText(text);
  if(!body) return;
  let jid = identity.remoteJid;
  if(identity.phone){
    try{ jid = (await ensureTargetJid(identity.phone)).jid; }catch{ /* resposta pelo chat original */ }
  }
  const r = await sendToJid(jid,{text:body});
  await logMessage({phone:identity.phone || null,lid:identity.lid || null,direction:'OUT',type:'text',body,status:'ENVIADA',waId:r?.key?.id,raw:{jid,rawMessage:r ? JSON.parse(JSON.stringify(r, BufferJSON.replacer)) : null}});
  return r;
}

// ---------------- Persistência operacional ----------------
async function addAlert(kind, title, payload={}){
  try{ await insert('rds10_alerts',{kind,title,payload,is_read:false,created_at:nowISO()},'minimal'); }catch{}
}
async function logEvent(kind, payload={}){
  try{ await insert('rds10_events',{event_type:String(kind||'RDS_EVENT'),metadata:payload||{},kind,payload:payload||{},created_at:nowISO()},'minimal'); }catch(e){ console.error('[RDS] logEvent:',e.message); }
}
async function logMessage({phone=null,lid=null,direction,type='text',body=null,status='RECEBIDA',waId=null,raw={}}){
  try{
    await insert('rds10_messages',{phone,lid,direction,message_type:type,body,wa_message_id:waId,status,raw_payload:raw,created_at:nowISO()},'minimal');
  }catch{}
}
async function getSettings(){
  let s = await one('rds10_settings','select=*&id=eq.1');
  if(!s){
    const rows = await insert('rds10_settings',{id:1,bot_enabled:true,office_whatsapp:OFFICE_WA_DEFAULT,unit_price:3,router_enabled:true,updated_at:nowISO()});
    s = rows?.[0] || {};
  }
  return s;
}
function phoneKey(v){
  const n = normalizeBR(v);
  return validBRPhone(n) ? n : '';
}
function isAutoContactName(name=''){
  return /^(SEM NOME|Cliente \d{4}|WhatsApp \d{4})$/i.test(cleanText(name));
}
function isWhatsAppOnlyContact(c){
  return ['WHATSAPP','WHATSAPP_HISTORICO'].includes(String(c?.origin||'').trim().toUpperCase());
}
async function findContact(phone){
  const key = phoneKey(phone);
  if(!key) return null;
  let c = await one('rds10_contacts',`select=*&phone=eq.${encodeURIComponent(key)}`);
  if(c) return c;
  // Não fazer varredura da tabela inteira aqui: isso deixava o cadastro lento
  // e podia ultrapassar o timeout quando o CRM tinha muitos registros.
  return null;
}
async function saveOrMergeContact(data, {preferExisting=true}={}){
  const phone = phoneKey(data.phone);
  if(!phone) throw new Error('Telefone inválido.');
  const existing = await findContact(phone);
  const name = cleanText(data.name);
  if(existing){
    const patchData = { updated_at:nowISO() };
    const crmOrigin=['MANUAL','IMPORTACAO'].includes(String(data.origin||'').trim().toUpperCase());
    if(name && (isAutoContactName(existing.name) || data.force_name || crmOrigin)) patchData.name = name;
    if(data.group_name && (!existing.group_name || existing.group_name==='ENTRADA WHATSAPP' || data.force_group || crmOrigin)) patchData.group_name = cleanText(data.group_name);
    if(data.city) patchData.city = cleanText(data.city);
    if(data.tags) patchData.tags = cleanText(data.tags);
    if(data.lid && !existing.lid) patchData.lid = data.lid;
    if(data.last_seen_at) patchData.last_seen_at = data.last_seen_at;
    if(data.validated === true) patchData.validated = true;
    if(['MANUAL','IMPORTACAO'].includes(String(data.origin||'').trim().toUpperCase())) patchData.origin=String(data.origin).trim().toUpperCase();
    const rows = await patch('rds10_contacts',`id=eq.${existing.id}`,patchData);
    return {contact:rows?.[0] || {...existing,...patchData}, merged:true};
  }
  const rows = await insert('rds10_contacts',{
    name:name || `Cliente ${phone.slice(-4)}`,
    phone,
    lid:data.lid || null,
    group_name:cleanText(data.group_name)||'NOVOS',
    city:cleanText(data.city)||null,
    tags:cleanText(data.tags)||null,
    status:data.status||'ATIVO',
    origin:data.origin||'MANUAL',
    validated:Boolean(data.validated),
    last_seen_at:data.last_seen_at||null,
    created_at:nowISO(),updated_at:nowISO()
  });
  return {contact:rows?.[0], merged:false};
}
// RDS CRM ISOLATION V1
// Mensagens recebidas pelo WhatsApp NÃO criam clientes no CRM automaticamente.
// O CRM é alimentado somente por cadastro/importação e pelo fluxo comercial
// que efetivamente cria um cliente/pedido.
async function upsertInboundContact(identity, pushName=''){
  return null;
}
async function rdsWhatsappSellerId(){
  const active=await list('rds10_sellers','select=id,status&status=eq.ATIVO&order=created_at.asc');
  if(active.length===1)return active[0].id;
  const authorized=await list('rds10_seller_settings','select=seller_id,official_authorized&official_authorized=eq.true&limit=20');
  const ids=[...new Set(authorized.map(x=>x?.seller_id).filter(Boolean))];
  if(ids.length===1){
    const seller=active.find(x=>String(x.id)===String(ids[0]));
    if(seller)return seller.id;
  }
  return null;
}
async function activeOrder(phone){
  const sellerId=await rdsWhatsappSellerId();
  const sellerFilter=sellerId?`&seller_id=eq.${encodeURIComponent(sellerId)}`:'';
  return one('rds10_orders',`select=*&phone=eq.${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)${sellerFilter}&order=created_at.desc`);
}
async function createOrder(phone, campaignCode=null){
  const existing = await activeOrder(phone);
  if(existing) return existing;
  const sellerId=await rdsWhatsappSellerId();
  if(!sellerId)throw new Error('Não foi possível identificar o vendedor responsável pelo WhatsApp. Configure um único vendedor ATIVO para este canal.');
  const s = await getSettings();

  // Se a compra veio de uma campanha, o pedido herda obrigatoriamente
  // o vínculo com o sorteio oficial escolhido nessa campanha.
  let campaign=null;
  const normalizedCampaignCode=cleanText(campaignCode||'').replace(/^RDS[-_:]?/i,'').trim();
  if(normalizedCampaignCode){
    campaign=await one('rds10_campaigns',`select=id,code,short_code,unit_price,official_draw_id,official_draw_title,status&or=(code.eq.${encodeURIComponent(normalizedCampaignCode)},short_code.eq.${encodeURIComponent(normalizedCampaignCode)})`).catch(()=>null);
    if(!campaign) throw new Error('Campanha não encontrada ou inválida.');
    if(!campaign.official_draw_id) throw new Error('A campanha não possui sorteio oficial vinculado.');
    if(String(campaign.status||'').toUpperCase()==='RASCUNHO') throw new Error('A campanha ainda não está ativa.');
  }

  const rows = await insert('rds10_orders',{
    code:orderCode(),
    seller_id:sellerId,
    phone,
    campaign_code:campaign?.code||normalizedCampaignCode||null,
    campaign_id:campaign?.id||null,
    official_draw_id:campaign?.official_draw_id||null,
    official_draw_title:campaign?.official_draw_title||null,
    status:'COLETANDO_DADOS',
    unit_price:Number(campaign?.unit_price||s.unit_price||3),
    created_at:nowISO(),
    updated_at:nowISO()
  });
  return rows?.[0];
}
function parseOrderForm(text){
  const t = cleanText(text);
  const get = label => {
    const re = new RegExp(`${label}\\s*[:\-]\\s*([^\\n\\r]+)`,'i');
    return cleanText(t.match(re)?.[1] || '');
  };
  let qty = Number((get('quantidade').match(/\d+/)||[])[0] || 0);
  return { quantity:qty, name:get('nome'), contact:get('contato') };
}
function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\s*COMPRAR|COMPRE\s*AGORA/i.test(text); }
function isOfficeRoute(text){ return /OUTRO\s*ASSUNTO|ATENDENTE|ESCRIT[ÓO]RIO/i.test(text); }
function looksLikeForm(text){ return /quantidade\s*[:\-]/i.test(text) || (/nome\s*[:\-]/i.test(text) && /contato\s*[:\-]/i.test(text)); }
function routerMessage(settings){ return `🍀 *CANAL DE VENDAS RDS*\n\n1️⃣ *Comprar bilhetes*\n2️⃣ *Consultar meu pedido*\n3️⃣ *Falar com atendente*\n4️⃣ *Ver este menu novamente*\n\nDigite apenas o número da opção.`; }
async function beginOrder(identity, campaignCode=null){
  if(!identity.phone){ await replyInbound(identity,'Não consegui identificar seu número de WhatsApp. Envie novamente.'); return; }
  const normalizedCampaignCode=cleanText(campaignCode||'').replace(/^RDS[-_:]?/i,'').trim()||null;
  const order=await createOrder(identity.phone,normalizedCampaignCode);
  // O contexto comercial fica gravado no próprio pedido. A partir daqui,
  // quantidade/nome/pagamento não dependem mais de o cliente repetir o código.
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode:normalizedCampaignCode,campaignId:order.campaign_id||null,officialDrawId:order.official_draw_id||null});
  await replyInbound(identity,`🛒 *COMPRA DE BILHETES*\n\nPedido: *${order.code}*${order.official_draw_title ? `\n🎯 Sorteio: *${order.official_draw_title}*` : ''}\n\nInforme apenas a *quantidade* de bilhetes.\nExemplo: *5*\n\nDigite *CANCELAR* para sair.`);
}
async function handleOrderForm(identity, order, text){
  const t=cleanText(text);
  if(order.status!=='COLETANDO_DADOS') return;
  if(!order.quantity){
    const m=t.match(/^(?:QUERO\s*)?(\d{1,4})(?:\s*BILHETES?)?$/i), qty=m?Number(m[1]):0;
    if(!qty||qty<1){ await replyInbound(identity,'Informe somente a quantidade de bilhetes usando números.\nExemplo: *5*'); return; }
    await patch('rds10_orders',`id=eq.${order.id}`,{quantity:qty,updated_at:nowISO()}); order.quantity=qty;
    await replyInbound(identity,`Quantidade: *${qty}* bilhete(s).\n\nAgora informe seu *nome completo*.\n\nDigite *CANCELAR* para sair.`); return;
  }
  const name=t.replace(/\s+/g,' ').trim();
  if(name.length<3||/^(\d+|CANCELAR|SAIR|REINICIAR)$/i.test(name)){ await replyInbound(identity,'Informe seu *nome completo* para continuar.\n\nDigite *CANCELAR* para sair.'); return; }
  const quantity=Number(order.quantity||0), total=Number((quantity*Number(order.unit_price||3)).toFixed(2));
  if(identity.phone){
    const existing=await findContact(identity.phone);
    const existingOrigin=String(existing?.origin||'').trim().toUpperCase();
    const historicalOnly=['WHATSAPP','WHATSAPP_HISTORICO'].includes(existingOrigin);
    if(existing && historicalOnly){
      const autoName=typeof rdsAutoContactName==='function' ? rdsAutoContactName(name) : ('Cliente '+name.split(/\\s+/).slice(0,2).join(' '));
      await patch('rds10_contacts',`id=eq.${existing.id}`,{
        name:autoName,
        group_name:'INTERESSADOS',
        origin:'PEDIDO',
        status:'ATIVO',
        validated:true,
        whatsapp_validated:true,
        last_seen_at:nowISO(),
        updated_at:nowISO()
      });
    }else if(existing){
      await patch('rds10_contacts',`id=eq.${existing.id}`,{
        name: name || existing.name,
        group_name:existing.group_name||'INTERESSADOS',
        origin:['IMPORTACAO','MANUAL','PEDIDO','COMPRA'].includes(existingOrigin)?existing.origin:'PEDIDO',
        validated:true,
        whatsapp_validated:true,
        last_seen_at:nowISO(),
        updated_at:nowISO()
      });
    }else{
      await saveOrMergeContact({
        name,
        phone:identity.phone,
        group_name:'INTERESSADOS',
        origin:'PEDIDO',
        validated:true,
        last_seen_at:nowISO()
      });
    }
  }
  await patch('rds10_orders',`id=eq.${order.id}`,{customer_name:name,contact_phone:identity.phone,quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  const settings=await getSettings(), pix=cleanText(settings.pix_key||'PIX NÃO CONFIGURADO');
  await replyInbound(identity,`✅ *PEDIDO RECEBIDO*\n\n👤 ${name}\n🎟 ${quantity} bilhete(s)\n💰 Total: *R$ ${money(total)}*\n🧾 Pedido: *${order.code}*\n\n💳 *PAGAMENTO PIX*\nChave: ${pix}\nFavorecido: ${cleanText(settings.pix_name||'REINO DA SORTE')}\nValor: *R$ ${money(total)}*\n\nApós pagar, envie o comprovante aqui 👇`);
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity,total});
}
async function handleProof(identity, order, inbound){
  await patch('rds10_orders',`id=eq.${order.id}`,{status:'AGUARDANDO_CONFERENCIA',proof_type:inbound.type,proof_received_at:nowISO(),updated_at:nowISO()});
  await addAlert('COMPROVANTE',`Comprovante recebido — ${order.code}`,{phone:identity.phone,order:order.code});
  await replyInbound(identity,`✅ Comprovante recebido.\nSeu pedido *${order.code}* está aguardando conferência do pagamento.`);
  await logEvent('COMPROVANTE_RECEBIDO',{phone:identity.phone,order:order.code});
}
async function handleInbound(m){
  const identity = resolveInboundIdentity(m);
  const inbound = extractInbound(m);
  const pushName = cleanText(m?.pushName || '');
  await logMessage({
    phone:identity.phone||null,
    lid:identity.lid||null,
    direction:'IN',
    type:inbound.type,
    body:inbound.text||null,
    status:'RECEBIDA',
    waId:m?.key?.id,
    raw:{
      remoteJid:identity.remoteJid,
      remoteJidAlt:m?.key?.remoteJidAlt||null,
      senderPn:m?.key?.senderPn||null,
      pushName,
      rawKeys:inbound.rawKeys,
      media:Boolean(inbound.media),
      rawMessage:inbound.media ? JSON.parse(JSON.stringify(m, BufferJSON.replacer)) : null
    }
  });

  if(!identity.phone && identity.lid){
    await addAlert('LID_SEM_PN','Mensagem recebida com LID sem número real; contato não foi criado.',{lid:identity.lid,pushName,text:inbound.text});
  }
  // WhatsApp e CRM são caixas separadas. A mensagem permanece no WhatsApp;
  // nenhum contato é criado no CRM apenas por receber uma mensagem.
  const contact = null;
  const settings = await getSettings();
  if(!settings.bot_enabled) return;

  const text = inbound.text;
  let order = identity.phone ? await activeOrder(identity.phone) : null;
  const menuText=cleanText(text);
  if(["0","4","MENU","INICIO","OI","OLA"].includes(menuText)) return replyInbound(identity,routerMessage(settings));
  if(!order){
    if(menuText==="1") return beginOrder(identity,null);
    if(menuText==="3"){ const office=normalizeBR(settings.office_whatsapp || OFFICE_WA_DEFAULT); return replyInbound(identity,"🏢 *ATENDIMENTO*\n"+(office||"ATENDIMENTO")); }
    if(menuText==="2") return replyInbound(identity,"🔎 *CONSULTAR PEDIDO*\n\nEnvie o código do pedido.");
  }

  // Comprovante tem prioridade quando há pedido aguardando pagamento.
  if(order && inbound.media && ['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(order.status)){
    return handleProof(identity,order,inbound);
  }

  if(order){
    if(order.status === 'COLETANDO_DADOS'){
      if(/^(CANCELAR|SAIR|REINICIAR)$/i.test(cleanText(text))){
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',updated_at:nowISO()});
        return replyInbound(identity,routerMessage(settings));
      }
      if(isOfficeRoute(text)){
        const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',updated_at:nowISO()});
        return replyInbound(identity,`🏢 Atendimento do escritório:\nhttps://wa.me/${office}?text=${encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')}`);
      }
      return handleOrderForm(identity,order,text);
    }
    if(order.status === 'AGUARDANDO_PAGAMENTO'){
      if(inbound.media) return handleProof(identity,order,inbound);
      return replyInbound(identity,`Seu pedido *${order.code}* está aguardando pagamento de *R$ ${money(order.total_amount)}*. Após pagar, envie o comprovante aqui.`);
    }
    if(order.status === 'AGUARDANDO_CONFERENCIA') return replyInbound(identity,`Seu comprovante do pedido *${order.code}* já está aguardando conferência. Assim que confirmado, seguimos com a emissão dos bilhetes.`);
    if(order.status === 'PAGO_AGUARDANDO_BILHETES') return replyInbound(identity,`Pagamento confirmado ✅\nPedido *${order.code}* aguardando envio dos bilhetes pelo operador.`);
  }

  if(isOfficeRoute(text)){
    const office = normalizeBR(settings.office_whatsapp || OFFICE_WA_DEFAULT);
    await logEvent('ENCAMINHADO_ESCRITORIO',{phone:identity.phone||null});
    return replyInbound(identity,`🏢 *OUTRO ASSUNTO*\nFale diretamente com o escritório:\nhttps://wa.me/${office}?text=${encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')}`);
  }
  if(isBuyRoute(text)){
    const code = (text.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1] || null;
    return beginOrder(identity,code);
  }
  return replyInbound(identity,routerMessage(settings));
}

// ---------------- Campanhas / fila ----------------
async function cancelFutureDeliveries(phone, reason){
  if(!phone) return;
  const rows = await list('rds10_deliveries',`select=id,status&phone=eq.${encodeURIComponent(phone)}&status=eq.AGENDADA`);
  for(const d of rows) await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:reason,updated_at:nowISO()});
}
async function campaignTargets(c){
  if(c.target_mode === 'individual'){
    const ids = Array.isArray(c.selected_contact_ids) ? c.selected_contact_ids : [];
    if(!ids.length) return [];
    return list('rds10_contacts',`select=*&id=in.(${ids.join(',')})&status=eq.ATIVO&validated=eq.true`);
  }
  if(c.target_mode === 'group') return list('rds10_contacts',`select=*&group_name=eq.${encodeURIComponent(c.target_group)}&status=eq.ATIVO&validated=eq.true`);
  return list('rds10_contacts','select=*&status=eq.ATIVO&validated=eq.true');
}
async function activateCampaign(campaignId){
  const c = await one('rds10_campaigns',`select=*&id=eq.${campaignId}`);
  if(!c) throw new Error('Campanha não encontrada.');
  const steps = await list('rds10_campaign_steps',`select=*&campaign_id=eq.${campaignId}&order=step_index.asc`);
  if(!steps.length) throw new Error('Campanha sem mensagens.');
  const targets = await campaignTargets(c);
  if(!targets.length) throw new Error('Nenhum contato válido selecionado.');
  const start = new Date(c.start_at);
  if(Number.isNaN(start.getTime())) throw new Error('Data/hora inicial inválida.');
  let cumulative = 0;
  for(const contact of targets){
    cumulative = 0;
    for(const step of steps){
      cumulative += Number(step.delay_minutes || 0);
      const scheduled = new Date(start.getTime() + cumulative*60000).toISOString();
      await insert('rds10_deliveries',{campaign_id:c.id,campaign_code:c.code,step_id:step.id,step_index:step.step_index,contact_id:contact.id,phone:contact.phone,scheduled_at:scheduled,status:'AGENDADA',created_at:nowISO(),updated_at:nowISO()},'minimal');
    }
  }
  await patch('rds10_campaigns',`id=eq.${campaignId}`,{status:'ATIVA',activated_at:nowISO(),updated_at:nowISO()});
  return {targets:targets.length,deliveries:targets.length*steps.length};
}
async function sendDelivery(d){
  const order = await activeOrder(d.phone);
  if(order){
    await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:'CLIENTE_EM_PEDIDO',updated_at:nowISO()});
    return;
  }
  const step = await one('rds10_campaign_steps',`select=*&id=eq.${d.step_id}`);
  if(!step) throw new Error('Etapa não encontrada.');
  const c = await one('rds10_campaigns',`select=*&id=eq.${d.campaign_id}`);
  const cta = c?.cta_enabled !== false ? `\n\n🛒 *COMPRE AGORA:* https://wa.me/${connectedNumber}?text=${encodeURIComponent('QUERO COMPRAR RDS-' + (c?.code || ''))}` : '';
  const body = cleanText(step.message) + cta;
  const result = await sendTextPhone(d.phone,body);
  await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'ENVIADA',sent_at:nowISO(),wa_message_id:result.id,updated_at:nowISO()});
}
let queueBusy = false;
async function processQueue(){
  if(queueBusy || !connected) return;
  queueBusy=true;
  try{
    const due = await list('rds10_deliveries',`select=*&status=eq.AGENDADA&scheduled_at=lte.${encodeURIComponent(nowISO())}&order=scheduled_at.asc&limit=20`);
    for(const d of due){
      try{ await sendDelivery(d); }
      catch(e){ await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'FALHA',error_text:e.message,updated_at:nowISO()}); await addAlert('FALHA_ENVIO',`Falha no envio para ${d.phone}`,{delivery:d.id,error:e.message}); }
      await sleep(900);
    }
  }finally{ queueBusy=false; }
}
setInterval(()=>processQueue().catch(()=>{}), 15000);
setInterval(()=>{
  // Supervisão conservadora: nunca derruba uma sessão saudável e nunca limpa a autenticação.
  if(!waManualDisconnect && !connected && !starting && !qrDataUrl) startWhatsApp(false).catch(e=>console.error('[RDS WA] supervisor:',e.message));
}, 30000);

// ---------------- API ----------------
app.get('/health',(req,res)=>res.json({ok:true,service:'CANAL DE VENDAS RDS V10 FINAL',version:'10.3',connected,lastConnectionAt,lastError,qrAvailable:Boolean(qrDataUrl),manualDisconnect:waManualDisconnect,reconnectAttempts:waReconnectAttempts,lastDisconnectCode:waLastDisconnectCode}));
app.get('/api/status',async(req,res)=>{ try{ await loadWaControl(); res.json({ok:true,connected,number:connectedNumber||null,starting,manualDisconnect:waManualDisconnect,qrAvailable:Boolean(qrDataUrl),qrDataUrl,qrUpdatedAt,qrExpiresAt,lastError,lastConnectionAt,lastDisconnectCode:waLastDisconnectCode,reconnectAttempts:waReconnectAttempts,lastEventAt:waLastEventAt,cacheMessages:messageCache.size,lidMappings:lidToPn.size,provider:'baileys-linked-device'}); }catch(e){res.status(500).json({ok:false,error:e.message});} });
app.post('/api/whatsapp/connect',async(req,res)=>{ try{ await setWaManualDisconnect(false); const force=Boolean(req.body?.force); if(connected && !force)return res.json({ok:true,connected:true}); await startWhatsApp(force); res.json({ok:true,starting:Boolean(starting),qrAvailable:Boolean(qrDataUrl)}); }catch(e){res.status(500).json({error:e.message});} });
app.post('/api/whatsapp/logout',async(req,res)=>{ try{ await setWaManualDisconnect(true); if(sock) try{await sock.logout();}catch{}; await closeSocket(); qrDataUrl=''; qrUpdatedAt=null; qrExpiresAt=null; connected=false; connectedNumber=''; waReconnectAttempts=0; waLastDisconnectCode=DisconnectReason.loggedOut; lastError='Conexão encerrada manualmente pelo painel.'; await clearWaAuthState(); res.json({ok:true,manualDisconnect:true}); }catch(e){res.status(500).json({error:e.message});} });
app.post('/api/whatsapp/test',async(req,res)=>{ try{ const r=await sendTextPhone(req.body.phone, req.body.text || '✅ Teste CANAL DE VENDAS RDS V10 FINAL'); res.json({ok:true,...r}); }catch(e){res.status(400).json({error:e.message});} });

app.get('/api/dashboard',async(req,res)=>{
  try{
    const [contacts,campaigns,queue,sent,returns,orders,alerts,failed] = await Promise.all([
      list('rds10_contacts','select=id,origin&status=eq.ATIVO'),
      list('rds10_campaigns','select=id,status&status=neq.EXCLUIDA'),
      list('rds10_deliveries','select=id,scheduled_at&status=eq.AGENDADA'),
      list('rds10_deliveries','select=id&status=eq.ENVIADA'),
      list('rds10_messages','select=id&direction=eq.IN'),
      list('rds10_orders','select=id,status,total_amount'),
      list('rds10_alerts','select=id&is_read=eq.false'),
      list('rds10_deliveries','select=id&status=eq.FALHA')
    ]);
    const crmContacts=contacts.filter(c=>!isWhatsAppOnlyContact(c));
    const purchases=orders.filter(x=>x.status==='CONCLUIDO');
    const revenue=purchases.reduce((s,x)=>s+Number(x.total_amount||0),0);
    res.json({
      contacts:crmContacts.length,campaigns:campaigns.length,queue:queue.length,sent:sent.length,
      returns:returns.length,orders:orders.length,purchases:purchases.length,revenue,
      alerts:alerts.length,failed:failed.length,connected,number:connectedNumber,
      proofReview:orders.filter(x=>x.status==='AGUARDANDO_CONFERENCIA').length,
      ticketsPending:orders.filter(x=>x.status==='PAGO_AGUARDANDO_BILHETES').length,
      nextSend:queue.sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))[0]?.scheduled_at||null
    });
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/groups',async(req,res)=>{ try{res.json(await list('rds10_groups','select=*&order=name.asc'));}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/groups',async(req,res)=>{ try{ const name=cleanText(req.body.name).toUpperCase(); if(!name) throw new Error('Nome obrigatório.'); const rows=await insert('rds10_groups',{name,created_at:nowISO()}); res.json(rows[0]);}catch(e){res.status(400).json({error:e.message});} });

app.get('/api/contacts',async(req,res)=>{ try{
  // O CRM não deve listar a agenda/histórico do WhatsApp como clientes.
  // Registros antigos de WhatsApp permanecem preservados para a aba WhatsApp.
  const rows=await list('rds10_contacts','select=id,name,phone,group_name,city,tags,status,origin,notes,whatsapp_validated,opted_out,last_interaction_at,created_at,updated_at,lid,validated,last_seen_at,seller_id&origin=in.(IMPORTACAO,MANUAL,PEDIDO,COMPRA)&order=created_at.desc&limit=500');
  res.json(rows);
}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/contacts',async(req,res)=>{
  try{
    const phone=phoneKey(req.body.phone);
    if(!phone) throw new Error('Telefone inválido.');
    // Cadastro manual não deve depender de uma consulta ao WhatsApp.
    // A validação do número é uma ação separada no botão "Validar".
    const valid=false;
    const r=await saveOrMergeContact({
      name:req.body.name,phone,
      group_name:req.body.group_name||'NOVOS',
      city:req.body.city,tags:req.body.tags,
      status:req.body.status||'ATIVO',
      origin:'MANUAL',validated:valid,
      force_name:true,force_group:true
    });
    res.json({...r.contact,merged:r.merged});
  }catch(e){res.status(400).json({error:e.message});}
});
app.put('/api/contacts/:id',async(req,res)=>{ try{ const row={...req.body,updated_at:nowISO()}; if(row.phone) row.phone=normalizeBR(row.phone); const rows=await patch('rds10_contacts',`id=eq.${req.params.id}`,row); res.json(rows[0]); }catch(e){res.status(400).json({error:e.message});} });
app.delete('/api/contacts/:id',async(req,res)=>{ try{await del('rds10_contacts',`id=eq.${req.params.id}`);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});} });
app.post('/api/contacts/:id/validate',async(req,res)=>{ try{ const c=await one('rds10_contacts',`select=*&id=eq.${req.params.id}`); if(!c) throw new Error('Contato não encontrado.'); const pn=`${normalizeBR(c.phone)}@s.whatsapp.net`; const f=await sock.onWhatsApp(pn); const ok=Boolean(f?.[0]?.exists); const rows=await patch('rds10_contacts',`id=eq.${c.id}`,{validated:ok,updated_at:nowISO()}); res.json(rows[0]); }catch(e){res.status(400).json({error:e.message});} });
app.post('/api/contacts/import',async(req,res)=>{
  try{
    const items=Array.isArray(req.body.items)?req.body.items:[]; const saved=[],duplicates=[],invalid=[];
    for(const item of items){
      const phone=normalizeBR(item.phone); if(!validBRPhone(phone)){invalid.push(item);continue;}
      const existing=await findContact(phone);
      if(existing && !isWhatsAppOnlyContact(existing)){duplicates.push(item);continue;}
      const r=await saveOrMergeContact({name:item.name,phone,group_name:item.group_name||'IMPORTADOS',origin:'IMPORTACAO',status:'ATIVO',validated:false,force_name:true,force_group:true});
      if(r.contact) saved.push(r.contact);
    }
    res.json({saved:saved.length,duplicates:duplicates.length,invalid:invalid.length});
  }catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/campaigns',async(req,res)=>{ try{ const cs=await list('rds10_campaigns','select=*&order=created_at.desc'); for(const c of cs){ const ds=await list('rds10_deliveries',`select=status&campaign_id=eq.${c.id}`); c.metrics={total:ds.length,queue:ds.filter(x=>x.status==='AGENDADA').length,sent:ds.filter(x=>x.status==='ENVIADA').length,failed:ds.filter(x=>x.status==='FALHA').length,cancelled:ds.filter(x=>x.status==='CANCELADA').length}; } res.json(cs);}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/campaigns',async(req,res)=>{
  try{
    const b=req.body||{}; const code=await uniqueCampaignCode();
    const rows=await insert('rds10_campaigns',{code,short_code:code,name:cleanText(b.name),unit_price:Number(b.unit_price||3),start_at:b.start_at,target_mode:b.target_mode||'all',target_group:b.target_group||null,selected_contact_ids:Array.isArray(b.selected_contact_ids)?b.selected_contact_ids:[],cta_enabled:b.cta_enabled!==false,official_draw_id:cleanText(b.official_draw_id||'')||null,official_draw_title:cleanText(b.official_draw_title||'')||null,status:'RASCUNHO',created_at:nowISO(),updated_at:nowISO()});
    const c=rows[0]; const steps=Array.isArray(b.steps)?b.steps:[];
    for(let i=0;i<steps.length;i++) await insert('rds10_campaign_steps',{campaign_id:c.id,step_index:i+1,delay_minutes:i===0?0:Number(steps[i].delay_minutes||0),message:cleanText(steps[i].message),created_at:nowISO()},'minimal');
    res.json(c);
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/campaigns/:id/activate',async(req,res)=>{ try{res.json({ok:true,...await activateCampaign(req.params.id)});}catch(e){res.status(400).json({error:e.message});} });
app.post('/api/campaigns/:id/duplicate',async(req,res)=>{ try{ const c=await one('rds10_campaigns',`select=*&id=eq.${req.params.id}`); const steps=await list('rds10_campaign_steps',`select=*&campaign_id=eq.${req.params.id}&order=step_index.asc`); const newCode=await uniqueCampaignCode(); const rows=await insert('rds10_campaigns',{...c,id:undefined,code:newCode,short_code:newCode,name:`${c.name} (cópia)`,status:'RASCUNHO',activated_at:null,created_at:nowISO(),updated_at:nowISO()}); const nc=rows[0]; for(const s of steps) await insert('rds10_campaign_steps',{campaign_id:nc.id,step_index:s.step_index,delay_minutes:s.delay_minutes,message:s.message,created_at:nowISO()},'minimal'); res.json(nc);}catch(e){res.status(400).json({error:e.message});} });
app.delete('/api/campaigns/:id',async(req,res)=>{ try{await del('rds10_deliveries',`campaign_id=eq.${req.params.id}`);await del('rds10_campaign_steps',`campaign_id=eq.${req.params.id}`);await del('rds10_campaigns',`id=eq.${req.params.id}`);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});} });
app.get('/api/campaigns/:id/details',async(req,res)=>{ try{ const c=await one('rds10_campaigns',`select=*&id=eq.${req.params.id}`); const steps=await list('rds10_campaign_steps',`select=*&campaign_id=eq.${req.params.id}&order=step_index.asc`); const deliveries=await list('rds10_deliveries',`select=*&campaign_id=eq.${req.params.id}&order=scheduled_at.asc`); res.json({campaign:c,steps,deliveries});}catch(e){res.status(500).json({error:e.message});} });

app.get('/api/execution',async(req,res)=>{ try{ const cs=await list('rds10_campaigns','select=*&status=in.(ATIVA,FINALIZADA)&order=created_at.desc'); for(const c of cs){ c.deliveries=await list('rds10_deliveries',`select=*&campaign_id=eq.${c.id}&order=scheduled_at.asc`); } res.json(cs);}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/process-now',async(req,res)=>{ try{await processQueue();res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

app.get('/api/returns',async(req,res)=>{ try{res.json(await list('rds10_messages','select=*&direction=eq.IN&order=created_at.desc&limit=300'));}catch(e){res.status(500).json({error:e.message});} });
app.get('/api/orders',async(req,res)=>{ try{res.json(await list('rds10_orders','select=*&order=updated_at.desc'));}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/orders/:id/payment-confirmed',async(req,res)=>{ try{ const o=await one('rds10_orders',`select=*&id=eq.${req.params.id}`); if(!o) throw new Error('Pedido não encontrado.'); await patch('rds10_orders',`id=eq.${o.id}`,{status:'PAGO_AGUARDANDO_BILHETES',payment_confirmed_at:nowISO(),updated_at:nowISO()}); await sendTextPhone(o.phone,`✅ *PAGAMENTO CONFIRMADO*\nPedido ${o.code}.\nSeus bilhetes serão emitidos e enviados em seguida.`); res.json({ok:true}); }catch(e){res.status(400).json({error:e.message});} });
app.post('/api/orders/:id/tickets-sent',async(req,res)=>{ try{
  const o=await one('rds10_orders',`select=*&id=eq.${req.params.id}`);
  const s=await getSettings();
  if(!o) throw new Error('Pedido não encontrado.');
  await patch('rds10_orders',`id=eq.${o.id}`,{status:'CONCLUIDO',completed_at:nowISO(),updated_at:nowISO()});
  if(o.phone){
    const c=await findContact(o.phone);
    if(c) await patch('rds10_contacts',`id=eq.${c.id}`,{
      name:cleanText(o.customer_name)||c.name,
      group_name:'COMPRA REALIZADA',
      validated:true,
      last_seen_at:nowISO(),
      updated_at:nowISO()
    });
    else await saveOrMergeContact({name:cleanText(o.customer_name)||`Cliente ${o.phone.slice(-4)}`,phone:o.phone,group_name:'COMPRA REALIZADA',origin:'COMPRA',validated:true,last_seen_at:nowISO()});
  }
  await cancelFutureDeliveries(o.phone,'COMPRA_CONCLUIDA');
  await sendTextPhone(o.phone,cleanText(s.final_message)||`✅ *COMPRA CONCLUÍDA*\nSeus bilhetes foram enviados. 🍀\nA Reino da Sorte agradece sua compra.\nBoa sorte! 🍀\n\nPedido ${o.code}`);
  res.json({ok:true});
}catch(e){res.status(400).json({error:e.message});} });
app.post('/api/orders/:id/cancel',async(req,res)=>{ try{const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id));if(!o)throw new Error('Pedido não encontrado.');if(['CONCLUIDO','CANCELADO'].includes(String(o.status||'')))throw new Error('Pedido já encerrado.');await patch('rds10_orders','id=eq.'+encodeURIComponent(o.id),{status:'CANCELADO',cancel_reason:'CANCELAMENTO_MANUAL',cancelled_at:nowISO(),updated_at:nowISO()});await cancelFutureDeliveries(o.phone,'CANCELAMENTO_MANUAL');await logEvent('PEDIDO_CANCELADO',{order:o.code,phone:o.phone,reason:'CANCELAMENTO_MANUAL',source:'OPERADOR'});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});} });


app.get('/api/contacts/:id/profile',async(req,res)=>{
  try{
    const c=await one('rds10_contacts',`select=*&id=eq.${req.params.id}`);
    if(!c) throw new Error('Contato não encontrado.');
    const [orders,messages,deliveries]=await Promise.all([
      list('rds10_orders',`select=*&phone=eq.${encodeURIComponent(c.phone)}&order=updated_at.desc`),
      list('rds10_messages',`select=*&phone=eq.${encodeURIComponent(c.phone)}&order=created_at.desc&limit=100`),
      list('rds10_deliveries',`select=*&phone=eq.${encodeURIComponent(c.phone)}&order=scheduled_at.desc&limit=100`)
    ]);
    const completed=orders.filter(x=>x.status==='CONCLUIDO');
    res.json({contact:c,orders,messages,deliveries,metrics:{
      orders:orders.length,purchases:completed.length,
      spent:completed.reduce((s,x)=>s+Number(x.total_amount||0),0),
      inbound:messages.filter(x=>x.direction==='IN').length,
      campaigns:new Set(deliveries.map(x=>x.campaign_id).filter(Boolean)).size
    }});
  }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/automation-center',async(req,res)=>{
  try{
    const [queue,failed,alerts,orders,campaigns]=await Promise.all([
      list('rds10_deliveries','select=*&status=eq.AGENDADA&order=scheduled_at.asc&limit=100'),
      list('rds10_deliveries','select=*&status=eq.FALHA&order=updated_at.desc&limit=50'),
      list('rds10_alerts','select=*&is_read=eq.false&order=created_at.desc&limit=50'),
      list('rds10_orders','select=*&status=not.in.(CONCLUIDO,CANCELADO)&order=updated_at.desc&limit=100'),
      list('rds10_campaigns','select=*&status=in.(ATIVA,RASCUNHO)&order=updated_at.desc&limit=50')
    ]);
    res.json({
      queue,failed,alerts,orders,campaigns,
      next:queue[0]||null,
      stats:{
        queue:queue.length,failed:failed.length,alerts:alerts.length,
        awaitingProof:orders.filter(x=>x.status==='AGUARDANDO_PAGAMENTO').length,
        proofReview:orders.filter(x=>x.status==='AGUARDANDO_CONFERENCIA').length,
        tickets:orders.filter(x=>x.status==='PAGO_AGUARDANDO_BILHETES').length
      }
    });
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/deliveries/:id/retry',async(req,res)=>{
  try{
    const d=await one('rds10_deliveries',`select=*&id=eq.${req.params.id}`);
    if(!d) throw new Error('Envio não encontrado.');
    await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'AGENDADA',scheduled_at:nowISO(),error_text:null,updated_at:nowISO()});
    res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/settings',async(req,res)=>{ try{res.json(await getSettings());}catch(e){res.status(500).json({error:e.message});} });
app.put('/api/settings',async(req,res)=>{ try{ const rows=await patch('rds10_settings','id=eq.1',{...req.body,id:undefined,updated_at:nowISO()}); res.json(rows[0]);}catch(e){res.status(400).json({error:e.message});} });
app.post('/api/settings/test-bot',async(req,res)=>{ try{ const s=await getSettings(); const phone=normalizeBR(req.body.phone||connectedNumber); await sendTextPhone(phone,routerMessage(s)); res.json({ok:true}); }catch(e){res.status(400).json({error:e.message});} });

app.get('/api/alerts',async(req,res)=>{ try{res.json(await list('rds10_alerts','select=*&order=created_at.desc&limit=100'));}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/alerts/read-all',async(req,res)=>{ try{await patch('rds10_alerts','is_read=eq.false',{is_read:true});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });
app.get('/api/diagnostic',async(req,res)=>{
  const tables=['rds10_groups','rds10_contacts','rds10_campaigns','rds10_campaign_steps','rds10_deliveries','rds10_messages','rds10_settings','rds10_orders','rds10_alerts','rds10_events','zap_auth'];
  const db={}; for(const t of tables){ try{await list(t,'select=*&limit=1');db[t]='OK';}catch(e){db[t]=e.message;} }
  res.json({version:'10.3',supabase:Boolean(SUPABASE_URL&&SUPABASE_KEY),whatsapp:{connected,number:connectedNumber,lastError,lastConnectionAt,lastInboundAt:lastInboundAt?new Date(lastInboundAt).toISOString():null,messageCache:messageCache.size,lidMappings:lidToPn.size},db});
});

app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));
app.listen(PORT,async()=>{
  console.log(`CANAL DE VENDAS RDS V10 FINAL 10.3 — porta ${PORT}`);
  try{ await loadWaControl(); await startWhatsApp(false); }catch(e){ console.error('WhatsApp aguardando:',e.message); }
});
