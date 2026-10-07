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
var rdsOfficialAccessV3='';
var rdsOfficialDeviceStateV3='';
function rdsOfficialKeyV3(){if(!RDS_OFFICIAL_KEY_V3)throw new Error('Chave de proteção oficial não configurada.');var b=Buffer.from(RDS_OFFICIAL_KEY_V3,'base64');if(b.length!==32)throw new Error('Chave de proteção oficial inválida.');return b;}
function rdsOfficialEncV3(v){var iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',rdsOfficialKeyV3(),iv);var d=Buffer.concat([c.update(String(v),'utf8'),c.final()]);return iv.toString('base64')+'.'+c.getAuthTag().toString('base64')+'.'+d.toString('base64');}
function rdsOfficialDecV3(v){var parts=String(v||'').split('.'),i=parts[0],t=parts[1],d=parts[2];if(!i||!t||!d)throw new Error('Sessão oficial protegida inválida.');var c=crypto.createDecipheriv('aes-256-gcm',rdsOfficialKeyV3(),Buffer.from(i,'base64'));c.setAuthTag(Buffer.from(t,'base64'));return Buffer.concat([c.update(Buffer.from(d,'base64')),c.final()]).toString('utf8');}
async function rdsOfficialRowV3(){return one('rds10_official_sales_auth','select=id,email,device_id,refresh_token_enc,last_auth_at,last_error&id=eq.main');}
async function rdsOfficialEnsureDeviceV3(){var row=await rdsOfficialRowV3();if(row?.device_id){rdsOfficialDeviceStateV3=String(row.device_id);return row;}var device='rds_server_'+crypto.randomBytes(12).toString('hex');await sb('/rest/v1/rds10_official_sales_auth?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'main',device_id:device,email:RDS_OFFICIAL_EMAIL_V3||null,updated_at:nowISO()})});rdsOfficialDeviceStateV3=device;return await rdsOfficialRowV3();}
function rdsOfficialHeadersV3(token){return {Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(rdsOfficialDeviceStateV3?{'x-device-id':rdsOfficialDeviceStateV3}:{})};}
async function rdsOfficialLoginV3(){if(!RDS_OFFICIAL_EMAIL_V3||!RDS_OFFICIAL_PASSWORD_V3)throw new Error('Credenciais do vendedor oficial ainda não configuradas no Render.');var row=await rdsOfficialEnsureDeviceV3();var deviceId=String(row?.device_id||rdsOfficialDeviceStateV3||'').trim();if(!deviceId)throw new Error('Dispositivo oficial do servidor não identificado.');var r=await fetch(RDS_OFFICIAL_API_V3+'/auth/login',{method:'POST',headers:rdsOfficialHeadersV3(''),body:JSON.stringify({email:RDS_OFFICIAL_EMAIL_V3,password:RDS_OFFICIAL_PASSWORD_V3,deviceId})});var raw=await r.text(),d={};try{d=raw?JSON.parse(raw):{};}catch{}if(!r.ok||d?.success===false)throw new Error(d?.message||d?.error||raw||'Login oficial recusado.');var x=d?.data||{};if(!x.accessToken||!x.refreshToken)throw new Error('Login oficial não retornou sessão.');rdsOfficialAccessV3=String(x.accessToken);await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({email:RDS_OFFICIAL_EMAIL_V3,device_id,refresh_token_enc:rdsOfficialEncV3(x.refreshToken),last_auth_at:nowISO(),last_error:null,updated_at:nowISO()})});return rdsOfficialAccessV3;}
async function rdsOfficialRequestV3(endpoint,opt){
  opt=opt||{};
  var row=await rdsOfficialEnsureDeviceV3();
  var token=rdsOfficialAccessV3;
  if(!token&&row?.refresh_token_enc){
    try{
      var refresh=rdsOfficialDecV3(row.refresh_token_enc);
      var rr=await fetch(RDS_OFFICIAL_API_V3+'/auth/refresh',{
        method:'POST',
        headers:rdsOfficialHeadersV3(''),
        body:JSON.stringify({refreshToken:refresh,deviceId:String(row?.device_id||rdsOfficialDeviceStateV3||'').trim()})
      });
      var raw=await rr.text(),d={};
      try{d=raw?JSON.parse(raw):{};}catch{}
      if(rr.ok&&d?.data?.accessToken){
        token=String(d.data.accessToken);
        rdsOfficialAccessV3=token;
        if(d?.data?.refreshToken){
          await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{
            method:'PATCH',
            headers:{Prefer:'return=minimal'},
            body:JSON.stringify({
              refresh_token_enc:rdsOfficialEncV3(d.data.refreshToken),
              last_auth_at:nowISO(),
              last_error:null,
              updated_at:nowISO()
            })
          });
        }
      }else{
        try{
          await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{
            method:'PATCH',
            headers:{Prefer:'return=minimal'},
            body:JSON.stringify({
              last_error:'REFRESH_REJECTED: '+String(rr.status)+' '+String(d?.message||d?.error||raw||'sem resposta').slice(0,500),
              updated_at:nowISO()
            })
          });
        }catch{}
      }
    }catch(refreshErr){
      try{
        await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{
          method:'PATCH',
          headers:{Prefer:'return=minimal'},
          body:JSON.stringify({
            last_error:'REFRESH_FAILED: '+String(refreshErr?.message||refreshErr).slice(0,500),
            updated_at:nowISO()
          })
        });
      }catch{}
    }
  }
  if(!token)token=await rdsOfficialLoginV3();
  var r=await fetch(RDS_OFFICIAL_API_V3+endpoint,{
    ...opt,
    headers:{...rdsOfficialHeadersV3(token),...(opt.headers||{})}
  });
  if(r.status===401){
    token=await rdsOfficialLoginV3();
    r=await fetch(RDS_OFFICIAL_API_V3+endpoint,{
      ...opt,
      headers:{...rdsOfficialHeadersV3(token),...(opt.headers||{})}
    });
  }
  var raw2=await r.text(),d2={};
  try{d2=raw2?JSON.parse(raw2):{};}catch{}
  if(!r.ok||d2?.success===false)throw new Error(d2?.message||d2?.error||raw2||'API oficial recusou a operação.');
  return d2?.data===undefined?d2:d2.data;
}
app.get('/api/v1011/official-sales/bootstrap',async(req,res)=>{try{var row=await rdsOfficialEnsureDeviceV3();var deviceId=String(row?.device_id||rdsOfficialDeviceStateV3||'').trim()||null;return res.json({configured:Boolean(RDS_OFFICIAL_EMAIL_V3&&RDS_OFFICIAL_PASSWORD_V3),emailConfigured:Boolean(RDS_OFFICIAL_EMAIL_V3),passwordConfigured:Boolean(RDS_OFFICIAL_PASSWORD_V3),deviceId,authorized:Boolean(row?.refresh_token_enc),lastAuthAt:row?.last_auth_at||null});}catch(e){return res.status(502).json({configured:false,emailConfigured:false,authorized:false,deviceId:null,message:String(e?.message||e)});}});
app.post('/api/v1011/official-sales/authorize',async(req,res)=>{try{if(!RDS_OFFICIAL_EMAIL_V3||!RDS_OFFICIAL_PASSWORD_V3)throw new Error('Credenciais do vendedor oficial ainda não configuradas no Render.');var row=await rdsOfficialEnsureDeviceV3();var deviceId=String(row?.device_id||rdsOfficialDeviceStateV3||'').trim();if(!deviceId)throw new Error('Dispositivo oficial do servidor não identificado.');var code=String(req.body?.authorizationCode||'').trim();if(!code)throw new Error('Código de autorização não informado.');var r=await fetch(RDS_OFFICIAL_API_V3+'/devices/authorize',{method:'POST',headers:rdsOfficialHeadersV3(''),body:JSON.stringify({authorizationCode:code,deviceId:deviceId,email:RDS_OFFICIAL_EMAIL_V3})}),raw=await r.text(),d={};try{d=raw?JSON.parse(raw):{};}catch{}if(!r.ok||d?.success===false)throw new Error(d?.message||d?.error||raw||'Código de autorização recusado.');await rdsOfficialLoginV3();return res.json({success:true,deviceId,message:'Servidor autorizado e sessão oficial persistida com segurança.'});}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});
app.get('/api/v1011/official-sales/status',async(req,res)=>{try{var row=await rdsOfficialEnsureDeviceV3();var me=await rdsOfficialRequestV3('/auth/me');return res.json({configured:true,authenticated:true,seller:me||null,deviceId:String(row?.device_id||rdsOfficialDeviceStateV3||'').trim()||null});}catch(e){var row=await rdsOfficialRowV3().catch(()=>null);return res.status(502).json({configured:Boolean(RDS_OFFICIAL_EMAIL_V3&&RDS_OFFICIAL_PASSWORD_V3),authenticated:false,authorized:Boolean(row?.refresh_token_enc),deviceId:String(row?.device_id||rdsOfficialDeviceStateV3||'').trim()||null,message:String(e?.message||e)});}});
async function rdsOfficialCompanyIdV3(){
  const c=await one('rds10_companies','select=id&code=eq.RDS');
  return c?.id||null;
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
    const explicit=item?.availableBooklets??item?.bookletsAvailable??item?.availableTickets??item?.remainingBooklets??item?.remainingTickets??item?.available??item?.quantityAvailable;
    const rawCount=Array.isArray(explicit)?explicit.length:(explicit?.length!=null?Number(explicit.length):Number(explicit));
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
    if(typeof rdsOpSession==='function'&&!await rdsOpSession(req))return res.status(401).json({success:false,message:'Sessão do vendedor inválida ou expirada.'});
    const draws=await rdsOfficialSyncDrawsV3();
    return res.json({success:true,count:draws.length,data:draws});
  }catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}
});
app.get('/api/v1011/official-sales/draws',async(req,res)=>{
  try{
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
app.get('/api/v1011/official-sales/draw-info',async(req,res)=>{try{return res.json({success:true,data:await rdsOfficialRequestV3('/seller/draw-info')});}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});
function rdsOfficialAvailableBooklets(draw){const raw=draw?.availableBooklets ?? draw?.bookletsAvailable ?? draw?.availableTickets ?? draw?.remainingBooklets ?? draw?.remainingTickets ?? draw?.totalBooklets;return raw===null||raw===undefined||raw===''?null:Number(raw);}
app.post('/api/v1011/official-sales/issue',async(req,res)=>{
  try{
    if(typeof rdsOpSession!=='function')throw new Error('Autenticação de vendedor indisponível.');
    var session=await rdsOpSession(req);if(!session)throw new Error('Sessão do vendedor inválida ou expirada.');
    var b=req.body||{},orderId=String(b.orderId||'').trim();if(!orderId)throw new Error('Pedido do vendedor não informado.');
    var order=await one('rds10_orders','select=id,seller_id,campaign_id,customer_name,phone,contact_phone,quantity,payment_method,status,official_draw_id,official_draw_title,official_draw_at& id=eq.'+encodeURIComponent(orderId)+'&seller_id=eq.'+encodeURIComponent(session.seller.id));
    if(!order)throw new Error('Pedido não encontrado para este vendedor.');
    var customerName=String(order.customer_name||'').trim(),customerPhone=String(order.phone||order.contact_phone||'').trim(),quantityBooklets=Math.max(1,Math.floor(Number(order.quantity||0)));
    if(customerName.length<2)throw new Error('Nome do cliente inválido.');if(!customerPhone)throw new Error('Telefone do cliente não informado.');if(!quantityBooklets)throw new Error('Quantidade do pedido inválida.');
    var requestedDrawId=String(b.drawId||order.official_draw_id||'').trim(),draw=null;
    if(!requestedDrawId&&order.campaign_id){
      const camp=await one('rds10_campaigns','select=official_draw_id,official_draw_title& id=eq.'+encodeURIComponent(order.campaign_id)).catch(()=>null);
      requestedDrawId=String(camp?.official_draw_id||'').trim();
    }
    if(requestedDrawId){
      var all=await rdsOfficialRequestV3('/draws/seller/all'),arr=Array.isArray(all)?all:(all?.draws||all?.items||all?.data||[]);
      draw=arr.find(x=>String(x?.drawId||x?.id||'')===requestedDrawId)||null;
    }
    if(!draw)draw=await rdsOfficialRequestV3('/seller/draw-info');
    if(!draw||draw.isDrawClosed===true||draw.closed===true)throw new Error('O sorteio oficial está encerrado ou indisponível.');
    const availableBooklets=rdsOfficialAvailableBooklets(draw);
    if(Number.isFinite(availableBooklets)&&availableBooklets<quantityBooklets)throw new Error('Quantidade solicitada maior que a disponibilidade oficial.');
    var drawId=String(draw.drawId||draw.id||requestedDrawId||'').trim();if(!drawId)throw new Error('ID do sorteio oficial não identificado.');
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{official_draw_id:drawId,official_draw_title:String(draw.drawTitle||draw.title||draw.name||'').trim()||null,official_draw_at:draw.drawDate||draw.drawAt||draw.date||null,official_inventory_available:Number.isFinite(availableBooklets)?availableBooklets:null,official_inventory_checked_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
    var sale=await rdsOfficialRequestV3('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify({drawId,customerName,customerPhone,quantityBooklets,lotNumber:Math.max(1,Math.floor(Number(b.lotNumber||1))),paymentMethod:String(order.payment_method||'pix').trim().toLowerCase()})});
    return res.status(201).json({success:true,data:sale,orderId:order.id,sellerId:session.seller.id,drawId});
  }catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}
});
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] autenticação oficial V3 instalada antes do catch-all');
}