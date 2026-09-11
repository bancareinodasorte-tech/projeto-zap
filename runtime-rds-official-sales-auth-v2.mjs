import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OFFICIAL SALES AUTH V2';
if(server.includes(marker)){
  console.log('[RDS] autenticação própria do sistema oficial V2 já aplicada');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para autenticação oficial V2.');

const block=String.raw`
${marker}
const RDS_OFFICIAL_API_V2='https://api.reinodasorte.com.br';
const RDS_OFFICIAL_KEY_V2=String(process.env.RDS_OFFICIAL_AUTH_ENCRYPTION_KEY||'').trim();
const RDS_OFFICIAL_EMAIL_V2=String(process.env.RDS_OFFICIAL_EMAIL||'').trim();
const RDS_OFFICIAL_PASSWORD_V2=String(process.env.RDS_OFFICIAL_PASSWORD||'').trim();
let rdsOfficialAccessTokenV2='';
let rdsOfficialRefreshTokenV2='';
let rdsOfficialDeviceIdV2='';
let rdsOfficialRefreshingV2=null;

function rdsOfficialKeyV2(){
  if(!RDS_OFFICIAL_KEY_V2)throw new Error('Autenticação oficial V2 sem chave de proteção no Render.');
  const b=Buffer.from(RDS_OFFICIAL_KEY_V2,'base64');
  if(b.length!==32)throw new Error('Chave de proteção oficial V2 inválida.');
  return b;
}
function rdsOfficialEncryptV2(value){
  const iv=crypto.randomBytes(12), key=rdsOfficialKeyV2();
  const c=crypto.createCipheriv('aes-256-gcm',key,iv);
  const enc=Buffer.concat([c.update(String(value),'utf8'),c.final()]);
  return [iv.toString('base64'),c.getAuthTag().toString('base64'),enc.toString('base64')].join('.');
}
function rdsOfficialDecryptV2(value){
  const [ivS,tagS,dataS]=String(value||'').split('.');
  if(!ivS||!tagS||!dataS)throw new Error('Sessão oficial protegida inválida.');
  const d=crypto.createDecipheriv('aes-256-gcm',rdsOfficialKeyV2(),Buffer.from(ivS,'base64'));
  d.setAuthTag(Buffer.from(tagS,'base64'));
  return Buffer.concat([d.update(Buffer.from(dataS,'base64')),d.final()]).toString('utf8');
}
async function rdsOfficialAuthRowV2(){return one('rds10_official_sales_auth','select=id,email,device_id,refresh_token_enc,last_auth_at,last_error&id=eq.main');}
async function rdsOfficialEnsureDeviceV2(){
  let row=await rdsOfficialAuthRowV2();
  if(row?.device_id){rdsOfficialDeviceIdV2=String(row.device_id);return row;}
  const device='rds_server_'+crypto.randomBytes(12).toString('hex');
  await sb('/rest/v1/rds10_official_sales_auth?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:'main',device_id:device,email:RDS_OFFICIAL_EMAIL_V2||null,updated_at:nowISO()})});
  rdsOfficialDeviceIdV2=device;
  return await rdsOfficialAuthRowV2();
}
function rdsOfficialHeadersV2(token=''){
  return {Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(rdsOfficialDeviceIdV2?{'x-device-id':rdsOfficialDeviceIdV2}:{})};
}
async function rdsOfficialLoginV2(){
  if(!RDS_OFFICIAL_EMAIL_V2||!RDS_OFFICIAL_PASSWORD_V2)throw new Error('Credenciais do vendedor oficial ainda não configuradas no Render.');
  await rdsOfficialEnsureDeviceV2();
  const response=await fetch(RDS_OFFICIAL_API_V2+'/auth/login',{method:'POST',headers:rdsOfficialHeadersV2(),body:JSON.stringify({email:RDS_OFFICIAL_EMAIL_V2,password:RDS_OFFICIAL_PASSWORD_V2,deviceId:rdsOfficialDeviceIdV2})});
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!response.ok)throw new Error('Login oficial '+response.status+': '+(data?.message||data?.error||raw||'falha de login'));
  const tokens=data?.data||{};
  if(!tokens.accessToken||!tokens.refreshToken)throw new Error('Login oficial não retornou tokens de sessão.');
  rdsOfficialAccessTokenV2=String(tokens.accessToken);rdsOfficialRefreshTokenV2=String(tokens.refreshToken);
  await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({email:RDS_OFFICIAL_EMAIL_V2,device_id:rdsOfficialDeviceIdV2,refresh_token_enc:rdsOfficialEncryptV2(rdsOfficialRefreshTokenV2),last_auth_at:nowISO(),last_error:null,updated_at:nowISO()})});
  return rdsOfficialAccessTokenV2;
}
async function rdsOfficialRefreshV2(){
  if(rdsOfficialRefreshingV2)return rdsOfficialRefreshingV2;
  rdsOfficialRefreshingV2=(async()=>{
    const row=await rdsOfficialEnsureDeviceV2();
    if(!row?.refresh_token_enc)throw new Error('Sessão oficial ainda não autorizada neste servidor.');
    rdsOfficialRefreshTokenV2=rdsOfficialDecryptV2(row.refresh_token_enc);
    const response=await fetch(RDS_OFFICIAL_API_V2+'/auth/refresh',{method:'POST',headers:rdsOfficialHeadersV2(),body:JSON.stringify({refreshToken:rdsOfficialRefreshTokenV2})});
    const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
    if(!response.ok){
      await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({last_error:(data?.message||data?.error||raw||'refresh recusado').slice(0,500),updated_at:nowISO()})}).catch(()=>{});
      throw new Error('Refresh oficial '+response.status+': '+(data?.message||data?.error||raw||'sessão recusada'));
    }
    const tokens=data?.data||{};
    if(!tokens.accessToken||!tokens.refreshToken)throw new Error('Refresh oficial não retornou novos tokens.');
    rdsOfficialAccessTokenV2=String(tokens.accessToken);rdsOfficialRefreshTokenV2=String(tokens.refreshToken);
    await sb('/rest/v1/rds10_official_sales_auth?id=eq.main',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({refresh_token_enc:rdsOfficialEncryptV2(rdsOfficialRefreshTokenV2),last_auth_at:nowISO(),last_error:null,updated_at:nowISO()})});
    return rdsOfficialAccessTokenV2;
  })().finally(()=>{rdsOfficialRefreshingV2=null;});
  return rdsOfficialRefreshingV2;
}
async function rdsOfficialRequestV2(endpoint,opt={}){
  await rdsOfficialEnsureDeviceV2();
  let token=rdsOfficialAccessTokenV2;
  if(!token){try{token=await rdsOfficialRefreshV2();}catch(e){if(!RDS_OFFICIAL_EMAIL_V2||!RDS_OFFICIAL_PASSWORD_V2)throw e;token=await rdsOfficialLoginV2();}}
  let response=await fetch(RDS_OFFICIAL_API_V2+endpoint,{...opt,headers:{...rdsOfficialHeadersV2(token),...(opt.headers||{})}});
  if(response.status===401){token=await rdsOfficialRefreshV2();response=await fetch(RDS_OFFICIAL_API_V2+endpoint,{...opt,headers:{...rdsOfficialHeadersV2(token),...(opt.headers||{})}});}
  const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!response.ok)throw new Error('API oficial '+response.status+': '+(data?.message||data?.error||data?.cause?.[0]?.description||raw||'requisição recusada'));
  return data?.data===undefined?data:data.data;
}

app.get('/api/v1011/official-sales/bootstrap',async(req,res)=>{
  try{const row=await rdsOfficialEnsureDeviceV2();return res.json({configured:Boolean(RDS_OFFICIAL_EMAIL_V2&&RDS_OFFICIAL_PASSWORD_V2),deviceId:rdsOfficialDeviceIdV2,authorized:Boolean(row?.refresh_token_enc),emailConfigured:Boolean(RDS_OFFICIAL_EMAIL_V2),diagnostics:{emailPresent:Boolean(RDS_OFFICIAL_EMAIL_V2),passwordPresent:Boolean(RDS_OFFICIAL_PASSWORD_V2),keyPresent:Boolean(RDS_OFFICIAL_KEY_V2),deviceRowPresent:Boolean(row?.device_id)}});}catch(e){return res.status(502).json({configured:false,authorized:false,message:String(e?.message||e)});}
});
app.post('/api/v1011/official-sales/authorize',async(req,res)=>{
  try{
    if(!RDS_OFFICIAL_EMAIL_V2||!RDS_OFFICIAL_PASSWORD_V2)throw new Error('Configure RDS_OFFICIAL_EMAIL e RDS_OFFICIAL_PASSWORD no Render antes da autorização.');
    await rdsOfficialEnsureDeviceV2();
    const authorizationCode=String(req.body?.authorizationCode||'').trim();
    if(!authorizationCode)throw new Error('Código de autorização não informado.');
    const response=await fetch(RDS_OFFICIAL_API_V2+'/devices/authorize',{method:'POST',headers:rdsOfficialHeadersV2(),body:JSON.stringify({authorizationCode,deviceId:rdsOfficialDeviceIdV2,email:RDS_OFFICIAL_EMAIL_V2})});
    const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
    if(!response.ok||data?.success===false)throw new Error(data?.message||data?.error||raw||'Código de autorização recusado.');
    await rdsOfficialLoginV2();
    return res.json({success:true,deviceId:rdsOfficialDeviceIdV2,message:'Servidor autorizado e sessão oficial persistida com segurança.'});
  }catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}
});

app.get('/api/v1011/official-sales/status',async(req,res)=>{
  try{
    await rdsOfficialEnsureDeviceV2();
    const me=await rdsOfficialRequestV2('/auth/me');
    return res.json({configured:true,authenticated:true,seller:me||null,deviceId:rdsOfficialDeviceIdV2});
  }catch(e){
    const row=await rdsOfficialAuthRowV2().catch(()=>null);
    return res.status(502).json({configured:Boolean(RDS_OFFICIAL_EMAIL_V2&&RDS_OFFICIAL_PASSWORD_V2),authenticated:false,authorized:Boolean(row?.refresh_token_enc),deviceId:rdsOfficialDeviceIdV2||row?.device_id||null,message:String(e?.message||e)});
  }
});

app.get('/api/v1011/official-sales/draw-info',async(req,res)=>{try{const draw=await rdsOfficialRequestV2('/seller/draw-info');return res.json({success:true,data:draw});}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});
app.post('/api/v1011/official-sales/issue',async(req,res)=>{try{
  const body=req.body||{},customerName=String(body.customerName||'').trim(),customerPhone=String(body.customerPhone||'').trim(),quantityBooklets=Math.max(1,Math.floor(Number(body.quantityBooklets||0))),paymentMethod=String(body.paymentMethod||'pix').trim().toLowerCase(),lotNumber=Math.max(1,Math.floor(Number(body.lotNumber||1)));
  if(customerName.length<2)throw new Error('Nome do cliente inválido.');if(!customerPhone)throw new Error('Telefone do cliente não informado.');if(!Number.isFinite(quantityBooklets)||quantityBooklets<1)throw new Error('Quantidade de bilhetes inválida.');
  const draw=await rdsOfficialRequestV2('/seller/draw-info');if(!draw||draw.isDrawClosed)throw new Error('O sorteio oficial está encerrado ou indisponível.');if(Number(draw.totalBooklets||0)<quantityBooklets)throw new Error('Quantidade solicitada maior que a disponibilidade oficial.');
  const sale=await rdsOfficialRequestV2('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify({drawId:draw.drawId,customerName,customerPhone,quantityBooklets,lotNumber,paymentMethod})});
  return res.status(201).json({success:true,data:sale});
}catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}});

console.log('[RDS] autenticação própria persistente do sistema oficial V2 instalada');
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] autenticação própria persistente do sistema oficial V2 instalada');