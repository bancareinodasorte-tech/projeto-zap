import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.41 — fluxo comercial correto: o cliente informa CPF + e-mail no WhatsApp;
// o pedido grava esses dados e o PIX PagBank é criado automaticamente.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  let s = fs.readFileSync(serverPath, 'utf8');

  if (!s.includes('RDS_CUSTOMER_PIX_FLOW_V10_41')) {
    const parseRe = /function parseOrderForm\(text\)\{[\s\S]*?\n\}\nfunction isBuyRoute/;
    const parseNew = `function parseOrderForm(text){
  const t = cleanText(text);
  const get = label => {
    const re = new RegExp(`${'${label}'}\\s*[:\\-]\\s*([^\\n\\r]+)`,'i');
    return cleanText(t.match(re)?.[1] || '');
  };
  const quantity = Number((get('quantidade').match(/\\d+/)||[])[0] || 0);
  const cpf = get('cpf').replace(/\\D/g,'');
  const email = get('e-?mail');
  return { quantity, name:get('nome'), cpf, email, contact:get('contato') };
}
function isBuyRoute`;
    if (!parseRe.test(s)) throw new Error('parseOrderForm V10.41 não localizado');
    s = s.replace(parseRe, parseNew);

    const beginRe = /async function beginOrder\(identity, campaignCode=null\)\{[\s\S]*?\n\}\nasync function handleOrderForm/;
    const beginNew = `async function beginOrder(identity, campaignCode=null){
  if(!identity.phone){
    await replyInbound(identity,'Recebi sua mensagem, mas o WhatsApp ainda não informou seu número real ao sistema. Envie novamente *QUERO COMPRAR* ou use o link da campanha.');
    return;
  }
  const order = await createOrder(identity.phone,campaignCode);
  await replyInbound(identity,'🛒 *PREENCHER PEDIDO*');
  await sleep(350);
  await replyInbound(identity,`Quantidade:\nNome:\nCPF:\nE-mail:\nContato:\n\nPedido: ${'${order.code}'}`);
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
}
async function handleOrderForm`;
    if (!beginRe.test(s)) throw new Error('beginOrder V10.41 não localizado');
    s = s.replace(beginRe, beginNew);

    const formRe = /async function handleOrderForm\(identity, order, text\)\{[\s\S]*?\n\}\nasync function handleProof/;
    const formNew = `async function handleOrderForm(identity, order, text){
  const p = parseOrderForm(text);
  const missing=[];
  if(!p.quantity || p.quantity < 1) missing.push('Quantidade');
  if(!p.name) missing.push('Nome');
  if(!p.cpf || ![11,14].includes(p.cpf.length)) missing.push('CPF');
  if(!p.email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email)) missing.push('E-mail');
  if(!p.contact) missing.push('Contato');
  if(missing.length){
    await replyInbound(identity,`Falta preencher ou corrigir: *${'${missing.join(', ')}'}*.\\nEnvie novamente somente o bloco preenchido.`);
    return;
  }
  const total = Number((p.quantity * Number(order.unit_price || 3)).toFixed(2));
  const submittedPhone = phoneKey(p.contact) || identity.phone;
  if(identity.phone){
    const existing = await findContact(identity.phone);
    if(existing){
      await patch('rds10_contacts',`id=eq.${'${existing.id}'}`,{name:p.name,validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
    }else{
      await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});
    }
  }

  await patch('rds10_orders',`id=eq.${'${order.id}'}`,{customer_name:p.name,customer_email:p.email,customer_tax_id:p.cpf,contact_phone:submittedPhone,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  const fresh = await one('rds10_orders',`select=*&id=eq.${'${order.id}'}`);

  try{
    const pix = await rdsPagBankCreatePix(fresh);
    const payMsg = `✅ *PEDIDO RECEBIDO*\\n\\n👤 ${'${p.name}'}\\n🎟 ${'${p.quantity}'} bilhete(s)\\n💰 Total: *R$ ${'${money(total)}'}*\\n🧾 Pedido: ${'${order.code}'}\\n\\n💳 *PAGAMENTO PIX*\\nPague usando o código abaixo:\\n\\n*PIX COPIA E COLA:*\\n${'${pix.qr.text}'}\\n\\nApós o pagamento, aguarde a confirmação automática do PagBank.\\n\\n🔐 Pedido vinculado: *${'${order.code}'}*`;
    await replyInbound(identity,payMsg);
    await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,customer_email:p.email,customer_tax_id:p.cpf});
    await logEvent('PAGBANK_PIX_CRIADO_WHATSAPP',{phone:identity.phone,order:order.code,pagbank_order_id:pix.orderId,qr_id:pix.qr.id,environment:String(process.env.PAGBANK_ENV||'sandbox').toLowerCase()});
  }catch(e){
    const production = String(process.env.PAGBANK_ENV||'sandbox').toLowerCase()==='production';
    const msg = production
      ? `⚠️ *PEDIDO REGISTRADO*\\n\\nPedido *${'${order.code}'}* recebido no valor de *R$ ${'${money(total)}'}*.\\n\\nA cobrança PIX automática não pôde ser criada neste momento. Não realize pagamento por nenhuma chave enviada fora deste sistema. Aguarde o atendimento do Reino da Sorte.`
      : `⚠️ Não foi possível gerar o PIX agora. Pedido *${'${order.code}'}* registrado. Aguarde o atendimento.`;
    await replyInbound(identity,msg);
    await addAlert('PAGBANK_PIX_FALHA',`Falha ao criar PIX — ${'${order.code}'}`,{order:order.code,error:e.message,production});
    await logEvent('PAGBANK_PIX_FALHA',{phone:identity.phone,order:order.code,error:e.message,production});
  }
}
async function handleProof`;
    if (!formRe.test(s)) throw new Error('handleOrderForm V10.41 não localizado');
    s = s.replace(formRe, formNew);

    s = s.replace("return replyInbound(identity,'Seu pedido já foi iniciado. Copie e envie o formulário com *Quantidade, Nome e Contato*.');", "return replyInbound(identity,'Seu pedido já foi iniciado. Copie e envie o formulário com *Quantidade, Nome, CPF, E-mail e Contato*.');");

    fs.writeFileSync(serverPath, s, 'utf8');
    console.log('[V10.41] fluxo cliente -> CPF/e-mail -> PIX PagBank automático aplicado');
  }
} catch (e) {
  console.error('[V10.41]', e.message);
  process.exitCode = 1;
}

await import('./runtime-v10.40-pagbank-customer-fix.mjs');
