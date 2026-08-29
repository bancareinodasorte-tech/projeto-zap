import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.51 — fluxo comercial + dados do pagador + recuperação segura do pedido.
// Primeiro restaura toda a cadeia PagBank V10.40 (inclui produção e reconciliação).
await import('./runtime-v10.40-pagbank-customer-fix.mjs');

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

function replaceBetween(start, end, replacement){
  const a=s.indexOf(start), b=s.indexOf(end,a+start.length);
  if(a<0 || b<0) throw new Error(`trecho não localizado: ${start}`);
  s=s.slice(0,a)+replacement+s.slice(b);
}

replaceBetween('function parseOrderForm(text){','function isBuyRoute(text){',`function parseOrderForm(text){
  const t = cleanText(text);
  const get = label => {
    const re = new RegExp(label+'\\\\s*[:\\\\-]\\\\s*([^\\\\n\\\\r]+)','i');
    return cleanText(t.match(re)?.[1] || '');
  };
  const quantity = Number((get('quantidade').match(/\\d+/)||[])[0] || 0);
  const cpf = digits(get('cpf'));
  const email = get('e-?mail');
  return { quantity, name:get('nome'), cpf, email, contact:get('contato') };
}
`+'function isBuyRoute(text){');

replaceBetween('async function beginOrder(identity, campaignCode=null){','async function handleOrderForm(identity, order, text){',`async function beginOrder(identity, campaignCode=null){
  if(!identity.phone){
    await replyInbound(identity,'Não consegui identificar seu número de WhatsApp. Envie novamente *COMPRAR*.');
    return;
  }
  const order = await createOrder(identity.phone,campaignCode);
  await replyInbound(identity,'🛒 *PREENCHER PEDIDO*');
  await sleep(350);
  await replyInbound(identity,`Quantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:\\n\\nPedido: ${order.code}`);
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
}
`+'async function handleOrderForm(identity, order, text){');

replaceBetween('async function handleOrderForm(identity, order, text){','async function handleProof(identity, order, inbound){',`async function handleOrderForm(identity, order, text){
  const p = parseOrderForm(text);
  const missing=[];
  if(!p.quantity || p.quantity < 1) missing.push('Quantidade');
  if(!p.name) missing.push('Nome');
  if(p.cpf.length!==11) missing.push('CPF');
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email)) missing.push('E-mail');
  if(!p.contact) missing.push('Contato');
  if(missing.length){
    await replyInbound(identity,`Falta preencher ou corrigir: *${missing.join(', ')}*.\\nEnvie novamente o formulário completo.`);
    return;
  }
  const total = Number((p.quantity * Number(order.unit_price || 3)).toFixed(2));
  const submittedPhone = phoneKey(p.contact) || identity.phone;
  if(identity.phone){
    const existing = await findContact(identity.phone);
    if(existing){
      await patch('rds10_contacts',`id=eq.${existing.id}`,{validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
    }else{
      await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});
    }
  }
  await patch('rds10_orders',`id=eq.${order.id}`,{customer_name:p.name,contact_phone:submittedPhone,customer_tax_id:p.cpf,customer_email:p.email,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  const fresh=await one('rds10_orders',`select=*&id=eq.${order.id}`);
  let payMsg='';
  try{
    if(typeof rdsPagBankConfigured==='function' && rdsPagBankConfigured()){
      const pg=await rdsPagBankCreatePix(fresh);
      const copy=cleanText(pg?.qr?.text||'');
      if(!copy) throw new Error('PagBank não retornou o PIX Copia e Cola.');
      payMsg=`✅ *PEDIDO RECEBIDO*\\n\\n👤 ${p.name}\\n🎟 ${p.quantity} bilhete(s)\\n💰 Total: *R$ ${money(total)}*\\n🧾 Pedido: ${order.code}\\n\\n💠 *PIX PAGBANK*\\n\\n*PIX Copia e Cola:*\\n${copy}\\n\\nApós pagar, aguarde a confirmação automática do sistema. Se desejar, também pode enviar o comprovante aqui.`;
      await logEvent('PIX_ENVIADO_AUTOMATICAMENTE',{order_id:order.id,order:order.code,phone:identity.phone,pagbank_order_id:pg?.orderId||null});
    }
  }catch(e){
    await logEvent('PIX_AUTOMATICO_FALHOU',{order_id:order.id,order:order.code,error:e.message});
  }
  if(!payMsg) payMsg='⚠️ *PAGAMENTO PIX INDISPONÍVEL NO MOMENTO*\\n\\nSeu pedido foi registrado, mas a cobrança automática não pôde ser criada. Aguarde o atendimento do Reino da Sorte. Não realize pagamento por outra chave enviada fora do sistema.';
  await replyInbound(identity,payMsg);
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,email:p.email});
}
`+'async function handleProof(identity, order, inbound){');

replaceBetween("  if(order.status === 'AGUARDANDO_PAGAMENTO'){
      if(inbound.media) return handleProof(identity,order,inbound);
      return replyInbound(identity,`Seu pedido", "    if(order.status === 'AGUARDANDO_CONFERENCIA')", `  if(order.status === 'AGUARDANDO_PAGAMENTO'){
      if(inbound.media) return handleProof(identity,order,inbound);
      const n=cleanText(text).toUpperCase();
      if(['2','CORRIGIR'].includes(n)) return replyInbound(identity,`✏️ *CORRIGIR PEDIDO*\\n\\nQuantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:\\n\\nPedido: ${order.code}`);
      if(['3','NOVA COMPRA','RECOMEÇAR','NOVO PEDIDO'].includes(n)){
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',cancel_reason:'CLIENTE_RECOMECOU',updated_at:nowISO()});
        await cancelFutureDeliveries(identity.phone,'CLIENTE_RECOMECOU');
        return beginOrder(identity,null);
      }
      if(['4','CANCELAR','DESISTIR','NÃO QUERO','NAO QUERO','ENCERRAR'].includes(n)){
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',cancel_reason:'CLIENTE_ENCERRAMENTO',updated_at:nowISO()});
        await cancelFutureDeliveries(identity.phone,'CLIENTE_ENCERRAMENTO');
        return replyInbound(identity,'✅ *Pedido encerrado.*\\nNenhuma nova cobrança será enviada. Para iniciar outra compra, envie *COMPRAR*.');
      }
      if(['5','ESCRITORIO','ATENDENTE','OUTRO ASSUNTO'].includes(n)){
        await patch('rds10_orders',`id=eq.${order.id}`,{status:'CANCELADO',cancel_reason:'ENCAMINHADO_ESCRITORIO',updated_at:nowISO()});
        const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
        return replyInbound(identity,`🏢 *ATENDIMENTO HUMANO*\\nFale diretamente com o escritório:\\nhttps://wa.me/${office}?text=${encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')}`);
      }
      if(['1','CONTINUAR','PAGAR'].includes(n)){
        if(!order.customer_tax_id || !order.customer_email) return replyInbound(identity,'Para continuar, preciso dos dados do pagador. Envie o formulário completo novamente com CPF e E-mail.');
        try{
          const pg=await rdsPagBankCreatePix(order); const copy=cleanText(pg?.qr?.text||'');
          if(!copy) throw new Error('PIX não retornado pelo PagBank.');
          return replyInbound(identity,`💠 *PIX DO PEDIDO ${order.code}*\\n\\nValor: *R$ ${money(order.total_amount)}*\\n\\n*PIX Copia e Cola:*\\n${copy}\\n\\nApós pagar, aguarde a confirmação automática.`);
        }catch(e){ return replyInbound(identity,'⚠️ Não foi possível gerar o PIX agora. O pedido permanece registrado e será possível tentar novamente.'); }
      }
      return replyInbound(identity,`🧾 Você já possui o pedido *${order.code}* aguardando pagamento de *R$ ${money(order.total_amount)}*.\\n\\n1️⃣ Continuar pagamento\\n2️⃣ Corrigir pedido\\n3️⃣ Nova compra\\n4️⃣ Encerrar pedido\\n5️⃣ Escritório\\n\\nResponda apenas com o número.`);
  }
`+"    if(order.status === 'AGUARDANDO_CONFERENCIA')");

fs.writeFileSync(serverPath,s,'utf8');
console.log('[V10.51] fluxo comercial e dados do pagador aplicados');
await import('./server.js');
