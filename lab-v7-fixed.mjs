import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import { Boom } from '@hapi/boom'
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto
} from '@whiskeysockets/baileys'

const app = express()
app.use(express.json({ limit: '5mb' }))

const PORT = Number(process.env.PORT || 3000)
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
const AUTH_PREFIX = 'labv7:'
const logger = P({ level: process.env.LAB_LOG_LEVEL || 'info' })

let sock = null
let starting = false
let connected = false
let qrDataUrl = ''
let connectedNumber = ''
let lastError = ''
let connectedAt = null
let lastInbound = null
let lastOutbound = null
let lastAck = null
let reconnectTimer = null

const messageStore = new Map()
const lidToPn = new Map()
const writeLocks = new Map()
const metrics = {
  socketStarts: 0,
  reconnects: 0,
  sent: 0,
  received: 0,
  acks: 0,
  errors: 0
}

function nowISO(){ return new Date().toISOString() }
function digits(v){ return String(v || '').replace(/\D/g, '') }
function clean(v){ return String(v || '').replace(/\u0000/g, '').trim() }
function normalizeBR(v){
  let n = digits(v)
  if(!n) return ''
  if(n.startsWith('00')) n = n.slice(2)
  if(!n.startsWith('55')) n = '55' + n
  return n
}
function validBR(v){ return /^55\d{10,11}$/.test(normalizeBR(v)) }
function msSince(iso){ return iso ? Date.now() - new Date(iso).getTime() : null }

async function sb(path, opt={}){
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase nao configurado')
  const r = await fetch(SUPABASE_URL + path, {
    ...opt,
    headers:{
      apikey: SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json',
      ...(opt.headers || {})
    }
  })
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if(!r.ok) throw new Error(data?.message || data?.details || `Supabase ${r.status}`)
  return data
}

async function oneAuth(id){
  const rows = await sb(`/rest/v1/zap_auth?select=value&id=eq.${encodeURIComponent(AUTH_PREFIX + id)}&limit=1`)
  const row = Array.isArray(rows) ? rows[0] : null
  return row ? JSON.parse(JSON.stringify(row.value), BufferJSON.reviver) : null
}

async function writeAuth(id, value){
  const key = AUTH_PREFIX + id
  const previous = writeLocks.get(key) || Promise.resolve()
  const next = previous.catch(()=>{}).then(async()=>{
    if(value == null){
      await sb(`/rest/v1/zap_auth?id=eq.${encodeURIComponent(key)}`, { method:'DELETE', headers:{ Prefer:'return=minimal' } })
      return
    }
    const safe = JSON.parse(JSON.stringify(value, BufferJSON.replacer))
    await sb('/rest/v1/zap_auth?on_conflict=id', {
      method:'POST',
      headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
      body:JSON.stringify({ id:key, value:safe, updated_at:nowISO() })
    })
  })
  writeLocks.set(key, next)
  try { await next } finally { if(writeLocks.get(key) === next) writeLocks.delete(key) }
}

async function useDbAuthState(){
  const creds = (await oneAuth('creds')) || initAuthCreds()
  const rawKeys = {
    get: async(type, ids) => {
      const out = {}
      for(const id of ids){
        let value = await oneAuth(`${type}:${id}`)
        if(type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value)
        if(value != null) out[id] = value
      }
      return out
    },
    set: async(data) => {
      for(const [type, values] of Object.entries(data || {})){
        for(const [id, value] of Object.entries(values || {})){
          await writeAuth(`${type}:${id}`, value)
        }
      }
    },
    clear: async() => {
      await sb(`/rest/v1/zap_auth?id=like.${encodeURIComponent(AUTH_PREFIX + '*')}`, { method:'DELETE', headers:{ Prefer:'return=minimal' } })
    }
  }
  return {
    state:{ creds, keys:rawKeys },
    saveCreds:()=>writeAuth('creds', creds)
  }
}

function rememberMessage(m){
  const id = m?.key?.id
  if(!id) return
  messageStore.set(id, m?.message || m)
  if(messageStore.size > 1000) messageStore.delete(messageStore.keys().next().value)
}

async function getMessage(key){
  const hit = messageStore.get(key?.id)
  if(hit?.message) return hit.message
  return hit || undefined
}

function resolvePhone(m){
  const key = m?.key || {}
  const candidates = [
    key.senderPn,
    key.remoteJidAlt,
    key.participantAlt,
    m?.senderPn,
    key.remoteJid,
    key.participant
  ].filter(Boolean).map(String)
  for(const jid of candidates){
    if(jid.endsWith('@s.whatsapp.net')){
      const n = normalizeBR(jid.split('@')[0])
      if(validBR(n)) return n
    }
  }
  const remote = String(key.remoteJid || '')
  if(remote.endsWith('@lid') && lidToPn.has(remote)) return lidToPn.get(remote)
  return ''
}

function textOf(m){
  let x = m?.message || {}
  if(x.ephemeralMessage?.message) x = x.ephemeralMessage.message
  if(x.viewOnceMessage?.message) x = x.viewOnceMessage.message
  if(x.viewOnceMessageV2?.message) x = x.viewOnceMessageV2.message
  return clean(x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || x.documentMessage?.caption || '')
}

async function closeSocket(){
  if(reconnectTimer){ clearTimeout(reconnectTimer); reconnectTimer = null }
  try { sock?.ws?.close?.() } catch {}
  sock = null
  connected = false
  connectedNumber = ''
}

function scheduleReconnect(){
  if(reconnectTimer) return
  reconnectTimer = setTimeout(()=>{
    reconnectTimer = null
    metrics.reconnects++
    startWhatsApp().catch(e=>{ lastError = e.message })
  }, 2500)
}

async function startWhatsApp(force=false){
  if(starting) return
  if(sock && !force) return
  starting = true
  metrics.socketStarts++
  if(force) await closeSocket()
  try{
    const { state, saveCreds } = await useDbAuthState()
    const auth = {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    }
    sock = makeWASocket({
      auth,
      logger,
      browser:['CANAL RDS LAB V7','Chrome','7.0'],
      printQRInTerminal:false,
      syncFullHistory:false,
      shouldSyncHistoryMessage:()=>false,
      markOnlineOnConnect:false,
      generateHighQualityLinkPreview:false,
      getMessage
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update
      if(qr){
        qrDataUrl = await QRCode.toDataURL(qr,{ margin:2, width:420 })
        connected = false
        lastError = ''
      }
      if(connection === 'open'){
        connected = true
        qrDataUrl = ''
        connectedAt = nowISO()
        connectedNumber = normalizeBR(String(sock.user?.id || '').split(':')[0].split('@')[0])
        lastError = ''
        try { await sock.sendPresenceUpdate('unavailable') } catch {}
        logger.info({ connectedNumber }, 'LAB V7 conectado')
      }
      if(connection === 'close'){
        connected = false
        const statusCode = new Boom(lastDisconnect?.error).output?.statusCode || lastDisconnect?.error?.output?.statusCode || 0
        const loggedOut = statusCode === DisconnectReason.loggedOut
        lastError = loggedOut ? 'Sessao encerrada pelo WhatsApp' : clean(lastDisconnect?.error?.message || `Conexao encerrada (${statusCode})`)
        await closeSocket()
        if(!loggedOut) scheduleReconnect()
      }
    })

    sock.ev.on('messages.upsert', async event => {
      if(event.type !== 'notify') return
      for(const m of event.messages || []){
        rememberMessage(m)
        if(!m?.message) continue
        const remote = String(m.key?.remoteJid || '')
        if(remote.endsWith('@g.us') || remote === 'status@broadcast' || remote.endsWith('@broadcast')) continue
        if(m.key?.fromMe) continue
        const phone = resolvePhone(m)
        const pn = String(m.key?.senderPn || m.key?.remoteJidAlt || '')
        if(remote.endsWith('@lid') && pn.endsWith('@s.whatsapp.net') && phone) lidToPn.set(remote, phone)
        metrics.received++
        lastInbound = {
          at:nowISO(),
          id:m.key?.id || '',
          remoteJid:remote,
          senderPn:m.key?.senderPn || null,
          remoteJidAlt:m.key?.remoteJidAlt || null,
          phone,
          pushName:m.pushName || null,
          text:textOf(m)
        }
        logger.info(lastInbound, 'LAB V7 entrada')
      }
    })

    sock.ev.on('messages.update', updates => {
      for(const u of updates || []){
        if(!u?.key?.id) continue
        metrics.acks++
        lastAck = { at:nowISO(), id:u.key.id, update:u.update || null }
      }
    })
  }catch(e){
    metrics.errors++
    lastError = e.message
    await closeSocket()
    throw e
  }finally{
    starting = false
  }
}

async function resolveJid(phone){
  if(!sock || !connected) throw new Error('WhatsApp nao conectado')
  const n = normalizeBR(phone)
  if(!validBR(n)) throw new Error('Numero invalido')
  const pn = `${n}@s.whatsapp.net`
  const result = await sock.onWhatsApp(pn)
  if(!result?.[0]?.exists) throw new Error('Numero nao encontrado no WhatsApp')
  const jid = result[0].jid || pn
  if(result[0].lid) lidToPn.set(String(result[0].lid), n)
  return { phone:n, jid, lid:result[0].lid || null }
}

async function sendLab(phone, text){
  const target = await resolveJid(phone)
  const body = clean(text)
  if(!body) throw new Error('Mensagem vazia')
  const startedAt = nowISO()
  const startedMs = Date.now()
  const result = await sock.sendMessage(target.jid, { text:body })
  rememberMessage(result)
  metrics.sent++
  lastOutbound = {
    startedAt,
    resolvedAt:nowISO(),
    elapsedMs:Date.now()-startedMs,
    id:result?.key?.id || '',
    phone:target.phone,
    jid:target.jid,
    lid:target.lid,
    text:body
  }
  logger.info(lastOutbound, 'LAB V7 saida')
  return lastOutbound
}

app.get('/api/lab/status', (req,res)=>{
  res.json({
    lab:'BAILEYS V7 ISOLADO', connected, starting, connectedNumber, connectedAt,
    connectedForMs:msSince(connectedAt), lastError, hasQr:Boolean(qrDataUrl),
    metrics, lastInbound, lastOutbound, lastAck, authPrefix:AUTH_PREFIX
  })
})

app.get('/api/lab/qr', (req,res)=>res.json({ connected, qr:qrDataUrl }))

app.post('/api/lab/reconnect', async(req,res)=>{
  try{ await startWhatsApp(true); res.json({ok:true}) }
  catch(e){ res.status(500).json({ok:false,error:e.message}) }
})

app.post('/api/lab/send', async(req,res)=>{
  try{
    const out = await sendLab(req.body?.phone, req.body?.text)
    res.json({ok:true,...out})
  }catch(e){
    metrics.errors++
    res.status(400).json({ok:false,error:e.message})
  }
})

app.post('/api/lab/reply-last', async(req,res)=>{
  try{
    if(!lastInbound?.phone) throw new Error('Nenhuma entrada com numero real identificada')
    const out = await sendLab(lastInbound.phone, clean(req.body?.text) || 'RESPOSTA LAB V7')
    res.json({ok:true,...out})
  }catch(e){ res.status(400).json({ok:false,error:e.message}) }
})

app.get('/', (req,res)=>{
  res.type('html').send(`<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laboratorio Baileys V7</title>
<style>
body{font-family:system-ui;background:#eef3f9;color:#10274d;margin:0;padding:24px}.wrap{max-width:820px;margin:auto}.card{background:white;border:1px solid #d7e2ef;border-radius:18px;padding:20px;margin:14px 0}.ok{color:#19733f}.bad{color:#a12b2b}.warn{color:#946200}input,textarea,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #c7d4e4;width:100%;box-sizing:border-box;margin:6px 0}button{background:#1766c2;color:#fff;font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}pre{white-space:pre-wrap;word-break:break-word;background:#f5f8fc;padding:12px;border-radius:10px}@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
<h1>Laboratorio Baileys V7</h1>
<p>Ambiente isolado. Nao usa o fluxo comercial da V10.3.</p>
<div class="card"><h2>Status</h2><div id="statusBox">Carregando...</div><img id="qrImg" style="max-width:320px;width:100%;display:none"><button id="reconnectBtn">Reconectar laboratorio</button></div>
<div class="card"><h2>Teste de envio</h2><input id="phoneInput" placeholder="5588999999999"><textarea id="textInput" rows="4">TESTE LAB V7 - mensagem direta</textarea><button id="sendBtn">Enviar teste</button><button id="replyBtn">Responder ultima entrada</button><pre id="resultBox"></pre></div>
<div class="grid"><div class="card"><h3>Ultima entrada</h3><pre id="inboundBox">-</pre></div><div class="card"><h3>Ultima saida / ACK</h3><pre id="outboundBox">-</pre></div></div>
</div>
<script>
const $ = id => document.getElementById(id)
const statusBox = $('statusBox')
const qrImg = $('qrImg')
const phoneInput = $('phoneInput')
const textInput = $('textInput')
const resultBox = $('resultBox')
const inboundBox = $('inboundBox')
const outboundBox = $('outboundBox')
const reconnectBtn = $('reconnectBtn')
const sendBtn = $('sendBtn')
const replyBtn = $('replyBtn')

async function api(url,opt){
  const r = await fetch(url,{cache:'no-store',...(opt||{})})
  const txt = await r.text()
  let data
  try{ data = txt ? JSON.parse(txt) : {} }catch{ data = {error:txt||('HTTP '+r.status)} }
  if(!r.ok && !data.error) data.error = 'HTTP '+r.status
  return data
}

async function refresh(){
  try{
    const s = await api('/api/lab/status?ts='+Date.now())
    if(s.error) throw new Error(s.error)
    const stateText = s.connected ? 'CONECTADO' : (s.starting ? 'CONECTANDO' : 'DESCONECTADO')
    const klass = s.connected ? 'ok' : (s.starting ? 'warn' : 'bad')
    statusBox.innerHTML = '<b class="'+klass+'">'+stateText+'</b><br>Numero: '+(s.connectedNumber||'-')+'<br>Erro: '+(s.lastError||'-')+'<br>Enviadas: '+(s.metrics?.sent||0)+' | Recebidas: '+(s.metrics?.received||0)+' | ACKs: '+(s.metrics?.acks||0)
    inboundBox.textContent = JSON.stringify(s.lastInbound,null,2)
    outboundBox.textContent = JSON.stringify({lastOutbound:s.lastOutbound,lastAck:s.lastAck},null,2)
    const q = await api('/api/lab/qr?ts='+Date.now())
    if(q.qr){ qrImg.src=q.qr; qrImg.style.display='block' } else { qrImg.removeAttribute('src'); qrImg.style.display='none' }
  }catch(e){
    statusBox.innerHTML = '<b class="bad">ERRO NA LEITURA DO STATUS</b><br>'+String(e.message||e)
  }
}

async function sendTest(){
  resultBox.textContent='Enviando...'
  const data = await api('/api/lab/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:phoneInput.value,text:textInput.value})})
  resultBox.textContent=JSON.stringify(data,null,2)
  await refresh()
}

async function replyLast(){
  resultBox.textContent='Respondendo...'
  const data = await api('/api/lab/reply-last',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'RESPOSTA LAB V7 - '+new Date().toLocaleTimeString()})})
  resultBox.textContent=JSON.stringify(data,null,2)
  await refresh()
}

async function reconnect(){
  resultBox.textContent='Reconectando...'
  const data = await api('/api/lab/reconnect',{method:'POST'})
  resultBox.textContent=JSON.stringify(data,null,2)
  setTimeout(refresh,1200)
}

reconnectBtn.addEventListener('click',reconnect)
sendBtn.addEventListener('click',sendTest)
replyBtn.addEventListener('click',replyLast)
refresh()
setInterval(refresh,3000)
</script>
</body></html>`)
})

app.listen(PORT, async()=>{
  logger.info({PORT}, 'LAB V7 FIXED iniciado')
  try{ await startWhatsApp() }catch(e){ logger.error({err:e},'Falha ao iniciar LAB V7') }
})
