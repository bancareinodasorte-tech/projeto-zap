import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(dir, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

// V10.52: pedido completo para PIX automático (CPF + e-mail) sem alterar o schema.
const formPattern = /function parseOrderForm\(text\)\{[\s\S]*?\n\}/;
const formFn = `function parseOrderForm(text){
  const t=cleanText(text);
  const get=label=>{ const re=new RegExp(label+'\\\\s*[:\\\\-]\\\\s*([^\\\\r\\\\n]+)','i'); return cleanText(t.match(re)?.[1]||''); };
  const quantity=Number((get('quantidade').match(/\\d+/)||[])[0]||0);
  const name=get('nome');
  const cpf=digits(get('cpf'));
  const email=get('e-?mail').toLowerCase();
  const contact=phoneKey(get('contato'));
  return {quantity,name,cpf,email,contact};
}`;
source=source.replace(formPattern,formFn);

// Solicita os dados necessários ao PagBank já no início do pedido.
source=source.replace(/Quantidade:\\nNome:\\nContato:/g,'Quantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:');
source=source.replace(/Quantidade:\\nNome:\\nContato:/g,'Quantidade:\\nNome:\\nCPF:\\nE-mail:\\nContato:');

// Validação e persistência dos dados do comprador via rds10_events, sem depender de novas colunas.
const orderFormPattern=/async function handleOrderForm\(identity, order, text\)\{[\s\S]*?\n\}\nasync function handleProof/;
const orderFormFn=`async function handleOrderForm(identity,order,text){
  const p=parseOrderForm(text);
  const missing=[];
  if(!p.quantity||p.quantity<1) missing.push('Quantidade');
  if(!p.name) missing.push('Nome');
  if(p.cpf.length!==11) missing.push('CPF');
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email)) missing.push('E-mail');
  if(!p.contact) missing.push('Contato');
  if(missing.length){ await replyInbound(identity,\`Falta preencher ou corrigir: *\${missing.join(', ')}*.\\nEnvie novamente o formulário completo.\`); return; }
  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));
  if(identity.phone){
    const existing=await findContact(identity.phone);
    if(existing) await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
    else await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});
  }
  await patch('rds10_orders',\`id=eq.\${order.id}\`,{customer_name:p.name,contact_phone:p.contact,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,email:p.email,name:p.name,contact:p.contact});
  const s=await getSettings();
  const pix=cleanText(s.pix_key||'PIX NÃO CONFIGURADO');
  await replyInbound(identity,\`✅ *PEDIDO RECEBIDO*\\n\\n👤 \${p.name}\\n🎟 \${p.quantity} bilhete(s)\\n💰 Total: *R$ \${money(total)}*\\n🧾 Pedido: \${order.code}\\n\\n💳 *PAGAMENTO PIX*\\nO PIX será gerado automaticamente pelo PagBank após a confirmação dos dados.\\n\\nSe o PagBank estiver em produção, você receberá aqui o QR Code/Pix Copia e Cola.\`);
}`;
if(!orderFormPattern.test(source)) throw new Error('handleOrderForm marker not found');
source=source.replace(orderFormPattern,orderFormFn+'\nasync function handleProof');

if(!source.includes("/api/pagbank/status")){
  const anchor="app.get('/api/settings',async(req,res)=>";
  const routes=`
// ---------------- PagBank PIX V10.52 ----------------
const PAGBANK_TOKEN=String(process.env.PAGBANK_ACCESS_TOKEN||'').trim();
const PAGBANK_BASE=String(process.env.PAGBANK_BASE_URL||'https://api.pagseguro.com').replace(/\\/+$/,'');
function splitBRPhone(phone){const n=digits(phone).replace(/^55/,'');return {area:n.slice(0,2),number:n.slice(2)};}
async function pagbankFetch(pathname,opt={}){
  if(!PAGBANK_TOKEN) throw new Error('PagBank não configurado: defina PAGBANK_ACCESS_TOKEN no Render.');
  const r=await fetch(PAGBANK_BASE+pathname,{...opt,headers:{Authorization:'Bearer '+PAGBANK_TOKEN,Accept:'application/json','Content-Type':'application/json',...(opt.headers||{})}});
  const txt=await r.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(data?.message||data?.error_description||\`PagBank HTTP \${r.status}\`);
  return data;
}
app.get('/api/pagbank/status',async(req,res)=>res.json({configured:Boolean(PAGBANK_TOKEN),environment:PAGBANK_BASE.includes('sandbox')?'sandbox':'production'}));
app.post('/api/pagbank/orders/:id/create',async(req,res)=>{try{
  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`); if(!o) throw new Error('Pedido não encontrado.');
  const events=await list('rds10_events','select=*&order=created_at.desc&limit=200');
  const ev=events.find(e=>e.kind==='PEDIDO_DADOS_COMPLETOS'&&e.payload?.order===o.code);
  const p=ev?.payload||{}; if(String(p.cpf||'').replace(/\\D/g,'').length!==11||!p.email) throw new Error('CPF e e-mail do pagador são obrigatórios para gerar o PIX.');
  const phone=splitBRPhone(o.contact_phone||o.phone);
  const expires=new Date(Date.now()+30*60000).toISOString();
  const body={reference_id:o.code,customer:{name:o.customer_name,email:String(p.email).trim().toLowerCase(),tax_id:String(p.cpf).replace(/\\D/g,''),phones:[{country:'55',area:phone.area,number:phone.number,type:'MOBILE'}]},items:[{reference_id:o.code,name:'Bilhetes Reino da Sorte',quantity:Number(o.quantity||1),unit_amount:Math.round(Number(o.unit_price||3)*100)}],charges:[{reference_id:o.code,description:'Pedido '+o.code,amount:{value:Math.round(Number(o.total_amount||0)*100),currency:'BRL'},payment_method:{type:'PIX',pix:{expiration_date:expires}}}],notification_urls:[(PUBLIC_URL||'').replace(/\\/+$/,'')+'/api/pagbank/webhook']};
  const data=await pagbankFetch('/orders',{method:'POST',body:JSON.stringify(body)});
  const charge=data?.charges?.[0];
  await logEvent('PAGBANK_PIX_CRIADO',{order:o.code,pagbank_order_id:data?.id,charge_id:charge?.id,status:charge?.status,qr_code:charge?.qr_code?.text});
  res.json({ok:true,pagbankOrderId:data?.id,status:charge?.status||'WAITING',pixCopyPaste:charge?.qr_code?.text||null,qrCodeId:charge?.qr_code?.id||null,links:charge?.links||[]});
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/pagbank/orders/:id/reconcile',async(req,res)=>{try{
  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`); if(!o) throw new Error('Pedido não encontrado.');
  const events=await list('rds10_events','select=*&order=created_at.desc&limit=200'); const ev=events.find(e=>e.kind==='PAGBANK_PIX_CRIADO'&&e.payload?.order===o.code); if(!ev?.payload?.pagbank_order_id) throw new Error('PIX PagBank ainda não foi criado para este pedido.');
  const data=await pagbankFetch('/orders/'+encodeURIComponent(ev.payload.pagbank_order_id)); const status=data?.charges?.[0]?.status||'UNKNOWN'; const paid=status==='PAID';
  if(paid&&o.status!=='PAGO_AGUARDANDO_BILHETES'){await patch('rds10_orders',\`id=eq.\${o.id}\`,{status:'PAGO_AGUARDANDO_BILHETES',payment_confirmed_at:nowISO(),updated_at:nowISO()}); try{await sendTextPhone(o.phone,\`✅ *PAGAMENTO CONFIRMADO*\\nPedido \${o.code}.\\nSeus bilhetes serão emitidos e enviados em seguida.\`)}catch{}}
  res.json({ok:true,paid,status,pagbankOrderId:ev.payload.pagbank_order_id});
}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/pagbank/webhook',async(req,res)=>{try{await logEvent('PAGBANK_WEBHOOK',req.body||{});res.sendStatus(200)}catch{res.sendStatus(200)}});

`;
  if(source.includes(anchor)) source=source.replace(anchor,routes+anchor); else throw new Error('settings anchor not found');
}
source=source.replace(/CANAL DE VENDAS RDS V10 FINAL 10\.3/g,'CANAL DE VENDAS RDS V10 FINAL 10.52');
fs.writeFileSync(serverPath,source,'utf8');
console.log('[V10.52] CPF/e-mail + PagBank PIX preparado');
await import('./server.js');
