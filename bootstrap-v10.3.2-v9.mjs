import Module from 'module'
import * as Baileys from '@whiskeysockets/baileys'

// CANAL DE VENDAS RDS — V10.3.2 MOTOR V9
// Mantém a sessão de produção e aplica a mesma estratégia de serialização
// de autenticação que ficou estável no Laboratório Baileys V7.
const AUTH_PREFIX = 'prodv7:'
const nativeFetch = globalThis.fetch.bind(globalThis)
const authLocks = new Map()

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

const originalCacheable = Baileys.makeCacheableSignalKeyStore
const originalMakeWASocket = Baileys.default

function stableCacheableSignalKeyStore(keys, logger){
  return originalCacheable(serializeSignalStore(keys), logger)
}

function stableMakeWASocket(options={}){
  const next = {...options}
  // O laboratório estável funcionou sem forçar versão/retry customizados.
  delete next.version
  delete next.maxMsgRetryCount
  delete next.retryRequestDelayMs
  delete next.msgRetryCounterCache
  next.browser = ['CANAL DE VENDAS RDS','Chrome','10.3.2-V9']
  next.syncFullHistory = false
  next.shouldSyncHistoryMessage = ()=>false
  next.markOnlineOnConnect = false
  next.generateHighQualityLinkPreview = false
  next.connectTimeoutMs = 60000
  next.keepAliveIntervalMs = 25000
  return originalMakeWASocket(next)
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

process.env.RDS_MOTOR = 'BAILEYS_V9_PRODUCAO_ESTAVEL'
process.env.RDS_AUTH_PREFIX = AUTH_PREFIX
await import('./server.js')
