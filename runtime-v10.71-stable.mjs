import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
const v70Path=path.join(dir,'runtime-v10.70-stable.mjs');
const basePagPath=path.join(dir,'runtime-v10.60-pagbank.mjs');
const pag71Path=path.join(dir,'runtime-v10.71-pagbank.mjs');
const v71Path=path.join(dir,'runtime-v10.71-runner.mjs');

// V10.71: máquina de estados coerente. Não permite que pedido pago seja tratado como pedido editável.
let server=fs.readFileSync(serverPath,'utf8');
const oldBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA/i.test(text); }";
const newBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$/i.test(text); }";
if(server.includes(oldBuy))server=server.replace(oldBuy,newBuy);
fs.writeFileSync(serverPath,server,'utf8');

let pag=fs.readFileSync(basePagPath,'utf8');
const guard="  if(order){\n    if(is4){";
const guardNew="  if(order){\n    if(['PAGO_AGUARDANDO_BILHETES','CONCLUIDO'].includes(String(order.status||''))){\n      if(is1)return replyInbound(identity,'Pedido *'+order.code+'*: pagamento já confirmado ✅. '+(order.status==='CONCLUIDO'?'Este pedido já foi concluído.':'Os bilhetes aguardam emissão/envio pelo operador.')+'\\n\\nSe precisar de atendimento, escolha *5 — Escritório*.');\n      if(is5){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *ESCRITÓRIO*\\nFale diretamente com o atendimento:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre meu pedido '+order.code+'.'));}\n      if(is2||is3||is4)return replyInbound(identity,'🔒 O pedido *'+order.code+'* já possui pagamento confirmado e não pode ser corrigido, reiniciado ou cancelado por este menu.\\n\\nPara atendimento, escolha *5 — Escritório*.');\n      return replyInbound(identity,'Pedido *'+order.code+'* com pagamento confirmado ✅. Para atendimento, escolha *5 — Escritório*.');\n    }\n    if(is4){";
if(!pag.includes('V10.71_PAID_STATE')&&pag.includes(guard))pag=pag.replace(guard,guardNew+'\n  // V10.71_PAID_STATE');
fs.writeFileSync(pag71Path,pag,'utf8');

let v70=fs.readFileSync(v70Path,'utf8');
v70=v70.replace("const pagbankPath=path.join(dir,'runtime-v10.60-pagbank.mjs');","const pagbankPath=path.join(dir,'runtime-v10.71-pagbank.mjs');");
v70=v70.replace("const pagbankPatchedPath=path.join(dir,'runtime-v10.70-pagbank-base.mjs');","const pagbankPatchedPath=path.join(dir,'runtime-v10.71-pagbank-base.mjs');");
v70=v70.replace("runtime-v10.70-pagbank-base.mjs","runtime-v10.71-pagbank-base.mjs");
v70=v70.replace("runtime-v10.70-fix-generated.mjs","runtime-v10.71-fix-generated.mjs");
v70=v70.replace("?v=1070","?v=1071");
fs.writeFileSync(v71Path,v70,'utf8');

console.log('[V10.71] compra curta aceita; pedidos pagos protegidos; expiracao 24h preservada');
await import(pathToFileURL(v71Path).href+'?stable=1071');
