import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const basePath = path.join(dir, 'runtime-v10.52-customer-data-base.mjs');
const generatedPath = path.join(dir, 'runtime-v10.53-generated.mjs');
let runtimeSource = fs.readFileSync(basePath, 'utf8');
const marker = "fs.writeFileSync(serverPath,source,'utf8');";
if(!runtimeSource.includes(marker)) throw new Error('V10.53 base marker not found');

// PagBank: na API Order, o CPF/CNPJ (tax_id) é explicitamente obrigatório;
// o e-mail do customer não é marcado como obrigatório no objeto Order. Portanto,
// o fluxo do cliente fica somente com CPF para reduzir dados solicitados.
runtimeSource = runtimeSource.replace(/Quantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:/g,'Quantidade:\\nNome:\\nCPF:\\nContato:');

const formPattern53=/function parseOrderForm\\(text\\)\\{[\\s\\S]*?\\n\\}/;
const formFn53='function parseOrderForm(text){\\n  const t=cleanText(text);\\n  const get=label=>{ const re=new RegExp(label+\'\\\\s*[:\\\\-]\\\\s*([^\\\\r\\\\n]+)\',\'i\'); return cleanText(t.match(re)?.[1]||\'\'); };\\n  const quantity=Number((get(\'quantidade\').match(/\\\\d+/)||[])[0]||0);\\n  const name=get(\'nome\');\\n  const cpf=digits(get(\'cpf\'));\\n  const contact=phoneKey(get(\'contato\'));\\n  return {quantity,name,cpf,contact};\\n}';
if(!formPattern53.test(runtimeSource)) throw new Error('parseOrderForm marker not found');
runtimeSource=runtimeSource.replace(formPattern53,formFn53);

const orderFormPattern53=/async function handleOrderForm\\(identity,order,text\\)\\{[\\s\\S]*?\\n\\}\\nasync function handleProof/;
const orderFormFn53='async function handleOrderForm(identity,order,text){\\n  const p=parseOrderForm(text);\\n  const missing=[];\\n  if(!p.quantity||p.quantity<1) missing.push(\'Quantidade\');\\n  if(!p.name) missing.push(\'Nome\');\\n  if(!validCPF(p.cpf)) missing.push(\'CPF\');\\n  if(!p.contact||!validBRPhone(p.contact)) missing.push(\'Contato\');\\n  if(missing.length){ await replyInbound(identity,\'Falta preencher ou corrigir: *\'+missing.join(\', \')+\'*.\\nEnvie novamente o formulário completo no mesmo formato.\'); return; }\\n  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));\\n  if(identity.phone){ const existing=await findContact(identity.phone); if(existing) await patch(\'rds10_contacts\',\'id=eq.\'+existing.id,{validated:true,last_seen_at:nowISO(),updated_at:nowISO()}); else await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:\'INTERESSADOS\',origin:\'PEDIDO\',validated:true,last_seen_at:nowISO()}); }\\n  await patch(\'rds10_orders\',\'id=eq.\'+order.id,{customer_name:p.name,contact_phone:p.contact,quantity:p.quantity,total_amount:total,status:\'AGUARDANDO_PAGAMENTO\',updated_at:nowISO()});\\n  await logEvent(\'PEDIDO_DADOS_COMPLETOS\',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,name:p.name,contact:p.contact});\\n  await cancelFutureDeliveries(identity.phone,\'PEDIDO_ATIVO\');\\n  await replyInbound(identity,\'✅ *PEDIDO RECEBIDO*\\n\\n👤 \'+p.name+\'\\n🎟 \'+p.quantity+\' bilhete(s)\\n💰 Total: *R$ \'+money(total)+\'*\\n🧾 Pedido: \'+order.code+\'\\n\\n💳 *PAGAMENTO PIX*\\nO PIX será gerado automaticamente pelo PagBank após a confirmação dos dados.\\n\\nSe o PagBank estiver em produção, você receberá aqui o QR Code/Pix Copia e Cola.\');\\n}';
if(!orderFormPattern53.test(runtimeSource)) throw new Error('handleOrderForm marker not found');
runtimeSource=runtimeSource.replace(orderFormPattern53,orderFormFn53+'\\nasync function handleProof');

// PagBank: retirar a exigência artificial de e-mail criada no fechamento anterior
// e omitir o campo quando não fornecido.
runtimeSource=runtimeSource.replace("if(String(p.cpf||'').replace(/\\\\D/g,'').length!==11||!p.email) throw new Error('CPF e e-mail do pagador são obrigatórios para gerar o PIX.');","if(String(p.cpf||'').replace(/\\\\D/g,'').length!==11) throw new Error('CPF do pagador é obrigatório para gerar o PIX.');");
runtimeSource=runtimeSource.replace("customer:{name:o.customer_name,email:String(p.email).trim().toLowerCase(),tax_id:String(p.cpf).replace(/\\\\D/g,''),phones:","customer:{name:o.customer_name,tax_id:String(p.cpf).replace(/\\\\D/g,''),phones:");

const patch = String.raw`
// ---------------- V10.53 FECHAMENTO — fluxo de pedido/cancelamento ----------------
function validCPF(v){
  const cpf=digits(v);
  if(!/^\\d{11}$/.test(cpf) || /^([0-9])\\1{10}$/.test(cpf)) return false;
  let sum=0; for(let i=0;i<9;i++) sum+=Number(cpf[i])*(10-i);
  let d1=(sum*10)%11; if(d1===10) d1=0; if(d1!==Number(cpf[9])) return false;
  sum=0; for(let i=0;i<10;i++) sum+=Number(cpf[i])*(11-i);
  let d2=(sum*10)%11; if(d2===10) d2=0; return d2===Number(cpf[10]);
}
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
  return replyInbound(identity,'Quantidade:\\nNome:\\nCPF:\\nContato:\\n\\nPedido: '+order.code);
}

const inboundPattern53=/async function handleInbound\\(m\\)\\{[\\s\\S]*?\\n\\}\\n\\n\\/\\/ ---------------- Campanhas \\/ fila/;
const inboundFn53='async function handleInbound(m){\\n  const identity=resolveInboundIdentity(m);\\n  const inbound=extractInbound(m);\\n  const pushName=cleanText(m?.pushName||\'\');\\n  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:\'IN\',type:inbound.type,body:inbound.text||null,status:\'RECEBIDA\',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName,rawKeys:inbound.rawKeys}});\\n  if(!identity.phone&&identity.lid) await addAlert(\'LID_SEM_PN\',\'Mensagem recebida com LID sem número real; contato não foi criado.\',{lid:identity.lid,pushName,text:inbound.text});\\n  await upsertInboundContact(identity,pushName);\\n  const settings=await getSettings(); if(!settings.bot_enabled) return;\\n  const text=cleanText(inbound.text); const order=identity.phone?await activeOrder(identity.phone):null; const cmd=text.toLowerCase().replace(/[.]/g,\'\').trim();\\n  const is1=/^(1|continuar|continuo)$/.test(cmd), is2=/^(2|corrigir|corrijo)$/.test(cmd), is3=/^(3|recomeçar|recomecar|novo|nova compra)$/.test(cmd), is4=/^(4|encerrar|encerrar pedido|cancelar|cancele|desistir|não quero|nao quero)$/.test(cmd), is5=/^(5|escritório|escritorio|atendente|outro assunto)$/.test(cmd);\\n  if(order&&inbound.media&&[\'AGUARDANDO_PAGAMENTO\',\'AGUARDANDO_COMPROVANTE\'].includes(order.status)) return handleProof(identity,order,inbound);\\n  if(order){\\n    if(is4){ await cancelOrderReal(order,\'CLIENTE_ENCERRAMENTO\'); return replyInbound(identity,\'Pedido *\'+order.code+\'* encerrado. Nenhuma nova cobrança será enviada.\\n\\nQuando quiser comprar novamente, envie *QUERO COMPRAR*.\'); }\\n    if(is5){ await cancelOrderReal(order,\'ENCAMINHADO_ESCRITORIO\'); const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT); return replyInbound(identity,\'🏢 Atendimento do escritório:\\nhttps://wa.me/\'+office+\'?text=\'+encodeURIComponent(\'Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.\')); }\\n    if(is3){ const old=order.code; await cancelOrderReal(order,\'CLIENTE_RECOMECAR\'); await replyInbound(identity,\'Pedido *\'+old+\'* encerrado. Vamos começar um novo pedido.\'); await sleep(250); return beginOrder(identity,null); }\\n    if(order.status===\'COLETANDO_DADOS\'){ if(is1||is2) return askOrderForm(identity,order,is2?\'📝 *CORRIGIR PEDIDO*\':\'🛒 *PREENCHER PEDIDO*\'); if(looksLikeForm(text)) return handleOrderForm(identity,order,text); return replyInbound(identity,orderMenu(order)); }\\n    if(order.status===\'AGUARDANDO_PAGAMENTO\'){ if(is1) return replyInbound(identity,\'Pedido *\'+order.code+\'*: aguardando pagamento de *R$ \'+money(order.total_amount)+\'*.\\n\\nVocê pode enviar o comprovante aqui após pagar.\'); if(is2){ await patch(\'rds10_orders\',\'id=eq.\'+order.id,{status:\'COLETANDO_DADOS\',updated_at:nowISO()}); return askOrderForm(identity,order,\'📝 *CORRIGIR PEDIDO*\'); } return replyInbound(identity,orderMenu(order)); }\\n    if(order.status===\'AGUARDANDO_CONFERENCIA\'){ if(is1) return replyInbound(identity,\'Comprovante do pedido *\'+order.code+\'* já recebido e aguardando conferência.\'); return replyInbound(identity,orderMenu(order)); }\\n    if(order.status===\'PAGO_AGUARDANDO_BILHETES\'){ if(is1) return replyInbound(identity,\'Pagamento do pedido *\'+order.code+\'* confirmado ✅\\nOs bilhetes aguardam emissão/envio pelo operador.\'); return replyInbound(identity,orderMenu(order)); }\\n  }\\n  if(isOfficeRoute(text)){ const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT); await logEvent(\'ENCAMINHADO_ESCRITORIO\',{phone:identity.phone||null}); return replyInbound(identity,\'🏢 *OUTRO ASSUNTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/\'+office+\'?text=\'+encodeURIComponent(\'Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.\')); }\\n  if(isBuyRoute(text)) return beginOrder(identity,(text.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null);\\n  return replyInbound(identity,routerMessage(settings));\\n}\\n\\n// ---------------- Campanhas / fila';
if(!inboundPattern53.test(source)) throw new Error('handleInbound marker not found');
source=source.replace(inboundPattern53,inboundFn53);

const ordersAnchor53="app.get('/api/orders',async(req,res)=>";
const stateRoute53="app.get('/api/orders/:id/state',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');res.json({ok:true,order:o});}catch(e){res.status(404).json({error:e.message})}});\\n";
if(!source.includes(ordersAnchor53)) throw new Error('orders anchor not found');
source=source.replace(ordersAnchor53,stateRoute53+ordersAnchor53);

`;
runtimeSource = runtimeSource.replace(marker, patch + marker);

// V10.53 FIX: não importar via data: URL. O runtime gerado contém imports relativos
// (ex.: ./server.js), que precisam ser resolvidos como arquivo ESM.
fs.writeFileSync(generatedPath,runtimeSource,'utf8');
await import(pathToFileURL(generatedPath).href+'?v=1053');
