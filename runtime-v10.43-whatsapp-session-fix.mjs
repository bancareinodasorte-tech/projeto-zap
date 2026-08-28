import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.43 — recupera sessão WhatsApp desconectada e força novo QR quando necessário.
// Executa antes dos runtimes existentes para não alterar o fluxo comercial já aprovado.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

const old = '  if(force) await closeSocket();\n  try{\n    const { state, saveCreds } = await useSupabaseAuthState();';
const replacement = `  const wasConnected = connected;\n  if(force) await closeSocket();\n  if(force && !wasConnected){\n    try{ await del('zap_auth','id=not.is.null'); }catch(e){ console.error('[V10.43] limpeza da sessão WhatsApp:',e.message); }\n    qrDataUrl=''; lastError='';\n  }\n  try{\n    const { state, saveCreds } = await useSupabaseAuthState();`;

if (s.includes(old) && !s.includes('[V10.43] limpeza da sessão WhatsApp')) {
  s = s.replace(old, replacement);
  fs.writeFileSync(serverPath, s, 'utf8');
  console.log('[V10.43] sessão WhatsApp preparada para novo QR');
}

await import('./runtime-v10.41-customer-pix-flow.mjs');
