import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS MENU REFINEMENT FINAL';
if(server.includes(marker)){console.log('[RDS] refinamento do menu já aplicado');process.exit(0);}

const oldMenu=/function rdsMainMenu\(settings\)\{[\s\S]*?\n\}/;
const newMenu=`function rdsMainMenu(settings){
  return '🍀 *CANAL DE VENDAS RDS*\\n\\n1️⃣ 🛒 *COMPRAR BILHETES*\\n2️⃣ 🔎 *CONSULTAR PEDIDO*\\n3️⃣ 📝 *ALTERAR PEDIDO*\\n4️⃣ ❌ *CANCELAR PEDIDO*\\n5️⃣ 🏢 *ATENDIMENTO*\\n6️⃣ ⚙️ *OUTRAS OPÇÕES*\\n\\nEscolha uma opção pelo número.';
}`;
if(!oldMenu.test(server))throw new Error('rdsMainMenu não localizado.');
server=server.replace(oldMenu,newMenu);

const oldCancel="if(cmd==='4'||/^(cancelar|cancelar pedido|encerrar|desistir|não quero|nao quero)$/.test(cmd)){await rdsCancelOrderFinal(order,'CLIENTE_CANCELAMENTO');return rdsSendMenuFinal(identity);}";
const newCancel="if(cmd==='4'||/^(cancelar|cancelar pedido|encerrar|desistir|não quero|nao quero)$/.test(cmd)){await rdsCancelOrderFinal(order,'CLIENTE_CANCELAMENTO');await replyInbound(identity,'✅ *SEU PEDIDO FOI CANCELADO*');return replyInbound(identity,'🛒 *NOVA COMPRA*');}";
if(!server.includes(oldCancel))throw new Error('Bloco de cancelamento do pedido não localizado.');
server=server.replace(oldCancel,newCancel);

const oldBuy="if(isBuyRoute(text)||cmd==='1')return beginOrder(identity,null);";
const newBuy="if(isBuyRoute(text)||cmd==='1'||cmd==='nova compra')return beginOrder(identity,null);";
if(!server.includes(oldBuy))throw new Error('Rota COMPRAR não localizada.');
server=server.replace(oldBuy,newBuy);

const oldRoute="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$/i.test(text); }";
const newRoute="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$|^\\s*COMPRAR\\s*$|^\\s*NOVA\\s+COMPRA\\s*$/i.test(text); }";
if(server.includes(oldRoute))server=server.replace(oldRoute,newRoute);

server += `\n${marker}\n`;
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] menu refinado: sem link, cancelamento com duas mensagens e nova compra');
