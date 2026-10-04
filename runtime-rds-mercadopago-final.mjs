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
function rdsMercadoPagoKey(){
  const raw=String(process.env.RDS_OPERATOR_CREDENTIALS_KEY||'').trim();
  if(!raw)throw new Error('Chave de proteção dos dados dos vendedores não configurada.');
  const key=Buffer.from(raw,'base64');
  if(key.length!==32)throw new Error('Chave de proteção dos dados dos vendedores inválida.');
  return key;
}
function rdsMercadoPagoDecrypt(v){
  const p=String(v||'').split('.');
  if(p.length!==3)throw new Error('Credencial Mercado Pago protegida inválida.');
  const d=crypto.createDecipheriv('aes-256-gcm',rdsMercadoPagoKey(),Buffer.from(p[0],'base64'));
  d.setAuthTag(Buffer.from(p[1],'base64'));
  return Buffer.concat([d.update(Buffer.from(p[2],'base64')),d.final()]).toString('utf8');
}
const rdsMercadoPagoRefreshLocks=new Map();
async function rdsMercadoPagoRefreshTenantToken(sellerId,settings){
  const key=String(sellerId);
  if(rdsMercadoPagoRefreshLocks.has(key))return await rdsMercadoPagoRefreshLocks.get(key);
  const job=(async()=>{
    const refreshToken=settings?.mp_refresh_token_enc?rdsMercadoPagoDecrypt(settings.mp_refresh_token_enc):'';
    if(!refreshToken)throw new Error('Token Mercado Pago expirado e sem refresh_token disponível. Reconecte o Mercado Pago.');
    if(!rdsMpOAuthConfigured())throw new Error('OAuth do Mercado Pago não configurado para renovação.');
    const form=new URLSearchParams({client_id:rdsMpOAuthClientId(),client_secret:rdsMpOAuthClientSecret(),grant_type:'refresh_token',refresh_token:refreshToken});
    const response=await fetch(MERCADOPAGO_BASE.replace('/api','')+'/oauth/token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
    const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok)throw new Error('Mercado Pago não renovou o Access Token ('+response.status+'). Reconecte o Mercado Pago se a autorização tiver sido revogada.');
    const accessToken=cleanText(data.access_token),nextRefresh=cleanText(data.refresh_token)||refreshToken;
    if(!accessToken)throw new Error('Mercado Pago não retornou novo Access Token.');
    const expiresAt=data.expires_in?new Date(Date.now()+Number(data.expires_in)*1000).toISOString():null;
    await patch('rds10_seller_settings','seller_id=eq.'+encodeURIComponent(sellerId),{mp_access_token_enc:rdsOpEnc(accessToken),mp_refresh_token_enc:rdsOpEnc(nextRefresh),mp_token_expires_at:expiresAt,mp_oauth_scope:cleanText(data.scope)||settings?.mp_oauth_scope||null,mp_user_id:data.user_id?String(data.user_id):(settings?.mp_user_id||null),mp_public_key:cleanText(data.public_key)||settings?.mp_public_key||null,mp_environment:data.live_mode===false?'sandbox':'production',updated_at:nowISO()});
    console.log('[RDS MP OAuth] Access Token renovado para vendedor '+key);
    return {token:accessToken,expiresAt};
  })();
  rdsMercadoPagoRefreshLocks.set(key,job);
  try{return await job;}finally{rdsMercadoPagoRefreshLocks.delete(key);}
}
async function rdsMercadoPagoTenantConfig(orderOrSeller){
  const sellerId=cleanText(orderOrSeller?.seller_id||orderOrSeller?.sellerId);
  if(!sellerId)return {token:MERCADOPAGO_ACCESS_TOKEN,environment:MERCADOPAGO_ENV,payerEmail:MERCADOPAGO_PAYER_EMAIL,tenant:false};
  let settings=await one('rds10_seller_settings','select=seller_id,mp_access_token_enc,mp_refresh_token_enc,mp_environment,official_email,mp_token_expires_at,mp_oauth_scope,mp_user_id,mp_public_key&seller_id=eq.'+encodeURIComponent(sellerId));
  if(!settings?.mp_access_token_enc)throw new Error('Mercado Pago não configurado para este vendedor.');
  let token=rdsMercadoPagoDecrypt(settings.mp_access_token_enc);
  if(!token)throw new Error('Credencial Mercado Pago do vendedor inválida.');
  const expires=settings?.mp_token_expires_at?new Date(settings.mp_token_expires_at).getTime():0;
  const scope=String(settings?.mp_oauth_scope||'');
  if(expires&&expires<=Date.now()+10*60*1000){
    if(!/\boffline_access\b/i.test(scope))throw new Error('A autorização do Mercado Pago precisa incluir offline_access para renovação automática. Reconecte o Mercado Pago.');
    const renewed=await rdsMercadoPagoRefreshTenantToken(sellerId,settings);
    token=renewed.token;
  }
  return {
    token,
    environment:String(settings.mp_environment||'production').toLowerCase()==='sandbox'?'sandbox':'production',
    payerEmail:String(settings.official_email||MERCADOPAGO_PAYER_EMAIL).trim(),
    tenant:true,
    sellerId
  };
}
async function rdsMercadoPagoRequest(endpoint,opt={},accessToken=MERCADOPAGO_ACCESS_TOKEN){
  if(!accessToken)throw new Error('Mercado Pago não configurado.');
  const response=await fetch(MERCADOPAGO_BASE+endpoint,{...opt,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+accessToken,...(opt.headers||{})}});
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
function rdsMercadoPagoExpiration(order){
  const fallback=Number(MERCADOPAGO_PIX_EXPIRATION_HOURS||24);
  const target=Date.parse(order?.order_expires_at||'');
  if(Number.isFinite(target)){
    const remaining=(target-Date.now())/3600000;
    if(remaining<0.5)throw new Error('O prazo deste pedido está muito próximo do vencimento. O PIX não pode mais ser gerado.');
    const seconds=Math.floor(remaining*3600);
    return 'PT'+Math.max(1800,seconds)+'S';
  }
  const h=Math.max(0.5,fallback);
  return 'PT'+h+'H';
}
function rdsMercadoPagoExisting(order){const exp=order?.pix_expires_at?new Date(order.pix_expires_at).getTime():0;const waiting=['WAITING','ACTION_REQUIRED','CREATED','PROCESSING'].includes(String(order?.pagbank_status||'').toUpperCase());if(order?.pagbank_order_id&&order?.pix_copy_paste&&waiting&&exp>Date.now()+30000)return {orderId:order.pagbank_order_id,chargeId:order.pagbank_charge_id,qr:{text:order.pix_copy_paste,amount:Number(order.total_amount||0),png:null,base64:null,url:order.pix_qr_code_url||null},reused:true};return null;}
async function rdsMercadoPagoCreatePix(order){
  if(!order)throw new Error('Pedido não encontrado.');
  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(order.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando pagamento.');
  const existing=rdsMercadoPagoExisting(order);if(existing)return existing;
  const total=Number(order.total_amount||0);if(!Number.isFinite(total)||total<=0)throw new Error('Valor do pedido inválido para PIX.');
  const cfg=await rdsMercadoPagoTenantConfig(order);
  if(!cfg.payerEmail||!/@/.test(cfg.payerEmail))throw new Error('E-mail operacional do Mercado Pago inválido.');
  const payload={type:'online',total_amount:total.toFixed(2),external_reference:String(order.code),processing_mode:'automatic',transactions:{payments:[{amount:total.toFixed(2),payment_method:{id:'pix',type:'bank_transfer'},expiration_time:rdsMercadoPagoExpiration(order)}]},payer:{email:cfg.payerEmail,...(cfg.environment==='sandbox'?{first_name:'APRO'}:{})}};
  const data=await rdsMercadoPagoRequest('/v1/orders',{method:'POST',headers:{'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)},cfg.token);
  const qr=rdsMercadoPagoQR(data);if(!qr?.text)throw new Error('Mercado Pago não retornou o PIX copia e cola.');
  const createdAt=data?.created_date?new Date(data.created_date).getTime():Date.now();
  const requestedOrderExpiry=Date.parse(order?.order_expires_at||'');
  const expiresAt=Number.isFinite(requestedOrderExpiry)?new Date(requestedOrderExpiry).toISOString():new Date(createdAt+MERCADOPAGO_PIX_EXPIRATION_HOURS*3600000).toISOString();
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
  const orders=await list('rds10_orders','select=*&status=eq.AGUARDANDO_PAGAMENTO&pagbank_order_id=not.is.null&order=created_at.asc&limit=50');
  for(const order of orders){
    try{
      const cfg=await rdsMercadoPagoTenantConfig(order);
      const data=await rdsMercadoPagoRequest('/v1/orders/'+encodeURIComponent(order.pagbank_order_id),{},cfg.token);
      await rdsMercadoPagoApplyResult(order,data,'auto_reconcile');
    }catch(e){
      await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e?.message||e),payment_updated_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
    }
  }
}

rdsPagBankConfigured=rdsMercadoPagoConfigured;
rdsPagBankRequest=rdsMercadoPagoRequest;
rdsPagBankRequestForOrder=async(order,endpoint,opt={})=>{const cfg=await rdsMercadoPagoTenantConfig(order);return rdsMercadoPagoRequest(endpoint,opt,cfg.token);};
rdsPagBankTenantConfig=async(sellerId)=>rdsMercadoPagoTenantConfig({seller_id:sellerId});
rdsPagBankStatus=rdsMercadoPagoStatus;
rdsPagBankAmount=rdsMercadoPagoAmount;
rdsPagBankPaid=rdsMercadoPagoPaid;
rdsPagBankExisting=rdsMercadoPagoExisting;
rdsPagBankCreatePix=rdsMercadoPagoCreatePix;
rdsApplyPagBankResult=rdsMercadoPagoApplyResult;
rdsPagBankWebhookValid=rdsMercadoPagoWebhookValid;
rdsPagBankAutoReconcile=rdsMercadoPagoAutoReconcile;

async function rdsCancelMercadoPagoForClosedOrder(order){
  if(!order?.id || !order?.pagbank_order_id) return {ok:true,skipped:true};
  const status=String(order.pagbank_status||'').toUpperCase();
  if(['PROCESSED','APPROVED','ACCREDITED','PAID'].includes(status)){
    await addAlert('PAGAMENTO_PEDIDO_CANCELADO','Pagamento identificado em pedido já cancelado',{order:order.code,order_id:order.id,pagbank_status:status});
    await logEvent('PAGAMENTO_EM_PEDIDO_CANCELADO',{order:order.code,order_id:order.id,pagbank_status:status});
    return {ok:false,paid:true};
  }
  if(['CANCELED','CANCELLED','EXPIRED','REJECTED'].includes(status)){
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{payment_cancelled_at:order.payment_cancelled_at||nowISO(),payment_cancel_error:null,pagbank_status:status,updated_at:nowISO()}).catch(()=>{});
    return {ok:true,already:true};
  }
  const cfg=await rdsMercadoPagoTenantConfig(order);
  let lastError='';
  try{
    const data=await rdsMercadoPagoRequest('/v1/orders/'+encodeURIComponent(order.pagbank_order_id)+'/cancel',{method:'POST',headers:{'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({})},cfg.token);
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{payment_cancelled_at:nowISO(),payment_cancel_error:null,pagbank_status:'CANCELLED',payment_updated_at:nowISO(),updated_at:nowISO()});
    await logEvent('MERCADOPAGO_COBRANCA_CANCELADA',{order:order.code,order_id:order.id,source:'order_cancel',status:data?.status||'canceled'});
    return {ok:true,method:'order_cancel'};
  }catch(e){lastError=String(e?.message||e);}
  if(order.pagbank_charge_id){
    try{
      const data=await rdsMercadoPagoRequest('/v1/payments/'+encodeURIComponent(order.pagbank_charge_id),{method:'PUT',body:JSON.stringify({status:'cancelled'})},cfg.token);
      await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{payment_cancelled_at:nowISO(),payment_cancel_error:null,pagbank_status:'CANCELLED',payment_updated_at:nowISO(),updated_at:nowISO()});
      await logEvent('MERCADOPAGO_COBRANCA_CANCELADA',{order:order.code,order_id:order.id,source:'payment_cancel',status:data?.status||'cancelled'});
      return {ok:true,method:'payment_cancel'};
    }catch(e){lastError=lastError+' | fallback payment: '+String(e?.message||e);}
  }
  await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{payment_cancel_error:lastError.slice(0,1800),payment_updated_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
  await addAlert('MERCADO_PAGO_CANCELAMENTO_FALHOU','Não foi possível encerrar a cobrança do pedido '+order.code,{order:order.code,order_id:order.id,error:lastError});
  return {ok:false,error:lastError};
}

async function rdsNotifyClosedOrder(order){
  if(!order?.id || !order?.phone || order.expiration_notified_at)return false;
  const reason=String(order.cancel_reason||'').toUpperCase();
  const deadline=order.order_expires_at?new Date(order.order_expires_at):null;
  const deadlineText=deadline&&!Number.isNaN(deadline.getTime())?deadline.toLocaleString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'o prazo informado anteriormente';
  const message=reason==='EXPIRADO_PAGAMENTO'
    ? '⚠️ *PEDIDO EXPIRADO E CANCELADO*\\n\\nPedido: *'+cleanText(order.code)+'*\\nPrazo encerrado em: *'+deadlineText+'*\\n\\nO pedido foi cancelado por falta de pagamento. *NÃO PAGUE O PIX ANTERIOR*, pois ele não deve mais ser utilizado.\\n\\nSe ainda quiser comprar, inicie um novo pedido pelo WhatsApp.'
    : '⚠️ *PEDIDO CANCELADO*\\n\\nPedido: *'+cleanText(order.code)+'*\\n\\nEste pedido foi encerrado. *NÃO PAGUE O PIX ANTERIOR*.\\n\\nSe ainda quiser comprar, inicie um novo pedido pelo WhatsApp.';
  try{
    await sendTextPhone(order.phone,message);
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{expiration_notified_at:nowISO(),updated_at:nowISO()});
    return true;
  }catch(e){
    await logEvent('AVISO_CANCELAMENTO_WHATSAPP_FALHOU',{order:order.code,order_id:order.id,error:String(e?.message||e)});
    return false;
  }
}

async function rdsCloseMercadoPagoOrders(){
  try{
    const sellerId=await rdsWhatsappSellerId();
    if(!sellerId)return;
    const rows=await list('rds10_orders','select=*&seller_id=eq.'+encodeURIComponent(sellerId)+'&status=eq.CANCELADO&cancel_reason=in.(EXPIRADO_PAGAMENTO,CANCELAMENTO_MANUAL,CANCELAMENTO_CLIENTE)&pagbank_order_id=not.is.null&order=updated_at.asc&limit=100');
    for(const order of rows||[]){
      try{
        if(!order.payment_cancelled_at)await rdsCancelMercadoPagoForClosedOrder(order);
        await rdsNotifyClosedOrder(order);
      }catch(e){console.error('[RDS] fechamento MP '+String(order.code||order.id)+':',e?.message||e);}
    }
  }catch(e){console.error('[RDS] guard cancelamento MP:',e?.message||e);}
}
setTimeout(()=>rdsCloseMercadoPagoOrders().catch(()=>{}),20000);
setInterval(()=>rdsCloseMercadoPagoOrders().catch(()=>{}),60000);
console.log('[RDS] cancelamento Mercado Pago + aviso WhatsApp instalados');


server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] PIX Mercado Pago Orders V2 instalado');
