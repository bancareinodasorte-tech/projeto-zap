import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const basePath = path.join(dir, 'runtime-v10.52-customer-data-base.mjs');
const generatedPath = path.join(dir, 'runtime-v10.55-generated.mjs');
let runtimeSource = fs.readFileSync(basePath, 'utf8');
const marker = "fs.writeFileSync(serverPath,source,'utf8');";
if(!runtimeSource.includes(marker)) throw new Error('V10.55 base marker not found');

// V10.55: substituições por blocos delimitados por funções, sem depender de espaços exatos.
function replaceRegex(re, replacement, label){
  if(!re.test(runtimeSource)) throw new Error('Bloco não encontrado: '+label);
  runtimeSource = runtimeSource.replace(re, replacement);
}

const cpfHelper = `function validCPF(v){
  const cpf=digits(v);
  if(!/^\\d{11}$/.test(cpf) || /^([0-9])\\1{10}$/.test(cpf)) return false;
  let sum=0; for(let i=0;i<9;i++) sum+=Number(cpf[i])*(10-i);
  let d1=(sum*10)%11; if(d1===10) d1=0; if(d1!==Number(cpf[9])) return false;
  sum=0; for(let i=0;i<10;i++) sum+=Number(cpf[i])*(11-i);
  let d2=(sum*10)%11; if(d2===10) d2=0; return d2===Number(cpf[10]);
}
`;

const parseOrderForm = `function parseOrderForm(text){
  const t=cleanText(text);
  const get=label=>{ const re=new RegExp(label+'\\\\s*[:\\\\-]\\\\s*([^\\\\r\\\\n]+)','i'); return cleanText(t.match(re)?.[1]||''); };
  const quantity=Number((get('quantidade').match(/\\\\d+/)||[])[0]||0);
  const name=get('nome');
  const cpf=digits(get('cpf'));
  return {quantity,name,cpf};
}`;
replaceRegex(/function parseOrderForm\\s*\\(text\\)\\s*\\{[\\s\\S]*?\\n\\}\\nfunction isBuyRoute/, cpfHelper+parseOrderForm+'\nfunction isBuyRoute', 'parseOrderForm');

const handleOrderForm = `async function handleOrderForm(identity,order,text){
  const p=parseOrderForm(text);
  const missing=[];
  if(!p.quantity||p.quantity<1) missing.push('Quantidade');
  if(!p.name) missing.push('Nome');
  if(!validCPF(p.cpf)) missing.push('CPF');
  if(missing.length){ await replyInbound(identity,'Falta preencher ou corrigir: *'+missing.join(', ')+'*.\\nEnvie novamente somente o bloco preenchido.'); return; }
  const contact=normalizeBR(identity.phone||'');
  if(!contact||!validBRPhone(contact)){ await replyInbound(identity,'Não consegui identificar o número de WhatsApp deste pedido. Envie novamente ou fale com o escritório.'); return; }
  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));
  const existing=await findContact(contact);
  if(existing){
    await patch('rds10_contacts','id=eq.'+existing.id,{name:p.name,validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
  }else{
    await insert('rds10_contacts',{name:p.name,phone:contact,lid:identity.lid||null,group_name:'INTERESSADOS',origin:'PEDIDO',status:'ATIVO',validated:true,last_seen_at:nowISO(),created_at:nowISO(),updated_at:nowISO()},'minimal');
  }
  await patch('rds10_orders','id=eq.'+order.id,{customer_name:p.name,contact_phone:contact,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,name:p.name,contact});
  await cancelFutureDeliveries(identity.phone,'PEDIDO_ATIVO');
  await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n💳 *PAGAMENTO PIX*\\nO PIX será gerado automaticamente pelo PagBank após a confirmação dos dados.\\n\\nSe o PagBank estiver em produção, você receberá aqui o QR Code/Pix Copia e Cola.');
}`;
replaceRegex(/async function handleOrderForm\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}\\nasync function handleProof/, handleOrderForm+'\nasync function handleProof', 'handleOrderForm');

const helpers = `
function orderMenu(order){
  return 'Pedido *'+order.code+'* em andamento. O que deseja fazer?\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.';
}
async function cancelOrderReal(order,reason){
  if(!order?.id) return;
  const why=reason||'CLIENTE_CANCELAMENTO';
  await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:why,updated_at:nowISO()});
  await cancelFutureDeliveries(order.phone,why);
  await logEvent('PEDIDO_CANCELADO',{phone:order.phone,order:order.code,reason:why});
}
async function askOrderForm(identity,order,prefix){
  await replyInbound(identity,prefix||'📝 *PREENCHER PEDIDO*');
  await sleep(250);
  return replyInbound(identity,'Quantidade:\\nNome:\\nCPF:');
}
`;
const inboundStart = runtimeSource.indexOf('async function handleInbound');
if(inboundStart<0) throw new Error('handleInbound base não encontrado');
runtimeSource = runtimeSource.slice(0,inboundStart) + helpers + runtimeSource.slice(inboundStart);

const handleInbound = `async function handleInbound(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const pushName=cleanText(m?.pushName||'');
  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName,rawKeys:inbound.rawKeys}});
  if(!identity.phone&&identity.lid) await addAlert('LID_SEM_PN','Mensagem recebida com LID sem número real; contato não foi criado.',{lid:identity.lid,pushName,text:inbound.text});
  await upsertInboundContact(identity,pushName);
  const settings=await getSettings(); if(!settings.bot_enabled) return;
  const text=cleanText(inbound.text); const order=identity.phone?await activeOrder(identity.phone):null; const cmd=text.toLowerCase().replace(/[.]/g,'').trim();
  const is1=/^(1|continuar|continuo)$/.test(cmd), is2=/^(2|corrigir|corrijo)$/.test(cmd), is3=/^(3|recomeçar|recomecar|novo|nova compra)$/.test(cmd), is4=/^(4|encerrar|encerrar pedido|cancelar|cancele|desistir|não quero|nao quero)$/.test(cmd), is5=/^(5|escritório|escritorio|atendente|outro assunto)$/.test(cmd);
  if(order&&inbound.media&&['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(order.status)) return handleProof(identity,order,inbound);
  if(order){
    if(is4){ await cancelOrderReal(order,'CLIENTE_ENCERRAMENTO'); return replyInbound(identity,'Pedido *'+order.code+'* encerrado. Nenhuma nova cobrança será enviada.\\n\\nQuando quiser comprar novamente, envie *QUERO COMPRAR*.'); }
    if(is5){ await cancelOrderReal(order,'ENCAMINHADO_ESCRITORIO'); const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT); return replyInbound(identity,'🏢 Atendimento do escritório:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')); }
    if(is3){ const old=order.code; await cancelOrderReal(order,'CLIENTE_RECOMECAR'); await replyInbound(identity,'Pedido *'+old+'* encerrado. Vamos começar um novo pedido.'); await sleep(250); return beginOrder(identity,null); }
    if(order.status==='COLETANDO_DADOS'){
      if(is1||is2) return askOrderForm(identity,order,is2?'📝 *CORRIGIR PEDIDO*':'🛒 *PREENCHER PEDIDO*');
      if(looksLikeForm(text)) return handleOrderForm(identity,order,text);
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_PAGAMENTO'){
      if(is1) return replyInbound(identity,'Pedido *'+order.code+'*: aguardando pagamento de *R$ '+money(order.total_amount)+'*.\\n\\nVocê pode enviar o comprovante aqui após pagar.');
      if(is2){ await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()}); return askOrderForm(identity,order,'📝 *CORRIGIR PEDIDO*'); }
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_CONFERENCIA'){ if(is1) return replyInbound(identity,'Comprovante do pedido *'+order.code+'* já recebido e aguardando conferência.'); return replyInbound(identity,orderMenu(order)); }
    if(order.status==='PAGO_AGUARDANDO_BILHETES'){ if(is1) return replyInbound(identity,'Pagamento do pedido *'+order.code+'* confirmado ✅\\nOs bilhetes aguardam emissão/envio pelo operador.'); return replyInbound(identity,orderMenu(order)); }
  }
  if(isOfficeRoute(text)){ const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT); await logEvent('ENCAMINHADO_ESCRITORIO',{phone:identity.phone||null}); return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')); }
  if(isBuyRoute(text)) return beginOrder(identity,(text.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null);
  return replyInbound(identity,routerMessage(settings));
}`;
replaceRegex(/async function handleInbound\\s*\\(m\\)\\s*\\{[\\s\\S]*?\\n\\}\\n\\/\\/ ---------------- Campanhas \\/ fila/, handleInbound+'\n// ---------------- Campanhas / fila', 'handleInbound');

// Formulário mínimo exibido ao cliente: não pedir e-mail nem contato.
runtimeSource=runtimeSource.replace(/Quantidade:\\\\nNome:\\\\nCPF:\\\\nE-mail:\\\\nContato:/g,'Quantidade:\\\\nNome:\\\\nCPF:');

// PagBank: CPF obrigatório; não exigir nem enviar e-mail.
runtimeSource=runtimeSource.replace("if(String(p.cpf||'').replace(/\\\\D/g,'').length!==11||!p.email) throw new Error('CPF e e-mail do pagador são obrigatórios para gerar o PIX.');","if(String(p.cpf||'').replace(/\\\\D/g,'').length!==11) throw new Error('CPF do pagador é obrigatório para gerar o PIX.');");
runtimeSource=runtimeSource.replace("customer:{name:o.customer_name,email:String(p.email).trim().toLowerCase(),tax_id:String(p.cpf).replace(/\\\\D/g,''),phones:","customer:{name:o.customer_name,tax_id:String(p.cpf).replace(/\\\\D/g,''),phones:");

fs.writeFileSync(generatedPath,runtimeSource,'utf8');
await import(pathToFileURL(generatedPath).href+'?v=1055');
