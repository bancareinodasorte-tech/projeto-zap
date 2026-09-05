import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS GUIDED PURCHASE FLOW FINAL';
if(server.includes(marker)){
  console.log('[RDS] fluxo guiado de compra já aplicado');
  process.exit(0);
}

const block=String.raw`
${marker}
const rdsGuidedPurchase=new Map();

function rdsGuidedPhone(identity){return normalizeBR(identity?.phone||'');}
function rdsGuidedName(v){
  let name=cleanText(v).replace(/\\s+/g,' ');
  if(!name)return '';
  while(name.length<4)name+='!';
  return name;
}
function rdsGuidedQuantity(v){
  const t=cleanText(v).replace(/[,]/g,'.');
  if(!/^\\d+(?:[.]0+)?(?:\\s*(?:bilhete|bilhetes))?$/i.test(t))return 0;
  const n=Number((t.match(/^\\d+/)||[])[0]||0);
  return Number.isInteger(n)&&n>0?n:0;
}
function rdsGuidedCpf(v){return digits(v);}
function rdsGuidedLogInbound(identity,inbound,m){
  return logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName:cleanText(m?.pushName||''),rawKeys:inbound.rawKeys}});
}
async function rdsGuidedStart(identity,campaignCode=null){
  const phone=rdsGuidedPhone(identity);
  if(!phone)return replyInbound(identity,'Não consegui identificar seu número de WhatsApp.');
  rdsGuidedPurchase.set(phone,{step:'QUANTIDADE',campaignCode:campaignCode||null,quantity:null,name:null,cpf:null,expiresAt:Date.now()+15*60*1000});
  await cancelFutureDeliveries(phone,'INTERESSE');
  await logEvent('INTERESSE',{phone,campaignCode:campaignCode||null,stage:'COMPRA_GUIADA_INICIADA'});
  await replyInbound(identity,'🍀 Olá! Vamos iniciar seu pedido.');
  await sleep(250);
  return replyInbound(identity,'🛒 *PREENCHA O PEDIDO*\\n\\n⚠️ *ATENÇÃO* ⚠️\\n✅ *Nome* deve ter mínimo 4 caracteres.\\n✅ *CPF* deve ser válido com 11 dígitos.');
}
async function rdsGuidedFinish(identity,state){
  const phone=rdsGuidedPhone(identity);
  const created=await createOrder(phone,state.campaignCode||null);
  if(!created)return replyInbound(identity,'⚠️ Não foi possível iniciar o pedido. Tente novamente com *COMPRAR*.');
  await patch('rds10_orders','id=eq.'+created.id,{customer_name:state.name,customer_tax_id:state.cpf,quantity:state.quantity,total_amount:Number((state.quantity*Number(created.unit_price||3)).toFixed(2)),updated_at:nowISO()});
  rdsGuidedPurchase.delete(phone);
  await cancelFutureDeliveries(phone,'INTERESSE');
  await logEvent('INTERESSE',{phone,order:created.code,campaignCode:state.campaignCode||null,stage:'DADOS_PREENCHIDOS_GUIADOS'});
  const fresh=await one('rds10_orders','select=*&id=eq.'+created.id);
  if(!fresh)return;
  const synthetic='Quantidade: '+state.quantity+'\\nNome: '+state.name+'\\nCPF: '+state.cpf;
  return handleOrderForm(identity,fresh,synthetic);
}

const rdsOriginalHandleInboundGuided=handleInbound;
handleInbound=async function(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const text=cleanText(inbound.text);
  const phone=rdsGuidedPhone(identity);
  const cmd=text.toLowerCase().replace(/[.]/g,'').trim();

  let state=phone?rdsGuidedPurchase.get(phone):null;
  if(state&&Date.now()>Number(state.expiresAt||0)){
    rdsGuidedPurchase.delete(phone);
    state=null;
  }

  const isBuy=/^(?:1|comprar|compra|nova compra|quero\\s*comprar|rds[-_: ]?comprar|compre\\s*agora)$/i.test(text);
  const isCancel=/^(?:4|cancelar|cancelar pedido|encerrar|desistir|não quero|nao quero)$/i.test(text);
  const isOther=/^(?:6|outras opcoes|outras opções)$/i.test(text);

  if(state){
    await rdsGuidedLogInbound(identity,inbound,m);

    if(isCancel){
      rdsGuidedPurchase.delete(phone);
      const order=await activeOrder(phone);
      if(order){
        await rdsCancelOrderFinal(order,'CLIENTE_CANCELAMENTO');
        await replyInbound(identity,'❌ *CANCELAR PEDIDO*\\n\\nPedido: *'+order.code+'*\\n\\nDeseja realmente cancelar este pedido?\\n\\n1️⃣ *SIM, CANCELAR*\\n2️⃣ *NÃO, VOLTAR*\\n\\nDigite uma opção.');
      }else{
        await replyInbound(identity,'❌ *CANCELAR PEDIDO*\\n\\nNão existe pedido criado ainda.');
        await replyInbound(identity,'🛒 *NOVA COMPRA*');
      }
      return;
    }
    if(isOther){
      rdsGuidedPurchase.delete(phone);
      return rdsOriginalHandleInboundGuided(m);
    }

    if(state.step==='QUANTIDADE'){
      const quantity=rdsGuidedQuantity(text);
      if(!quantity)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\\n\\nDigite apenas a quantidade de bilhetes que você deseja.');
      state.quantity=quantity;state.step='NOME';state.expiresAt=Date.now()+15*60*1000;
      return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
    }
    if(state.step==='NOME'){
      const name=rdsGuidedName(text);
      if(!name)return replyInbound(identity,'❌ *NOME INVÁLIDO*\\n\\nDigite seu nome para continuar.');
      state.name=name;state.step='CPF';state.expiresAt=Date.now()+15*60*1000;
      return replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
    }
    if(state.step==='CPF'){
      const cpf=rdsGuidedCpf(text);
      if(typeof validCPF==='function'&&!validCPF(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\\n\\nO CPF informado não é válido. Digite novamente seu CPF com 11 dígitos.');
      if(!/^\\d{11}$/.test(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\\n\\nDigite novamente seu CPF com 11 dígitos.');
      state.cpf=cpf;state.expiresAt=Date.now()+15*60*1000;
      return rdsGuidedFinish(identity,state);
    }
  }

  if(isBuy&&phone){
    await rdsGuidedLogInbound(identity,inbound,m);
    return rdsGuidedStart(identity,null);
  }

  return rdsOriginalHandleInboundGuided(m);
};
`;

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para fluxo guiado.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] fluxo guiado: quantidade → nome → CPF → pedido completo');
