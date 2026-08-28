import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.42 — fechamento do fluxo comercial.
await import('./runtime-v10.40-pagbank-customer-fix.mjs');
const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js');

try {
  let s = fs.readFileSync(serverPath, 'utf8');

  const parseRe=/function parseOrderForm\(text\)\{[\s\S]*?\n\}\nfunction isBuyRoute/;
  const parseNew=[
    'function parseOrderForm(text){',
    '  const t=cleanText(text);',
    '  const get=label=>{const re=new RegExp(label+"\\\\s*[:\\\\-]\\\\s*([^\\\\n\\\\r]+)","i");const m=t.match(re);return cleanText(m&&m[1]||"");};',
    '  const q=get("quantidade").match(/[0-9]+(?:[.,][0-9]+)?/);',
    '  const quantity=q?Number(q[0].replace(",",".")):0;',
    '  const cpf=get("cpf").replace(/\\D/g,"");',
    '  const email=get("e-?mail");',
    '  return {quantity,name:get("nome"),cpf,email,contact:get("contato")};',
    '}',
    'function isBuyRoute'
  ].join('\n');
  if(parseRe.test(s))s=s.replace(parseRe,parseNew);

  const formRe=/async function handleOrderForm\(identity, order, text\)\{[\s\S]*?\n\}\nasync function handleProof/;
  const formNew=[
    'async function handleOrderForm(identity,order,text){',
    '  const p=parseOrderForm(text),missing=[];',
    '  if(!p.quantity||p.quantity<1)missing.push("Quantidade");',
    '  if(!p.name)missing.push("Nome");',
    '  if(!p.cpf||![11,14].includes(p.cpf.length))missing.push("CPF");',
    '  if(!p.email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email))missing.push("E-mail");',
    '  if(!p.contact||!phoneKey(p.contact))missing.push("Contato");',
    '  if(missing.length)return replyInbound(identity,"⚠️ Falta preencher ou corrigir: *"+missing.join(", ")+"*.\\nEnvie novamente o formulário completo.\\n\\nPara desistir, envie *CANCELAR*.");',
    '  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));',
    '  const contactPhone=phoneKey(p.contact)||identity.phone;',
    '  await patch("rds10_orders","id=eq."+order.id,{customer_name:p.name,customer_email:p.email,customer_tax_id:p.cpf,contact_phone:contactPhone,quantity:p.quantity,total_amount:total,status:"AGUARDANDO_PAGAMENTO",updated_at:nowISO()});',
    '  await cancelFutureDeliveries(identity.phone,"PEDIDO_DADOS_RECEBIDOS");',
    '  const fresh=await one("rds10_orders","select=*&id=eq."+order.id);',
    '  let pix=null;',
    '  try{if(typeof rdsPagBankCreatePix==="function")pix=await rdsPagBankCreatePix(fresh);}catch(e){await addAlert("PAGBANK_PIX_FALHA","Falha ao criar PIX — "+order.code,{order:order.code,error:e.message});}',
    '  if(pix&&pix.qr&&pix.qr.text)await replyInbound(identity,"✅ *PEDIDO RECEBIDO*\\n\\n👤 "+p.name+"\\n🎟 "+p.quantity+" bilhete(s)\\n💰 Total: *R$ "+money(total)+"*\\n🧾 Pedido: "+order.code+"\\n\\n💳 *PAGAMENTO PIX*\\n\\n*PIX COPIA E COLA:*\\n"+pix.qr.text+"\\n\\nApós o pagamento, aguarde a confirmação automática do PagBank.");',
    '  else await replyInbound(identity,"⚠️ Pedido "+order.code+" recebido, mas o PIX automático não pôde ser criado neste momento. Aguarde o atendimento.");',
    '  await logEvent("PEDIDO_DADOS_COMPLETOS",{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,email:p.email});',
    '}',
    'async function handleProof'
  ].join('\n');
  if(formRe.test(s))s=s.replace(formRe,formNew);

  const marker='  let order = identity.phone ? await activeOrder(identity.phone) : null;';
  if(s.includes(marker)&&!s.includes('RDS_FLOW_GUARD_V10_42')){
    const guard=[
      marker,'',
      '  const cancelCommand=/^(CANCELAR|DESISTIR|ENCERRAR|NAO QUERO|NÃO QUERO|4)$/i.test(text);',
      '  const officeCommand=isOfficeRoute(text)||/^(5)$/i.test(text);',
      '  if(order&&cancelCommand){',
      '    await patch("rds10_orders","id=eq."+order.id,{status:"CANCELADO",cancelled_at:nowISO(),updated_at:nowISO()});',
      '    await cancelFutureDeliveries(identity.phone,"PEDIDO_CANCELADO_CLIENTE");',
      '    await logEvent("PEDIDO_CANCELADO_CLIENTE",{phone:identity.phone,order:order.code});',
      '    return replyInbound(identity,"✅ *PEDIDO "+order.code+" ENCERRADO.*\\n\\nNenhum novo lembrete será enviado.\\n\\nPara uma nova compra, envie *COMPRAR*.");',
      '  }',
      '  if(order&&officeCommand){',
      '    const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);',
      '    await patch("rds10_orders","id=eq."+order.id,{status:"CANCELADO",cancelled_at:nowISO(),updated_at:nowISO()});',
      '    await cancelFutureDeliveries(identity.phone,"ENCAMINHADO_ESCRITORIO");',
      '    return replyInbound(identity,"🏢 *ATENDIMENTO HUMANO*\\nFale diretamente com o escritório:\\nhttps://wa.me/"+office+"?text="+encodeURIComponent("Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento."));',
      '  }',
      '  if(order&&order.status==="AGUARDANDO_PAGAMENTO"&&(isBuyRoute(text)||/^COMPRAR$/i.test(text))){',
      '    return replyInbound(identity,"Você já tem o pedido *"+order.code+"* aguardando pagamento de *R$ "+money(order.total_amount)+"*.\\n\\n1️⃣ Continuar pagamento\\n2️⃣ Cancelar pedido\\n3️⃣ Nova compra\\n4️⃣ Encerrar\\n5️⃣ Escritório");',
      '  }',
      '  if(order&&order.status==="AGUARDANDO_PAGAMENTO"&&!inbound.media&&!isBuyRoute(text)){',
      '    return replyInbound(identity,"Seu pedido *"+order.code+"* está aguardando pagamento de *R$ "+money(order.total_amount)+"*.\\n\\nPara cancelar e parar os lembretes, envie *CANCELAR*.\\nPara atendimento humano, envie *ESCRITÓRIO*.");',
      '  }'
    ].join('\n');
    s=s.replace(marker,guard);
  }

  s=s.replace(/Quantidade, Nome e Contato/g,'Quantidade, Nome, CPF, E-mail e Contato');
  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.42] fechamento do fluxo comercial aplicado');
}catch(e){console.error('[V10.42]',e.message);process.exitCode=1;}

await import('./server.js');
