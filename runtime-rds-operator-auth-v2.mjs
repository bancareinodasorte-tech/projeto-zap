import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OPERATOR AUTH V2';
if(server.includes(marker)){console.log('[RDS] operador V2 já aplicado');process.exit(0);}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);if(pos<0)throw new Error('catch-all não localizado para operador.');
const block=String.raw`
${marker}
const RDS_OPERATOR_SESSION_DAYS=Math.max(1,Math.min(90,Number(process.env.RDS_OPERATOR_SESSION_DAYS||30)));
const RDS_OPERATOR_ADMIN_PASSWORD=String(process.env.RDS_OPERATOR_ADMIN_PASSWORD||'').trim();
const RDS_OPERATOR_CREDENTIALS_KEY=String(process.env.RDS_OPERATOR_CREDENTIALS_KEY||'').trim();
function rdsOpHash(p,s){return crypto.scryptSync(String(p),Buffer.from(String(s),'hex'),32).toString('hex');}
function rdsOpNewHash(p){const s=crypto.randomBytes(16).toString('hex');return {salt:s,hash:rdsOpHash(p,s)};}
function rdsOpToken(){return crypto.randomBytes(32).toString('base64url');}
function rdsOpTHash(t){return crypto.createHash('sha256').update(String(t)).digest('hex');}
function rdsOpKey(){if(!RDS_OPERATOR_CREDENTIALS_KEY)throw new Error('Chave de proteção dos dados do operador não configurada.');const b=Buffer.from(RDS_OPERATOR_CREDENTIALS_KEY,'base64');if(b.length!==32)throw new Error('Chave de proteção dos dados do operador inválida.');return b;}
function rdsOpEnc(v){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',rdsOpKey(),iv);const d=Buffer.concat([c.update(String(v),'utf8'),c.final()]);return iv.toString('base64')+'.'+c.getAuthTag().toString('base64')+'.'+d.toString('base64');}
function rdsOpCookie(req){const m=String(req.headers.cookie||'').match(/(?:^|;\\s*)rds_operator_session=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
function rdsOpBearer(req){const h=String(req.headers.authorization||'');return /^Bearer\\s+/i.test(h)?h.replace(/^Bearer\\s+/i,'').trim():'';}
function rdsOpSetCookie(res,t){res.setHeader('Set-Cookie','rds_operator_session='+encodeURIComponent(t)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+String(RDS_OPERATOR_SESSION_DAYS*86400)+(process.env.NODE_ENV==='production'?'; Secure':''));}
function rdsOpClearCookie(res){res.setHeader('Set-Cookie','rds_operator_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));}
async function rdsOpSession(req){
  const t=rdsOpBearer(req)||rdsOpCookie(req);if(!t)return null;
  const h=rdsOpTHash(t);
  const ss=await one('rds10_seller_sessions','select=id,seller_id,expires_at,device_id,platform&token_hash=eq.'+encodeURIComponent(h)+'&revoked_at=is.null');
  if(!ss||new Date(ss.expires_at).getTime()<=Date.now())return null;
  const seller=await one('rds10_sellers','select=id,name,phone,email,status,role,verified_at,approved_at,blocked_at,last_login_at,created_at&id=eq.'+encodeURIComponent(ss.seller_id));
  if(!seller||seller.status!=='ATIVO')return null;
  if(ss.device_id){const device=await one('rds10_seller_devices','select=id,status,platform,device_id&seller_id=eq.'+encodeURIComponent(seller.id)+'&device_id=eq.'+encodeURIComponent(ss.device_id));if(!device||device.status!=='ATIVO')return null;}
  return {token:t,session:ss,seller};
}
async function rdsOpRequire(req,res){const s=await rdsOpSession(req);if(!s){res.status(401).json({success:false,error:'Sessão inválida, expirada ou bloqueada.'});return null;}return s;}
function rdsOpAdmin(req){return Boolean(RDS_OPERATOR_ADMIN_PASSWORD)&&String(req.headers['x-rds-admin-password']||'')===RDS_OPERATOR_ADMIN_PASSWORD;}
function rdsOpPublic(s){return {id:s.id,name:s.name,phone:s.phone,email:s.email||null,status:s.status,role:s.role||'VENDEDOR',verifiedAt:s.verified_at||null,approvedAt:s.approved_at||null,blockedAt:s.blocked_at||null,lastLoginAt:s.last_login_at||null,createdAt:s.created_at};}
function rdsOpPlatform(req,requested){
  const p=cleanText(requested||'').toLowerCase();
  if(p==='app')return 'app';
  const ua=String(req.headers['user-agent']||'');
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)?'web_mobile':'web_pc';
}
async function rdsOpAudit(action,actorType,actorId,targetType,targetId,deviceId,metadata={}){
  try{await insert('rds10_security_audit',{actor_type:actorType,actor_id:actorId||null,action,target_type:targetType||null,target_id:targetId||null,device_id:deviceId||null,metadata:metadata||{},created_at:nowISO()},'minimal');}
  catch(e){console.warn('[RDS][SECURITY][AUDIT]',e?.message||e);}
}
async function rdsOpActiveDeviceCount(sellerId){
  return (await list('rds10_seller_devices','select=id&seller_id=eq.'+encodeURIComponent(sellerId)+'&status=eq.ATIVO')).length;
}
app.post('/api/operator/register',async(req,res)=>{try{const name=cleanText(req.body?.name),phone=normalizeBR(req.body?.phone),email=cleanText(req.body?.email),password=String(req.body?.password||'');if(name.length<3)throw new Error('Nome inválido.');if(!validBRPhone(phone))throw new Error('Telefone inválido.');if(password.length<6)throw new Error('Senha mínima de 6 caracteres.');if(await one('rds10_sellers','select=id&phone=eq.'+encodeURIComponent(phone)))throw new Error('Telefone já cadastrado.');if(email&&await one('rds10_sellers','select=id&email=eq.'+encodeURIComponent(email.toLowerCase())))throw new Error('E-mail já cadastrado.');const p=rdsOpNewHash(password);const rows=await insert('rds10_sellers',{name,phone,email:email||null,password_hash:p.hash,password_salt:p.salt,status:'PENDENTE',created_at:nowISO(),updated_at:nowISO()});const created=rows?.[0];if(!created?.id)throw new Error('Cadastro criado sem identificador; solicite ajuda ao administrador.');const company=await one('rds10_companies','select=id&code=eq.RDS');if(!company?.id)throw new Error('Empresa padrão RDS não está configurada.');const link=await one('rds10_seller_companies','select=seller_id,company_id&seller_id=eq.'+encodeURIComponent(created.id)+'&company_id=eq.'+encodeURIComponent(company.id));if(link)await patch('rds10_seller_companies','seller_id=eq.'+encodeURIComponent(created.id)+'&company_id=eq.'+encodeURIComponent(company.id),{role:'VENDEDOR',active:true,updated_at:nowISO()});else await insert('rds10_seller_companies',{seller_id:created.id,company_id:company.id,role:'VENDEDOR',active:true,created_at:nowISO(),updated_at:nowISO()});return res.status(201).json({success:true,status:'PENDENTE',seller:rdsOpPublic(created),message:'Cadastro recebido. Aguarde a aprovação do administrador.'});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/login',async(req,res)=>{
  try{
    const phone=normalizeBR(req.body?.phone),password=String(req.body?.password||''),platform=rdsOpPlatform(req,req.body?.platform),deviceId=cleanText(req.body?.deviceId||req.headers['x-rds-device-id']);
    const seller=await one('rds10_sellers','select=*&phone=eq.'+encodeURIComponent(phone));
    if(!seller)throw new Error('Cadastro não encontrado.');
    if(seller.status==='PENDENTE')throw new Error('Cadastro aguardando aprovação.');
    if(seller.status==='BLOQUEADO')throw new Error('Conta bloqueada pelo administrador.');
    const a=rdsOpHash(password,seller.password_salt),b=String(seller.password_hash||'');
    if(a.length!==b.length||!crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex')))throw new Error('Telefone ou senha inválidos.');
    if(!deviceId)throw new Error('Dispositivo não identificado. Atualize o aplicativo ou navegador e tente novamente.');
    let device=await one('rds10_seller_devices','select=id,device_id,platform,status,authorized_at,blocked_at&seller_id=eq.'+encodeURIComponent(seller.id)+'&device_id=eq.'+encodeURIComponent(deviceId));
    if(device?.status==='BLOQUEADO'||device?.status==='REVOGADO')throw new Error('Este dispositivo foi bloqueado ou revogado pelo administrador.');
    if(device?.status==='PENDENTE')return res.status(403).json({success:false,code:'DEVICE_PENDING',error:'Este dispositivo aguarda autorização do administrador.'});
    if(!device){
      const activeCount=await rdsOpActiveDeviceCount(seller.id);
      if(activeCount>=2){await rdsOpAudit('DEVICE_REJECTED_LIMIT','SELLER',seller.id,'SELLER',seller.id,deviceId,{platform,activeCount});throw new Error('Limite de 2 dispositivos atingido. O administrador precisa revogar um dispositivo antes de autorizar outro.');}
      try{
        const rows=await insert('rds10_seller_devices',{seller_id:seller.id,device_id:deviceId,platform,status:'PENDENTE',first_seen_at:nowISO(),last_seen_at:nowISO(),created_at:nowISO(),updated_at:nowISO()});
        device=rows?.[0]||null;
      }catch(e){if(String(e?.message||'').includes('LIMITE_DISPOSITIVOS_ATINGIDO'))throw new Error('Limite de 2 dispositivos atingido. O administrador precisa revogar um dispositivo antes de autorizar outro.');throw e;}
      await rdsOpAudit('DEVICE_PENDING','SELLER',seller.id,'SELLER',seller.id,deviceId,{platform});
      return res.status(403).json({success:false,code:'DEVICE_PENDING',error:'Dispositivo registrado e aguardando autorização do administrador.'});
    }
    const token=rdsOpToken(),exp=new Date(Date.now()+RDS_OPERATOR_SESSION_DAYS*86400000).toISOString();
    await insert('rds10_seller_sessions',{seller_id:seller.id,token_hash:rdsOpTHash(token),platform,device_id:deviceId,created_at:nowISO(),last_seen_at:nowISO(),expires_at:exp});
    await patch('rds10_seller_devices','id=eq.'+device.id,{status:'ATIVO',platform,last_seen_at:nowISO(),updated_at:nowISO()});
    await patch('rds10_sellers','id=eq.'+seller.id,{last_login_at:nowISO(),updated_at:nowISO()});
    await rdsOpAudit('LOGIN_SUCCESS','SELLER',seller.id,'SELLER',seller.id,deviceId,{platform});
    rdsOpSetCookie(res,token);
    return res.json({success:true,token,seller:rdsOpPublic(seller),session:{expiresAt:exp,platform,deviceId}});
  }catch(e){return res.status(401).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/logout',async(req,res)=>{
  try{const t=rdsOpBearer(req)||rdsOpCookie(req),ss=await rdsOpSession(req).catch(()=>null);if(t)await patch('rds10_seller_sessions','token_hash=eq.'+encodeURIComponent(rdsOpTHash(t)),{revoked_at:nowISO()}).catch(()=>{});if(ss)await rdsOpAudit('LOGOUT','SELLER',ss.seller.id,'SESSION',ss.session.id,ss.session.device_id,{platform:ss.session.platform});rdsOpClearCookie(res);return res.json({success:true});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.get('/api/operator/sessions',async(req,res)=>{try{const s=await rdsOpRequire(req,res);if(!s)return;const rows=await list('rds10_seller_sessions','select=id,platform,device_id,created_at,last_seen_at,expires_at,revoked_at&seller_id=eq.'+s.seller.id+'&revoked_at=is.null&order=last_seen_at.desc.nullslast');return res.json({success:true,sessions:rows});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/sessions/:id/revoke',async(req,res)=>{
  try{const s=await rdsOpRequire(req,res);if(!s)return;const id=cleanText(req.params.id);const rows=await patch('rds10_seller_sessions','id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+s.seller.id+'&revoked_at=is.null',{revoked_at:nowISO()});if(!rows?.[0])throw new Error('Sessão não encontrada.');await rdsOpAudit('SESSION_REVOKED_SELF','SELLER',s.seller.id,'SESSION',id,rows[0].device_id||null,{});return res.json({success:true});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.get('/api/operator/me',async(req,res)=>{
  try{const s=await rdsOpRequire(req,res);if(!s)return;const devices=await list('rds10_seller_devices','select=id,device_id,platform,status,first_seen_at,last_seen_at,authorized_at,blocked_at&seller_id=eq.'+s.seller.id+'&order=last_seen_at.desc.nullslast');const company=await one('rds10_seller_companies','select=company_id,role,active&seller_id=eq.'+s.seller.id+'&active=eq.true');return res.json({success:true,seller:rdsOpPublic(s.seller),devices,deviceLimit:2,activeDeviceCount:devices.filter(x=>x.status==='ATIVO').length,company:company||null});}
  catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/devices/:id/revoke',async(req,res)=>{
  try{const ss=await rdsOpRequire(req,res);if(!ss)return;const id=cleanText(req.params.id);const d=await one('rds10_seller_devices','select=id,device_id,status&seller_id=eq.'+ss.seller.id+'&id=eq.'+encodeURIComponent(id));if(!d)throw new Error('Dispositivo não encontrado.');await patch('rds10_seller_devices','id=eq.'+encodeURIComponent(d.id),{status:'BLOQUEADO',blocked_at:nowISO(),updated_at:nowISO()});await patch('rds10_seller_sessions','seller_id=eq.'+ss.seller.id+'&device_id=eq.'+encodeURIComponent(d.device_id)+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});await rdsOpAudit('DEVICE_REVOKED_SELF','SELLER',ss.seller.id,'DEVICE',d.id,d.device_id,{});return res.json({success:true});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.get('/api/operator/admin/seller/devices',async(req,res)=>{
  try{const admin=await rdsAdminRequire(req,res);if(!admin)return;const sellerId=cleanText(req.query?.sellerId);if(!sellerId)throw new Error('Vendedor não informado.');const seller=await one('rds10_sellers','select=id,name,phone,status,role&id=eq.'+encodeURIComponent(sellerId));if(!seller)throw new Error('Vendedor não encontrado.');const devices=await list('rds10_seller_devices','select=id,device_id,platform,status,first_seen_at,last_seen_at,authorized_at,blocked_at&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=last_seen_at.desc.nullslast');const sessions=await list('rds10_seller_sessions','select=id,platform,device_id,created_at,last_seen_at,expires_at,revoked_at&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=last_seen_at.desc.nullslast');return res.json({success:true,seller,devices,sessions,deviceLimit:2,activeDeviceCount:devices.filter(x=>x.status==='ATIVO').length});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/admin/device/authorize',async(req,res)=>{
  try{const admin=await rdsAdminRequire(req,res);if(!admin)return;const id=cleanText(req.body?.deviceId);const d=await one('rds10_seller_devices','select=id,seller_id,device_id,platform,status&id=eq.'+encodeURIComponent(id));if(!d)throw new Error('Dispositivo não encontrado.');if(d.status==='ATIVO')return res.json({success:true});const activeCount=await rdsOpActiveDeviceCount(d.seller_id);if(activeCount>=2)throw new Error('Limite de 2 dispositivos ativos atingido. Revogue um dispositivo antes de autorizar este.');await patch('rds10_seller_devices','id=eq.'+encodeURIComponent(d.id),{status:'ATIVO',authorized_at:nowISO(),blocked_at:null,last_seen_at:nowISO(),updated_at:nowISO()});await rdsOpAudit('DEVICE_AUTHORIZED','ADMINISTRADOR',admin.admin?.id||admin.id||null,'DEVICE',d.id,d.device_id,{sellerId:d.seller_id,platform:d.platform});return res.json({success:true});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/admin/device/block',async(req,res)=>{
  try{const admin=await rdsAdminRequire(req,res);if(!admin)return;const id=cleanText(req.body?.deviceId);const d=await one('rds10_seller_devices','select=id,seller_id,device_id,platform,status&id=eq.'+encodeURIComponent(id));if(!d)throw new Error('Dispositivo não encontrado.');await patch('rds10_seller_devices','id=eq.'+encodeURIComponent(d.id),{status:'BLOQUEADO',blocked_at:nowISO(),updated_at:nowISO()});await patch('rds10_seller_sessions','seller_id=eq.'+encodeURIComponent(d.seller_id)+'&device_id=eq.'+encodeURIComponent(d.device_id)+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});await rdsOpAudit('DEVICE_BLOCKED','ADMINISTRADOR',admin.admin?.id||admin.id||null,'DEVICE',d.id,d.device_id,{sellerId:d.seller_id,platform:d.platform});return res.json({success:true});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/admin/device/revoke',async(req,res)=>{
  try{const admin=await rdsAdminRequire(req,res);if(!admin)return;const id=cleanText(req.body?.deviceId);const d=await one('rds10_seller_devices','select=id,seller_id,device_id,platform,status&id=eq.'+encodeURIComponent(id));if(!d)throw new Error('Dispositivo não encontrado.');await patch('rds10_seller_devices','id=eq.'+encodeURIComponent(d.id),{status:'REVOGADO',blocked_at:nowISO(),updated_at:nowISO()});await patch('rds10_seller_sessions','seller_id=eq.'+encodeURIComponent(d.seller_id)+'&device_id=eq.'+encodeURIComponent(d.device_id)+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});await rdsOpAudit('DEVICE_REVOKED','ADMINISTRADOR',admin.admin?.id||admin.id||null,'DEVICE',d.id,d.device_id,{sellerId:d.seller_id,platform:d.platform});return res.json({success:true});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.get('/api/operator/admin/security-audit',async(req,res)=>{
  try{const admin=await rdsAdminRequire(req,res);if(!admin)return;const sellerId=cleanText(req.query?.sellerId);const q=sellerId?'actor_id=eq.'+encodeURIComponent(sellerId)+'&':'';const rows=await list('rds10_security_audit',q+'select=id,actor_type,actor_id,action,target_type,target_id,device_id,metadata,created_at&order=created_at.desc&limit=200');return res.json({success:true,audit:rows});}
  catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.get('/api/operator/admin/sellers',async(req,res)=>{try{if(!(await rdsAdminRequire(req,res)))return;const rows=await list('rds10_sellers','select=id,name,phone,email,status,verified_at,approved_at,blocked_at,last_login_at,created_at&order=created_at.desc');return res.json({success:true,sellers:rows.map(rdsOpPublic)});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/approve',async(req,res)=>{try{if(!rdsOpAdmin(req))return res.status(403).json({success:false,error:'Acesso administrativo não autorizado.'});const id=cleanText(req.body?.sellerId);if(!id)throw new Error('Vendedor não informado.');const rows=await patch('rds10_sellers','id=eq.'+encodeURIComponent(id),{status:'ATIVO',verified_at:nowISO(),approved_at:nowISO(),blocked_at:null,updated_at:nowISO()});if(!rows?.[0])throw new Error('Vendedor não encontrado.');return res.json({success:true,seller:rdsOpPublic(rows[0])});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/block',async(req,res)=>{try{if(!rdsOpAdmin(req))return res.status(403).json({success:false,error:'Acesso administrativo não autorizado.'});const id=cleanText(req.body?.sellerId);const rows=await patch('rds10_sellers','id=eq.'+encodeURIComponent(id),{status:'BLOQUEADO',blocked_at:nowISO(),updated_at:nowISO()});if(!rows?.[0])throw new Error('Vendedor não encontrado.');await patch('rds10_seller_sessions','seller_id=eq.'+encodeURIComponent(id)+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});await patch('rds10_seller_devices','seller_id=eq.'+encodeURIComponent(id)+'&status=eq.ATIVO',{status:'BLOQUEADO',blocked_at:nowISO(),updated_at:nowISO()}).catch(()=>{});return res.json({success:true,seller:rdsOpPublic(rows[0])});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/unblock',async(req,res)=>{try{if(!rdsOpAdmin(req))return res.status(403).json({success:false,error:'Acesso administrativo não autorizado.'});const id=cleanText(req.body?.sellerId);const rows=await patch('rds10_sellers','id=eq.'+encodeURIComponent(id),{status:'ATIVO',blocked_at:null,updated_at:nowISO()});if(!rows?.[0])throw new Error('Vendedor não encontrado.');return res.json({success:true,seller:rdsOpPublic(rows[0])});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.get('/api/operator/settings',async(req,res)=>{try{const s=await rdsOpRequire(req,res);if(!s)return;const row=await one('rds10_seller_settings','select=seller_id,mp_public_key,mp_environment,pix_key,pix_name,official_email,official_authorized,official_device_id&seller_id=eq.'+s.seller.id);return res.json({success:true,settings:row||{seller_id:s.seller.id,mp_environment:'production'}});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/settings',async(req,res)=>{try{const s=await rdsOpRequire(req,res);if(!s)return;const b=req.body||{},row={seller_id:s.seller.id,mp_public_key:cleanText(b.mpPublicKey)||null,mp_environment:String(b.mpEnvironment||'production').toLowerCase()==='sandbox'?'sandbox':'production',pix_key:cleanText(b.pixKey)||null,pix_name:cleanText(b.pixName)||null,official_email:cleanText(b.officialEmail)||null,updated_at:nowISO()};if(b.mpAccessToken)row.mp_access_token_enc=rdsOpEnc(b.mpAccessToken);if(b.mpRefreshToken)row.mp_refresh_token_enc=rdsOpEnc(b.mpRefreshToken);const saved=await sb('/rest/v1/rds10_seller_settings?on_conflict=seller_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});return res.json({success:true,settings:saved?.[0]||null});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.get('/api/operator/health',async(req,res)=>{try{const s=await rdsOpSession(req);return res.json({success:true,authenticated:Boolean(s),status:s?.seller?.status||'ANON'});}catch{return res.json({success:true,authenticated:false,status:'ANON'});}});
console.log('[RDS] autenticação multiacesso V2 instalada');
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] autenticação multiacesso V2 instalada');
