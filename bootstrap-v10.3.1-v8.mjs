import Module from 'module'
import * as Baileys from '@whiskeysockets/baileys'

// CANAL DE VENDAS RDS — V10.3.1 MOTOR V8
// Mantém a sessão V7 já pareada e corrige concorrência no armazenamento Signal.
const AUTH_PREFIX = 'prodv7:'
const nativeFetch = globalThis.fetch.bind(globalThis)

function prefixAuthId(id){
  const value = String(id || '')
  if(!value || value.startsWith(AUTH_PREFIX)) return value
  return AUTH_PREFIX + value
}
function rewriteZapAuthUrl(input){
  const raw = typeof input === 'string' ? input : input?.url
  if(!raw || !raw.includes('/rest/v1/zap_auth')) return input
  try{
    const url = new URL(raw)
    const id = url.searchParams.get('id')
    if(id && id.startsWith('eq.')) url.searchParams.set('id','eq.' + prefixAuthId(id.slice(3)))
    return typeof input === 'string' ? url.toString() : new Request(url.toString(), input)
  }catch{return input}
}
function rewriteZapAuthBody(input, init){
  const rawUrl = typeof input === 'string' ? input : input?.url || ''
  if(!rawUrl.includes('/rest/v1/zap_auth') || !init?.body || typeof init.body !== 'string') return init
  try{
    const parsed=JSON.parse(init.body)
    const patchOne=row=>row&&typeof row==='object'&&Object.prototype.hasOwnProperty.call(row,'id')?{...row,id:prefixAuthId(row.id)}:row
    return {...init,body:JSON.stringify(Array.isArray(parsed)?parsed.map(patchOne):patchOne(parsed))}
  }catch{return init}
}
globalThis.fetch=async function(input,init={}){
  const i=rewriteZapAuthUrl(input)
  return nativeFetch(i,rewriteZapAuthBody(i,init))
}

function serializeSignalStore(rawKeys){
  let writeQueue=Promise.resolve()
  return {
    get: async (...args)=>{ await writeQueue.catch(()=>{}); return rawKeys.get(...args) },
    set: data=>{
      writeQueue=writeQueue.catch(()=>{}).then(()=>rawKeys.set(data))
      return writeQueue
    },
    clear: rawKeys.clear ? async (...args)=>{ await writeQueue.catch(()=>{}); return rawKeys.clear(...args) } : undefined
  }
}
const originalCacheable=Baileys.makeCacheableSignalKeyStore
const originalMakeWASocket=Baileys.default
function stableCacheableSignalKeyStore(keys,logger){return originalCacheable(serializeSignalStore(keys),logger)}
function stableMakeWASocket(options={}){
  const next={...options}
  delete next.version
  delete next.maxMsgRetryCount
  delete next.retryRequestDelayMs
  delete next.msgRetryCounterCache
  next.browser=['CANAL DE VENDAS RDS','Chrome','10.3.1-V8']
  next.syncFullHistory=false
  next.shouldSyncHistoryMessage=()=>false
  next.markOnlineOnConnect=false
  next.generateHighQualityLinkPreview=false
  next.connectTimeoutMs=60000
  next.keepAliveIntervalMs=25000
  return originalMakeWASocket(next)
}
const baileysShim={...Baileys,default:stableMakeWASocket,makeCacheableSignalKeyStore:stableCacheableSignalKeyStore}
const originalLoad=Module._load
Module._load=function(request,parent,isMain){if(request==='@whiskeysockets/baileys')return baileysShim;return originalLoad.call(this,request,parent,isMain)}
process.env.RDS_MOTOR='BAILEYS_V8_PRODUCAO'
process.env.RDS_AUTH_PREFIX=AUTH_PREFIX
await import('./server.js')
