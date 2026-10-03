import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS PAYMENT FLOW FINAL V1';
if(s.includes(marker)){
  console.log('[RDS] fluxo de pagamento final V1 já aplicado');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=s.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para fluxo final.');

const block=String.raw`
${marker}

/* 1) Pagamento do WhatsApp usa Mercado Pago Orders, nunca a chave Pix legada. */
async function rdsFinalHandleOrderForm(identity,order,text){
  const t=cleanText(text);
  if(!order||order.status!=='COLETANDO_DADOS')return;
  const get=label=>{
    const m=t.match(new RegExp(label+'\\s*[:\\-]\\s*([^\\n\\r]+)','i'));
    return cleanText(m?.[1]||'');
  };
  const quantity=Number((get('quantidade').match(/\\d+/)||[])[0]||0);
  const name=get('nome').replace(/\\s+/g,' ').trim();
  const cpf=digits(get('cpf'));
  if(!quantity||quantity<1)return replyInbound(identity,'❌ Informe uma quantidade válida.');
  if(name.length<3)return replyInbound(identity,'❌ Informe seu nome completo.');
  if(!/^\\d{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ Informe um CPF válido com 11 dígitos.');

  const total=Number((quantity*Number(order.unit_price||3)).toFixed(2));
  if(identity.phone){
    try{
      const existing=await findContact(identity.phone);
      const data={name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',status:'ATIVO',validated:true,whatsapp_validated:true,last_seen_at:nowISO(),updated_at:nowISO()};
      if(existing)await patch('rds10_contacts','id=eq.'+existing.id,data);
      else await saveOrMergeContact(data);
    }catch(e){console.error('[RDS] CRM pedido:',e.message);}
  }

  await patch('rds10_orders','id=eq.'+order.id,{
    customer_name:name,
    customer_tax_id:cpf,
    contact_phone:identity.phone||null,
    quantity,
    total_amount:total,
    status:'AGUARDANDO_PAGAMENTO',
    payment_method:'PIX_MERCADO_PAGO',
    updated_at:nowISO()
  });

  const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
  if(!fresh)throw new Error('Pedido não encontrado após atualização.');

  let pix;
  try{
    pix=await rdsMercadoPagoCreatePix(fresh);
  }catch(e){
    await addAlert('MERCADO_PAGO_PIX_FALHA','Falha ao criar PIX — '+fresh.code,{order:fresh.code,error:e.message});
    return replyInbound(identity,'⚠️ *PEDIDO RECEBIDO*\\n\\nSeu pedido '+fresh.code+' foi registrado, mas não foi possível gerar o PIX agora. O atendimento pode tentar novamente pelo painel.');
  }

  if(typeof sendPixToIdentity==='function'){
    await sendPixToIdentity(identity,{...fresh,pix_copy_paste:pix?.qr?.text||fresh.pix_copy_paste},pix);
  }else{
    const code=cleanText(pix?.qr?.text||'');
    await replyInbound(identity,'💳 *PAGAMENTO PIX*\\n\\nPedido: *'+fresh.code+'*\\nValor: *R$ '+money(total)+'*\\n\\n*PIX COPIA E COLA:*\\n'+code+'\\n\\nApós pagar, aguarde a confirmação automática do Mercado Pago.');
  }
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:fresh.code,quantity,total,provider:'MERCADO_PAGO'});
}
handleOrderForm=rdsFinalHandleOrderForm;

/* 2) Cancelamentos passam a guardar a natureza do encerramento. */
const oldCancelRoute="app.post('/api/orders/:id/cancel',async(req,res)=>{ try{await patch('rds10_orders',\`id=eq.${req.params.id}\`,{status:'CANCELADO',updated_at:nowISO()});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});} });";
const newCancelRoute="app.post('/api/orders/:id/cancel',async(req,res)=>{ try{const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id));if(!o)throw new Error('Pedido não encontrado.');if(['CONCLUIDO','CANCELADO'].includes(String(o.status||'')))throw new Error('Pedido já encerrado.');await patch('rds10_orders','id=eq.'+encodeURIComponent(o.id),{status:'CANCELADO',cancel_reason:'CANCELAMENTO_MANUAL',cancelled_at:nowISO(),updated_at:nowISO()});await cancelFutureDeliveries(o.phone,'CANCELAMENTO_MANUAL');await logEvent('PEDIDO_CANCELADO',{order:o.code,phone:o.phone,reason:'CANCELAMENTO_MANUAL',source:'OPERADOR'});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});} });";
if(s.includes(oldCancelRoute))s=s.replace(oldCancelRoute,newCancelRoute);

/* Expiração: grava explicitamente que foi automática. */
s=s.replace(
  "await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',updated_at:nowISO()});\n  await rdsRestoreQueueAfterExpiration(order.phone);\n  console.log('[RDS] pedido expirado:'",
  "await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:'EXPIRADO_PAGAMENTO',cancelled_at:nowISO(),updated_at:nowISO()});\n  await rdsRestoreQueueAfterExpiration(order.phone);\n  await logEvent('PEDIDO_EXPIRADO',{phone:order.phone,order:order.code,reason:'EXPIRADO_PAGAMENTO'});\n  console.log('[RDS] pedido expirado:'"
);

/* Cancelamentos do cliente no fluxo final. */
s=s.replace(
  "await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',updated_at:nowISO()});await cancelFutureDeliveries(order.phone,reason||'CLIENTE_CANCELAMENTO');",
  "await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:reason||'CANCELAMENTO_CLIENTE',cancelled_at:nowISO(),updated_at:nowISO()});await cancelFutureDeliveries(order.phone,reason||'CANCELAMENTO_CLIENTE');"
);

/* Expõe cancel_reason para o painel multi-vendedor. */
s=s.replace(
  "payment_method,payment_created_at,payment_updated_at,payment_last_error';}",
  "payment_method,payment_created_at,payment_updated_at,payment_last_error,cancel_reason,cancelled_at';}"
);

fs.writeFileSync(path,s,'utf8');
console.log('[RDS] fluxo de pagamento final V1 aplicado');
`;

s=s.slice(0,pos)+block+'\\n'+s.slice(pos);
fs.writeFileSync(path,s,'utf8');
