import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS MERCADO PAGO ORDERS PIX V2';
if(server.includes(marker)){
  console.log('[RDS] runtime Mercado Pago já aplicado');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para Mercado Pago.');

const block=String.raw`
${marker}
const MERCADOPAGO_ENV=String(process.env.MERCADOPAGO_ENV||'sandbox').toLowerCase()==='production'?'production':'sandbox';
const MERCADOPAGO_ACCESS_TOKEN=String(process.env.MERCADOPAGO_ACCESS_TOKEN||'').trim();
const MERCADOPAGO_BASE='https://api.mercadopago.com';
const MERCADOPAGO_PAYER_EMAIL=String(process.env.MERCADOPAGO_PAYER_EMAIL||'test_user_br@testuser.com').trim();
const MERCADOPAGO_WEBHOOK_SECRET=String(process.env.MERCADOPAGO_WEBHOOK_SECRET||'').trim();
const MERCADOPAGO_PIX_EXPIRATION_HOURS=Math.min(24,Math.max(0.5,Number(process.env.MERCADOPAGO_PIX_EXPIRATION_HOURS||3)));
function rdsMercadoPagoConfigured(){return Boolean(MERCADOPAGO_ACCESS_TOKEN);}
async function rdsMercadoPagoRequest(endpoint,opt={}){
  if(!rdsMercadoPagoConfigured())throw new Error('Mercado Pago não configurado no Render. Defina MERCADOPAGO_ACCESS_TOKEN.');
  const response=await fetch(MERCADOPAGO_BASE+endpoint,{...opt,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+MERCADOPAGO_ACCESS_TOKEN,...(opt.headers||{})}});
  const raw=await response.text();
  let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!response.ok){const detail=data?.message||data?.error||data?.cause?.[0]?.description||raw||('HTTP '+response.status);throw new Error('Mercado Pago '+response.status+': '+detail);}
  return data;
}
function rdsMercadoPagoPayment(data){return data?.transactions?.payments?.[0]||null;}
function rdsMercadoPagoQR(data){const p=rdsMercadoPagoPayment(data);const pm=p?.payment_method||{};const text=pm.qr_code||'';return text?{id:p?.id||null,text,png:null,base64:pm.qr_code_base64||null,url:pm.ticket_url||null,amount:Number(p?.amount||data?.total_amount||0)}:null;}
function rdsMercadoPagoStatus(data){return String(rdsMercadoPagoPayment(data)?.status||data?.status||'WAITING').toUpperCase();}
function rdsMercadoPagoAmount(data){return Number(rdsMercadoPagoPayment(data)?.amount||data?.total_amount||0);}
function rdsMercadoPagoPaid(data){return rdsMercadoPagoStatus(data)==='PROCESSED'&&String(data?.status_detail||rdsMercadoPagoPayment(data)?.status_detail||'').toLowerCase()==='accredited';}
function rdsMercadoPagoExpiration(){const h=String(MERCADOPAGO_PIX_EXPIRATION_HOURS).replace(/\.0$/,'');return 'PT'+h+'H';}
function rdsMercadoPagoExisting(order){const exp=order?.pix_expires_at?new Date(order.pix_expires_at).getTime():0;const waiting=['WAITING','ACTION_REQUIRED','CREATED','PROCESSING'].includes(String(order?.pagbank_status||'').toUpperCase());if(order?.pagbank_order_id&&order?.pix_copy_paste&&waiting&&exp>Date.now()+30000)return {orderId:order.pagbank_order_id,chargeId:order.pagbank_charge_id,qr:{text:order.pix_copy_paste,amount:Number(order.total_amount||0),png:null,base64:null,url:order.pix_qr_code_url||null},reused:true};return null;}
async function rdsMercadoPagoCreatePix(order){
  if(!order)throw new Error('Pedido não encontrado.');
  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(order.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando pagamento.');
  const existing=rdsMercadoPagoExisting(order);if(existing)return existing;
  const total=Number(order.total_amount||0);if(!Number.isFinite(total)||total<=0)throw new Error('Valor do pedido inválido para PIX.');
  if(!MERCADOPAGO_PAYER_EMAIL||!/@/.test(MERCADOPAGO_PAYER_EMAIL))throw new Error('MERCADOPAGO_PAYER_EMAIL inválido.');
  const payload={type:'online',total_amount:total.toFixed(2),external_reference:String(order.code),processing_mode:'automatic',transactions:{payments:[{amount:total.toFixed(2),payment_method:{id:'pix',type:'bank_transfer'},expiration_time:rdsMercadoPagoExpiration()}]},payer:{email:MERCADOPAGO_PAYER_EMAIL}};
  const data=await rdsMercadoPagoRequest('/v1/orders',{method:'POST',headers:{'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)});
  const qr=rdsMercadoPagoQR(data);if(!qr?.text)throw new Error('Mercado Pago não retornou o PIX copia e cola.');
  const createdAt=data?.created_date?new Date(data.created_date).getTime():Date.now();
  const expiresAt=new Date(createdAt+MERCADOPAGO_PIX_EXPIRATION_HOURS*3600000).toISOString();
  const status=rdsMercadoPagoStatus(data);
  await patch('rds10_orders','id=eq.'+order.id,{pagbank_order_id:data.id,pagbank_charge_id:qr.id,pagbank_status:status,pix_copy_paste:qr.text,pix_qr_code_url:qr.url||null,pix_expires_at:expiresAt,payment_method:'PIX_MERCADOPAGO',payment_created_at:nowISO(),payment_updated_at:nowISO(),payment_last_error:null,updated_at:nowISO()});
  await logEvent('MERCADOPAGO_PIX_CRIADO',{order_id:order.id,order:order.code,mercadopago_order_id:data.id,mercadopago_payment_id:qr.id,status});
  return {orderId:data.id,chargeId:qr.id,qr:{text:qr.text,amount:Math.round(total*100),png:null,base64:qr.base64||null,url:qr.url||null},reused:false};
}
async function rdsMercadoPagoApplyResult(order,data,source){
  if(!order)throw new Error('Pedido não encontrado.');
  const ref=String(data?.external_reference||'');if(ref&&ref!==String(order.code))throw new Error('Referência Mercado Pago não corresponde ao pedido RDS.');
  const status=rdsMercadoPagoStatus(data);const detail=String(data?.status_detail||rdsMercadoPagoPayment(data)?.status_detail||'').toLowerCase();const amount=rdsMercadoPagoAmount(data);const expected=Number(order.total_amount||0);const p=rdsMercadoPagoPayment(data);
  const patchData={pagbank_status:status,pagbank_charge_id:p?.id||order.pagbank_charge_id||null,payment_updated_at:nowISO(),updated_at:nowISO()};
  if(amount>0&&Math.abs(amount-expected)>0.009){patchData.payment_last_error='Valor do pagamento não corresponde ao pedido.';await patch('rds10_orders','id=eq.'+order.id,patchData);return false;}
  if(status==='PROCESSED'&&detail==='accredited'){
    patchData.status='PAGO_AGUARDANDO_BILHETES';patchData.payment_confirmed_at=nowISO();patchData.payment_last_error=null;
    await patch('rds10_orders','id=eq.'+order.id,patchData);
    await logEvent('PAGAMENTO_CONFIRMADO',{phone:order.phone,order:order.code,provider:'MERCADO_PAGO',source,mercadopago_order_id:order.pagbank_order_id,mercadopago_payment_id:p?.id||null});
    return true;
  }
  if(['CANCELED','EXPIRED','FAILED'].includes(status))patchData.payment_last_error='Mercado Pago status '+status+(detail?' / '+detail:'');
  await patch('rds10_orders','id=eq.'+order.id,patchData);return false;
}
function rdsMercadoPagoWebhookValid(req){
  const secret=MERCADOPAGO_WEBHOOK_SECRET;if(!secret)return false;
  const signature=String(req.get('x-signature')||'');const requestId=String(req.get('x-request-id')||'');const dataId=String(req.query?.['data.id']||'');
  const ts=(signature.match(/(?:^|,)ts=([^,]+)/)||[])[1]||'';const v1=(signature.match(/(?:^|,)v1=([^,]+)/)||[])[1]||'';
  const parts=[];if(dataId)parts.push('id:'+dataId);if(requestId)parts.push('request-id:'+requestId);if(ts)parts.push('ts:'+ts);const manifest=parts.join(';')+';';
  const expected=crypto.createHmac('sha256',secret).update(manifest).digest('hex');
  try{return Boolean(v1)&&v1.length===expected.length&&crypto.timingSafeEqual(Buffer.from(v1),Buffer.from(expected));}catch{return false;}
}
async function rdsMercadoPagoAutoReconcile(){
  if(!rdsMercadoPagoConfigured())return;
  const orders=await list('rds10_orders','select=*&status=eq.AGUARDANDO_PAGAMENTO&pagbank_order_id=not.is.null&order=created_at.asc&limit=20');
  for(const order of orders){try{const data=await rdsMercadoPagoRequest('/v1/orders/'+encodeURIComponent(order.pagbank_order_id));await rdsMercadoPagoApplyResult(order,data,'auto_reconcile');}catch(e){await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e?.message||e),payment_updated_at:nowISO(),updated_at:nowISO()}).catch(()=>{});}}
}

rdsPagBankConfigured=rdsMercadoPagoConfigured;
rdsPagBankRequest=rdsMercadoPagoRequest;
rdsPagBankStatus=rdsMercadoPagoStatus;
rdsPagBankAmount=rdsMercadoPagoAmount;
rdsPagBankPaid=rdsMercadoPagoPaid;
rdsPagBankExisting=rdsMercadoPagoExisting;
rdsPagBankCreatePix=rdsMercadoPagoCreatePix;
rdsApplyPagBankResult=rdsMercadoPagoApplyResult;
rdsPagBankWebhookValid=rdsMercadoPagoWebhookValid;
rdsPagBankAutoReconcile=rdsMercadoPagoAutoReconcile;

server=server.replace("app.get('/api/pagbank/status',(req,res)=>res.json({ok:true,configured:rdsPagBankConfigured(),environment:PAGBANK_ENV,webhook_url:PAGBANK_WEBHOOK_URL||null}));","app.get('/api/pagbank/status',(req,res)=>res.json({ok:true,configured:rdsMercadoPagoConfigured(),environment:MERCADOPAGO_ENV,provider:'mercadopago',webhook_url:(PUBLIC_URL||'')+'/api/pagbank/webhook'}));");
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] PIX Mercado Pago Orders V2 instalado');
