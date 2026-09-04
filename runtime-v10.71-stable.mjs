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

// Menu principal refinado: ações úteis e link de compra com mensagem pré-preenchida.
const menuFunction="function rdsRouterMessageV2(settings){const bot=normalizeBR(connectedNumber||'');const buyText=encodeURIComponent('QUERO COMPRAR\\n\\nQuantidade:\\nNome:\\nCPF:');const buyLink=bot?'https://wa.me/'+bot+'?text='+buyText:'';return '🍀 *CANAL DE VENDAS RDS*\\n\\n'+'1️⃣ *COMPRAR BILHETES*'+(buyLink?'\\n👉 '+buyLink:'')+'\\n\\n2️⃣ *CONSULTAR PEDIDO*\\n3️⃣ *ALTERAR PEDIDO*\\n4️⃣ *CANCELAR PEDIDO*\\n5️⃣ *ATENDIMENTO*\\n\\nEscolha uma opção pelo número ou toque no link de *COMPRAR BILHETES*.\\n\\n🔒 Pagamentos confirmados não podem ser alterados ou cancelados pelo menu.';}";
if(!server.includes('function rdsRouterMessageV2('))server=server.replace('function isBuyRoute',menuFunction+'\nfunction isBuyRoute');
fs.writeFileSync(serverPath,server,'utf8');

let pag=fs.readFileSync(basePagPath,'utf8');

// O menu numérico passa a ter semântica consistente:
// 1 comprar/continuar, 2 consultar, 3 alterar, 4 cancelar, 5 atendimento.
pag=pag.replace("const is3=/^(3|recomeçar|recomecar|novo|nova compra)$/.test(cmd);","const is3=/^(3|alterar|corrigir|editar|altero|edito)$/.test(cmd);");
pag=pag.replace("if(is1||is2)return askOrderForm(identity,order,is2?'📝 *CORRIGIR PEDIDO*':'🛒 *PREENCHER PEDIDO*');","if(is1||is3)return askOrderForm(identity,order,is3?'📝 *ALTERAR PEDIDO*':'🛒 *PREENCHER PEDIDO*');");
pag=pag.replace("if(is2){await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});return askOrderForm(identity,order,'📝 *CORRIGIR PEDIDO*');}","if(is3){await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});return askOrderForm(identity,order,'📝 *ALTERAR PEDIDO*');}");

// Consulta útil de pedido: mostra código, situação, quantidade e valor, sem alterar o estado.
const consultBlock="if(is2){const statusLabel={COLETANDO_DADOS:'aguardando preenchimento dos dados',AGUARDANDO_PAGAMENTO:'aguardando pagamento',AGUARDANDO_CONFERENCIA:'comprovante recebido e aguardando conferência',PAGO_AGUARDANDO_BILHETES:'pagamento confirmado e aguardando emissão dos bilhetes',CONCLUIDO:'concluído',CANCELADO:'cancelado'}[String(order.status||'')]||String(order.status||'');return replyInbound(identity,'🔎 *CONSULTA DO PEDIDO*\\n\\n🧾 Pedido: *'+order.code+'*\\n🎟 Quantidade: *'+(order.quantity||0)+'*\\n💰 Total: *R$ '+money(order.total_amount||0)+'*\\n📌 Situação: *'+statusLabel+'*'+(order.pix_expires_at&&order.status==='AGUARDANDO_PAGAMENTO'?'\\n⏳ PIX válido até: '+new Date(order.pix_expires_at).toLocaleString('pt-BR'):'')+'\\n\\nPara alterar, escolha *3*. Para cancelar, escolha *4*. Para atendimento, escolha *5*.');}\n    if(is4){";
if(!pag.includes("const statusLabel={COLETANDO_DADOS")&&pag.includes("if(order){\n    if(is4){"))pag=pag.replace("if(order){\n    if(is4){", "if(order){\n    "+consultBlock);

// Novo pedido quando o cliente digita 1 diretamente no menu.
pag=pag.replace("if(isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);", "if(is1){return beginOrder(identity,null);}\n  if(is2&&identity.phone){const latest=await one('rds10_orders','select=*&phone=eq.'+encodeURIComponent(identity.phone)+'&order=created_at.desc');if(latest)return replyInbound(identity,'🔎 *ÚLTIMO PEDIDO*\\n\\n🧾 Pedido: *'+latest.code+'*\\n🎟 Quantidade: *'+(latest.quantity||0)+'*\\n💰 Total: *R$ '+money(latest.total_amount||0)+'*\\n📌 Situação: *'+String(latest.status||'').replaceAll('_',' ')+'*\\n\\nEnvie *QUERO COMPRAR* para iniciar uma nova compra.');return replyInbound(identity,'🔎 Você ainda não possui um pedido registrado.\\n\\n👉 Para comprar, envie *QUERO COMPRAR* ou use o link de *COMPRAR BILHETES* no menu.');}\n  if(is3){return replyInbound(identity,'ℹ️ Não há pedido ativo para alterar.\\n\\nPara iniciar uma compra, envie *QUERO COMPRAR*.');}\n  if(is4){return replyInbound(identity,'ℹ️ Não há pedido ativo para cancelar.\\n\\nPara iniciar uma compra, envie *QUERO COMPRAR*.');}\n  if(isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);");
pag=pag.replace("return replyInbound(identity,routerMessage(settings));","return replyInbound(identity,rdsRouterMessageV2(settings));");

const guard="  if(order){\n    if(is4){";
const guardNew="  if(order){\n    if(['PAGO_AGUARDANDO_BILHETES','CONCLUIDO'].includes(String(order.status||''))){\n      if(is1)return replyInbound(identity,'Pedido *'+order.code+'*: pagamento já confirmado ✅. '+(order.status==='CONCLUIDO'?'Este pedido já foi concluído.':'Os bilhetes aguardam emissão/envio pelo operador.')+'\\n\\nSe precisar de atendimento, escolha *5 — Atendimento*.');\n      if(is2)return replyInbound(identity,'🔎 *CONSULTA DO PEDIDO*\\n\\n🧾 Pedido: *'+order.code+'*\\n🎟 Quantidade: *'+(order.quantity||0)+'*\\n💰 Total: *R$ '+money(order.total_amount||0)+'*\\n📌 Situação: *'+(order.status==='CONCLUIDO'?'concluído':'pagamento confirmado — aguardando emissão/envio dos bilhetes')+'*\\n\\nPara atendimento, escolha *5*.');\n      if(is5){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *ATENDIMENTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre meu pedido '+order.code+'.'));}\n      if(is3||is4)return replyInbound(identity,'🔒 O pedido *'+order.code+'* já possui pagamento confirmado e não pode ser alterado ou cancelado pelo menu.\\n\\nPara atendimento, escolha *5 — Atendimento*.');\n      return replyInbound(identity,'Pedido *'+order.code+'* com pagamento confirmado ✅. Para atendimento, escolha *5 — Atendimento*.');\n    }\n    if(is4){";
if(!pag.includes('V10.71_PAID_STATE')&&pag.includes(guard))pag=pag.replace(guard,guardNew+'\n  // V10.71_PAID_STATE');
// O banco rds10_orders não possui cancel_reason. Remover esse campo do runtime evita falha silenciosa no encerramento/cancelamento.
pag=pag.replace("{status:'CANCELADO',cancel_reason:why,updated_at:nowISO()}","{status:'CANCELADO',updated_at:nowISO()}");
fs.writeFileSync(pag71Path,pag,'utf8');

let v70=fs.readFileSync(v70Path,'utf8');
v70=v70.replace("const pagbankPath=path.join(dir,'runtime-v10.60-pagbank.mjs');","const pagbankPath=path.join(dir,'runtime-v10.71-pagbank.mjs');");
v70=v70.replace("const pagbankPatchedPath=path.join(dir,'runtime-v10.70-pagbank-base.mjs');","const pagbankPatchedPath=path.join(dir,'runtime-v10.71-pagbank-base.mjs');");
v70=v70.replace("runtime-v10.70-pagbank-base.mjs","runtime-v10.71-pagbank-base.mjs");
v70=v70.replace("runtime-v10.70-fix-generated.mjs","runtime-v10.71-fix-generated.mjs");
v70=v70.replace("?v=1070","?v=1071");
fs.writeFileSync(v71Path,v70,'utf8');

console.log('[V10.71] menu refinado; comprar com link pre-preenchido; consulta/alteracao/cancelamento/atendimento revisados; pedidos pagos protegidos');
await import(pathToFileURL(v71Path).href+'?stable=1071');
