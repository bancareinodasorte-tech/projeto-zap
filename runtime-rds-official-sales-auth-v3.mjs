import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OFFICIAL SALES AUTH V3';
if(server.includes(marker)){
  console.log('[RDS] autenticação oficial V3 já aplicada antes do catch-all');
} else {
const anchor="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(anchor);
if(pos<0)throw new Error('catch-all do server.js não localizado para autenticação oficial V3.');
const block=String.raw`
(()=>{
${marker}
var RDS_OFFICIAL_API_V3='https://api.reinodasorte.com.br';
var RDS_OFFICIAL_EMAIL_V3=String(process.env.RDS_OFFICIAL_EMAIL||'').trim();
var RDS_OFFICIAL_PASSWORD_V3=String(process.env.RDS_OFFICIAL_PASSWORD||'').trim();
var RDS_OFFICIAL_KEY_V3=String(process.env.RDS_OFFICIAL_AUTH_ENCRYPTION_KEY||'').trim();
var rdsOfficialAccessV3=new Map();
var rdsOfficialDeviceStateV3=new Map();
function rdsOfficialContextV3(sellerId){const scope=(typeof rdsRequestScope!=='undefined'&&typeof rdsRequestScope.getStore==='function')?rdsRequestScope.getStore():null;const ownerId=String(process.env.RDS_OFFICIAL_OWNER_SELLER_ID||'').trim();const sid=String(sellerId||scope?.sellerId||ownerId).trim();return {sellerId:sid,ownerId,isOwner:Boolean(ownerId&&sid===ownerId),authId:ownerId&&sid===ownerId?'main':sid,companyId:String(scope?.companyId||'').trim()};}
async function rdsOfficialCredentialsV3(sellerId,override={}){const ctx=rdsOfficialContextV3(sellerId);if(ctx.isOwner)return {email:RDS_OFFICIAL_EMAIL_V3,password:RDS_OFFICIAL_PASSWORD_V3,owner:true};const settings=await one('rds10_seller_settings','select=seller_id,official_email,official_device_id,official_authorized&seller_id=eq.'+encodeURIComponent(ctx.sellerId)).catch(()=>null);return {email:String(override.email||settings?.official_email||'').trim(),password:String(override.password||'').trim(),owner:false,settings};}
function rdsOfficialKeyV3(){if(!RDS_OFFICIAL_KEY_V3)throw new Error('Chave de proteção oficial não configurada.');var b=Buffer.from(RDS_OFFICIAL_KEY_V3,'base64');if(b.length!==32)throw new Error('Chave de proteção oficial inválida.');return b;}
function rdsOfficialEncV3(v){var iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',rdsOfficialKeyV3(),iv);var d=Buffer.concat([c.update(String(v),'utf8'),c.final()]);return iv.toString('base64')+'.'+c.getAuthTag().toString('base64')+'.'+d.toString('base64');}
function rdsOfficialDecV3(v){var parts=String(v||'').split('.'),i=parts[0],t=parts[1],d=parts[2];if(!i||!t||!d)throw new Error('Sessão oficial protegida inválida.');var c=crypto.createDecipheriv('aes-256-gcm',rdsOfficialKeyV3(),Buffer.from(i,'base64'));c.setAuthTag(Buffer.from(t,'base64'));return Buffer.concat([c.update(Buffer.from(d,'base64')),c.final()]).toString('utf8');}
async function rdsOfficialRowV3(sellerId){const ctx=rdsOfficialContextV3(sellerId);return one('rds10_official_sales_auth','select=id,email,device_id,refresh_token_enc,last_auth_at,last_error,company_id&id=eq.'+encodeURIComponent(ctx.authId));}
async function rdsOfficialRequireSellerV3(req,res){if(typeof rdsOpSession!=='function'){res.status(503).json({success:false,message:'Autenticação de vendedor indisponível.'});return null;}const session=await rdsOpSession(req).catch(()=>null);if(!session?.seller?.id){res.status(401).json({success:false,message:'Sessão do vendedor inválida, expirada ou bloqueada.'});return null;}return session;}
async function rdsOfficialRequireOwnerV3(req,res){const session=await rdsOfficialRequireSellerV3(req,res);if(!session)return null;const ownerId=String(process.env.RDS_OFFICIAL_OWNER_SELLER_ID||'').trim();if(!ownerId||String(session.seller.id)!==ownerId){res.status(403).json({success:false,message:'Esta função é reservada à conta proprietária.'});return null;}return session;}
async function rdsOfficialEnsureDeviceV3(sellerId,emailOverride){const ctx=rdsOfficialContextV3(sellerId);const credentials=await rdsOfficialCredentialsV3(ctx.sellerId,{email:emailOverride});let row=await rdsOfficialRowV3(ctx.sellerId);if(row?.device_id){rdsOfficialDeviceStateV3.set(ctx.authId,String(row.device_id));return row;}let companyId=ctx.companyId;if(!companyId){if(ctx.isOwner){const company=await one('rds10_companies','select=id&code=eq.RDS');companyId=String(company?.id||'');}else{const memberships=await list('rds10_seller_companies','select=company_id&seller_id=eq.'+encodeURIComponent(ctx.sellerId)+'&active=eq.true&limit=1000');const ids=[...new Set((memberships||[]).map(x=>String(x.company_id||'')).filter(Boolean))];if(ids.length===1)companyId=ids[0];}}if(!companyId)throw new Error('Empresa da conta oficial não identificada.');const device='rds_server_'+crypto.randomBytes(12).toString('hex');await sb('/rest/v1/rds10_official_sales_auth?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:ctx.authId,company_id:companyId,device_id:device,email:credentials.email||null,updated_at:nowISO()})});rdsOfficialDeviceStateV3.set(ctx.authId,device);row=await rdsOfficialRowV3(ctx.sellerId);if(!ctx.isOwner&&credentials.email)await patch('rds10_seller_settings','seller_id=eq.'+encodeURIComponent(ctx.sellerId),{official_email:credentials.email,official_device_id:device,updated_at:nowISO()}).catch(()=>{});return row;}
function rdsOfficialHeadersV3(token,sellerId){const ctx=rdsOfficialContextV3(sellerId);const deviceId=rdsOfficialDeviceStateV3.get(ctx.authId)||'';return {Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(deviceId?{'x-device-id':deviceId}:{})};}
async function rdsOfficialLoginV3(sellerId,override={}){const ctx=rdsOfficialContextV3(sellerId);const credentials=await rdsOfficialCredentialsV3(ctx.sellerId,override);if(!credentials.email||!credentials.password)throw new Error(ctx.isOwner?'Credenciais oficiais do proprietário não configuradas no Render.':'Informe seu e-mail, senha e código de autorização do sistema oficial para conectar esta conta.');const row=await rdsOfficialEnsureDeviceV3(ctx.sellerId,credentials.email);const deviceId=String(row?.device_id||rdsOfficialDeviceStateV3.get(ctx.authId)||'').trim();if(!deviceId)throw new Error('Dispositivo oficial do servidor não identificado.');const r=await fetch(RDS_OFFICIAL_API_V3+'/auth/login',{method:'POST',headers:rdsOfficialHeadersV3('',ctx.sellerId),body:JSON.stringify({email:credentials.email,password:credentials.password,deviceId})});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{};}catch{}if(!r.ok||d?.success===false)throw new Error(d?.message||d?.error||raw||'Login oficial recusado.');const x=d?.data||{};if(!x.accessToken||!x.refreshToken)throw new Error('Login oficial não retornou sessão.');rdsOfficialAccessV3.set(ctx.authId,String(x.accessToken));await sb('/rest/v1/rds10_official_sales_auth?id=eq.'+encodeURIComponent(ctx.authId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({email:credentials.email,device_id:deviceId,company_id:ctx.companyId||row.company_id,refresh_token_enc:rdsOfficialEncV3(x.refreshToken),last_auth_at:nowISO(),last_error:null,updated_at:nowISO()})});if(!ctx.isOwner)await patch('rds10_seller_settings','seller_id=eq.'+encodeURIComponent(ctx.sellerId),{official_email:credentials.email,official_authorized:true,official_device_id:deviceId,updated_at:nowISO()}).catch(()=>{});return String(x.accessToken);}
async function rdsOfficialRefreshV3(sellerId,row){const ctx=rdsOfficialContextV3(sellerId);if(!row?.refresh_token_enc)throw new Error('A conta oficial ainda não foi autorizada. Conecte sua conta e autorize o dispositivo.');const refresh=rdsOfficialDecV3(row.refresh_token_enc);const rr=await fetch(RDS_OFFICIAL_API_V3+'/auth/refresh',{method:'POST',headers:rdsOfficialHeadersV3('',ctx.sellerId),body:JSON.stringify({refreshToken:refresh,deviceId:String(row.device_id||rdsOfficialDeviceStateV3.get(ctx.authId)||'').trim()})});const raw=await rr.text();let d={};try{d=raw?JSON.parse(raw):{};}catch{}if(!rr.ok||!d?.data?.accessToken){const message=d?.message||d?.error||raw||'Refresh da sessão oficial recusado.';await sb('/rest/v1/rds10_official_sales_auth?id=eq.'+encodeURIComponent(ctx.authId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({last_error:'REFRESH_REJECTED: '+String(rr.status)+' '+String(message).slice(0,450),updated_at:nowISO()})}).catch(()=>{});if(!ctx.isOwner)await patch('rds10_seller_settings','seller_id=eq.'+encodeURIComponent(ctx.sellerId),{official_authorized:false,updated_at:nowISO()}).catch(()=>{});throw new Error('A sessão oficial expirou. Reconecte sua conta e autorize novamente.');}const token=String(d.data.accessToken);rdsOfficialAccessV3.set(ctx.authId,token);const patchData={last_auth_at:nowISO(),last_error:null,updated_at:nowISO()};if(d.data.refreshToken)patchData.refresh_token_enc=rdsOfficialEncV3(d.data.refreshToken);await sb('/rest/v1/rds10_official_sales_auth?id=eq.'+encodeURIComponent(ctx.authId),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patchData)});return token;}
async function rdsOfficialRequestV3(endpoint,opt,sellerId){opt=opt||{};const ctx=rdsOfficialContextV3(sellerId);const row=await rdsOfficialEnsureDeviceV3(ctx.sellerId);let token=rdsOfficialAccessV3.get(ctx.authId)||'';if(!token){if(row?.refresh_token_enc){try{token=await rdsOfficialRefreshV3(ctx.sellerId,row);}catch(e){if(ctx.isOwner)token=await rdsOfficialLoginV3(ctx.sellerId);else throw e;}}else if(ctx.isOwner)token=await rdsOfficialLoginV3(ctx.sellerId);else throw new Error('Sua conta oficial ainda não está conectada. Abra Integração Oficial e conecte suas credenciais.');}let r=await fetch(RDS_OFFICIAL_API_V3+endpoint,{...opt,headers:{...rdsOfficialHeadersV3(token,ctx.sellerId),...(opt.headers||{})}});if(r.status===401){rdsOfficialAccessV3.delete(ctx.authId);const latest=await rdsOfficialRowV3(ctx.sellerId);try{token=latest?.refresh_token_enc?await rdsOfficialRefreshV3(ctx.sellerId,latest):(ctx.isOwner?await rdsOfficialLoginV3(ctx.sellerId):'');}catch(e){if(ctx.isOwner)token=await rdsOfficialLoginV3(ctx.sellerId);else throw e;}if(!token)throw new Error('A sessão oficial expirou. Reconecte sua conta e autorize novamente.');r=await fetch(RDS_OFFICIAL_API_V3+endpoint,{...opt,headers:{...rdsOfficialHeadersV3(token,ctx.sellerId),...(opt.headers||{})}});}const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{};}catch{}if(!r.ok||d?.success===false)throw new Error(d?.message||d?.error||raw||'API oficial recusou a operação.');return d?.data===undefined?d:d.data;}
app.get('/api/v1011/official-sales/bootstrap',async(req,res)=>{try{const session=await rdsOfficialRequireSellerV3(req,res);if(!session)return;const ctx=rdsOfficialContextV3(session.seller.id);const credentials=await rdsOfficialCredentialsV3(ctx.sellerId);const row=await rdsOfficialEnsureDeviceV3(ctx.sellerId,credentials.email);return res.json({success:true,owner:ctx.isOwner,configured:Boolean(credentials.email&&(ctx.isOwner?credentials.password:row?.refresh_token_enc)),emailConfigured:Boolean(credentials.email),passwordConfigured:ctx.isOwner?Boolean(credentials.password):false,needsCredentials:Boolean(!ctx.isOwner&&!row?.refresh_token_enc),email:credentials.email||null,deviceId:String(row?.device_id||'')||null,authorized:Boolean(row?.refresh_token_enc),lastAuthAt:row?.last_auth_at||null,lastError:row?.last_error||null});}catch(e){return res.status(502).json({success:false,configured:false,emailConfigured:false,authorized:false,message:String(e?.message||e)});}});
app.post('/api/v1011/official-sales/authorize',async(req,res)=>{try{const session=await rdsOfficialRequireSellerV3(req,res);if(!session)return;const ctx=rdsOfficialContextV3(session.seller.id);const email=ctx.isOwner?RDS_OFFICIAL_EMAIL_V3:String(req.body?.email||'').trim();const password=ctx.isOwner?RDS_OFFICIAL_PASSWORD_V3:String(req.body?.password||'');const code=String(req.body?.authorizationCode||'').trim();if(!email||!password)throw new Error('Informe o e-mail e a senha da sua conta oficial.');if(!code)throw new Error('Código de autorização não informado.');if(!ctx.isOwner){await sb('/rest/v1/rds10_seller_settings?on_conflict=seller_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({seller_id:ctx.sellerId,official_email:email,official_authorized:false,updated_at:nowISO()})});}const row=await rdsOfficialEnsureDeviceV3(ctx.sellerId,email);const deviceId=String(row?.device_id||rdsOfficialDeviceStateV3.get(ctx.authId)||'').trim();if(!deviceId)throw new Error('Dispositivo oficial do servidor não identificado.');const r=await fetch(RDS_OFFICIAL_API_V3+'/devices/authorize',{method:'POST',headers:rdsOfficialHeadersV3('',ctx.sellerId),body:JSON.stringify({authorizationCode:code,deviceId,email})});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{};}catch{}if(!r.ok||d?.success===false)throw new Error(d?.message||d?.error||raw||'Código de autorização recusado.');await rdsOfficialLoginV3(ctx.sellerId,{email,password});return res.json({success:true,deviceId,message:'Conta oficial conectada e sessão protegida no servidor.'});}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});
app.get('/api/v1011/official-sales/status',async(req,res)=>{try{const session=await rdsOfficialRequireSellerV3(req,res);if(!session)return;const ctx=rdsOfficialContextV3(session.seller.id);const me=await rdsOfficialRequestV3('/auth/me',{},ctx.sellerId);const row=await rdsOfficialRowV3(ctx.sellerId);return res.json({success:true,configured:true,authenticated:true,owner:ctx.isOwner,seller:me,deviceId:row?.device_id||null,lastAuthAt:row?.last_auth_at||null});}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});
app.get('/api/v1011/official-sales/auto-status',async(req,res)=>{try{const session=await rdsOfficialRequireSellerV3(req,res);if(!session)return;const pending=await list('rds10_orders','select=id,code,status,official_sale_id,official_issue_status,official_issue_error,updated_at&seller_id=eq.'+encodeURIComponent(session.seller.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&order=updated_at.desc&limit=100');return res.json({success:true,pending:(pending||[]),count:(pending||[]).length});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
async function rdsOfficialCompanyIdV3(){
  const ctx=rdsOfficialContextV3();
  if(ctx.companyId)return ctx.companyId;
  if(ctx.isOwner){const c=await one('rds10_companies','select=id&code=eq.RDS');return c?.id||null;}
  const memberships=await list('rds10_seller_companies','select=company_id&seller_id=eq.'+encodeURIComponent(ctx.sellerId)+'&active=eq.true&limit=1000');
  const ids=[...new Set((memberships||[]).map(x=>String(x.company_id||'')).filter(Boolean))];
  return ids.length===1?ids[0]:null;
}
function rdsOfficialDrawMapV3(x,companyId){
  const externalDrawId=String(x?.drawId??x?.id??x?.sorteioId??'').trim();
  if(!externalDrawId)return null;
  const status=String(x?.status??x?.state??'').trim();
  const closed=x?.isDrawClosed===true||x?.closed===true||['CLOSED','ENCERRADO','FECHADO'].includes(status.toUpperCase());
  const active=x?.active===false||x?.isActive===false?false:!closed;
  const rawDate=x?.drawDate??x?.drawAt??x?.date??x?.scheduledAt??null;
  const n=Number(x?.pricePerTicket??x?.ticketPrice??x?.price??NaN);
  const av=Number(x?.availableBooklets??x?.bookletsAvailable??x?.availableTickets??x?.remainingBooklets??x?.remainingTickets??NaN);
  return {company_id:companyId,external_draw_id:externalDrawId,title:String(x?.drawTitle??x?.title??x?.name??'').trim()||null,status:status||null,active,draw_at:rawDate||null,price_per_ticket:Number.isFinite(n)?n:null,available_booklets:Number.isFinite(av)?av:null,public_url:String(x?.publicUrl??x?.publicURL??x?.url??'').trim()||null,raw_data:x,synced_at:nowISO(),updated_at:nowISO()};
}
function rdsOfficialDrawArrayV3(raw){
  const arr=Array.isArray(raw)?raw:(raw?.draws||raw?.items||raw?.booklets||raw?.availableBooklets||raw?.data||[]);
  return Array.isArray(arr)?arr:[];
}
async function rdsOfficialSyncDrawsV3(){
  // O APK oficial consulta "available" e "all". Usamos as duas fontes e
  // consolidamos por drawId para não perder um sorteio liberado ao vendedor.
  const [availableResult,allResult]=await Promise.allSettled([
    rdsOfficialRequestV3('/draws/seller/available'),
    rdsOfficialRequestV3('/draws/seller/all')
  ]);
  const available=availableResult.status==='fulfilled'?rdsOfficialDrawArrayV3(availableResult.value):[];
  const all=allResult.status==='fulfilled'?rdsOfficialDrawArrayV3(allResult.value):[];
  const byId=new Map();
  for(const draw of [...all,...available]){
    const id=String(draw?.drawId??draw?.id??draw?.sorteioId??'').trim();
    if(!id)continue;
    const previous=byId.get(id);
    byId.set(id,{...(previous||{}),...draw});
  }
  if(!byId.size){
    const errors=[availableResult,allResult].filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||x.reason||'')).filter(Boolean);
    throw new Error(errors.join(' | ')||'A API oficial não retornou sorteios.');
  }
  // A API oficial separa o catálogo de sorteios do estoque realmente disponível.
  // /seller/booklet-sales/available é a fonte de inventário em tempo real.
  let inventory=[];
  try{
    const invRaw=await rdsOfficialRequestV3('/seller/booklet-sales/available');
    inventory=rdsOfficialDrawArrayV3(invRaw);
  }catch{}
  const inventoryByDraw=new Map();
  for(const item of inventory){
    const id=String(item?.drawId??item?.draw_id??item?.sorteioId??item?.draw?.drawId??item?.draw?.id??'').trim();
    if(!id)continue;
    const current=inventoryByDraw.get(id)||{count:0,explicit:null};
    const explicit=item?.availableBooklets??item?.bookletsAvailable??item?.availableTickets??item?.remainingBooklets??item?.remainingTickets??item?.available??item?.quantityAvailable??item?.totalBooklets??item?.availableCount??item?.remaining??item?.quantity??item?.count;
    const inventoryCountV3=(value,depth=0)=>{
      if(depth>4||value===null||value===undefined||value==='')return null;
      if(Array.isArray(value))return value.length;
      if(typeof value==='number'&&Number.isFinite(value))return value;
      if(typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value)))return Number(value);
      if(typeof value==='object'){
        for(const k of ['count','total','totalBooklets','availableBooklets','availableTickets','remainingBooklets','remainingTickets','available','quantity','quantityAvailable','availableCount','remaining','data','booklets','items']){
          if(Object.prototype.hasOwnProperty.call(value,k)){
            const n=inventoryCountV3(value[k],depth+1);
            if(Number.isFinite(n))return n;
          }
        }
      }
      return null;
    };
    const rawCount=inventoryCountV3(explicit);
    if(Number.isFinite(rawCount)) current.explicit=rawCount;
    else current.count++;
    inventoryByDraw.set(id,current);
  }
  const companyId=await rdsOfficialCompanyIdV3();
  const mapped=Array.from(byId.entries()).map(([id,x])=>{
    const row=rdsOfficialDrawMapV3(x,companyId);
    if(!row)return null;
    const inv=inventoryByDraw.get(id);
    if(inv) row.available_booklets=Number.isFinite(inv.explicit)?inv.explicit:inv.count;
    return row;
  }).filter(Boolean);
  if(mapped.length){
    await sb('/rest/v1/rds10_official_draws?on_conflict=company_id,external_draw_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(mapped)});
  }
  return mapped;
}
app.post('/api/v1011/official-sales/sync-draws',async(req,res)=>{
  try{
    if(!await rdsOfficialRequireSellerV3(req,res))return;
    const draws=await rdsOfficialSyncDrawsV3();
    return res.json({success:true,count:draws.length,data:draws});
  }catch(e){
    return res.status(502).json({success:false,message:String(e?.message||e)});
  }
});
app.get('/api/v1011/official-sales/draws',async(req,res)=>{
  try{
    if(!await rdsOfficialRequireSellerV3(req,res))return;
    const draws=await rdsOfficialSyncDrawsV3();
    return res.json({success:true,data:draws,source:'official-api:/draws/seller/all'});
  }catch(e){
    try{
      const companyId=await rdsOfficialCompanyIdV3();
      const cached=await list('rds10_official_draws','select=external_draw_id,title,status,active,draw_at,price_per_ticket,available_booklets,public_url,raw_data,synced_at&company_id=eq.'+encodeURIComponent(companyId||'')+'&order=active.desc,draw_at.asc.nullslast');
      if(cached.length)return res.json({success:true,data:cached,source:'cache'});
    }catch{}
    return res.status(502).json({success:false,message:String(e?.message||e)});
  }
});
app.get('/api/v1011/official-sales/draw-info',async(req,res)=>{try{if(!await rdsOfficialRequireSellerV3(req,res))return;return res.json({success:true,data:await rdsOfficialRequestV3('/seller/draw-info')});}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});
function rdsOfficialAvailableBooklets(draw){const raw=draw?.availableBooklets ?? draw?.bookletsAvailable ?? draw?.availableTickets ?? draw?.remainingBooklets ?? draw?.remainingTickets ?? draw?.totalBooklets;return raw===null||raw===undefined||raw===''?null:Number(raw);}
app.post('/api/v1011/official-sales/issue',async(req,res)=>{
  let claimedOrderId=null,saleRequestStarted=false;
  try{
    if(typeof rdsOpSession!=='function')throw new Error('Autenticação de vendedor indisponível.');
    var session=await rdsOfficialRequireSellerV3(req,res);if(!session)return;
    if(typeof rdsSalesChannelEnabled==='function'&&!rdsSalesChannelEnabled())return res.status(503).json({success:false,message:'O canal de vendas está temporariamente pausado para validação.'});
    var b=req.body||{},orderId=String(b.orderId||'').trim();if(!orderId)throw new Error('Pedido do vendedor não informado.');
    var order=await one('rds10_orders','select=id,seller_id,campaign_id,customer_name,phone,contact_phone,quantity,payment_method,status,official_draw_id,official_draw_title,official_draw_at,official_sale_id,official_issue_status,official_ticket_payload,official_ticket_url&id=eq.'+encodeURIComponent(orderId)+'&seller_id=eq.'+encodeURIComponent(session.seller.id));
    if(!order)throw new Error('Pedido não encontrado para este vendedor.');
    // Idempotência: uma venda oficial já concluída nunca deve ser emitida novamente.
    if(['ERRO_RECONCILIAR','CONCLUIDO'].includes(String(order.official_issue_status||'').toUpperCase())&&!order.official_sale_id)throw new Error('O estado da emissão anterior é ambíguo. Confira a venda no sistema oficial antes de tentar emitir novamente.');
    if(order.official_sale_id){
      return res.status(200).json({success:true,alreadyIssued:true,data:order.official_ticket_payload||null,orderId:order.id,sellerId:session.seller.id,drawId:order.official_draw_id||null,officialSaleId:String(order.official_sale_id)});
    }
    if(String(order.official_issue_status||'').toUpperCase()==='EMITINDO')throw new Error('A emissão automática já está em andamento. Aguarde a atualização antes de tentar novamente.');
    var customerName=String(order.customer_name||'').trim(),customerPhone=String(order.phone||order.contact_phone||'').trim(),quantityBooklets=Math.max(1,Math.floor(Number(order.quantity||0)));
    if(customerName.length<2)throw new Error('Nome do cliente inválido.');if(!customerPhone)throw new Error('Telefone do cliente não informado.');if(!quantityBooklets)throw new Error('Quantidade do pedido inválida.');
    var requestedDrawId=String(b.drawId||order.official_draw_id||'').trim(),draw=null;
    if(!requestedDrawId&&order.campaign_id){
      const camp=await one('rds10_campaigns','select=official_draw_id,official_draw_title&id=eq.'+encodeURIComponent(order.campaign_id)).catch(()=>null);
      requestedDrawId=String(camp?.official_draw_id||'').trim();
    }
    if(requestedDrawId){
      var all=await rdsOfficialRequestV3('/draws/seller/all'),arr=Array.isArray(all)?all:(all?.draws||all?.items||all?.data||[]);
      draw=arr.find(x=>String(x?.drawId||x?.id||'')===requestedDrawId)||null;
    }
    if(!draw){
      const all=await rdsOfficialRequestV3('/draws/seller/all');
      const arr=Array.isArray(all)?all:(all?.draws||all?.items||all?.data||[]);
      const active=arr.filter(x=>x?.isDrawClosed!==true&&x?.closed!==true&&x?.active!==false&&x?.isActive!==false);
      if(active.length===1){
        draw=active[0];
      }else if(active.length>1){
        throw new Error('O pedido não está vinculado a um sorteio oficial. Selecione o sorteio na campanha antes de emitir os bilhetes.');
      }else{
        draw=await rdsOfficialRequestV3('/seller/draw-info');
      }
    }
    if(!draw||draw.isDrawClosed===true||draw.closed===true)throw new Error('O sorteio oficial está encerrado ou indisponível.');
    const availableBooklets=rdsOfficialAvailableBooklets(draw);
    if(Number.isFinite(availableBooklets)&&availableBooklets<quantityBooklets)throw new Error('Quantidade solicitada maior que a disponibilidade oficial.');
    var drawId=String(draw.drawId||draw.id||requestedDrawId||'').trim();if(!drawId)throw new Error('ID do sorteio oficial não identificado.');
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{official_draw_id:drawId,official_draw_title:String(draw.drawTitle||draw.title||draw.name||'').trim()||null,official_draw_at:draw.drawDate||draw.drawAt||draw.date||null,official_inventory_available:Number.isFinite(availableBooklets)?availableBooklets:null,official_inventory_checked_at:nowISO()}).catch(()=>{});
    const issueStatus=String(order.official_issue_status||'');
    const claimFilter='id=eq.'+encodeURIComponent(order.id)+'&seller_id=eq.'+encodeURIComponent(session.seller.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES'+(issueStatus?'&official_issue_status=eq.'+encodeURIComponent(issueStatus):'&official_issue_status=is.null');
    const claim=await patch('rds10_orders',claimFilter,{official_issue_status:'EMITINDO',official_issue_error:null,updated_at:nowISO()});
    if(!claim?.length)throw new Error('Outro processo está emitindo este pedido. Atualize a tela e aguarde.');
    claimedOrderId=order.id;
    saleRequestStarted=true;
    var sale=await rdsOfficialRequestV3('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify({drawId,customerName,customerPhone,quantityBooklets,lotNumber:Math.max(1,Math.floor(Number(b.lotNumber||1))),paymentMethod:String(order.payment_method||'pix').trim().toLowerCase()})});
    const saleData=sale?.data||sale||{};
    const saleId=String(saleData?.saleId||saleData?.id||saleData?.sale?.saleId||saleData?.sale?.id||'').trim()||null;
    if(!saleId)throw new Error('Sistema oficial não retornou o identificador da venda. Confira a venda no sistema oficial antes de tentar novamente.');
    const issuePayload=saleData;
    const saved=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&seller_id=eq.'+encodeURIComponent(session.seller.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{
      official_sale_id:saleId,
      official_issue_status:'CONCLUIDO',
      official_issue_at:nowISO(),
      official_issue_error:null,
      official_ticket_payload:issuePayload,
      official_ticket_url:saleData?.publicUrl||saleData?.ticketUrl||saleData?.url||null,
      status:'PAGO_AGUARDANDO_BILHETES',
      updated_at:nowISO()
    });
    if(!saved?.length)throw new Error('Venda oficial retornou, mas o pedido não pôde ser atualizado. Não reemitir sem conferência manual.');
    claimedOrderId=null;
    return res.status(201).json({success:true,data:sale,orderId:order.id,sellerId:session.seller.id,drawId,officialSaleId:saleId});
  }catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}
});
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] autenticação oficial V3 instalada antes do catch-all');
}