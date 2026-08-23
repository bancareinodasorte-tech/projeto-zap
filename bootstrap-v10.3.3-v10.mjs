import Module from 'module'
import * as Baileys from '@whiskeysockets/baileys'

// CANAL DE VENDAS RDS — V10.3.3 MOTOR V10
// Sessao de producao isolada e limpa, usando a mesma estrategia do laboratorio V7 estavel.
// Acrescenta baixa automatica quando o operador envia PDF ao cliente com pedido pago aguardando bilhetes.
const AUTH_PREFIX = 'prodv10stable:'
const nativeFetch = globalThis.fetch.bind(globalThis)
const authLocks = new Map()
const pdfFinalizeLocks = new Set()

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''

function nowISO(){ return new Date().toISOString() }
function digits(v){ return String(v || '').replace(/\D/g,'') }
function cleanText(v){ return String(v || '').replace(/\u0000/g,'').trim() }
function normalizeBR(v){
  let n = digits(v)
  if(!n) return ''
  if(n.startsWith('00')) n = n.slice(2)
  if(!n.startsWith('55')) n = '55' + n
  return /^55\d{10,11}$/.test(n) ? n : ''
}

async function sb(path,opt={}){
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase nao configurado')
  const r = await nativeFetch(SUPABASE_URL + path,{
    ...opt,
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json',
      ...(opt.headers||{})
    }
  })
  const txt = await r.text()
  let data = null
  try{ data = txt ? JSON.parse(txt) : null }catch{ data = txt }
  if(!r.ok) throw new Error(data?.message || data?.details || `Supabase ${r.status}`)
  return data
}
async function one(table,query){
  const rows = await sb(`/rest/v1/${table}?${query}&limit=1`)
  return Array.isArray(rows) ? rows[0] || null : null
}
async function list(table,query='select=*'){
  const rows = await sb(`/rest/v1/${table}?${query}`)
  return Array.isArray(rows) ? rows : []
}
async function patch(table,filter,row){
  return sb(`/rest/v1/${table}?${filter}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)})
}
async function insert(table,row){
  return sb(`/rest/v1/${table}`,{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)})
}

function prefixAuthId(id){
  const value = String(id || '')
  if(!value || value.startsWith(AUTH_PREFIX)) return value
  return AUTH_PREFIX + value
}

function getRawUrl(input){
  return typeof input === 'string' ? input : input?.url || ''
}

function rewriteZapAuthUrl(input){
  const raw = getRawUrl(input)
  if(!raw || !raw.includes('/rest/v1/zap_auth')) return input
  try{
    const url = new URL(raw)
    const id = url.searchParams.get('id')
    if(id && id.startsWith('eq.')) url.searchParams.set('id','eq.' + prefixAuthId(id.slice(3)))
    return typeof input === 'string' ? url.toString() : new Request(url.toString(), input)
  }catch{return input}
}

function rewriteZapAuthBody(input, init){
  const rawUrl = getRawUrl(input)
  if(!rawUrl.includes('/rest/v1/zap_auth') || !init?.body || typeof init.body !== 'string') return init
  try{
    const parsed = JSON.parse(init.body)
    const patchOne = row => row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row,'id')
      ? {...row,id:prefixAuthId(row.id)} : row
    return {...init,body:JSON.stringify(Array.isArray(parsed)?parsed.map(patchOne):patchOne(parsed))}
  }catch{return init}
}

function extractAuthLockKey(input, init){
  const raw = getRawUrl(input)
  if(!raw.includes('/rest/v1/zap_auth')) return ''
  try{
    if(init?.body && typeof init.body === 'string'){
      const parsed = JSON.parse(init.body)
      const row = Array.isArray(parsed) ? parsed[0] : parsed
      if(row?.id) return String(row.id)
    }
    const url = new URL(raw)
    const id = url.searchParams.get('id')
    if(id?.startsWith('eq.')) return id.slice(3)
  }catch{}
  return 'zap_auth_global'
}

function withLock(key, fn){
  const previous = authLocks.get(key) || Promise.resolve()
  const next = previous.catch(()=>{}).then(fn)
  authLocks.set(key,next)
  return next.finally(()=>{ if(authLocks.get(key) === next) authLocks.delete(key) })
}

globalThis.fetch = async function(input, init={}){
  const rewrittenInput = rewriteZapAuthUrl(input)
  const rewrittenInit = rewriteZapAuthBody(rewrittenInput, init)
  const raw = getRawUrl(rewrittenInput)
  if(!raw.includes('/rest/v1/zap_auth')) return nativeFetch(rewrittenInput, rewrittenInit)

  const method = String(rewrittenInit?.method || 'GET').toUpperCase()
  if(method === 'GET'){
    const key = extractAuthLockKey(rewrittenInput, rewrittenInit)
    const pending = authLocks.get(key)
    if(pending) await pending.catch(()=>{})
    return nativeFetch(rewrittenInput, rewrittenInit)
  }

  const key = extractAuthLockKey(rewrittenInput, rewrittenInit)
  return withLock(key, ()=>nativeFetch(rewrittenInput, rewrittenInit))
}

function serializeSignalStore(rawKeys){
  let writeQueue = Promise.resolve()
  return {
    get: async (...args)=>{ await writeQueue.catch(()=>{}); return rawKeys.get(...args) },
    set: data=>{
      writeQueue = writeQueue.catch(()=>{}).then(()=>rawKeys.set(data))
      return writeQueue
    },
    clear: rawKeys.clear ? async (...args)=>{ await writeQueue.catch(()=>{}); return rawKeys.clear(...args) } : undefined
  }
}

function unwrapMessageContent(message){
  let x = message || {}
  if(x.ephemeralMessage?.message) x = x.ephemeralMessage.message
  if(x.viewOnceMessage?.message) x = x.viewOnceMessage.message
  if(x.viewOnceMessageV2?.message) x = x.viewOnceMessageV2.message
  if(x.documentWithCaptionMessage?.message) x = x.documentWithCaptionMessage.message
  return x
}

function phoneFromOutboundMessage(m){
  const candidates = [m?.key?.remoteJidAlt,m?.key?.participantAlt,m?.key?.remoteJid,m?.key?.participant].filter(Boolean).map(String)
  for(const jid of candidates){
    if(jid.endsWith('@s.whatsapp.net')){
      const phone = normalizeBR(jid.split('@')[0])
      if(phone) return phone
    }
  }
  return ''
}

async function pendingOrderForOutbound(socket,m){
  const directPhone = phoneFromOutboundMessage(m)
  if(directPhone){
    const order = await one('rds10_orders',`select=*&phone=eq.${encodeURIComponent(directPhone)}&status=eq.PAGO_AGUARDANDO_BILHETES&order=updated_at.desc`)
    if(order) return {order,phone:directPhone}
  }

  const remote = String(m?.key?.remoteJid || '')
  if(!remote.endsWith('@lid')) return null

  const pending = await list('rds10_orders','select=*&status=eq.PAGO_AGUARDANDO_BILHETES&order=updated_at.desc&limit=50')
  for(const order of pending){
    const phone = normalizeBR(order.phone)
    if(!phone) continue
    try{
      const found = await socket.onWhatsApp(`${phone}@s.whatsapp.net`)
      const match = found?.[0]
      if(String(match?.lid || '') === remote || String(match?.jid || '') === remote) return {order,phone}
    }catch{}
  }
  return null
}

async function finalizeTicketsPdf(socket,m){
  const id = String(m?.key?.id || '')
  if(!id || pdfFinalizeLocks.has(id)) return
  const x = unwrapMessageContent(m?.message)
  const doc = x?.documentMessage
  if(!doc) return
  const mime = cleanText(doc.mimetype).toLowerCase()
  const fileName = cleanText(doc.fileName).toLowerCase()
  if(mime !== 'application/pdf' && !fileName.endsWith('.pdf')) return

  pdfFinalizeLocks.add(id)
  try{
    const match = await pendingOrderForOutbound(socket,m)
    if(!match?.order) return
    const {order,phone} = match
    const finishedAt = nowISO()

    // Primeiro encerra no banco para impedir baixa duplicada do mesmo pedido.
    await patch('rds10_orders',`id=eq.${order.id}`,{status:'CONCLUIDO',completed_at:finishedAt,updated_at:finishedAt})

    try{
      const contact = await one('rds10_contacts',`select=*&phone=eq.${encodeURIComponent(phone)}`)
      if(contact){
        await patch('rds10_contacts',`id=eq.${contact.id}`,{
          name:cleanText(order.customer_name) || contact.name,
          group_name:'COMPRA REALIZADA',
          validated:true,
          last_seen_at:finishedAt,
          updated_at:finishedAt
        })
      }
    }catch{}

    try{
      const queued = await list('rds10_deliveries',`select=id&phone=eq.${encodeURIComponent(phone)}&status=eq.AGENDADA`)
      for(const d of queued){
        await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:'COMPRA_CONCLUIDA',updated_at:finishedAt})
      }
    }catch{}

    const settings = await one('rds10_settings','select=*&id=eq.1').catch(()=>null)
    const finalMessage = cleanText(settings?.final_message) || `✅ *COMPRA CONCLUÍDA*\nSeus bilhetes foram enviados. 🍀\nA Reino da Sorte agradece sua compra.\nBoa sorte! 🍀\n\nPedido ${order.code}`
    const jid = String(m?.key?.remoteJid || '') || `${phone}@s.whatsapp.net`
    const sent = await socket.sendMessage(jid,{text:finalMessage})

    try{
      await insert('rds10_messages',{
        phone,direction:'OUT',message_type:'text',body:finalMessage,
        wa_message_id:sent?.key?.id || null,status:'ENVIADA',
        raw_payload:{jid,automatic:true,reason:'PDF_BILHETES_ENVIADO',order:order.code,pdf_message_id:id},
        created_at:nowISO()
      })
      await insert('rds10_events',{
        kind:'BILHETES_PDF_AUTO_CONCLUIDO',
        payload:{phone,order:order.code,pdf_message_id:id,file_name:doc.fileName||null},
        created_at:nowISO()
      })
    }catch{}

    console.log(`[AUTO-PDF] Pedido ${order.code} concluido automaticamente para ${phone}`)
  }catch(e){
    console.error('[AUTO-PDF]',e.message)
    try{
      await insert('rds10_alerts',{kind:'ERRO_AUTO_PDF',title:`Falha na baixa automatica de PDF: ${e.message}`,payload:{message_id:id},is_read:false,created_at:nowISO()})
    }catch{}
  }finally{
    setTimeout(()=>pdfFinalizeLocks.delete(id),5*60*1000)
  }
}

function attachAutoPdfCompletion(socket){
  socket.ev.on('messages.upsert', async ({messages,type})=>{
    if(type !== 'notify') return
    for(const m of messages || []){
      if(!m?.message || !m?.key?.fromMe) continue
      await finalizeTicketsPdf(socket,m)
    }
  })
}

const originalCacheable = Baileys.makeCacheableSignalKeyStore
const originalMakeWASocket = Baileys.default

function stableCacheableSignalKeyStore(keys, logger){
  return originalCacheable(serializeSignalStore(keys), logger)
}

function stableMakeWASocket(options={}){
  const next = {...options}
  delete next.version
  delete next.maxMsgRetryCount
  delete next.retryRequestDelayMs
  delete next.msgRetryCounterCache
  next.browser = ['CANAL DE VENDAS RDS','Chrome','10.3.3-V10']
  next.syncFullHistory = false
  next.shouldSyncHistoryMessage = ()=>false
  next.markOnlineOnConnect = false
  next.generateHighQualityLinkPreview = false
  next.connectTimeoutMs = 60000
  next.keepAliveIntervalMs = 25000
  const socket = originalMakeWASocket(next)
  attachAutoPdfCompletion(socket)
  return socket
}

const baileysShim = {
  ...Baileys,
  default: stableMakeWASocket,
  makeCacheableSignalKeyStore: stableCacheableSignalKeyStore
}

const originalLoad = Module._load
Module._load = function(request,parent,isMain){
  if(request === '@whiskeysockets/baileys') return baileysShim
  return originalLoad.call(this,request,parent,isMain)
}

process.env.RDS_MOTOR = 'BAILEYS_V10_PRODUCAO_AUTO_PDF'
process.env.RDS_AUTH_PREFIX = AUTH_PREFIX
await import('./server.js')