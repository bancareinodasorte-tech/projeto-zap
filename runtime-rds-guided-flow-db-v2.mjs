import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS GUIDED PURCHASE FLOW DB V2';
if(server.includes(marker)){console.log('[RDS] fluxo guiado persistente V2 já aplicado');process.exit(0);}

const block=String.raw`
${marker}
function rdsGuidedDbPhone(identity){return normalizeBR(identity?.phone||'');}
function rdsGuidedDbQuantity(v){
  const t=cleanText(v).replace(/[,]/g,'.');
  if(!/^\\d+(?:[.]0+)?(?:\\s*(?:bilhete|bilhetes))?$/i.test(t))return 0;
  const n=Number((t.match(/^\\d+/)||[])[0]||0);
  return Number.isInteger(n)&&n>0?n:0;
}
function rdsGuidedDbName(v){return cleanText(v).replace(/\\s+/g,' ').trim();}
function rdsGuidedDbCpf(v){return digits(v);}
function rdsGuidedDbTotal(o,q){return Number((Number(q||0)*Number(o?.unit_price||3)).toFixed(2));}
function rdsGuidedDbConfirm(o){
  return ['✅ *CONFIRA OS DADOS DO PEDIDO*','','👤 Nome: '+cleanText(o.customer_name||''),'🎟️ Quantidade: '+Number(o.quantity||0)+' bilhete(s)','💰 Total: *R$ '+money(rdsGuidedDbTotal(o,o.quantity||0))+'*','','Os dados estão corretos?','','1️⃣ *SIM, CONFIRMAR*','2️⃣ *EDITAR*'].join(String.fromCharCode(10));
}
function rdsGuidedDbEditMenu(){
  return ['✏️ *EDITAR DADOS DO PEDIDO*','','1️⃣ Quantidade','2️⃣ Nome','3️⃣ CPF','4️⃣ Todos','5️⃣ Voltar','','Digite o número do dado que deseja alterar.'].join(String.fromCharCode(10));
}
async function rdsGuidedDbCancel(order,reason='CANCELAMENTO_CLIENTE'){
  if(!order?.id)return;
  if(typeof rdsCancelOrderFinal==='function')return rdsCancelOrderFinal(order,reason);
  await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:reason,cancelled_at:nowISO(),updated_at:nowISO()});
  await cancelFutureDeliveries(order.phone,reason);
}
async function rdsGuidedDbStart(identity,campaignCode=null){
  const phone=rdsGuidedDbPhone(identity);
  if(!phone)return replyInbound(identity,'Não consegui identificar seu número de WhatsApp.');
  let order=await activeOrder(phone);
  if(!order){
    order=await createOrder(phone,campaignCode||null);
    if(!order)return replyInbound(identity,'⚠️ Não foi possível iniciar o pedido. Tente novamente com *COMPRAR*.');
  }
  const step=cleanText(order.guided_step||'');
  if(order.status!=='COLETANDO_DADOS')return replyInbound(identity,'⚠️ Você já possui o pedido *'+order.code+'* em andamento.');
  if(!step){
    const inferred=order.customer_tax_id?'CONFIRMAR':order.customer_name?'CPF':order.quantity?'NOME':'QUANTIDADE';
    await patch('rds10_orders','id=eq.'+order.id,{guided_step:inferred,updated_at:nowISO()});
  }
  await cancelFutureDeliveries(phone,'INTERESSE');
  await logEvent('INTERESSE',{phone,order:order.code,campaignCode:campaignCode||null,stage:'COMPRA_GUIADA_INICIADA'});
  await replyInbound(identity,'🍀 Olá! Vamos iniciar seu pedido.');
  await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*\\n\\n⚠️ *ATENÇÃO* ⚠️\\n\\n✅ *Nome* deve ter mínimo 4 caracteres.\\n\\n✅ *CPF* deve ser válido com 11 dígitos.');
  return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
}
async function rdsGuidedDbHandle(identity,inbound,m){
  const phone=rdsGuidedDbPhone(identity);
  if(!phone)return false;
  let order=await activeOrder(phone);
  const text=cleanText(inbound?.text);
  const isBuy=/^(?:1|comprar|compra|nova compra|quero\\s*comprar|rds[-_: ]?comprar|compre\\s*agora)$/i.test(text);
  if(!order){
    if(isBuy){
      await rdsGuidedDbStart(identity,null);
      return true;
    }
    return false;
  }
  if(order.status!=='COLETANDO_DADOS')return false;

  let step=cleanText(order.guided_step||'');
  if(!step)step=order.customer_tax_id?'CONFIRMAR':order.customer_name?'CPF':order.quantity?'NOME':'QUANTIDADE';

  if(isBuy){
    return true;
  }

  if(/^(?:cancelar|cancelar pedido|desistir|não quero|nao quero|sair)$/i.test(text)){
    await rdsGuidedDbCancel(order,'CANCELAMENTO_CLIENTE');
    await replyInbound(identity,'✅ *SEU PEDIDO FOI CANCELADO*');
    return true;
  }

  if(step==='QUANTIDADE'){
    const quantity=rdsGuidedDbQuantity(text);
    if(!quantity){await replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\\n\\nDigite apenas a quantidade de bilhetes que você deseja.');return true;}
    order.quantity=quantity;
    await patch('rds10_orders','id=eq.'+order.id,{quantity,guided_step:'NOME',updated_at:nowISO()});
    await replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
    return true;
  }

  if(step==='NOME'){
    const name=rdsGuidedDbName(text);
    if(name.length<4){await replyInbound(identity,'❌ *NOME INVÁLIDO*\\n\\nDigite seu nome completo para continuar.');return true;}
    order.customer_name=name;
    await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CPF',updated_at:nowISO()});
    await replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');
    return true;
  }

  if(step==='CPF'){
    const cpf=rdsGuidedDbCpf(text);
    if(!/^\\d{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf))){await replyInbound(identity,'❌ *CPF INVÁLIDO*\\n\\nDigite novamente seu CPF com 11 dígitos.');return true;}
    order.customer_tax_id=cpf;
    await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
    order.guided_step='CONFIRMAR';
    return replyInbound(identity,rdsGuidedDbConfirm(order));
  }

  if(step==='CONFIRMAR'){
    if(/^(?:1|sim|confirmar|confirmo)$/i.test(text)){
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
      if(!fresh)return replyInbound(identity,'⚠️ Não foi possível recuperar seu pedido. Tente novamente.');
      if(!fresh.quantity||!fresh.customer_name||!/^\\d{11}$/.test(String(fresh.customer_tax_id||'')))return replyInbound(identity,'⚠️ Os dados do pedido estão incompletos. Escolha *2 — EDITAR* para corrigir.');
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'PROCESSANDO',updated_at:nowISO()});
      try{
        await handleOrderForm(identity,fresh,'Quantidade: '+fresh.quantity+'\\nNome: '+fresh.customer_name+'\\nCPF: '+fresh.customer_tax_id);
        await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:null,updated_at:nowISO()});
      }catch(e){
        await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});
        throw e;
      }
      return true;
    }
    if(/^(?:2|editar|alterar)$/i.test(text)){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDITAR',updated_at:nowISO()});return replyInbound(identity,rdsGuidedDbEditMenu());}
    return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*\\n\\nEscolha *1 — SIM, CONFIRMAR* ou *2 — EDITAR*.');
  }

  if(step==='EDITAR'){
    if(text==='1'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_QUANTIDADE'});return replyInbound(identity,'🎟️ *DIGITE A NOVA QUANTIDADE DE BILHETES:* 👇');}
    if(text==='2'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_NOME'});return replyInbound(identity,'👤 *DIGITE O NOVO NOME:* 👇');}
    if(text==='3'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_CPF'});return replyInbound(identity,'🧾 *DIGITE O NOVO CPF:* 👇');}
    if(text==='4'){await patch('rds10_orders','id=eq.'+order.id,{quantity:null,customer_name:null,customer_tax_id:null,guided_step:'TODOS_QUANTIDADE'});return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');}
    if(text==='5'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'CONFIRMAR'});const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);return replyInbound(identity,rdsGuidedDbConfirm(fresh||order));}
    return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*\\n\\nEscolha uma opção de *1 a 5*.');
  }

  if(step==='EDIT_QUANTIDADE'){
    const quantity=rdsGuidedDbQuantity(text);
    if(!quantity)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\\n\\nDigite apenas a quantidade de bilhetes que você deseja.');
    await patch('rds10_orders','id=eq.'+order.id,{quantity,guided_step:'CONFIRMAR',updated_at:nowISO()});
    const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);return replyInbound(identity,rdsGuidedDbConfirm(fresh||order));
  }
  if(step==='EDIT_NOME'){
    const name=rdsGuidedDbName(text);
    if(name.length<4)return replyInbound(identity,'❌ *NOME INVÁLIDO*\\n\\nDigite seu nome completo para continuar.');
    await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CONFIRMAR',updated_at:nowISO()});
    const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);return replyInbound(identity,rdsGuidedDbConfirm(fresh||order));
  }
  if(step==='EDIT_CPF'){
    const cpf=rdsGuidedDbCpf(text);
    if(!/^\\d{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ *CPF INVÁLIDO*\\n\\nDigite novamente seu CPF com 11 dígitos.');
    await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
    const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);return replyInbound(identity,rdsGuidedDbConfirm(fresh||order));
  }
  if(step==='TODOS_QUANTIDADE'){
    const quantity=rdsGuidedDbQuantity(text);
    if(!quantity)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*\\n\\nDigite apenas a quantidade de bilhetes que você deseja.');
    await patch('rds10_orders','id=eq.'+order.id,{quantity,guided_step:'TODOS_NOME',updated_at:nowISO()});
    return replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
  }
  if(step==='TODOS_NOME'){
    const name=rdsGuidedDbName(text);
    if(name.length<4)return replyInbound(identity,'❌ *NOME INVÁLIDO*\\n\\nDigite seu nome completo para continuar.');
    await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'TODOS_CPF',updated_at:nowISO()});
    return replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');
  }
  if(step==='TODOS_CPF'){
    const cpf=rdsGuidedDbCpf(text);
    if(!/^\\d{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ *CPF INVÁLIDO*\\n\\nDigite novamente seu CPF com 11 dígitos.');
    await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
    const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);return replyInbound(identity,rdsGuidedDbConfirm(fresh||order));
  }
  return false;
}
const rdsPreviousHandleInboundDbV2=handleInbound;
handleInbound=async function(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const handled=await rdsGuidedDbHandle(identity,inbound,m);
  if(handled)return;
  return rdsPreviousHandleInboundDbV2(m);
};
`;

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para fluxo guiado DB V2.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] fluxo guiado persistente DB V2 aplicado');
