import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS FLOW HARDENING FINAL';
if(server.includes(marker)){
  console.log('[RDS] blindagem do fluxo de compra já aplicada');
  process.exit(0);
}

const block=String.raw`
${marker}
const rdsPendingBuy=new Map();

async function beginOrder(identity,campaignCode=null){
  if(!identity?.phone){await replyInbound(identity,'Não consegui identificar seu número de WhatsApp.');return;}
  const phone=normalizeBR(identity.phone);
  rdsPendingBuy.set(phone,{campaignCode:campaignCode||null,expiresAt:Date.now()+15*60*1000});
  await cancelFutureDeliveries(phone,'INTERESSE');
  await logEvent('INTERESSE',{phone,campaignCode:campaignCode||null,stage:'FORMULARIO_PENDENTE'});
  await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*');
  return replyInbound(identity,'Quantidade:\nNome:\nCPF:');
}
`;

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para blindagem do fluxo.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);

const anchor="  const order=identity.phone?await activeOrder(identity.phone):null;";
const injection=`  let order=identity.phone?await activeOrder(identity.phone):null;\n  if(order && order.status==='COLETANDO_DADOS' && Number(order.quantity||0)===0 && !String(order.customer_name||'').trim() && !String(order.customer_cpf||'').trim()){\n    await rdsCancelOrderFinal(order,'PEDIDO_VAZIO_RECUPERADO');\n    order=null;\n  }\n  const pendingBuy=identity.phone?rdsPendingBuy.get(normalizeBR(identity.phone)):null;\n  if(pendingBuy && Date.now()>Number(pendingBuy.expiresAt||0))rdsPendingBuy.delete(normalizeBR(identity.phone));\n  if(pendingBuy && Date.now()<=Number(pendingBuy.expiresAt||0) && looksLikeForm(text) && !order){\n    rdsPendingBuy.delete(normalizeBR(identity.phone));\n    const created=await createOrder(normalizeBR(identity.phone),pendingBuy.campaignCode||null);\n    await cancelFutureDeliveries(normalizeBR(identity.phone),'INTERESSE');\n    await logEvent('INTERESSE',{phone:normalizeBR(identity.phone),order:created.code,campaignCode:pendingBuy.campaignCode||null,stage:'DADOS_PREENCHIDOS'});\n    return handleOrderForm(identity,created,text);\n  }`;
if(!server.includes(anchor))throw new Error('Ponto de entrada do pedido não localizado.');
server=server.replace(anchor,injection);

server += `\n${marker}\n`;
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] fluxo blindado: pedido só nasce após formulário completo');
