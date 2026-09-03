import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
const serverPatchedPath=path.join(dir,'runtime-v10.70-server.js');
const pagbankPath=path.join(dir,'runtime-v10.60-pagbank.mjs');
const pagbankPatchedPath=path.join(dir,'runtime-v10.70-pagbank-base.mjs');
const fixPath=path.join(dir,'runtime-v10.60-fix.mjs');
const fixPatchedPath=path.join(dir,'runtime-v10.70-fix-generated.mjs');

// V10.70: aplica a expiracao diretamente no server.js antes das camadas PagBank/dedupe.
// Isso elimina a dependencia do wrapper V10.69 que estava chamando funcoes fora do escopo.
let server=fs.readFileSync(serverPath,'utf8');
const expirationBlock=[
  "const RDS_ORDER_EXPIRATION_HOURS=Math.max(1,Number(process.env.RDS_ORDER_EXPIRATION_HOURS||process.env.ORDER_EXPIRATION_HOURS||24));",
  "const RDS_ORDER_EXPIRATION_MS=RDS_ORDER_EXPIRATION_HOURS*60*60*1000;",
  "const rdsPendingExpiredNotice=new Map();",
  "function rdsOrderIsExpiredV1070(order){if(!order||!['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(String(order.status||''))||!order.created_at)return false;const created=Date.parse(order.created_at);return Number.isFinite(created)&&(Date.now()-created)>=RDS_ORDER_EXPIRATION_MS;}",
  "async function rdsExpireOrderV1070(order){if(!rdsOrderIsExpiredV1070(order))return false;await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:'PEDIDO_EXPIRADO',payment_last_error:null,updated_at:nowISO()});await cancelFutureDeliveries(order.phone,'PEDIDO_EXPIRADO');await logEvent('PEDIDO_EXPIRADO',{phone:order.phone,order:order.code,created_at:order.created_at,expiration_hours:RDS_ORDER_EXPIRATION_HOURS});rdsPendingExpiredNotice.set(order.phone,{code:order.code});return true;}",
  "// RDS_ORDER_EXPIRATION_V1070"
].join('\n');
const activeOld="async function activeOrder(phone){\n  return one('rds10_orders',`select=*&phone=eq.${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc`);\n}";
if(!server.includes('// RDS_ORDER_EXPIRATION_V1070')){
  if(!server.includes(activeOld))throw new Error('activeOrder base não localizado para V10.70.');
  server=server.replace(activeOld,expirationBlock+"\n"+"async function activeOrder(phone){\n  const order=await one('rds10_orders',`select=*&phone=eq.${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc`);\n  if(order&&await rdsExpireOrderV1070(order))return null;\n  return order;\n}");
}
const replyOld="async function replyInbound(identity, text){\n  const body = cleanText(text);";
const replyNew="async function replyInbound(identity, text){\n  let body = cleanText(text);\n  const expiredNotice=rdsPendingExpiredNotice.get(identity?.phone||'');\n  if(expiredNotice){\n    rdsPendingExpiredNotice.delete(identity?.phone||'');\n    body='⏰ *PEDIDO EXPIRADO*\\n\\nO pedido *'+expiredNotice.code+'* ultrapassou o prazo de validade e foi encerrado automaticamente.\\n\\nVocê pode iniciar um novo pedido enviando *QUERO COMPRAR*.\\n\\n'+body;\n  }";
if(server.includes(replyOld)&&!server.includes('const expiredNotice=rdsPendingExpiredNotice.get'))server=server.replace(replyOld,replyNew);
fs.writeFileSync(serverPatchedPath,server,'utf8');

// Reaproveita integralmente o Fechamento 2/PagBank e a deduplicacao V10.68.
let pag=fs.readFileSync(pagbankPath,'utf8');
const pagServerOld="const serverPath=path.join(dir,'server.js');";
const pagGeneratedOld="const generatedPath=path.join(dir,'runtime-v10.60-generated.cjs');";
if(!pag.includes(pagServerOld)||!pag.includes(pagGeneratedOld))throw new Error('Runtime PagBank base incompatível.');
pag=pag.replace(pagServerOld,"const serverPath=path.join(dir,'runtime-v10.70-server.js');");
pag=pag.replace(pagGeneratedOld,"const generatedPath=path.join(dir,'runtime-v10.70-generated.cjs');");
fs.writeFileSync(pagbankPatchedPath,pag,'utf8');

let fix=fs.readFileSync(fixPath,'utf8');
const fixSourceOld="const sourcePath = path.join(dir, 'runtime-v10.60-pagbank.mjs');";
const fixFixedOld="const fixedPath = path.join(dir, 'runtime-v10.60-pagbank-fixed.mjs');";
if(!fix.includes(fixSourceOld)||!fix.includes(fixFixedOld))throw new Error('Runtime fix base incompatível.');
fix=fix.replace(fixSourceOld,"const sourcePath = path.join(dir, 'runtime-v10.70-pagbank-base.mjs');");
fix=fix.replace(fixFixedOld,"const fixedPath = path.join(dir, 'runtime-v10.70-fix-generated.mjs');");
fs.writeFileSync(fixPatchedPath,fix,'utf8');

console.log('[V10.70] expiracao instalada diretamente no server.js; preservando PagBank PIX e deduplicacao V10.68');
await import(pathToFileURL(fixPatchedPath).href+'?v=1070');
