import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS ADMIN AUTH V1';
if(server.includes(marker)){console.log('[RDS] admin auth V1 já aplicada');}else{
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para admin auth.');

server=server.replaceAll("if(!rdsOpAdmin(req))return res.status(403).json({success:false,error:'Acesso administrativo não autorizado.'});","if(!(await rdsAdminRequire(req,res)))return;");

const block=String.raw`// RDS ADMIN AUTH V1
const RDS_ADMIN_EMAIL=String(process.env.RDS_OPERATOR_ADMIN_EMAIL||'bancareinodasorte@gmail.com').trim().toLowerCase();
const RDS_ADMIN_SESSION_DAYS=Math.max(1,Math.min(90,Number(process.env.RDS_ADMIN_SESSION_DAYS||30)));
function rdsAdminToken(){return crypto.randomBytes(32).toString('base64url');}
function rdsAdminTokenHash(t){return crypto.createHash('sha256').update(String(t)).digest('hex');}
function rdsAdminCookie(req){const m=String(req.headers.cookie||'').match(/(?:^|;\\s*)rds_admin_session=([^;]+)/);return m?decodeURIComponent(m[1]):'';}
function rdsAdminBearer(req){const h=String(req.headers.authorization||'');return /^Bearer\\s+/i.test(h)?h.replace(/^Bearer\\s+/i,'').trim():'';}
function rdsAdminSetCookie(res,t){res.setHeader('Set-Cookie','rds_admin_session='+encodeURIComponent(t)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+String(RDS_ADMIN_SESSION_DAYS*86400)+(process.env.NODE_ENV==='production'?'; Secure':''));}
function rdsAdminClearCookie(res){res.setHeader('Set-Cookie','rds_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':''));}
async function rdsAdminRowByEmail(email){return await one('rds10_admin','select=id,email,password_hash,password_salt,created_at,updated_at&email=eq.'+encodeURIComponent(String(email).trim().toLowerCase()));}
async function rdsAdminBootstrap(){
 let a=await rdsAdminRowByEmail(RDS_ADMIN_EMAIL); if(a)return a;
 const seed=String(process.env.RDS_OPERATOR_ADMIN_PASSWORD||'').trim();
 if(!seed)throw new Error('Administrador inicial ainda não configurado.');
 if(seed.length<8)throw new Error('A senha administrativa inicial deve ter pelo menos 8 caracteres.');
 const p=rdsOpNewHash(seed);
 const rows=await insert('rds10_admin',{email:RDS_ADMIN_EMAIL,password_hash:p.hash,password_salt:p.salt,created_at:nowISO(),updated_at:nowISO()});
 return rows?.[0]||await rdsAdminRowByEmail(RDS_ADMIN_EMAIL);
}
async function rdsAdminSession(req){
 const t=rdsAdminBearer(req)||rdsAdminCookie(req); if(!t)return null;
 const h=rdsAdminTokenHash(t);
 const ss=await one('rds10_admin_sessions','select=id,admin_id,expires_at,device_id&token_hash=eq.'+encodeURIComponent(h)+'&revoked_at=is.null');
 if(!ss||new Date(ss.expires_at).getTime()<=Date.now())return null;
 const a=await one('rds10_admin','select=id,email,created_at,updated_at& id=eq.'+encodeURIComponent(ss.admin_id));
 if(!a)return null;
 await patch('rds10_admin_sessions','id=eq.'+ss.id,{last_seen_at:nowISO()}).catch(()=>{});
 return {token:t,session:ss,admin:a};
}
async function rdsAdminRequire(req,res){const s=await rdsAdminSession(req);if(!s){res.status(401).json({success:false,error:'Sessão administrativa inválida, expirada ou encerrada.'});return null;}return s;}
function rdsAdminPublic(a){return {id:a.id,email:a.email,createdAt:a.created_at,updatedAt:a.updated_at};}
app.post('/api/operator/admin/login',async(req,res)=>{try{
 const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
 if(!email||!password)throw new Error('Informe e-mail e senha.');
 let a=await rdsAdminRowByEmail(email); if(!a&&email===RDS_ADMIN_EMAIL)a=await rdsAdminBootstrap();
 if(!a)throw new Error('E-mail ou senha inválidos.');
 const h=rdsOpHash(password,a.password_salt),b=String(a.password_hash||'');
 if(h.length!==b.length||!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(b,'hex')))throw new Error('E-mail ou senha inválidos.');
 const token=rdsAdminToken(),exp=new Date(Date.now()+RDS_ADMIN_SESSION_DAYS*86400000).toISOString();
 await insert('rds10_admin_sessions',{admin_id:a.id,token_hash:rdsAdminTokenHash(token),device_id:cleanText(req.headers['x-rds-device-id'])||null,created_at:nowISO(),last_seen_at:nowISO(),expires_at:exp});
 rdsAdminSetCookie(res,token); return res.json({success:true,token,admin:rdsAdminPublic(a),session:{expiresAt:exp}});
}catch(e){return res.status(401).json({success:false,error:String(e?.message||e)});}});

app.post('/api/operator/admin/logout',async(req,res)=>{try{const t=rdsAdminBearer(req)||rdsAdminCookie(req);if(t)await patch('rds10_admin_sessions','token_hash=eq.'+encodeURIComponent(rdsAdminTokenHash(t)),{revoked_at:nowISO()}).catch(()=>{});rdsAdminClearCookie(res);return res.json({success:true});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.get('/api/operator/admin/me',async(req,res)=>{try{const s=await rdsAdminRequire(req,res);if(!s)return;return res.json({success:true,admin:rdsAdminPublic(s.admin)});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
app.get('/api/operator/admin/list',async(req,res)=>{try{const s=await rdsAdminRequire(req,res);if(!s)return;const rows=await list('rds10_admin','select=id,email,created_at,updated_at&order=created_at.asc');return res.json({success:true,admins:rows.map(rdsAdminPublic)});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/create',async(req,res)=>{try{const s=await rdsAdminRequire(req,res);if(!s)return;const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-mail administrativo inválido.');if(password.length<8)throw new Error('A senha deve ter pelo menos 8 caracteres.');if(await rdsAdminRowByEmail(email))throw new Error('Este administrador já existe.');const p=rdsOpNewHash(password);const rows=await insert('rds10_admin',{email,password_hash:p.hash,password_salt:p.salt,created_at:nowISO(),updated_at:nowISO()});return res.status(201).json({success:true,admin:rdsAdminPublic(rows?.[0]||{})});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/change-password',async(req,res)=>{try{const s=await rdsAdminRequire(req,res);if(!s)return;const current=String(req.body?.currentPassword||''),next=String(req.body?.newPassword||'');if(next.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');const a=await one('rds10_admin','select=id,password_hash,password_salt& id=eq.'+encodeURIComponent(s.admin.id));if(!a)throw new Error('Administrador não encontrado.');const h=rdsOpHash(current,a.password_salt),b=String(a.password_hash||'');if(h.length!==b.length||!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(b,'hex')))throw new Error('Senha atual inválida.');const p=rdsOpNewHash(next);await patch('rds10_admin','id=eq.'+encodeURIComponent(a.id),{password_hash:p.hash,password_salt:p.salt,updated_at:nowISO()});return res.json({success:true,message:'Senha alterada com sucesso.'});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/forgot-password',async(req,res)=>{try{const email=String(req.body?.email||'').trim().toLowerCase(),a=await rdsAdminRowByEmail(email);if(!a)return res.json({success:true,message:'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.'});const key=String(process.env.RDS_RESEND_API_KEY||'').trim();if(!key)throw new Error('Recuperação por e-mail ainda não configurada no servidor.');const from=String(process.env.RDS_ADMIN_EMAIL_FROM||'onboarding@resend.dev').trim();const base=String(process.env.RDS_PUBLIC_BASE_URL||'https://projeto-zap-4tyg.onrender.com').replace(/\/+$/,'');await patch('rds10_admin_reset_tokens','admin_id=eq.'+a.id+'&used_at=is.null',{used_at:nowISO()}).catch(()=>{});const token=crypto.randomBytes(32).toString('base64url');await insert('rds10_admin_reset_tokens',{admin_id:a.id,token_hash:rdsAdminTokenHash(token),expires_at:new Date(Date.now()+1800000).toISOString(),created_at:nowISO()});const link=base+'/admin-recuperar?token='+encodeURIComponent(token);const rr=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({from,to:[a.email],subject:'REINO DA SORTE — Recuperação do acesso administrativo',html:'<h2>CANAL DE VENDAS RDS</h2><p>Foi solicitada a recuperação da senha administrativa.</p><p><a href="'+link+'">RECUPERAR SENHA</a></p><p>O link expira em 30 minutos e só pode ser usado uma vez.</p>'})});const body=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(body?.message||body?.error||'Falha ao enviar e-mail.');return res.json({success:true,message:'Se o e-mail estiver cadastrado, enviaremos as instruções.'});}catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}});
app.post('/api/operator/admin/reset-password',async(req,res)=>{try{const token=String(req.body?.token||'').trim(),password=String(req.body?.password||'');if(token.length<20)throw new Error('Link de recuperação inválido.');if(password.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');const t=await one('rds10_admin_reset_tokens','select=id,admin_id,expires_at&token_hash=eq.'+encodeURIComponent(rdsAdminTokenHash(token))+'&used_at=is.null');if(!t||new Date(t.expires_at).getTime()<=Date.now())throw new Error('Link expirado ou já utilizado.');const p=rdsOpNewHash(password),rows=await patch('rds10_admin','id=eq.'+encodeURIComponent(t.admin_id),{password_hash:p.hash,password_salt:p.salt,updated_at:nowISO()});if(!rows?.[0])throw new Error('Administrador não encontrado.');await patch('rds10_admin_reset_tokens','id=eq.'+encodeURIComponent(t.id),{used_at:nowISO()});await patch('rds10_admin_sessions','admin_id=eq.'+encodeURIComponent(t.admin_id)+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});return res.json({success:true,message:'Senha administrativa alterada com sucesso.'});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
app.get('/admin-recuperar',(req,res)=>res.redirect('/admin-vendedores'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):'')));
console.log('[RDS] autenticação administrativa V1 instalada');
`;
server=server.slice(0,pos)+block+'\\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] autenticação administrativa V1 instalada');
}