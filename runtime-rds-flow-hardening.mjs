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
  let name=cleanText(v).replace(/\s+/g,' ');
  if(!name)return '';
  while(name.length<4)name+='!';
  return name;
}
function rdsGuidedQuantity(v){
  const t=cleanText(v).replace(/[,]/g,'.');
  if(!/^\d+(?:[.]0+)?(?:\s*(?:bilhete|bilhetes))?$/i.test(t))return 0;
  const n=Number((t.match(/^\d+/)||[])[0]||0);
  return Number.isInteger(n)&&n>0?n:0;
}
function rdsGuidedCpf(v){return digits(v);}
function rdsGuidedMoney(quantity,unitPrice){return Number((Number(quantity||0)*Number(unitPrice||3)).toFixed(2));}
function rdsGuidedConfirmation(state){
  return ['✅ *CONFIRA OS DADOS DO PEDIDO*','','👤 Nome: '+state.name,'🎟️ Quantidade: '+state.quantity+' bilhete(s)','💰 Total: *R$ '+money(rdsGuidedMoney(state.quantity,state.unitPrice||3))+'*','','Os dados estão corretos?','','1️⃣ *SIM, CONFIRMAR*','2️⃣ *EDITAR*'].join(String.fromCharCode(10));
}
function rdsGuidedEditMenu(){
  return ['✏️ *EDITAR DADOS DO PEDIDO*','','1️⃣ Quantidade','2️⃣ Nome','3️⃣ CPF','4️⃣ Todos','5️⃣ Voltar','','Digite o número do dado que deseja alterar.'].join(String.fromCharCode(10));
}
function rdsGuidedLogInbound(identity,inbound,m){
  return logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName:cleanText(m?.pushName||''),rawKeys:inbound.rawKeys}});
}
async function rdsGuidedStart(identity,campaignCode=null){
  const phone=rdsGuidedPhone(identity);
  if(!phone)return replyInbound(identity,'Não consegui identificar seu número de WhatsApp.');
  const current=await activeOrder(phone);
  if(current)return replyInbound(identity,'⚠️ Você já possui o pedido *'+current.code+'* em andamento. Use *3 — ALTERAR PEDIDO* ou *4 — CANCELAR PEDIDO*.');
  const settings=await getSettings();
  const unitPrice=Number(settings?.unit_price||settings?.default_unit_price||3);
  rdsGuidedPurchase.set(phone,{step:'QUANTIDADE',campaignCode:campaignCode||null,quantity:null,name:null,cpf:null,unitPrice,expiresAt:Date.now()+15*60*1000});
  await cancelFutureDeliveries(phone,'INTERESSE');
  await logEvent('INTERESSE',{phone,campaignCode:campaignCode||null,stage:'COMPRA_GUIADA_INICIADA'});
  await replyInbound(identity,'🍀 Olá! Vamos iniciar seu pedido.');
  await sleep(250);
  await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*\n\n⚠️ *ATENÇÃO* ⚠️\n\n✅ *Nome* deve ter mínimo 4 caracteres.\n\n✅ *CPF* deve ser válido com 11 dígitos.');
  return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
}
async function rdsGuidedConfirm(identity,state){
  state.step='CONFIRMAR';state.expiresAt=Date.now()+15*60*1000;
  return replyInbound(identity,rdsGuidedConfirmation(state));
}
async function rdsGuidedCreateAndPay(identity,state){
  const phone=rdsGuidedPhone(identity);
  const existing=await activeOrder(phone);
  if(existing)return replyInbound(identity,'⚠️ Você já possui o pedido *'+existing.code+'* em andamento.');
  const created=await createOrder(phone,state.campaignCode||null);
  if(!created)return replyInbound(identity,'⚠️ Não foi possível iniciar o pedido. Tente novamente com *COMPRAR*.');
  await patch('rds10_orders','id=eq.'+created.id,{customer_name:state.name,customer_tax_id:state.cpf,quantity:state.quantity,total_amount:rdsGuidedMoney(state.quantity,state.unitPrice||created.unit_price||3),updated_at:nowISO()});
  rdsGuidedPurchase.delete(phone);
  await cancelFutureDeliveries(phone,'PEDIDO_ATIVO');
  await logEvent('INTERESSE',{phone,order:created.code,campaignCode:state.campaignCode||null,stage:'DADOS_CONFIRMADOS_GUIADOS'});
  const fresh=await one('rds10_orders','select=*&id=eq.'+created.id);
  if(!fresh)return replyInbound(identity,'⚠️ Não foi possível recuperar o pedido.');
  const synthetic='Quantidade: '+state.quantity+'\nNome: '+state.name+'\nCPF: '+state.cpf;
  return handleOrderForm(identity,fresh,synthetic);
}
async function rdsGuidedReturnToConfirmation(identity,state){
  return rdsGuidedConfirm(identity,state);
}

const rdsOriginalHandleInboundGuided=handleInbound;
handleInbound=async function(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const text=cleanText(inbound.text);
  const phone=rdsGuidedPhone(identity);

  let state=phone?rdsGuidedPurchase.get(phone):null;
  if(state&&Date.now()>Number(state.expiresAt||0)){
    rdsGuidedPurchase.delete(phone);
    state=null;
  }

  const isBuy=/^(?:1|comprar|compra|nova compra|quero\s*comprar|rds[-_: ]?comprar|compre\s*agora)$/i.test(text);
  const isOther=/^(?:6|outras opcoes|outras opções)$/i.test(text);

  if(state){
    await rdsGuidedLogInbound(identity,inbound,m);

    if(isOther){
      rdsGuidedPurchase.delete(phone);
      return rdsOriginalHandleInboundGuided(m);
    }

    if(state.step==='QUANTIDADE'){
      if(/^(?:cancelar|cancelar pedido|desistir|não quero|nao quero|4)$/i.test(text)){
        rdsGuidedPurchase.delete(phone);
        await replyInbound(identity,'🛒 *NOVA COMPRA*');
        return;
      }
      const quantity=rdsGuidedQuantity(text);
      if(!quantity)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\n\nDigite apenas a quantidade de bilhetes que você deseja.');
      state.quantity=quantity;state.step='NOME';state.expiresAt=Date.now()+15*60*1000;
      return replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
    }

    if(state.step==='NOME'){
      const name=rdsGuidedName(text);
      if(!name)return replyInbound(identity,'❌ *NOME INVÁLIDO*\n\nDigite seu nome para continuar.');
      state.name=name;state.step='CPF';state.expiresAt=Date.now()+15*60*1000;
      return replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');
    }

    if(state.step==='CPF'){
      const cpf=rdsGuidedCpf(text);
      if(typeof validCPF==='function'&&!validCPF(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\n\nO CPF informado não é válido. Digite novamente seu CPF com 11 dígitos.');
      if(!/^\d{11}$/.test(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\n\nDigite novamente seu CPF com 11 dígitos.');
      state.cpf=cpf;
      return rdsGuidedConfirm(identity,state);
    }

    if(state.step==='CONFIRMAR'){
      if(/^(?:1|sim|confirmar|confirmo)$/i.test(text))return rdsGuidedCreateAndPay(identity,state);
      if(/^(?:2|editar|alterar)$/i.test(text)){state.step='EDITAR';state.expiresAt=Date.now()+15*60*1000;return replyInbound(identity,rdsGuidedEditMenu());}
      return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*\n\nEscolha *1 — SIM, CONFIRMAR* ou *2 — EDITAR*.');
    }

    if(state.step==='EDITAR'){
      if(/^1$/i.test(text)){state.step='EDIT_QUANTIDADE';state.expiresAt=Date.now()+15*60*1000;return replyInbound(identity,'🎟️ *DIGITE A NOVA QUANTIDADE DE BILHETES:* 👇');}
      if(/^2$/i.test(text)){state.step='EDIT_NOME';state.expiresAt=Date.now()+15*60*1000;return replyInbound(identity,'👤 *DIGITE O NOVO NOME:* 👇');}
      if(/^3$/i.test(text)){state.step='EDIT_CPF';state.expiresAt=Date.now()+15*60*1000;return replyInbound(identity,'🧾 *DIGITE O NOVO CPF:* 👇');}
      if(/^4$/i.test(text)){state.step='TODOS_QUANTIDADE';state.quantity=null;state.name=null;state.cpf=null;state.expiresAt=Date.now()+15*60*1000;return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');}
      if(/^5$/i.test(text)){return rdsGuidedReturnToConfirmation(identity,state);}
      return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*\n\nEscolha uma opção de *1 a 5*.');
    }

    if(state.step==='EDIT_QUANTIDADE'){
      const quantity=rdsGuidedQuantity(text);
      if(!quantity)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\n\nDigite apenas a quantidade de bilhetes que você deseja.');
      state.quantity=quantity;return rdsGuidedReturnToConfirmation(identity,state);
    }

    if(state.step==='EDIT_NOME'){
      const name=rdsGuidedName(text);
      if(!name)return replyInbound(identity,'❌ *NOME INVÁLIDO*\n\nDigite seu nome para continuar.');
      state.name=name;return rdsGuidedReturnToConfirmation(identity,state);
    }

    if(state.step==='EDIT_CPF'){
      const cpf=rdsGuidedCpf(text);
      if(typeof validCPF==='function'&&!validCPF(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\n\nO CPF informado não é válido. Digite novamente seu CPF com 11 dígitos.');
      if(!/^\d{11}$/.test(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\n\nDigite novamente seu CPF com 11 dígitos.');
      state.cpf=cpf;return rdsGuidedReturnToConfirmation(identity,state);
    }

    if(state.step==='TODOS_QUANTIDADE'){
      const quantity=rdsGuidedQuantity(text);
      if(!quantity)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\n\nDigite apenas a quantidade de bilhetes que você deseja.');
      state.quantity=quantity;state.step='TODOS_NOME';state.expiresAt=Date.now()+15*60*1000;
      return replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
    }

    if(state.step==='TODOS_NOME'){
      const name=rdsGuidedName(text);
      if(!name)return replyInbound(identity,'❌ *NOME INVÁLIDO*\n\nDigite seu nome para continuar.');
      state.name=name;state.step='TODOS_CPF';state.expiresAt=Date.now()+15*60*1000;
      return replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');
    }

    if(state.step==='TODOS_CPF'){
      const cpf=rdsGuidedCpf(text);
      if(typeof validCPF==='function'&&!validCPF(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\n\nO CPF informado não é válido. Digite novamente seu CPF com 11 dígitos.');
      if(!/^\d{11}$/.test(cpf))return replyInbound(identity,'❌ *CPF INVÁLIDO*\n\nDigite novamente seu CPF com 11 dígitos.');
      state.cpf=cpf;return rdsGuidedReturnToConfirmation(identity,state);
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
console.log('[RDS] confirmação antes do pedido + edição seletiva + opção todos instaladas');
