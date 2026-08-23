import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  let src = fs.readFileSync(serverPath, 'utf8');

  const oldBlock = `function phoneKey(v){
  const n = normalizeBR(v);
  return validBRPhone(n) ? n : '';
}
function isAutoContactName(name=''){
  return /^(SEM NOME|Cliente \\d{4}|WhatsApp \\d{4})$/i.test(cleanText(name));
}
async function findContact(phone){
  const key = phoneKey(phone);
  if(!key) return null;
  let c = await one('rds10_contacts',\`select=*&phone=eq.\${encodeURIComponent(key)}\`);
  if(c) return c;
  // Compatibilidade com cadastros antigos em formatações diferentes.
  const rows = await list('rds10_contacts','select=*');
  return rows.find(x => phoneKey(x.phone) === key) || null;
}`;

  const newBlock = `function phoneKey(v){
  const n = normalizeBR(v);
  return validBRPhone(n) ? n : '';
}
function phoneAliases(v){
  const key = phoneKey(v);
  if(!key) return [];
  const out = new Set([key]);
  const local = key.slice(2);
  if(local.length === 11 && local[2] === '9') out.add('55' + local.slice(0,2) + local.slice(3));
  if(local.length === 10) out.add('55' + local.slice(0,2) + '9' + local.slice(2));
  return [...out];
}
function sameBRPhone(a,b){
  const aa = new Set(phoneAliases(a));
  return phoneAliases(b).some(x=>aa.has(x));
}
function isAutoContactName(name=''){
  return /^(SEM NOME|Cliente \\d{4}|WhatsApp \\d{4})$/i.test(cleanText(name));
}
async function findContact(phone){
  const aliases = phoneAliases(phone);
  if(!aliases.length) return null;
  for(const key of aliases){
    const c = await one('rds10_contacts',\`select=*&phone=eq.\${encodeURIComponent(key)}\`);
    if(c) return c;
  }
  // Compatibilidade com cadastros antigos: formatos, DDI e nono dígito divergentes.
  const rows = await list('rds10_contacts','select=*');
  return rows.find(x => aliases.some(a=>sameBRPhone(x.phone,a))) || null;
}`;

  if(!src.includes('function phoneAliases(v){')){
    if(!src.includes(oldBlock)) throw new Error('bloco de telefone não localizado');
    src = src.replace(oldBlock, newBlock);
  }

  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[V10.4.1] proteção contra contato duplicado por nono dígito aplicada');
} catch (err) {
  console.error('[V10.4.1] falha no patch CRM:', err?.message || err);
  process.exitCode = 1;
}

await import('./runtime-v10.3.4-live-ui.mjs');
