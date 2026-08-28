import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const p=path.join(dir,'server.js');
let s=fs.readFileSync(p,'utf8');

// V10.48.1 — auth compatibility without nested template interpolation.
if(!s.includes('RDS_V10_48_AUTH_COMPAT')){
  const marker='// RDS_V10_48_AUTH_COMPAT';
  const insert=marker+`\n`+
`app.post('/api/v1026/auth/login',async(req,res)=>{ try{ const cpf=String(req.body?.cpf||'').replace(/\\D/g,''); const senha=String(req.body?.senha||req.body?.password||''); if(!cpf||!senha) return res.status(400).json({ok:false,error:'CPF e senha obrigatórios.'}); const rows=await list('rds10_users','select=*&cpf=eq.'+encodeURIComponent(cpf)+'&limit=1'); const u=rows[0]; if(!u||String(u.password||u.senha||'')!==senha) return res.status(401).json({ok:false,error:'CPF ou senha inválidos.'}); return res.json({ok:true,user:{cpf,email:u.email||null}}); }catch(e){ return res.status(500).json({ok:false,error:e.message}); } });\n`+
`app.post('/api/v1026/auth/register',async(req,res)=>{ try{ const cpf=String(req.body?.cpf||'').replace(/\\D/g,''); const email=String(req.body?.email||'').trim().toLowerCase(); const senha=String(req.body?.senha||req.body?.password||''); if(cpf.length!==11||!email||senha.length<4) return res.status(400).json({ok:false,error:'CPF, e-mail e senha válidos são obrigatórios.'}); const exists=await list('rds10_users','select=id&cpf=eq.'+encodeURIComponent(cpf)+'&limit=1'); if(exists.length) return res.status(409).json({ok:false,error:'CPF já cadastrado.'}); await insert('rds10_users',{cpf,email,password:senha,created_at:nowISO(),updated_at:nowISO()},'minimal'); return res.json({ok:true,user:{cpf,email}}); }catch(e){ return res.status(500).json({ok:false,error:e.message}); } });\n`;
  const idx=s.indexOf("app.get('/health'");
  if(idx>=0) s=s.slice(0,idx)+insert+s.slice(idx);
}
fs.writeFileSync(p,s,'utf8');
console.log('[V10.48.1] auth compatibility routes installed');
await import('./server.js');
