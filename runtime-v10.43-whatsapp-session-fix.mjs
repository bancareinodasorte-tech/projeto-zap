import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.44 — fechamento do motor de conversa/lembretes.
// Prioridade: nenhum pedido antigo pode disparar cobrança após reconexão.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');
const reminderPath = path.join(__dirname, 'runtime-v10.7-production-reminders.mjs');
let s = fs.readFileSync(serverPath, 'utf8');

const old = '  if(force) await closeSocket();\n  try{\n    const { state, saveCreds } = await useSupabaseAuthState();';
const replacement = `  const wasConnected = connected;\n  if(force) await closeSocket();\n  if(force && !wasConnected){\n    try{ await del('zap_auth','id=not.is.null'); }catch(e){ console.error('[V10.44] limpeza da sessão WhatsApp:',e.message); }\n    qrDataUrl=''; lastError='';\n  }\n  try{\n    const { state, saveCreds } = await useSupabaseAuthState();`;
if(s.includes(old) && !s.includes('[V10.44] limpeza da sessão WhatsApp')) s=s.replace(old,replacement);

try{
  let r = fs.readFileSync(reminderPath,'utf8');
  // Mata o scheduler legado e qualquer chamada automática do processador.
  r = r.replace(/setTimeout\(\(\)=>processOrderReminders\(\)\.catch\(\{\}\),20000\);/g, '// V10.44: scheduler legado desativado');
  r = r.replace(/setInterval\(\(\)=>processOrderReminders\(\)\.catch\(\{\}\),300000\);/g, '// V10.44: scheduler legado desativado');
  r = r.replace(/async function processOrderReminders\(\)\{/, 'async function processOrderReminders(){ return false; /* V10.44: automático desativado até motor transacional definitivo */');
  fs.writeFileSync(reminderPath,r,'utf8');
}catch(e){ console.error('[V10.44] bloqueio do motor legado:',e.message); }

fs.writeFileSync(serverPath,s,'utf8');
console.log('[V10.44] proteção de lembretes aplicada; scheduler legado desativado');
await import('./runtime-v10.41-customer-pix-flow.mjs');
