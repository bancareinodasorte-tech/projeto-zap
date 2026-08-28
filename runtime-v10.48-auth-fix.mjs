import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const p=path.join(dir,'server.js');
let s=fs.readFileSync(p,'utf8');

// V10.48.2 — autenticação usa a tabela zap_auth já existente.
if(!s.includes('RDS_V10_48_AUTH_COMPAT')){
  const marker='// RDS_V10_48_AUTH_COMPAT';
  const insert=marker+`\n`+
`function rdsAuthHash(v){ return crypto.createHash('sha256').update(String(v||'')).digest('hex'); }\n`+
`function rdsAuthToken(){ return crypto.randomBytes(32).toString('hex'); }\n`+
`app.post('/api/v1026/auth/login',async(req,res)=>{ try{ const cpf=digits(req.body?.cpf); const senha=String(req.body?.senha||req.body?.password||''); if(cpf.length!==11||!senha) return res.status(400).json({ok:false,error:'CPF e senha obrigatórios.'}); const u=await authRead('operator:'+cpf); if(!u||u.passwordHash!==rdsAuthHash(senha)) return res.status(401).json({ok:false,error:'CPF ou senha inválidos.'}); const token=rdsAuthToken(); await authWrite('operator-session:'+token,{cpf,createdAt:nowISO()}); return res.json({ok:true,token,cpf,email:u.email||null}); }catch(e){ return res.status(500).json({ok:false,error:e.message}); } });\n`+
`app.post('/api/v1026/auth/register',async(req,res)=>{ try{ const cpf=digits(req.body?.cpf); const email=String(req.body?.email||'').trim().toLowerCase(); const senha=String(req.body?.senha||req.body?.password||''); if(cpf.length!==11||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||senha.length<8) return res.status(400).json({ok:false,error:'CPF, e-mail e senha válidos são obrigatórios.'}); const u=await authRead('operator:'+cpf); if(u) return res.status(409).json({ok:false,error:'CPF já cadastrado.'}); await authWrite('operator:'+cpf,{cpf,email,passwordHash:rdsAuthHash(senha),createdAt:nowISO(),updatedAt:nowISO()}); const token=rdsAuthToken(); await authWrite('operator-session:'+token,{cpf,createdAt:nowISO()}); return res.json({ok:true,token,cpf,email}); }catch(e){ return res.status(500).json({ok:false,error:e.message}); } });\n`+
`app.get('/api/v1026/auth/status',async(req,res)=>{ try{ const token=String(req.headers.authorization||'').replace(/^Bearer\\s+/i,''); if(token){ const session=await authRead('operator-session:'+token); if(session?.cpf){ const u=await authRead('operator:'+session.cpf); return res.json({ok:true,authenticated:true,configured:true,cpf:session.cpf,email:u?.email||null}); } } const rows=await list('zap_auth','select=id&order=updated_at.desc&limit=200'); const configured=rows.some(x=>String(x.id||'').startsWith('operator:')); return res.json({ok:true,authenticated:false,configured}); }catch(e){ return res.status(500).json({ok:false,error:e.message}); } });\n`+
`app.post('/api/v1026/auth/logout',async(req,res)=>{ try{ const token=String(req.headers.authorization||'').replace(/^Bearer\\s+/i,''); if(token) await authDelete('operator-session:'+token); return res.json({ok:true}); }catch(e){ return res.status(500).json({ok:false,error:e.message}); } });\n`;
  const idx=s.indexOf("app.get('/health'");
  if(idx>=0) s=s.slice(0,idx)+insert+s.slice(idx);
}
fs.writeFileSync(p,s,'utf8');
console.log('[V10.48.2] auth switched to existing zap_auth storage');
await import('./server.js');
