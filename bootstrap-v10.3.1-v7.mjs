import Module from 'module'
import * as Baileys from '@whiskeysockets/baileys'

/**
 * CANAL DE VENDAS RDS — V10.3.1 MOTOR V7
 *
 * Objetivo:
 * - manter server.js / fluxo comercial V10.3 intacto;
 * - executar o mesmo núcleo Baileys V7 validado no laboratório;
 * - isolar a sessão Signal/WhatsApp da sessão antiga em zap_auth;
 * - serializar gravações de chaves Signal para evitar corrida no Supabase;
 * - remover opções de retry da V6 que não foram necessárias no laboratório V7.
 */

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
    if(id && id.startsWith('eq.')){
      url.searchParams.set('id', 'eq.' + prefixAuthId(id.slice(3)))
    }
    return typeof input === 'string' ? url.toString() : new Request(url.toString(), input)
  }catch{
    return input
  }
}

function rewriteZapAuthBody(input, init){
  const rawUrl = typeof input === 'string' ? input : input?.url || ''
  if(!rawUrl.includes('/rest/v1/zap_auth') || !init?.body || typeof init.body !== 'string') return init
  try{
    const parsed = JSON.parse(init.body)
    const patchOne = row => {
      if(row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'id')){
        return { ...row, id: prefixAuthId(row.id) }
      }
      return row
    }
    const next = Array.isArray(parsed) ? parsed.map(patchOne) : patchOne(parsed)
    return { ...init, body: JSON.stringify(next) }
  }catch{
    return init
  }
}

globalThis.fetch = async function(input, init={}){
  const rewrittenInput = rewriteZapAuthUrl(input)
  const rewrittenInit = rewriteZapAuthBody(rewrittenInput, init)
  return nativeFetch(rewrittenInput, rewrittenInit)
}

function serializeSignalStore(rawKeys){
  let queue = Promise.resolve()
  return {
    get: (...args) => rawKeys.get(...args),
    set: data => {
      queue = queue.catch(()=>{}).then(async()=>{
        for(const [category, values] of Object.entries(data || {})){
          for(const [id, value] of Object.entries(values || {})){
            await rawKeys.set({ [category]: { [id]: value } })
          }
        }
      })
      return queue
    },
    clear: rawKeys.clear ? (...args) => rawKeys.clear(...args) : undefined
  }
}

const originalCacheable = Baileys.makeCacheableSignalKeyStore
const originalMakeWASocket = Baileys.default

function stableCacheableSignalKeyStore(keys, logger){
  return originalCacheable(serializeSignalStore(keys), logger)
}

function stableMakeWASocket(options={}){
  const next = { ...options }
  // O laboratório V7 funcionou sem versão forçada e sem retry legado.
  delete next.version
  delete next.maxMsgRetryCount
  delete next.retryRequestDelayMs
  delete next.msgRetryCounterCache
  next.browser = ['CANAL DE VENDAS RDS', 'Chrome', '10.3.1-V7']
  next.syncFullHistory = false
  next.shouldSyncHistoryMessage = () => false
  next.markOnlineOnConnect = false
  next.generateHighQualityLinkPreview = false
  return originalMakeWASocket(next)
}

const baileysShim = {
  ...Baileys,
  default: stableMakeWASocket,
  makeCacheableSignalKeyStore: stableCacheableSignalKeyStore
}

const originalLoad = Module._load
Module._load = function(request, parent, isMain){
  if(request === '@whiskeysockets/baileys') return baileysShim
  return originalLoad.call(this, request, parent, isMain)
}

process.env.RDS_MOTOR = 'BAILEYS_V7_PRODUCAO'
process.env.RDS_AUTH_PREFIX = AUTH_PREFIX

await import('./server.js')
