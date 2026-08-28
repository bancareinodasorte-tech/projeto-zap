import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(dir, 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

function replaceFunction(source, name, replacement){
  const start = source.indexOf(`function ${name}`);
  const asyncStart = source.indexOf(`async function ${name}`);
  const at = asyncStart >= 0 && (start < 0 || asyncStart < start) ? asyncStart : start;
  if(at < 0) return source;
  const brace = source.indexOf('{', at);
  if(brace < 0) return source;
  let depth = 0, end = -1;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{') depth++;
    else if(source[i]==='}'){
      depth--;
      if(depth===0){ end=i+1; break; }
    }
  }
  if(end<0) return source;
  return source.slice(0,at) + replacement + source.slice(end);
}

s = replaceFunction(s,'activeOrder',`async function activeOrder(phone){
  const key=phoneKey(phone);
  if(!key) return null;
  const rows=await list('rds10_orders','select=*&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc');
  return rows.find(o=>phoneKey(o.phone)===key)||null;
}`);

s = replaceFunction(s,'parseOrderForm',`function parseOrderForm(text){
  const t=cleanText(text);
  const get=(label)=>{
    const re=new RegExp(label+'\\\\s*[:\\\\-]\\\\s*([^\\\\n\\\\r]+)','i');
    const m=t.match(re);
    return cleanText(m?.[1]||'');
  };
  const rawQty=get('quantidade');
  const qm=rawQty.match(/\\\\d+(?:[.,]\\\\d+)?/);
  const quantity=qm?Number(qm[0].replace(',','.')):0;
  return {quantity,name:get('nome'),cpf:get('cpf').replace(/\\\\D/g,''),email:get('e-?mail'),contact:get('contato')};
}`);

s = replaceFunction(s,'beginOrder',`async function beginOrder(identity,campaignCode=null){
  if(!identity.phone){ return replyInbound(identity,'Não consegui identificar seu número. Envie novamente *COMPRAR*.'); }
  const order=await createOrder(identity.phone,campaignCode);
  await cancelFutureDeliveries(identity.phone,'NOVO_FLUXO_PEDIDO');
  await replyInbound(identity,'🛒 *PREENCHER PEDIDO*');
  await sleep(250);
  await replyInbound(identity,'Quantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:\\n\\nPedido: '+order.code);
  await logEvent('PEDIDO_INICIADO',{phone:identity.phone,order:order.code,campaignCode});
}`);

s = replaceFunction(s,'handleOrderForm',`async function handleOrderForm(identity,order,text){
  const p=parseOrderForm(text),missing=[];
  if(!Number.isFinite(p.quantity)||p.quantity<1) missing.push('Quantidade');
  if(!p.name) missing.push('Nome');
  if(!p.cpf||p.cpf.length!==11) missing.push('CPF');
  if(!p.email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email)) missing.push('E-mail');
  if(!p.contact||!phoneKey(p.contact)) missing.push('Contato');
  if(missing.length){ return replyInbound(identity,'⚠️ Falta preencher ou corrigir: *'+missing.join(', ')+'*.\\n\\nEnvie novamente o formulário completo.\\nPara desistir, envie *CANCELAR*.'); }
  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));
  const submittedPhone=phoneKey(p.contact)||identity.phone;
  await patch('rds10_orders','id=eq.'+order.id,{customer_name:p.name,customer_tax_id:p.cpf,customer_email:p.email,contact_phone:submittedPhone,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  await cancelFutureDeliveries(identity.phone,'PEDIDO_PRONTO_PAGAMENTO');
  const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);
  let pix=null;
  try{ if(typeof rdsPagBankCreatePix==='function') pix=await rdsPagBankCreatePix(fresh); }catch(e){ await addAlert('PAGBANK_PIX_FALHA','Falha ao criar PIX — '+order.code,{order:order.code,error:e.message}); }
  if(pix?.qr?.text){
    await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n💳 *PAGAMENTO PIX*\\n\\n*PIX COPIA E COLA:*\\n'+pix.qr.text+'\\n\\nApós pagar, aguarde a confirmação automática do PagBank.');
  }else{
    await replyInbound(identity,'⚠️ Pedido '+order.code+' recebido. O PIX automático não pôde ser criado neste momento. Aguarde o atendimento.');
  }
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,email:p.email});
}`);

s = replaceFunction(s,'handleInbound',`async function handleInbound(m){
  const identity=resolveInboundIdentity(m),inbound=extractInbound(m),pushName=cleanText(m?.pushName||'');
  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,pushName,rawKeys:inbound.rawKeys}});
  if(!identity.phone&&identity.lid) await addAlert('LID_SEM_PN','Mensagem recebida com LID sem número real; contato não foi criado.',{lid:identity.lid,pushName,text:inbound.text});
  await upsertInboundContact(identity,pushName);
  const settings=await getSettings();
  if(!settings.bot_enabled) return;
  const text=cleanText(inbound.text);
  let order=identity.phone?await activeOrder(identity.phone):null;

  const cancel=/^(CANCELAR|DESISTIR|NÃO QUERO|NAO QUERO|ENCERRAR)$/i.test(text);
  const office=isOfficeRoute(text);
  if(order&&cancel){
    await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancelled_at:nowISO(),updated_at:nowISO()});
    await cancelFutureDeliveries(identity.phone,'PEDIDO_CANCELADO');
    await logEvent('PEDIDO_CANCELADO',{phone:identity.phone,order:order.code});
    return replyInbound(identity,'✅ *PEDIDO '+order.code+' ENCERRADO.*\\n\\nNenhum lembrete de pagamento será enviado.\\n\\nPara uma nova compra, envie *COMPRAR*.');
  }
  if(order&&office){
    await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancelled_at:nowISO(),updated_at:nowISO()});
    await cancelFutureDeliveries(identity.phone,'ESCRITORIO');
    const officePhone=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
    return replyInbound(identity,'🏢 *ATENDIMENTO HUMANO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+officePhone+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));
  }

  if(order&&order.status==='COLETANDO_DADOS'){
    if(looksLikeForm(text)) return handleOrderForm(identity,order,text);
    if(isBuyRoute(text)) return replyInbound(identity,'🛒 Seu pedido *'+order.code+'* já está aberto. Envie o formulário preenchido ou *CANCELAR* para desistir.');
    return replyInbound(identity,'🛒 Seu pedido *'+order.code+'* está aguardando seus dados. Envie o formulário completo.');
  }

  if(order&&order.status==='AGUARDANDO_PAGAMENTO'){
    if(inbound.media) return handleProof(identity,order,inbound);
    if(/^(COMPRAR|QUERO COMPRAR|COMPRE AGORA)$/i.test(text)){
      return replyInbound(identity,'🧾 Você já possui o pedido *'+order.code+'* aguardando pagamento de *R$ '+money(order.total_amount)+'*.\\n\\n1️⃣ Continuar pagamento\\n2️⃣ Corrigir pedido\\n3️⃣ Nova compra\\n4️⃣ Encerrar pedido\\n5️⃣ Escritório\\n\\nResponda apenas com o número.');
    }
    if(/^[1]$/.test(text)) return replyInbound(identity,'💳 Seu pedido *'+order.code+'* continua aguardando o pagamento de *R$ '+money(order.total_amount)+'*. Aguarde o PIX automático ou a atualização do pagamento.');
    if(/^[2]$/.test(text)){
      await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});
      return replyInbound(identity,'✏️ *CORRIGIR PEDIDO*\\n\\nQuantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:\\n\\nPedido: '+order.code);
    }
    if(/^[3]$/.test(text)){
      await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancelled_at:nowISO(),updated_at:nowISO()});
      await cancelFutureDeliveries(identity.phone,'NOVA_COMPRA');
      return beginOrder(identity,null);
    }
    if(/^[4]$/.test(text)){
      await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancelled_at:nowISO(),updated_at:nowISO()});
      await cancelFutureDeliveries(identity.phone,'PEDIDO_ENCERRADO');
      return replyInbound(identity,'✅ *PEDIDO '+order.code+' ENCERRADO.*\\n\\nPara uma nova compra, envie *COMPRAR*.');
    }
    if(/^[5]$/.test(text)){
      await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancelled_at:nowISO(),updated_at:nowISO()});
      await cancelFutureDeliveries(identity.phone,'ESCRITORIO');
      const officePhone=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
      return replyInbound(identity,'🏢 *ATENDIMENTO HUMANO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+officePhone+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));
    }
    return replyInbound(identity,'Seu pedido *'+order.code+'* está aguardando pagamento.\\n\\nEnvie *COMPRAR* para ver as opções ou *CANCELAR* para encerrar e parar os lembretes.');
  }

  if(order&&order.status==='AGUARDANDO_CONFERENCIA') return replyInbound(identity,'Seu comprovante do pedido *'+order.code+'* está em conferência.');
  if(order&&order.status==='PAGO_AGUARDANDO_BILHETES') return replyInbound(identity,'✅ Pagamento confirmado. Pedido *'+order.code+'* aguardando emissão dos bilhetes.');

  if(office){
    const officePhone=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
    return replyInbound(identity,'🏢 *ATENDIMENTO HUMANO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+officePhone+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));
  }
  if(isBuyRoute(text)){
    const code=(text.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null;
    return beginOrder(identity,code);
  }
  return replyInbound(identity,routerMessage(settings));
}`);

// Prevent old campaign deliveries from becoming payment reminders for customers with an open order.
const oldSend = `async function sendDelivery(d){`;
if(s.includes(oldSend) && !s.includes('RDS_V10_46_DELIVERY_GUARD')){
  s=s.replace(oldSend,`// RDS_V10_46_DELIVERY_GUARD\nasync function sendDelivery(d){`);
}

fs.writeFileSync(serverPath,s,'utf8');
console.log('[V10.46] fluxo de pedidos, saídas e lembretes consolidado');

await import('./server.js');
