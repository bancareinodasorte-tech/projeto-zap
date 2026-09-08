import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const startMarker='// RDS_PAGBANK_V10_60';
const endMarker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";

const start=server.indexOf(startMarker);
const end=server.indexOf(endMarker,start);
if(start<0)throw new Error('Bloco de pagamento base não localizado.');
if(end<0)throw new Error('Ponto final do bloco de pagamento não localizado.');

const block=String.raw`// RDS MERCADO PAGO ORDERS PIX V1
const MERCADOPAGO_ENV=String(process.env.MERCADOPAGO_ENV||'sandbox').toLowerCase()==='production'?'production':'sandbox';
const MERCADOPAGO_ACCESS_TOKEN=String(process.env.MERCADOPAGO_ACCESS_TOKEN||'').trim();
const MERCADOPAGO_BASE='https://api.mercadopago.com';
const MERCADOPAGO_PAYER_EMAIL=String(process.env.MERCADOPAGO_PAYER_EMAIL||'test_user_br@testuser.com').trim();
const MERCADOPAGO_WEBHOOK_SECRET=String(process.env.MERCADOPAGO_WEBHOOK_SECRET||'').trim();
const MERCADOPAGO_PIX_EXPIRATION_HOURS=Math.min(24,Math.max(0.5,Number(process.env.MERCADOPAGO_PIX_EXPIRATION_HOURS||3)));
const MERCADOPAGO_RECONCILE_MS=Math.max(30000,Number(process.env.MERCADOPAGO_RECONCILE_MS||60000));
function rdsPagBankConfigured(){return Boolean(MERCADOPAGO_ACCESS_TOKEN);}
async function rdsPagBankRequest(endpoint,opt={}){
  if(!rdsPagBankConfigured())throw new Error('Mercado Pago não configurado no Render. Defina MERCADOPAGO_ACCESS_TOKEN.');
  const response=await fetch(MERCADOPAGO_BASE+endpoint,{...opt,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+MERCADOPAGO_ACCESS_TOKEN,...(opt.headers||{})}});
  const raw=await response.text();
  let data=null;try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!response.ok){
    const detail=data?.message||data?.error||data?.cause?.[0]?.description||raw||('HTTP '+response.status);
    throw new Error('Mercado Pago '+response.status+': '+detail);
  }
  return data;
}
function rdsPagBankPayment(data){return data?.transactions?.payments?.[0]||null;}
function rdsPagBankQR(data){
  const p=rdsPagBankPayment(data);
  const pm=p?.payment_method||{};
  const text=pm.qr_code||null;
  return text?{id:p?.id||null,text,png:null,base64:pm.qr_code_base64||null,url:pm.ticket_url||null,amount:Number(p?.amount||data?.total_amount||0)}:null;
}
function rdsPagBankStatus(data){
  return String(rdsPagBankPayment(data)?.status||data?.status||'WAITING').toUpperCase();
}
function rdsPagBankAmount(data){return Number(rdsPagBankPayment(data)?.amount||data?.total_amount||0);}
function rdsPagBankPaid(data){return ['PROCESSED','PAID'].includes(rdsPagBankStatus(data))&&String(data?.status_detail||rdsPagBankPayment(data)?.status_detail||'').toLowerCase()==='accredited';}
function rdsMercadoPagoExpiration(){return 'PT'+String(MERCADOPAGO_PIX_EXPIRATION_HOURS).replace(/\.0$/,'')+'H';}
function rdsPagBankExisting(order){
  const exp=order?.pix_expires_at?new Date(order.pix_expires_at).getTime():0;
  const waiting=['WAITING','ACTION_REQUIRED','CREATED'].includes(String(order?.pagbank_status||'').toUpperCase());
  if(order?.pagbank_order_id&&order?.pix_copy_paste&&waiting&&exp>Date.now()+30000)return {orderId:order.pagbank_order_id,chargeId:order.pagbank_charge_id,qr:{text:order.pix_copy_paste,amount:Number(order.total_amount||0),png:null,base64:null,url:order.pix_qr_code_url||null},reused:true};
  return null;
}
async function rdsPagBankCreatePix(order){
  if(!order)throw new Error('Pedido não encontrado.');
  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(order.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando pagamento.');
  const existing=rdsPagBankExisting(order);if(existing)return existing;
  const total=Number(order.total_amount||0);if(!Number.isFinite(total)||total<=0)throw new Error('Valor do pedido inválido para PIX.');
  if(!MERCADOPAGO_PAYER_EMAIL||!/@/.test(MERCADOPAGO_PAYER_EMAIL))throw new Error('MERCADOPAGO_PAYER_EMAIL inválido.');
  const expiration=rdsMercadoPagoExpiration();
  const payload={
    type:'online',
    total_amount:total.toFixed(2),
    external_reference:String(order.code),
    processing_mode:'automatic',
    transactions:{payments:[{amount:total.toFixed(2),payment_method:{id:'pix',type:'bank_transfer'},expiration_time:expiration}]},
    payer:{email:MERCADOPAGO_PAYER_EMAIL}
  };
  const data=await rdsPagBankRequest('/v1/orders',{method:'POST',headers:{'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)});
  const qr=rdsPagBankQR(data);if(!qr?.text)throw new Error('Mercado Pago não retornou o PIX copia e cola.');
  const createdAt=data?.created_date?new Date(data.created_date).getTime():Date.now();
  const expiresAt=data?.expiration_time&&/^P/.test(data.expiration_time)?new Date(createdAt+MERCADOPAGO_PIX_EXPIRATION_HOURS*3600000).toISOString():new Date(Date.now()+MERCADOPAGO_PIX_EXPIRATION_HOURS*3600000).toISOString();
  const status=rdsPagBankStatus(data);
  await patch('rds10_orders','id=eq.'+order.id,{pagbank_order_id:data.id,pagbank_charge_id:qr.id,pagbank_status:status,pix_copy_paste:qr.text,pix_qr_code_url:qr.url||null,pix_expires_at:expiresAt,payment_method:'PIX_MERCADOPAGO',payment_created_at:nowISO(),payment_updated_at:nowISO(),payment_last_error:null,updated_at:nowISO()});
  await logEvent('MERCADOPAGO_PIX_CRIADO',{order_id:order.id,order:order.code,mercadopago_order_id:data.id,mercadopago_payment_id:qr.id,status});
  return {orderId:data.id,chargeId:qr.id,qr:{text:qr.text,amount:Math.round(total*100),png:null,base64:qr.base64||null,url:qr.url||null},reused:false};
}
async function rdsApplyPagBankResult(order,data,source){
  if(!order)throw new Error('Pedido não encontrado.');
  const ref=String(data?.external_reference||'');
  if(ref&&ref!==String(order.code))throw new Error('Referência Mercado Pago não corresponde ao pedido RDS.');
  const status=rdsPagBankStatus(data);
  const detail=String(data?.status_detail||rdsPagBankPayment(data)?.status_detail||'').toLowerCase();
  const amount=rdsPagBankAmount(data);
  const expected=Number(order.total_amount||0);
  const p=rdsPagBankPayment(data);
  const patchData={pagbank_status:status,pagbank_charge_id:p?.id||order.pagbank_charge_id||null,payment_updated_at:nowISO(),updated_at:nowISO()};
  if(amount>0&&Math.abs(amount-expected)>0.009){patchData.payment_last_error='Valor do pagamento não corresponde ao pedido.';await patch('rds10_orders','id=eq.'+order.id,patchData);return false;}
  if(status==='PROCESSED'&&detail==='accredited'){
    patchData.status='PAGO_AGUARDANDO_BILHETES';
    patchData.payment_confirmed_at=nowISO();
    patchData.payment_last_error=null;
    await patch('rds10_orders','id=eq.'+order.id,patchData);
    await logEvent('PAGAMENTO_CONFIRMADO',{phone:order.phone,order:order.code,provider:'MERCADO_PAGO',source,mercadopago_order_id:order.pagbank_order_id,mercadopago_payment_id:p?.id||null});
    return true;
  }
  if(['CANCELED','EXPIRED','FAILED'].includes(status))patchData.payment_last_error='Mercado Pago status '+status+(detail?' / '+detail:'');
  await patch('rds10_orders','id=eq.'+order.id,patchData);
  return false;
}
function rdsMercadoPagoWebhookValid(req){
  const secret=MERCADOPAGO_WEBHOOK_SECRET;if(!secret)return false;
  const signature=String(req.get('x-signature')||'');
  const requestId=String(req.get('x-request-id')||'');
  const dataId=String(req.query?.['data.id']||'');
  const ts=(signature.match(/(?:^|,)ts=([^,]+)/)||[])[1]||'';
  const v1=(signature.match(/(?:^|,)v1=([^,]+)/)||[])[1]||'';
  const parts=[];if(dataId)parts.push('id:'+dataId);if(requestId)parts.push('request-id:'+requestId);if(ts)parts.push('ts:'+ts);
  const manifest=parts.join(';')+';';
  const expected=crypto.createHmac('sha256',secret).update(manifest).digest('hex');
  try{return Boolean(v1)&&v1.length===expected.length&&crypto.timingSafeEqual(Buffer.from(v1),Buffer.from(expected));}catch{return false;}
}
async function rdsPagBankAutoReconcile(){
  if(!rdsPagBankConfigured())return;
  const orders=await list('rds10_orders','select=*&status=eq.AGUARDANDO_PAGAMENTO&pagbank_order_id=not.is.null&order=created_at.asc&limit=20');
  for(const order of orders){
    try{const data=await rdsPagBankRequest('/v1/orders/'+encodeURIComponent(order.pagbank_order_id));await rdsApplyPagBankResult(order,data,'auto_reconcile');}
    catch(e){await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e?.message||e),payment_updated_at:nowISO(),updated_at:nowISO()}).catch(()=>{});}
  }
}
app.get('/api/pagbank/status',(req,res)=>res.json({ok:true,configured:rdsPagBankConfigured(),environment:MERCADOPAGO_ENV,provider:'mercadopago',webhook_url:(PUBLIC_URL||'')+'/api/pagbank/webhook'}));
app.post('/api/pagbank/orders/:id/pix',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');const fresh=await one('rds10_orders','select=*&id=eq.'+o.id);const pix=await rdsPagBankCreatePix(fresh);res.json({ok:true,...pix,provider:'mercadopago'});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/pagbank/orders/:id/send-pix',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');const fresh=await one('rds10_orders','select=*&id=eq.'+o.id);const pix=await rdsPagBankCreatePix(fresh);await sendPixToIdentity({phone:fresh.phone,remoteJid:fresh.phone},fresh,pix);res.json({ok:true,...pix,sent:true,provider:'mercadopago'});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/pagbank/orders/:id/reconcile',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');if(!o.pagbank_order_id)throw new Error('Este pedido ainda não possui PIX.');const data=await rdsPagBankRequest('/v1/orders/'+encodeURIComponent(o.pagbank_order_id));const paid=await rdsApplyPagBankResult(o,data,'consulta');await logEvent('MERCADOPAGO_CONSULTA',{order_id:o.id,order:o.code,mercadopago_order_id:o.pagbank_order_id,status:rdsPagBankStatus(data),paid});res.json({ok:true,status:rdsPagBankStatus(data),paid,mercadopago_order_id:o.pagbank_order_id,environment:MERCADOPAGO_ENV});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.get('/api/pagbank/orders/:id/qrcode.png',async(req,res)=>{try{const o=await one('rds10_orders','select=pix_copy_paste&id=eq.'+req.params.id);if(!o?.pix_copy_paste)throw new Error('QR Code ainda não disponível.');const image=await QRCode.toBuffer(o.pix_copy_paste,{type:'png',width:700,margin:2});res.set('Content-Type','image/png').set('Cache-Control','no-store').send(image);}catch(e){res.status(404).json({ok:false,error:e.message});}});
app.post('/api/pagbank/webhook',async(req,res)=>{try{if(!rdsMercadoPagoWebhookValid(req))return res.status(401).json({ok:false,error:'Assinatura Mercado Pago inválida ou webhook ainda não configurado.'});const p=req.body||{};const id=String(p?.data?.id||req.query?.['data.id']||'');if(!id)return res.status(200).json({ok:true,ignored:true});const data=await rdsPagBankRequest('/v1/orders/'+encodeURIComponent(id));const ref=String(data?.external_reference||'');const o=ref?await one('rds10_orders','select=*&code=eq.'+encodeURIComponent(ref)):null;if(!o)return res.status(200).json({ok:true,ignored:true});await rdsApplyPagBankResult(o,data,'webhook');return res.status(200).json({ok:true});}catch(e){console.error('MERCADOPAGO_WEBHOOK',e.message);return res.status(400).json({ok:false,error:e.message});}});

setTimeout(()=>rdsPagBankAutoReconcile().catch(()=>{}),5000);
setInterval(()=>rdsPagBankAutoReconcile().catch(()=>{}),MERCADOPAGO_RECONCILE_MS);
console.log('[RDS] PIX Mercado Pago Orders V1 instalado');
`;

server=server.slice(0,start)+block+'\n'+server.slice(end);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] integração Mercado Pago aplicada ao runtime gerado');
