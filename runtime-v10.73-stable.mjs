import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
const serverPatchedPath=path.join(dir,'runtime-v10.73-server.js');
const pagbankPath=path.join(dir,'runtime-v10.60-pagbank.mjs');
const pagbankPatchedPath=path.join(dir,'runtime-v10.73-pagbank-base.mjs');
const fixPath=path.join(dir,'runtime-v10.60-fix.mjs');
const fixPatchedPath=path.join(dir,'runtime-v10.73-fix-generated.mjs');

let server=fs.readFileSync(serverPath,'utf8');

function replaceFunction(src,signature,replacement){
  const start=src.indexOf(signature);
  if(start<0)throw new Error('Funcao nao encontrada: '+signature);
  const brace=src.indexOf('{',start);
  if(brace<0)throw new Error('Abertura nao encontrada: '+signature);
  let depth=0,inStr=null,esc=false,inLine=false,inBlock=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i],n=src[i+1];
    if(inLine){if(c==='\n')inLine=false;continue;}
    if(inBlock){if(c==='*'&&n==='/'){inBlock=false;i++;}continue;}
    if(inStr){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===inStr)inStr=null;continue;}
    if(c==='/'&&n==='/'){inLine=true;i++;continue;}
    if(c==='/'&&n==='*'){inBlock=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){inStr=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return src.slice(0,start)+replacement+src.slice(i+1);}
  }
  throw new Error('Fechamento nao encontrado: '+signature);
}

server=replaceFunction(server,'function parseOrderForm(text)',String.raw`function parseOrderForm(text){
  const t=cleanText(text);
  const get=label=>{const re=new RegExp(label+'\\s*[:\\-]\\s*([^\\n\\r]+)','i');return cleanText(t.match(re)?.[1]||'');};
  const quantity=Number((get('quantidade').match(/\\d+/)||[])[0]||0);
  const name=get('nome');
  const cpf=digits(get('cpf'));
  return {quantity,name,cpf};
}`);

server=replaceFunction(server,'function isBuyRoute(text)',String.raw`function isBuyRoute(text){return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$/i.test(text);}`);

server=replaceFunction(server,'function isOfficeRoute(text)',String.raw`function isOfficeRoute(text){return /OUTRO\\s*ASSUNTO|ATENDENTE|ESCRIT[ÓO]RIO/i.test(text);}`);

server=replaceFunction(server,'function looksLikeForm(text)',String.raw`function looksLikeForm(text){return /quantidade\\s*[:\\-]/i.test(text)&&/nome\\s*[:\\-]/i.test(text)&&/cpf\\s*[:\\-]/i.test(text);}`);

server=replaceFunction(server,'function routerMessage(settings)',String.raw`function routerMessage(settings){
  const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);
  const channel=normalizeBR(connectedNumber||process.env.BOT_WHATSAPP||process.env.WHATSAPP_NUMBER||process.env.RDS_WHATSAPP||'');
  const buyUrl=(channel?'https://wa.me/'+channel:'')+'?text='+encodeURIComponent(['🛒 NOVO PEDIDO','','Quantidade:','Nome:','CPF:'].join(String.fromCharCode(10)));
  const officeUrl='https://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.');
  return ['👋 *CANAL DE VENDAS RDS*','','Como podemos ajudar?','','🛒 *COMPRAR*',buyUrl,'','🏢 *OUTRO ASSUNTO*',officeUrl].join(String.fromCharCode(10));
}`);

server=replaceFunction(server,'async function beginOrder(identity, campaignCode=null)',String.raw`async function beginOrder(identity,campaignCode=null){
  if(!identity.phone){await replyInbound(identity,'Nao consegui identificar seu numero do WhatsApp. Tente novamente pelo link *COMPRAR*.');return;}
  const order=await createOrder(identity.phone,campaignCode);
  await replyInbound(identity,'🛒 *NOVO PEDIDO*');
  await sleep(250);
  await replyInbound(identity,'Quantidade:\nNome:\nCPF:');
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
}`);

server=replaceFunction(server,'async function handleOrderForm(identity, order, text)',String.raw`async function handleOrderForm(identity,order,text){
  const p=parseOrderForm(text);
  const missing=[];
  if(!p.quantity||p.quantity<1)missing.push('Quantidade');
  if(!p.name)missing.push('Nome');
  if(!validCPF(p.cpf))missing.push('CPF');
  if(missing.length){await replyInbound(identity,'Falta preencher ou corrigir: *'+missing.join(', ')+'*.\\nEnvie novamente o bloco completo.');return;}
  const contact=normalizeBR(identity.phone||'');
  if(!contact||!validBRPhone(contact)){await replyInbound(identity,'Nao consegui identificar seu numero do WhatsApp. Tente novamente pelo link *COMPRAR*.');return;}
  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));
  const existing=await findContact(contact);
  if(existing)await patch('rds10_contacts','id=eq.'+existing.id,{name:p.name,validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
  else await saveOrMergeContact({name:p.name,phone:contact,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});
  await patch('rds10_orders','id=eq.'+order.id,{customer_name:p.name,customer_tax_id:p.cpf,contact_phone:contact,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO(),payment_last_error:null});
  await cancelFutureDeliveries(identity.phone,'PEDIDO_ATIVO');
  const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);
  let pix=null,pixError=null;
  try{pix=await rdsPagBankCreatePix(fresh);}catch(e){pixError=e;await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e.message||e),updated_at:nowISO()}).catch(()=>{});await addAlert('PAGBANK_PIX_FALHA','Falha ao criar PIX — '+order.code,{order:order.code,error:e.message}).catch(()=>{});}
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,name:p.name,contact,pagbank:!!pix,pagbank_error:pixError?.message||null});
  if(pix&&pix.qr?.text){return sendPixToIdentity(identity,fresh,pix);}
  if(pixError&&/nao configurado/i.test(String(pixError.message||'')))return replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ O PIX automatico ainda nao esta configurado no sistema.');
  return replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ Nao foi possivel gerar o PIX neste momento. O pedido permanece registrado.');
}`);

const helperNeedle='async function handleInbound(m)';
const helperBlock=String.raw`function validCPF(v){const cpf=digits(v);if(!/^\\d{11}$/.test(cpf)||/^([0-9])\\1{10}$/.test(cpf))return false;let sum=0;for(let i=0;i<9;i++)sum+=Number(cpf[i])*(10-i);let d1=(sum*10)%11;if(d1===10)d1=0;if(d1!==Number(cpf[9]))return false;sum=0;for(let i=0;i<10;i++)sum+=Number(cpf[i])*(11-i);let d2=(sum*10)%11;if(d2===10)d2=0;return d2===Number(cpf[10]);}
function orderMenu(order){const s=String(order?.status||'');if(s==='COLETANDO_DADOS')return ['📝 *PEDIDO EM PREENCHIMENTO*','Pedido *'+order.code+'*','','1️⃣ Continuar preenchimento','2️⃣ Alterar dados','3️⃣ Cancelar pedido','4️⃣ Outro assunto','','Responda apenas com o numero.'].join(String.fromCharCode(10));if(s==='AGUARDANDO_PAGAMENTO')return ['💳 *PAGAMENTO PENDENTE*','Pedido *'+order.code+'*','','1️⃣ Ver PIX','2️⃣ Alterar dados','3️⃣ Cancelar pedido','4️⃣ Outro assunto','','Responda apenas com o numero.'].join(String.fromCharCode(10));if(s==='AGUARDANDO_CONFERENCIA')return ['🔎 *COMPROVANTE EM ANALISE*','Pedido *'+order.code+'*','','1️⃣ Consultar pedido','2️⃣ Outro assunto','','Responda apenas com o numero.'].join(String.fromCharCode(10));if(s==='PAGO_AGUARDANDO_BILHETES')return ['✅ *PAGAMENTO CONFIRMADO*','Pedido *'+order.code+'*','','1️⃣ Consultar pedido','2️⃣ Outro assunto','','Responda apenas com o numero.'].join(String.fromCharCode(10));return ['Pedido *'+order.code+'* em andamento.','','1️⃣ Continuar','2️⃣ Outro assunto','','Responda apenas com o numero.'].join(String.fromCharCode(10));}
async function cancelOrderReal(order,reason){if(!order?.id)return;await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:reason||'CLIENTE_CANCELAMENTO',updated_at:nowISO()});await cancelFutureDeliveries(order.phone,reason||'CLIENTE_CANCELAMENTO');await logEvent('PEDIDO_CANCELADO',{phone:order.phone,order:order.code,reason:reason||'CLIENTE_CANCELAMENTO'});}
async function askOrderForm(identity,order,title){await replyInbound(identity,title||'📝 *PREENCHER PEDIDO*');await sleep(200);return replyInbound(identity,'Quantidade:\nNome:\nCPF:');}
`;
if(!server.includes('function validCPF(v)'))server=server.slice(0,server.indexOf(helperNeedle))+helperBlock+server.slice(server.indexOf(helperNeedle));

server=replaceFunction(server,'async function handleInbound(m)',String.raw`async function handleInbound(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const pushName=cleanText(m?.pushName||'');
  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName,rawKeys:inbound.rawKeys}});
  if(!identity.phone&&identity.lid)await addAlert('LID_SEM_PN','Mensagem recebida com LID sem numero real ao sistema.',{lid:identity.lid,pushName,text:inbound.text});
  await upsertInboundContact(identity,pushName);
  const settings=await getSettings();
  if(!settings.bot_enabled)return;
  const text=cleanText(inbound.text);
  const order=identity.phone?await activeOrder(identity.phone):null;
  const cmd=text.toLowerCase().replace(/[.]/g,'').trim();
  const is1=/^(1|continuar|continuo)$/.test(cmd);
  const is2=/^(2|alterar|alterar dados|corrigir|corrijo)$/.test(cmd);
  const is3=/^(3|cancelar|cancele|desistir)$/.test(cmd);
  const is4=/^(4|outro assunto|encerrar|encerrar pedido)$/.test(cmd);
  const isPaid=order&&['PAGO_AGUARDANDO_BILHETES','CONCLUIDO'].includes(String(order.status||''));
  if(order&&inbound.media&&['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(order.status))return handleProof(identity,order,inbound);
  if(order&&isPaid){
    if(is1)return replyInbound(identity,'Pedido *'+order.code+'*: pagamento confirmado ✅. '+(order.status==='CONCLUIDO'?'Este pedido ja foi concluido.':'Os bilhetes aguardam emissao/envio pelo operador.')+'\\n\\nSe precisar de atendimento, escolha *2 — Outro assunto*.');
    if(is2||is3)return replyInbound(identity,'🔒 O pedido *'+order.code+'* ja possui pagamento confirmado e nao pode ser alterado ou cancelado por este menu.\\n\\nEscolha *2 — Outro assunto* para falar com o escritorio.');
    if(is4){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Ola, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre o pedido '+order.code+'.'));}
    return replyInbound(identity,orderMenu(order));
  }
  if(order){
    if(order.status==='COLETANDO_DADOS'){
      if(looksLikeForm(text))return handleOrderForm(identity,order,text);
      if(is1||is2)return askOrderForm(identity,order,is2?'📝 *ALTERAR DADOS*':'🛒 *PREENCHER PEDIDO*');
      if(is3){await cancelOrderReal(order,'CLIENTE_CANCELAMENTO');return replyInbound(identity,'Pedido *'+order.code+'* cancelado. Nenhuma nova cobranca sera enviada.\\n\\nQuando quiser comprar novamente, envie *QUERO COMPRAR*.');}
      if(is4){await cancelOrderReal(order,'ENCAMINHADO_ESCRITORIO');const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Ola, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre o pedido '+order.code+'.'));}
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_PAGAMENTO'){
      if(is1){if(order.pix_copy_paste)return replyInbound(identity,'💳 *PAGAMENTO PIX*\\nPedido *'+order.code+'*\\nValor: *R$ '+money(order.total_amount)+'*\\n\\n*PIX COPIA E COLA:*\\n'+order.pix_copy_paste+'\\n\\nApos pagar, aguarde a confirmacao automatica.');return replyInbound(identity,'Pedido *'+order.code+'*: aguardando pagamento de *R$ '+money(order.total_amount)+'*. O PIX ainda esta sendo preparado.');}
      if(is2){await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});return askOrderForm(identity,order,'📝 *ALTERAR DADOS*');}
      if(is3){await cancelOrderReal(order,'CLIENTE_CANCELAMENTO');return replyInbound(identity,'Pedido *'+order.code+'* cancelado. Nenhuma nova cobranca sera enviada.');}
      if(is4){await cancelOrderReal(order,'ENCAMINHADO_ESCRITORIO');const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Ola, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre o pedido '+order.code+'.'));}
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_CONFERENCIA'){
      if(is1)return replyInbound(identity,'Comprovante do pedido *'+order.code+'* ja recebido e aguardando conferencia.');
      if(is2||is3)return replyInbound(identity,'🔒 O comprovante do pedido *'+order.code+'* ja foi enviado e esta em analise. Aguarde a conferencia ou escolha *2 — Outro assunto*.');
      if(is4){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Ola, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre o pedido '+order.code+'.'));}
      return replyInbound(identity,orderMenu(order));
    }
  }
  if(isBuyRoute(text)){const code=(text.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null;return beginOrder(identity,code);}
  if(isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);await logEvent('ENCAMINHADO_ESCRITORIO',{phone:identity.phone||null});return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Ola, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));}
  return replyInbound(identity,routerMessage(settings));
}`);

// Expiracao V10.70 diretamente no server patch.
const expirationBlock=[
  "const RDS_ORDER_EXPIRATION_HOURS=Math.max(1,Number(process.env.RDS_ORDER_EXPIRATION_HOURS||process.env.ORDER_EXPIRATION_HOURS||24));",
  "const RDS_ORDER_EXPIRATION_MS=RDS_ORDER_EXPIRATION_HOURS*60*60*1000;",
  "const rdsPendingExpiredNotice=new Map();",
  "function rdsOrderIsExpiredV1070(order){if(!order||!['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(String(order.status||''))||!order.created_at)return false;const created=Date.parse(order.created_at);return Number.isFinite(created)&&(Date.now()-created)>=RDS_ORDER_EXPIRATION_MS;}",
  "async function rdsExpireOrderV1070(order){if(!rdsOrderIsExpiredV1070(order))return false;await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:'PEDIDO_EXPIRADO',payment_last_error:null,updated_at:nowISO()});await cancelFutureDeliveries(order.phone,'PEDIDO_EXPIRADO');await logEvent('PEDIDO_EXPIRADO',{phone:order.phone,order:order.code,created_at:order.created_at,expiration_hours:RDS_ORDER_EXPIRATION_HOURS});rdsPendingExpiredNotice.set(order.phone,{code:order.code});return true;}",
  "// RDS_ORDER_EXPIRATION_V1070"
].join('\n');
const activeOld="async function activeOrder(phone){\n  return one('rds10_orders',`select=*&phone=eq.${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc`);\n}";
if(!server.includes('// RDS_ORDER_EXPIRATION_V1070')){
  if(!server.includes(activeOld))throw new Error('activeOrder base nao localizado.');
  server=server.replace(activeOld,expirationBlock+"\nasync function activeOrder(phone){\n  const order=await one('rds10_orders',`select=*&phone=eq.${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc`);\n  if(order&&await rdsExpireOrderV1070(order))return null;\n  return order;\n}");
}
const replyOld="async function replyInbound(identity, text){\n  const body = cleanText(text);";
const replyNew="async function replyInbound(identity, text){\n  let body = cleanText(text);\n  const expiredNotice=rdsPendingExpiredNotice.get(identity?.phone||'');\n  if(expiredNotice){rdsPendingExpiredNotice.delete(identity?.phone||'');body='⏰ *PEDIDO EXPIRADO*\\n\\nO pedido *'+expiredNotice.code+'* ultrapassou o prazo de validade e foi encerrado automaticamente.\\n\\nVoce pode iniciar um novo pedido enviando *QUERO COMPRAR*.\\n\\n'+body;}";
if(server.includes(replyOld)&&!server.includes('const expiredNotice=rdsPendingExpiredNotice.get'))server=server.replace(replyOld,replyNew);
fs.writeFileSync(serverPatchedPath,server,'utf8');

let pag=fs.readFileSync(pagbankPath,'utf8');
pag=pag.replace("const serverPath=path.join(dir,'server.js');","const serverPath=path.join(dir,'runtime-v10.73-server.js');");
pag=pag.replace("const generatedPath=path.join(dir,'runtime-v10.60-generated.cjs');","const generatedPath=path.join(dir,'runtime-v10.73-generated.cjs');");
fs.writeFileSync(pagbankPatchedPath,pag,'utf8');

let fix=fs.readFileSync(fixPath,'utf8');
fix=fix.replace("const sourcePath = path.join(dir, 'runtime-v10.60-pagbank.mjs');","const sourcePath = path.join(dir, 'runtime-v10.73-pagbank-base.mjs');");
fix=fix.replace("const fixedPath = path.join(dir, 'runtime-v10.60-pagbank-fixed.mjs');","const fixedPath = path.join(dir, 'runtime-v10.73-fix-generated.mjs');");
fs.writeFileSync(fixPatchedPath,fix,'utf8');

console.log('[V10.73] entrada profissional + formulario pre-preenchido + estados sem Reiniciar + expiracao 24h');
await import(pathToFileURL(fixPatchedPath).href+'?v=1073');
