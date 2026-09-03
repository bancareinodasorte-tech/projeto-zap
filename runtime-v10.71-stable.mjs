import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
const v70Path=path.join(dir,'runtime-v10.70-stable.mjs');
const basePagPath=path.join(dir,'runtime-v10.60-pagbank.mjs');
const pag71Path=path.join(dir,'runtime-v10.71-pagbank.mjs');
const v71Path=path.join(dir,'runtime-v10.71-runner.mjs');

// V10.72: entrada única e profissional da jornada. Qualquer mensagem sem pedido ativo recebe dois caminhos:
// COMPRAR (abre o formulário já preenchido no campo do WhatsApp) ou OUTRO ASSUNTO (escritório).
// Pedidos pagos permanecem protegidos.
let server=fs.readFileSync(serverPath,'utf8');
const oldBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA/i.test(text); }";
const newBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$/i.test(text); }";
if(server.includes(oldBuy))server=server.replace(oldBuy,newBuy);
fs.writeFileSync(serverPath,server,'utf8');

let pag=fs.readFileSync(basePagPath,'utf8');

// Menu de pedido: elimina "Recomeçar" e separa claramente Alterar dados de Cancelar pedido.
const oldOrderMenu="function orderMenu(order){return 'Pedido *'+order.code+'* em andamento.\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.';}";
const newOrderMenu="function orderMenu(order){const s=String(order?.status||'');if(s==='COLETANDO_DADOS')return '📝 *PEDIDO EM PREENCHIMENTO*\\nPedido *'+order.code+'*\\n\\n1️⃣ Continuar preenchimento\\n2️⃣ Alterar dados\\n3️⃣ Cancelar pedido\\n4️⃣ Outro assunto\\n\\nResponda apenas com o número.';if(s==='AGUARDANDO_PAGAMENTO')return '💳 *PAGAMENTO PENDENTE*\\nPedido *'+order.code+'*\\n\\n1️⃣ Ver PIX\\n2️⃣ Alterar dados\\n3️⃣ Cancelar pedido\\n4️⃣ Outro assunto\\n\\nResponda apenas com o número.';if(s==='AGUARDANDO_CONFERENCIA')return '🔎 *COMPROVANTE EM ANÁLISE*\\nPedido *'+order.code+'*\\n\\n1️⃣ Consultar pedido\\n4️⃣ Outro assunto\\n\\nResponda apenas com o número.';if(s==='PAGO_AGUARDANDO_BILHETES')return '✅ *PAGAMENTO CONFIRMADO*\\nPedido *'+order.code+'*\\n\\n1️⃣ Consultar pedido\\n2️⃣ Outro assunto\\n\\nResponda apenas com o número.';return 'Pedido *'+order.code+'* em andamento.\\n\\n1️⃣ Continuar\\n2️⃣ Outro assunto\\n\\nResponda apenas com o número.';}";
if(pag.includes(oldOrderMenu))pag=pag.replace(oldOrderMenu,newOrderMenu);

// Link de compra: o texto inteiro do formulário fica pré-preenchido no WhatsApp.
const initialHelpers="function rdsPurchaseFormText(){return '🛒 NOVO PEDIDO\\n\\nQuantidade:\\nNome:\\nCPF:';}\nfunction rdsPurchaseLink(){const bot=normalizeBR(process.env.BOT_WHATSAPP||process.env.WHATSAPP_NUMBER||process.env.RDS_WHATSAPP||'');return bot?'https://wa.me/'+bot+'?text='+encodeURIComponent(rdsPurchaseFormText()):'';}\nfunction rdsInitialMenu(){const buy=rdsPurchaseLink();const buyLine=buy?'🛒 *COMPRAR*\\n'+buy:'🛒 *COMPRAR*\\nEnvie *COMPRAR* para iniciar o pedido.';const office=normalizeBR(process.env.OFFICE_WHATSAPP||'');const officeLine=office?'🏢 *OUTRO ASSUNTO*\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'):'🏢 *OUTRO ASSUNTO*';return '👋 *CANAL DE VENDAS RDS*\\n\\nComo podemos ajudar?\\n\\n'+buyLine+'\\n\\n'+officeLine;}\n";
const helperNeedle="async function cancelOrderReal(order,reason)";
if(!pag.includes('function rdsInitialMenu()')&&pag.includes(helperNeedle))pag=pag.replace(helperNeedle,initialHelpers+helperNeedle);

// Estado pago: nenhuma operação de edição/cancelamento/reinício pode alterar pedido já pago.
const guard="  if(order){\n    if(is4){";
const guardNew="  if(order){\n    if(['PAGO_AGUARDANDO_BILHETES','CONCLUIDO'].includes(String(order.status||''))){\n      if(is1)return replyInbound(identity,'Pedido *'+order.code+'*: pagamento já confirmado ✅. '+(order.status==='CONCLUIDO'?'Este pedido já foi concluído.':'Os bilhetes aguardam emissão/envio pelo operador.')+'\\n\\nSe precisar de atendimento, escolha *2 — Outro assunto*.');\n      if(is5||is2){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nFale diretamente com o atendimento:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre meu pedido '+order.code+'.'));}\n      if(is3||is4)return replyInbound(identity,'🔒 O pedido *'+order.code+'* já possui pagamento confirmado e não pode ser alterado ou cancelado por este menu.\\n\\nPara atendimento, escolha *2 — Outro assunto*.');\n      return replyInbound(identity,'Pedido *'+order.code+'* com pagamento confirmado ✅. Para atendimento, escolha *2 — Outro assunto*.');\n    }\n    if(is4){";
if(!pag.includes('V10.72_PAID_STATE')&&pag.includes(guard))pag=pag.replace(guard,guardNew+'\n  // V10.72_PAID_STATE');

// Sem pedido ativo: qualquer mensagem inicia a apresentação dos dois caminhos.
const finalRouter="  return replyInbound(identity,routerMessage(settings));";
const finalInitial="  return replyInbound(identity,rdsInitialMenu());";
if(pag.includes(finalRouter))pag=pag.replace(finalRouter,finalInitial);

fs.writeFileSync(pag71Path,pag,'utf8');

let v70=fs.readFileSync(v70Path,'utf8');
v70=v70.replace("const pagbankPath=path.join(dir,'runtime-v10.60-pagbank.mjs');","const pagbankPath=path.join(dir,'runtime-v10.71-pagbank.mjs');");
v70=v70.replace("const pagbankPatchedPath=path.join(dir,'runtime-v10.70-pagbank-base.mjs');","const pagbankPatchedPath=path.join(dir,'runtime-v10.71-pagbank-base.mjs');");
v70=v70.replace("runtime-v10.70-pagbank-base.mjs","runtime-v10.71-pagbank-base.mjs");
v70=v70.replace("runtime-v10.70-fix-generated.mjs","runtime-v10.71-fix-generated.mjs");
v70=v70.replace("?v=1070","?v=1072");
fs.writeFileSync(v71Path,v70,'utf8');

console.log('[V10.72] entrada em dois caminhos; COMPRAR abre formulario pre-preenchido; menu profissional; pedidos pagos protegidos');
await import(pathToFileURL(v71Path).href+'?stable=1072');
