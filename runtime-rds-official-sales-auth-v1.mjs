import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OFFICIAL SALES AUTH V1';
if(server.includes(marker)){
  console.log('[RDS] autenticação do sistema oficial de vendas já aplicada');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para integração oficial de vendas.');

const block=String.raw`
${marker}
const RDS_OFFICIAL_API='https://api.reinodasorte.com.br';
const RDS_OFFICIAL_REFRESH_TOKEN=String(process.env.RDS_OFFICIAL_REFRESH_TOKEN||'').trim();
const RDS_OFFICIAL_DEVICE_ID=String(process.env.RDS_OFFICIAL_DEVICE_ID||'').trim();
const RDS_OFFICIAL_ACCESS_TOKEN=String(process.env.RDS_OFFICIAL_ACCESS_TOKEN||'').trim();
let rdsOfficialAccessToken=RDS_OFFICIAL_ACCESS_TOKEN;
let rdsOfficialRefreshToken=RDS_OFFICIAL_REFRESH_TOKEN;
let rdsOfficialRefreshing=null;

function rdsOfficialConfigured(){
  return Boolean(rdsOfficialRefreshToken&&rdsOfficialDeviceId());
}
function rdsOfficialDeviceId(){return RDS_OFFICIAL_DEVICE_ID;}
function rdsOfficialHeaders(token=''){
  return {
    Accept:'application/json',
    'Content-Type':'application/json',
    ...(token?{Authorization:'Bearer '+token}:{}),
    ...(rdsOfficialDeviceId()?{'x-device-id':rdsOfficialDeviceId()}:{}),
  };
}
async function rdsOfficialRefresh(){
  if(!rdsOfficialConfigured())throw new Error('Sistema oficial de vendas não configurado no Render.');
  if(rdsOfficialRefreshing)return rdsOfficialRefreshing;
  rdsOfficialRefreshing=(async()=>{
    const response=await fetch(RDS_OFFICIAL_API+'/auth/refresh',{method:'POST',headers:rdsOfficialHeaders(),body:JSON.stringify({refreshToken:rdsOfficialRefreshToken})});
    const raw=await response.text();
    let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
    if(!response.ok)throw new Error('API oficial /auth/refresh '+response.status+': '+(data?.message||data?.error||raw||'falha de autenticação'));
    const tokens=data?.data||{};
    if(!tokens.accessToken||!tokens.refreshToken)throw new Error('API oficial não retornou os novos tokens de sessão.');
    rdsOfficialAccessToken=String(tokens.accessToken);
    rdsOfficialRefreshToken=String(tokens.refreshToken);
    return rdsOfficialAccessToken;
  })().finally(()=>{rdsOfficialRefreshing=null;});
  return rdsOfficialRefreshing;
}
async function rdsOfficialRequest(endpoint,opt={}){
  if(!rdsOfficialConfigured())throw new Error('Configure RDS_OFFICIAL_REFRESH_TOKEN e RDS_OFFICIAL_DEVICE_ID no Render.');
  let token=rdsOfficialAccessToken||await rdsOfficialRefresh();
  let response=await fetch(RDS_OFFICIAL_API+endpoint,{...opt,headers:{...rdsOfficialHeaders(token),...(opt.headers||{})}});
  if(response.status===401){
    token=await rdsOfficialRefresh();
    response=await fetch(RDS_OFFICIAL_API+endpoint,{...opt,headers:{...rdsOfficialHeaders(token),...(opt.headers||{})}});
  }
  const raw=await response.text();
  let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!response.ok)throw new Error('API oficial '+response.status+': '+(data?.message||data?.error||data?.cause?.[0]?.description||raw||'requisição recusada'));
  return data?.data===undefined?data:data.data;
}

app.get('/api/v1011/official-sales/status',async(req,res)=>{
  try{
    if(!rdsOfficialConfigured())return res.json({configured:false,authenticated:false,message:'Configure RDS_OFFICIAL_REFRESH_TOKEN e RDS_OFFICIAL_DEVICE_ID no Render.'});
    const me=await rdsOfficialRequest('/auth/me');
    return res.json({configured:true,authenticated:true,seller:me||null});
  }catch(e){
    return res.status(502).json({configured:rdsOfficialConfigured(),authenticated:false,message:String(e?.message||e)});
  }
});

app.get('/api/v1011/official-sales/draw-info',async(req,res)=>{
  try{
    const draw=await rdsOfficialRequest('/seller/draw-info');
    return res.json({success:true,data:draw});
  }catch(e){
    return res.status(502).json({success:false,message:String(e?.message||e)});
  }
});

app.post('/api/v1011/official-sales/issue',async(req,res)=>{
  try{
    const body=req.body||{};
    const customerName=String(body.customerName||'').trim();
    const customerPhone=String(body.customerPhone||'').trim();
    const quantityBooklets=Math.max(1,Math.floor(Number(body.quantityBooklets||0)));
    const paymentMethod=String(body.paymentMethod||'pix').trim().toLowerCase();
    const lotNumber=Math.max(1,Math.floor(Number(body.lotNumber||1)));
    if(customerName.length<2)throw new Error('Nome do cliente inválido.');
    if(!customerPhone)throw new Error('Telefone do cliente não informado.');
    if(!Number.isFinite(quantityBooklets)||quantityBooklets<1)throw new Error('Quantidade de bilhetes inválida.');
    const draw=await rdsOfficialRequest('/seller/draw-info');
    if(!draw||draw.isDrawClosed)throw new Error('O sorteio oficial está encerrado ou indisponível.');
    if(Number(draw.totalBooklets||0)<quantityBooklets)throw new Error('Quantidade solicitada maior que a disponibilidade oficial.');
    const payload={drawId:draw.drawId,customerName,customerPhone,quantityBooklets,lotNumber,paymentMethod};
    const sale=await rdsOfficialRequest('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify(payload)});
    return res.status(201).json({success:true,data:sale});
  }catch(e){
    return res.status(502).json({success:false,message:String(e?.message||e)});
  }
});

console.log('[RDS] integração de autenticação do sistema oficial de vendas V1 instalada');
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] integração de autenticação do sistema oficial de vendas instalada');
