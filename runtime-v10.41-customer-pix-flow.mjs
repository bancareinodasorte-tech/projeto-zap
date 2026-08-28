import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.41.1 — correção de sintaxe do runtime de inicialização.
// O fluxo comercial permanece: cliente informa CPF/e-mail -> pedido grava -> PIX automático.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  let s = fs.readFileSync(serverPath, 'utf8');
  if (!s.includes('RDS_CUSTOMER_PIX_FLOW_V10_41')) {
    const parseRe = /function parseOrderForm\(text\)\{[\s\S]*?\n\}\nfunction isBuyRoute/;
    const parseNew = `function parseOrderForm(text){
  const t = cleanText(text);
  const get = (label) => {
    const re = new RegExp(label + "\\\\s*[:\\\\-]\\\\s*([^\\\\n\\\\r]+)", 'i');
    return cleanText(t.match(re)?.[1] || '');
  };
  const quantity = Number((get('quantidade').match(/\\\\d+/) || [])[0] || 0);
  const cpf = get('cpf').replace(/\\\\D/g, '');
  const email = get('e-?mail');
  return { quantity, name:get('nome'), cpf, email, contact:get('contato') };
}
function isBuyRoute`;
    if (parseRe.test(s)) s = s.replace(parseRe, parseNew);

    const beginRe = /async function beginOrder\(identity, campaignCode=null\)\{[\s\S]*?\n\}\nasync function handleOrderForm/;
    const beginNew = `async function beginOrder(identity, campaignCode=null){
  if(!identity.phone) return replyInbound(identity,'Recebi sua mensagem, mas não consegui identificar seu WhatsApp. Envie novamente *QUERO COMPRAR*.');
  const order = await createOrder(identity.phone,campaignCode);
  await replyInbound(identity,'🛒 *PREENCHER PEDIDO*');
  await sleep(350);
  await replyInbound(identity,'Quantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:\\n\\nPedido: '+order.code);
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
}
async function handleOrderForm`;
    if (beginRe.test(s)) s = s.replace(beginRe, beginNew);

    const formRe = /async function handleOrderForm\(identity, order, text\)\{[\s\S]*?\n\}\nasync function handleProof/;
    const formNew = `async function handleOrderForm(identity, order, text){
  const p = parseOrderForm(text);
  const missing=[];
  if(!p.quantity || p.quantity<1) missing.push('Quantidade');
  if(!p.name) missing.push('Nome');
  if(!p.cpf || ![11,14].includes(p.cpf.length)) missing.push('CPF');
  if(!p.email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email)) missing.push('E-mail');
  if(!p.contact) missing.push('Contato');
  if(missing.length){ await replyInbound(identity,'Falta preencher ou corrigir: *'+missing.join(', ')+'*.\\nEnvie novamente o formulário completo.'); return; }
  const unit = Number(order.unit_price || 3);
  const total = Number((p.quantity * unit).toFixed(2));
  const submittedPhone = phoneKey(p.contact) || identity.phone;
  await patch('rds10_orders','id=eq.'+order.id,{customer_name:p.name,customer_email:p.email,customer_tax_id:p.cpf,contact_phone:submittedPhone,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);
  try{
    const pix=await rdsPagBankCreatePix(fresh);
    await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n💳 *PAGAMENTO PIX*\\n\\n*PIX COPIA E COLA:*\\n'+pix.qr.text+'\\n\\nApós o pagamento, aguarde a confirmação automática do PagBank.');
    await logEvent('PAGBANK_PIX_CRIADO_WHATSAPP',{phone:identity.phone,order:order.code,pagbank_order_id:pix.orderId,qr_id:pix.qr.id,environment:String(process.env.PAGBANK_ENV||'sandbox').toLowerCase()});
  }catch(e){
    const production=String(process.env.PAGBANK_ENV||'sandbox').toLowerCase()==='production';
    await replyInbound(identity,production?'⚠️ *PEDIDO REGISTRADO*\\nPedido '+order.code+' foi recebido, mas não foi possível criar o PIX automático. Não faça pagamento por chave externa. Aguarde o atendimento.':'⚠️ Não foi possível gerar o PIX agora. Pedido '+order.code+' registrado.');
    await addAlert('PAGBANK_PIX_FALHA','Falha ao criar PIX — '+order.code,{order:order.code,error:e.message,production});
  }
}
async function handleProof`;
    if (formRe.test(s)) s = s.replace(formRe, formNew);

    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.41.1] fluxo cliente -> dados -> PIX automático aplicado');
  }
} catch(e) { console.error('[V10.41.1]',e.message); process.exitCode=1; }

await import('./runtime-v10.40-pagbank-customer-fix.mjs');
