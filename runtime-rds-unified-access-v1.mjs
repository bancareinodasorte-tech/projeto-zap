import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS UNIFIED ACCESS V1';
if(server.includes(marker)){console.log('[RDS] acesso unificado V1 já aplicado');process.exit(0);}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para acesso unificado.');
const block=String.raw`
 // RDS UNIFIED ACCESS V1
async function rdsUnifiedContext(req){
  let seller=null,admin=null;
  try{seller=await rdsOpSession(req);}catch{}
  if(seller)return {authenticated:true,role:'VENDEDOR',seller:rdsOpPublic(seller.seller),admin:null};
  try{admin=await rdsAdminSession(req);}catch{}
  if(admin)return {authenticated:true,role:'ADMINISTRADOR',seller:null,admin:rdsAdminPublic(admin.admin)};
  return {authenticated:false,role:null,seller:null,admin:null};
}
app.get('/api/rds/unified/context',async(req,res)=>{
  try{return res.json({success:true,...await rdsUnifiedContext(req)});}
  catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/rds/unified/login',async(req,res)=>{
  try{
    const identifier=cleanText(req.body?.identifier||''),password=String(req.body?.password||'');
    if(!identifier||!password)throw new Error('Informe telefone/e-mail e senha.');
    try{const t=rdsOpBearer(req)||rdsOpCookie(req);if(t)await patch('rds10_seller_sessions','token_hash=eq.'+encodeURIComponent(rdsOpTHash(t)),{revoked_at:nowISO()}).catch(()=>{});}catch{}
    try{const t=rdsAdminBearer(req)||rdsAdminCookie(req);if(t)await patch('rds10_admin_sessions','token_hash=eq.'+encodeURIComponent(rdsAdminHash(t)),{revoked_at:nowISO()}).catch(()=>{});}catch{}
    if(identifier.includes('@')){
      const email=identifier.toLowerCase();
      let a=await rdsAdminFind(email);
      if(!a&&email===RDS_ADMIN_EMAIL)a=await rdsAdminEnsure();
      if(!a)throw new Error('E-mail ou senha inválidos.');
      const h=rdsOpHash(password,a.password_salt),b=String(a.password_hash||'');
      if(h.length!==b.length||!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(b,'hex')))throw new Error('E-mail ou senha inválidos.');
      const t=rdsAdminToken(),exp=new Date(Date.now()+RDS_ADMIN_SESSION_DAYS*86400000).toISOString();
      await insert('rds10_admin_sessions',{admin_id:a.id,token_hash:rdsAdminHash(t),device_id:cleanText(req.headers['x-rds-device-id'])||null,created_at:nowISO(),last_seen_at:nowISO(),expires_at:exp});
      rdsAdminSetCookie(res,t);
      return res.json({success:true,role:'ADMINISTRADOR',token:t,admin:rdsAdminPublic(a),session:{expiresAt:exp}});
    }
    const phone=normalizeBR(identifier);
    if(!validBRPhone(phone))throw new Error('Informe um telefone válido ou um e-mail administrativo.');
    const s=await one('rds10_sellers','select=*&phone=eq.'+encodeURIComponent(phone));
    if(!s)throw new Error('Cadastro não encontrado.');
    if(s.status==='PENDENTE')throw new Error('Cadastro aguardando aprovação.');
    if(s.status==='BLOQUEADO')throw new Error('Conta bloqueada pelo administrador.');
    const h=rdsOpHash(password,s.password_salt),b=String(s.password_hash||'');
    if(h.length!==b.length||!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(b,'hex')))throw new Error('Telefone ou senha inválidos.');
    const t=rdsOpToken(),exp=new Date(Date.now()+RDS_OPERATOR_SESSION_DAYS*86400000).toISOString();
    const deviceId=cleanText(req.body?.deviceId||req.headers['x-rds-device-id']),platform=rdsOpPlatform(req,req.body?.platform);
    await insert('rds10_seller_sessions',{seller_id:s.id,token_hash:rdsOpTHash(t),platform,device_id:deviceId||null,created_at:nowISO(),last_seen_at:nowISO(),expires_at:exp});
    if(deviceId){
      const d=await one('rds10_seller_devices','select=id&seller_id=eq.'+s.id+'&device_id=eq.'+encodeURIComponent(deviceId));
      if(d)await patch('rds10_seller_devices','id=eq.'+d.id,{status:'ATIVO',platform,last_seen_at:nowISO(),updated_at:nowISO()});
      else await insert('rds10_seller_devices',{seller_id:s.id,device_id:deviceId,platform,status:'ATIVO',first_seen_at:nowISO(),last_seen_at:nowISO(),authorized_at:nowISO(),created_at:nowISO(),updated_at:nowISO()});
    }
    await patch('rds10_sellers','id=eq.'+s.id,{last_login_at:nowISO(),updated_at:nowISO()});
    rdsOpSetCookie(res,t);
    return res.json({success:true,role:'VENDEDOR',token:t,seller:rdsOpPublic(s),session:{expiresAt:exp,platform,deviceId:deviceId||null}});
  }catch(e){return res.status(401).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/rds/unified/logout',async(req,res)=>{
  try{
    const st=rdsOpBearer(req)||rdsOpCookie(req);if(st)await patch('rds10_seller_sessions','token_hash=eq.'+encodeURIComponent(rdsOpTHash(st)),{revoked_at:nowISO()}).catch(()=>{});
    const at=rdsAdminBearer(req)||rdsAdminCookie(req);if(at)await patch('rds10_admin_sessions','token_hash=eq.'+encodeURIComponent(rdsAdminHash(at)),{revoked_at:nowISO()}).catch(()=>{});
    rdsOpClearCookie(res);rdsAdminClearCookie(res);
    return res.json({success:true});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
console.log('[RDS] acesso unificado V1 instalado');
`;
server=server.slice(0,pos)+block+'\\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] acesso unificado V1 instalado');
