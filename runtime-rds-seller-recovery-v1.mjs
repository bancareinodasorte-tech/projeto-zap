import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS SELLER RECOVERY V1';
if(server.includes(marker)){
  console.log('[RDS] recuperação de vendedor V1 já aplicada');
}else{
  const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=server.indexOf(catchAll);
  if(pos<0)throw new Error('catch-all não localizado para recuperação de vendedor.');
  const block=String.raw`
${marker}
const RDS_SELLER_EMAIL_FROM=String(process.env.RDS_SELLER_EMAIL_FROM||process.env.RDS_ADMIN_EMAIL_FROM||'onboarding@resend.dev').trim();
const RDS_PUBLIC_BASE_URL_SELLER=String(process.env.RDS_PUBLIC_BASE_URL||'https://projeto-zap-4tyg.onrender.com').replace(/\/+$/,'');
function rdsSellerResetPublicMessage(){return 'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.';}
app.post('/api/operator/forgot-password',async(req,res)=>{
  try{
    const email=String(req.body?.email||'').trim().toLowerCase();
    if(!email)return res.status(400).json({success:false,error:'Informe o e-mail cadastrado.'});
    const sellers=await list('rds10_sellers','select=id,email,status,role&email=eq.'+encodeURIComponent(email)+'&order=created_at.desc&limit=2');
    if(!Array.isArray(sellers)||sellers.length!==1)return res.json({success:true,message:rdsSellerResetPublicMessage()});
    const seller=sellers[0];
    if(!seller||!seller.email)return res.json({success:true,message:rdsSellerResetPublicMessage()});
    const key=String(process.env.RDS_RESEND_API_KEY||'').trim();
    if(!key)throw new Error('Recuperação por e-mail ainda não configurada no servidor.');
    const token=crypto.randomBytes(32).toString('base64url');
    await insert('rds10_seller_reset_tokens',{seller_id:seller.id,token_hash:rdsAdminHash(token),expires_at:new Date(Date.now()+1800000).toISOString(),created_at:nowISO()});
    const link=RDS_PUBLIC_BASE_URL_SELLER+'/operador?token='+encodeURIComponent(token);
    const rr=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({from:RDS_SELLER_EMAIL_FROM,to:[seller.email],subject:'REINO DA SORTE - Recuperação de senha',text:'Foi solicitada a recuperação da sua senha de vendedor. Abra este link para criar uma nova senha: '+link+'\\n\\nO link expira em 30 minutos.'})});
    if(!rr.ok)throw new Error('Falha ao enviar e-mail de recuperação.');
    return res.json({success:true,message:rdsSellerResetPublicMessage()});
  }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/reset-password',async(req,res)=>{
  try{
    const token=String(req.body?.token||'').trim(),password=String(req.body?.password||'');
    if(password.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
    const row=await one('rds10_seller_reset_tokens','select=id,seller_id,expires_at&token_hash=eq.'+encodeURIComponent(rdsAdminHash(token))+'&used_at=is.null');
    if(!row||Date.parse(row.expires_at)<=Date.now())throw new Error('Link expirado ou inválido.');
    const h=rdsOpNewHash(password);
    await patch('rds10_sellers','id=eq.'+row.seller_id,{password_hash:h.hash,password_salt:h.salt,updated_at:nowISO()});
    const linkedAdmin=await one('rds10_admin','select=id&seller_id=eq.'+row.seller_id).catch(()=>null);
    if(linkedAdmin){
      await patch('rds10_admin','id=eq.'+linkedAdmin.id,{password_hash:h.hash,password_salt:h.salt,updated_at:nowISO()}).catch(()=>{});
      await patch('rds10_admin_sessions','admin_id=eq.'+linkedAdmin.id+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});
    }
    await patch('rds10_seller_reset_tokens','id=eq.'+row.id,{used_at:nowISO()});
    await patch('rds10_seller_sessions','seller_id=eq.'+row.seller_id+'&revoked_at=is.null',{revoked_at:nowISO()}).catch(()=>{});
    return res.json({success:true,message:'Senha alterada. Entre novamente com sua nova senha.'});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/change-password',async(req,res)=>{
  try{
    const s=await rdsOpRequire(req,res);if(!s)return;
    const current=String(req.body?.currentPassword||''),next=String(req.body?.newPassword||'');
    const row=await one('rds10_sellers','select=id,password_hash,password_salt&id=eq.'+s.seller.id);
    if(!row||rdsOpHash(current,row.password_salt)!==row.password_hash)throw new Error('Senha atual inválida.');
    if(next.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
    const h=rdsOpNewHash(next);
    await patch('rds10_sellers','id=eq.'+s.seller.id,{password_hash:h.hash,password_salt:h.salt,updated_at:nowISO()});
    return res.json({success:true});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
console.log('[RDS] recuperação de vendedor V1 instalada');
`;
  server=server.slice(0,pos)+block+'\n'+server.slice(pos);
  fs.writeFileSync(path,server,'utf8');
  console.log('[RDS] recuperação de vendedor V1 instalada');
}
