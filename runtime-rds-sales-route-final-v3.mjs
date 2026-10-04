import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS SALES ROUTE FINAL V3';
if(server.includes(marker)){
  console.log('[RDS] rota comercial final V3 já aplicada');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para rota comercial final V3.');

const block=`
// RDS SALES ROUTE FINAL V3
(()=>{
  const NL=String.fromCharCode(10);
  const cleanName=v=>cleanText(v).split(' ').filter(Boolean).join(' ').trim();
  const cleanCpf=v=>digits(v);
  const qtyFrom=v=>{
    const t=cleanText(v).toLowerCase();
    if(!/^[0-9]+(?: *(?:bilhete|bilhetes))?$/.test(t))return 0;
    const n=Number((t.match(/^[0-9]+/)||[])[0]||0);
    return Number.isInteger(n)&&n>0?n:0;
  };
  const confirmText=o=>[
    '✅ *CONFIRA OS DADOS DO PEDIDO*','',
    '👤 Nome: '+cleanText(o.customer_name||''),
    '🎟️ Quantidade: '+Number(o.quantity||0)+' bilhete(s)',
    '💰 Total: *R$ '+money(Number(o.total_amount||0))+'*','',
    'Os dados estão corretos?','',
    '1️⃣ *SIM, CONFIRMAR*',
    '2️⃣ *EDITAR*'
  ].join(NL);
  const editText=[
    '✏️ *EDITAR DADOS DO PEDIDO*','',
    '1️⃣ Quantidade',
    '2️⃣ Nome',
    '3️⃣ CPF',
    '4️⃣ Todos',
    '5️⃣ Voltar','',
    'Digite o número do dado que deseja alterar.'
  ].join(NL);

  async function saveOrderContact(identity,order){
    if(!identity?.phone)return;
    try{
      const data={
        name:cleanText(order.customer_name),
        phone:identity.phone,
        group_name:'CLIENTES',
        origin:'PEDIDO',
        status:'ATIVO',
        validated:true,
        whatsapp_validated:true,
        last_seen_at:nowISO(),
        updated_at:nowISO()
      };
      await saveOrMergeContact(data,{preferExisting:true});
    }catch(e){console.warn('[RDS] CRM do pedido:',e?.message||e);}
  }

  async function startFinalPurchase(identity){
    const phone=normalizeBR(identity?.phone||'');
    if(!phone)return false;
    let order=await activeOrder(phone);
    if(order)return rdsFinalHandleInbound(identity,order,'');
    order=await createOrder(phone,null);
    if(!order)throw new Error('Não foi possível criar o pedido.');
    await patch('rds10_orders','id=eq.'+order.id,{guided_step:'QUANTIDADE',status:'COLETANDO_DADOS',updated_at:nowISO()});
    await logMessage({phone,direction:'IN',type:'text',body:'COMPRAR',status:'RECEBIDA',created_at:nowISO()});
    await logEvent('PEDIDO_INICIADO',{phone,order:order.code,stage:'COMPRA_GUIADA_V3'});
    await replyInbound(identity,'🍀 Olá! Vamos iniciar seu pedido.');
    await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*'+NL+NL+'⚠️ *ATENÇÃO* ⚠️'+NL+NL+'✅ *Nome* deve ter mínimo 4 caracteres.'+NL+NL+'✅ *CPF* deve ser válido com 11 dígitos.');
    await replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
    return true;
  }

  async function confirmFinalPurchase(identity,order){
    const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
    if(!fresh)throw new Error('Pedido não encontrado.');
    const quantity=Number(fresh.quantity||0);
    const name=cleanName(fresh.customer_name);
    const cpf=cleanCpf(fresh.customer_tax_id);
    if(!quantity||quantity<1||name.length<4||!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf))){
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});
      return replyInbound(identity,'⚠️ Os dados do pedido estão incompletos. Escolha *2 — EDITAR* para corrigir.');
    }
    const total=Number((quantity*Number(fresh.unit_price||3)).toFixed(2));
    await patch('rds10_orders','id=eq.'+fresh.id,{
      customer_name:name,
      customer_tax_id:cpf,
      contact_phone:identity.phone||fresh.phone||null,
      quantity,
      total_amount:total,
      status:'AGUARDANDO_PAGAMENTO',
      payment_method:'PIX_MERCADO_PAGO',
      guided_step:null,
      updated_at:nowISO()
    });
    const ready=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(fresh.id));
    await saveOrderContact(identity,ready||fresh);
    let pix=null;
    try{
      pix=await rdsMercadoPagoCreatePix(ready||fresh);
    }catch(e){
      await addAlert('MERCADO_PAGO_PIX_FALHA','Falha ao criar PIX — '+fresh.code,{order:fresh.code,error:e?.message||String(e)});
      await logEvent('MERCADO_PAGO_PIX_FALHA',{phone:identity.phone,order:fresh.code,error:e?.message||String(e)});
      await replyInbound(identity,'⚠️ *PEDIDO REGISTRADO*'+NL+NL+'Pedido *'+fresh.code+'* foi registrado, mas o PIX não pôde ser criado agora.'+NL+NL+'Não faça nenhum pagamento por outra chave. O sistema tentará novamente pelo painel.');
      return true;
    }
    const paidOrder=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(fresh.id));
    if(typeof sendPixToIdentity==='function'){
      await sendPixToIdentity(identity,{...(paidOrder||ready||fresh),pix_copy_paste:pix?.qr?.text||paidOrder?.pix_copy_paste||null},pix);
    }else{
      await replyInbound(identity,'🧾 *N° do Pedido:* '+fresh.code+NL+NL+'💳 *PAGAMENTO PIX*'+NL+NL+'💰 *VALOR:* R$ '+money(total)+NL+NL+'📋 *PIX COPIA E COLA:*'+NL+cleanText(pix?.qr?.text||''));
    }
    await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:fresh.code,quantity,total,provider:'MERCADO_PAGO'});
    return true;
  }

  async function rdsFinalHandleInbound(identity,order,text){
    const t=cleanText(text);
    let step=cleanText(order.guided_step||'');
    if(!step)step=order.customer_tax_id?'CONFIRMAR':order.customer_name?'CPF':order.quantity?'NOME':'QUANTIDADE';

    if(/^(?:cancelar|cancelar pedido|desistir|não quero|nao quero|sair|4)$/i.test(t)){
      await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:'CANCELAMENTO_CLIENTE',cancelled_at:nowISO(),guided_step:null,updated_at:nowISO()});
      await cancelFutureDeliveries(order.phone,'CANCELAMENTO_CLIENTE');
      await logEvent('PEDIDO_CANCELADO',{phone:order.phone,order:order.code,reason:'CANCELAMENTO_CLIENTE'});
      await replyInbound(identity,'✅ *SEU PEDIDO FOI CANCELADO*');
      return true;
    }

    if(step==='QUANTIDADE'){
      const q=qtyFrom(t);
      if(!q){await replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*'+NL+NL+'Digite apenas a quantidade de bilhetes que você deseja.');return true;}
      const total=Number((q*Number(order.unit_price||3)).toFixed(2));
      await patch('rds10_orders','id=eq.'+order.id,{quantity:q,total_amount:total,guided_step:'NOME',updated_at:nowISO()});
      await replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
      return true;
    }

    if(step==='NOME'){
      const name=cleanName(t);
      if(name.length<4){await replyInbound(identity,'❌ *NOME INVÁLIDO*'+NL+NL+'Digite seu nome completo para continuar.');return true;}
      await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CPF',updated_at:nowISO()});
      await replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');
      return true;
    }

    if(step==='CPF'){
      const cpf=cleanCpf(t);
      if(!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf))){await replyInbound(identity,'❌ *CPF INVÁLIDO*'+NL+NL+'Digite novamente seu CPF com 11 dígitos.');return true;}
      await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
      await replyInbound(identity,confirmText(fresh||{...order,customer_tax_id:cpf,guided_step:'CONFIRMAR'}));
      return true;
    }

    if(step==='CONFIRMAR'){
      if(/^(?:1|sim|confirmar|confirmo)$/i.test(t)){
        await patch('rds10_orders','id=eq.'+order.id,{guided_step:'PROCESSANDO',updated_at:nowISO()});
        try{return await confirmFinalPurchase(identity,order);}
        catch(e){
          await patch('rds10_orders','id=eq.'+order.id,{guided_step:'CONFIRMAR',updated_at:nowISO()}).catch(()=>{});
          await replyInbound(identity,'⚠️ Não foi possível concluir a confirmação agora. O pedido continua salvo. Tente *1 — SIM, CONFIRMAR* novamente.');
          return true;
        }
      }
      if(/^(?:2|editar|alterar)$/i.test(t)){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDITAR',updated_at:nowISO()});await replyInbound(identity,editText);return true;}
      return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*'+NL+NL+'Escolha *1 — SIM, CONFIRMAR* ou *2 — EDITAR*.');
    }

    if(step==='EDITAR'){
      if(t==='1'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_QUANTIDADE'});return replyInbound(identity,'🎟️ *DIGITE A NOVA QUANTIDADE DE BILHETES:* 👇');}
      if(t==='2'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_NOME'});return replyInbound(identity,'👤 *DIGITE O NOVO NOME:* 👇');}
      if(t==='3'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_CPF'});return replyInbound(identity,'🧾 *DIGITE O NOVO CPF:* 👇');}
      if(t==='4'){await patch('rds10_orders','id=eq.'+order.id,{quantity:null,total_amount:null,customer_name:null,customer_tax_id:null,guided_step:'TODOS_QUANTIDADE',updated_at:nowISO()});return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');}
      if(t==='5'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));}
      return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*'+NL+NL+'Escolha uma opção de *1 a 5*.');
    }

    if(step==='EDIT_QUANTIDADE'){
      const q=qtyFrom(t);if(!q)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*'+NL+NL+'Digite apenas a quantidade de bilhetes que você deseja.');
      const total=Number((q*Number(order.unit_price||3)).toFixed(2));
      await patch('rds10_orders','id=eq.'+order.id,{quantity:q,total_amount:total,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    if(step==='EDIT_NOME'){
      const name=cleanName(t);if(name.length<4)return replyInbound(identity,'❌ *NOME INVÁLIDO*'+NL+NL+'Digite seu nome completo para continuar.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    if(step==='EDIT_CPF'){
      const cpf=cleanCpf(t);if(!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ *CPF INVÁLIDO*'+NL+NL+'Digite novamente seu CPF com 11 dígitos.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    if(step==='TODOS_QUANTIDADE'){
      const q=qtyFrom(t);if(!q)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*'+NL+NL+'Digite apenas a quantidade de bilhetes que você deseja.');
      const total=Number((q*Number(order.unit_price||3)).toFixed(2));
      await patch('rds10_orders','id=eq.'+order.id,{quantity:q,total_amount:total,guided_step:'TODOS_NOME',updated_at:nowISO()});
      return replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
    }
    if(step==='TODOS_NOME'){
      const name=cleanName(t);if(name.length<4)return replyInbound(identity,'❌ *NOME INVÁLIDO*'+NL+NL+'Digite seu nome completo para continuar.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'TODOS_CPF',updated_at:nowISO()});
      return replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');
    }
    if(step==='TODOS_CPF'){
      const cpf=cleanCpf(t);if(!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ *CPF INVÁLIDO*'+NL+NL+'Digite novamente seu CPF com 11 dígitos.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    return false;
  }

  const previousHandleInbound=handleInbound;
  handleInbound=async function(m){
    const identity=resolveInboundIdentity(m);
    const inbound=extractInbound(m);
    const text=cleanText(inbound?.text);
    const phone=normalizeBR(identity?.phone||'');
    if(!phone)return previousHandleInbound(m);

    const active=await activeOrder(phone);
    const buy=/^(?:comprar|compra|quero comprar|quero comprar|compre agora)$/i.test(text);

    if(active&&active.status==='COLETANDO_DADOS'){
      await logMessage({phone,direction:'IN',type:inbound.type||'text',body:text,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid}});
      await upsertInboundContact(identity,cleanText(m?.pushName||''));
      return rdsFinalHandleInbound(identity,active,text);
    }

    if(!active&&buy){
      await logMessage({phone,direction:'IN',type:'text',body:text,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid}});
      await upsertInboundContact(identity,cleanText(m?.pushName||''));
      return startFinalPurchase(identity);
    }

    return previousHandleInbound(m);
  };
})();
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] rota comercial final V3 aplicada');
