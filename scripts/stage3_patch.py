from pathlib import Path
import re
p=Path('server.js'); s=p.read_text()
begin='''async function beginOrder(identity, campaignCode=null){
  if(!identity.phone){ await replyInbound(identity,'Não consegui identificar seu número de WhatsApp. Envie novamente.'); return; }
  const order=await createOrder(identity.phone,campaignCode);
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
  await replyInbound(identity,`🛒 *COMPRA DE BILHETES*\\n\\nPedido: *${order.code}*\\n\\nInforme apenas a *quantidade* de bilhetes.\\nExemplo: *5*\\n\\nDigite *CANCELAR* para sair.`);
}'''
s,n=re.subn(r'async function beginOrder\(identity, campaignCode=null\)\{.*?\n\}\nasync function handleOrderForm',lambda m:begin+'\nasync function handleOrderForm',s,1,re.S)
if n!=1: raise SystemExit('beginOrder não encontrado')
form='''async function handleOrderForm(identity, order, text){
  const t=cleanText(text);
  if(order.status!=='COLETANDO_DADOS') return;
  if(!order.quantity){
    const m=t.match(/^(\\d{1,4})$/), qty=m?Number(m[1]):0;
    if(!qty||qty<1){ await replyInbound(identity,'Informe somente a quantidade de bilhetes usando números.\\nExemplo: *5*'); return; }
    await patch('rds10_orders',`id=eq.${order.id}`,{quantity:qty,updated_at:nowISO()}); order.quantity=qty;
    await replyInbound(identity,`Quantidade: *${qty}* bilhete(s).\\n\\nAgora informe seu *nome completo*.\\n\\nDigite *CANCELAR* para sair.`); return;
  }
  const name=t.replace(/\\s+/g,' ').trim();
  if(name.length<3||/^(\\d+|CANCELAR|SAIR|REINICIAR)$/i.test(name)){ await replyInbound(identity,'Informe seu *nome completo* para continuar.\\n\\nDigite *CANCELAR* para sair.'); return; }
  const quantity=Number(order.quantity||0), total=Number((quantity*Number(order.unit_price||3)).toFixed(2));
  if(identity.phone){ const existing=await findContact(identity.phone); if(existing) await patch('rds10_contacts',`id=eq.${existing.id}`,{name,validated:true,last_seen_at:nowISO(),updated_at:nowISO()}); else await saveOrMergeContact({name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()}); }
  await patch('rds10_orders',`id=eq.${order.id}`,{customer_name:name,contact_phone:identity.phone,quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  const settings=await getSettings(), pix=cleanText(settings.pix_key||'PIX NÃO CONFIGURADO');
  await replyInbound(identity,`✅ *PEDIDO RECEBIDO*\\n\\n👤 ${name}\\n🎟 ${quantity} bilhete(s)\\n💰 Total: *R$ ${money(total)}*\\n🧾 Pedido: *${order.code}*\\n\\n💳 *PAGAMENTO PIX*\\nChave: ${pix}\\nFavorecido: ${cleanText(settings.pix_name||'REINO DA SORTE')}\\nValor: *R$ ${money(total)}*\\n\\nApós pagar, envie o comprovante aqui 👇`);
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity,total});
}'''
s,n=re.subn(r'async function handleOrderForm\(identity, order, text\)\{.*?\n\}\nasync function handleProof',lambda m:form+'\nasync function handleProof',s,1,re.S)
if n!=1: raise SystemExit('handleOrderForm não encontrado')
block='''    if(order.status === 'COLETANDO_DADOS'){
      if(/^(CANCELAR|SAIR|REINICIAR)$/i.test(cleanText(text))){
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',updated_at:nowISO()});
        return replyInbound(identity,routerMessage(settings));
      }
      if(isOfficeRoute(text)){
        const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',updated_at:nowISO()});
        return replyInbound(identity,`🏢 Atendimento do escritório:\\nhttps://wa.me/${office}?text=${encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')}`);
      }
      return handleOrderForm(identity,order,text);
    }'''
s,n=re.subn(r"    if\(order\.status === 'COLETANDO_DADOS'\)\{.*?\n    \}",lambda m:block,s,1,re.S)
if n!=1: raise SystemExit('bloco COLETANDO_DADOS não encontrado')
p.write_text(s)
print('PATCH_OK')
