import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS MERCADO PAGO ORDER ROUTES V1';
if(server.includes(marker)){
  console.log('[RDS] rotas de pedido Mercado Pago já aplicadas');
  process.exit(0);
}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para rotas Mercado Pago.');

const block=String.raw`
${marker}
async function rdsMpOrderTenant(req,res){
  if(typeof rdsOpRequire!=='function')return null;
  const session=await rdsOpRequire(req,res);
  if(!session)return null;
  return session;
}
app.post('/api/operator/orders/:id/pix',async(req,res)=>{
  try{
    const session=await rdsMpOrderTenant(req,res);if(!session)return;
    const id=cleanText(req.params.id);
    const order=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(session.seller.id));
    if(!order)throw new Error('Pedido não encontrado para este vendedor.');
    if(!['AGUARDANDO_PAGAMENTO','COLETANDO_DADOS'].includes(String(order.status||'').toUpperCase()))throw new Error('Este pedido não está disponível para geração de PIX.');
    if(!order.total_amount||Number(order.total_amount)<=0)throw new Error('Pedido sem valor válido para pagamento.');
    const result=await rdsMercadoPagoCreatePix(order);
    return res.json({success:true,orderId:order.id,code:order.code,status:order.status,mercadoPagoOrderId:result.orderId,mercadoPagoPaymentId:result.chargeId,reused:Boolean(result.reused),qr:result.qr});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/orders/:id/pix/send',async(req,res)=>{
  try{
    const session=await rdsMpOrderTenant(req,res);if(!session)return;
    const id=cleanText(req.params.id);
    const order=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(session.seller.id));
    if(!order)throw new Error('Pedido não encontrado para este vendedor.');
    if(!order.phone)throw new Error('Pedido sem WhatsApp do cliente.');
    const result=await rdsMercadoPagoCreatePix(order);
    const text='💳 *PAGAMENTO PIX*\n\nPedido: *'+order.code+'*\nValor: *R$ '+money(order.total_amount)+'*\n\nCopie e cole o código PIX abaixo para pagar:\n\n'+result.qr.text+'\n\nApós o pagamento, aguarde a confirmação automática do RDS.';
    const sent=await sendTextPhone(order.phone,text);
    return res.json({success:true,sent:true,messageId:sent?.id||null,reused:Boolean(result.reused),qr:result.qr});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.get('/api/operator/orders/:id/payment-status',async(req,res)=>{
  try{
    const session=await rdsMpOrderTenant(req,res);if(!session)return;
    const id=cleanText(req.params.id);
    const order=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(session.seller.id));
    if(!order)throw new Error('Pedido não encontrado para este vendedor.');
    if(!order.pagbank_order_id)return res.json({success:true,configured:false,status:null,paid:false,order});
    const cfg=await rdsMercadoPagoTenantConfig(order);
    const data=await rdsMercadoPagoRequest('/v1/orders/'+encodeURIComponent(order.pagbank_order_id),{},cfg.token);
    const paid=await rdsMercadoPagoApplyResult(order,data,'manual_status');
    const updated=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
    return res.json({success:true,configured:true,status:rdsMercadoPagoStatus(data),paid,order:updated||order});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/mercadopago/webhook',async(req,res)=>{
  const dataId=cleanText(req.query?.['data.id']||req.body?.data?.id);
  try{
    if(!rdsMercadoPagoWebhookValid(req))return res.status(401).json({success:false,error:'Webhook Mercado Pago inválido.'});
    if(!dataId)return res.status(200).json({success:true,ignored:true});
    const order=await one('rds10_orders','select=*&pagbank_order_id=eq.'+encodeURIComponent(dataId));
    if(!order)return res.status(200).json({success:true,ignored:true});
    const cfg=await rdsMercadoPagoTenantConfig(order);
    const data=await rdsMercadoPagoRequest('/v1/orders/'+encodeURIComponent(dataId),{},cfg.token);
    const paid=await rdsMercadoPagoApplyResult(order,data,'webhook');
    return res.status(200).json({success:true,paid,status:rdsMercadoPagoStatus(data)});
  }catch(e){
    console.error('[RDS MP webhook]',e?.message||e);
    return res.status(500).json({success:false,error:'Webhook recebido, mas não foi possível processar agora.'});
  }
});
console.log('[RDS] rotas de pedido Mercado Pago instaladas');
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] rotas de pedido Mercado Pago instaladas');
