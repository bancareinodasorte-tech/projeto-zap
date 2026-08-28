import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
let s=fs.readFileSync(serverPath,'utf8');

if(!s.includes('RDS_V10_48_OPERATOR_AUTH')){
  const marker='// RDS_V10_48_OPERATOR_AUTH';
  const code=marker+`\n`+
`function rdsOperatorKey(cpf){return 'operator:'+String(cpf||'').replace(/\\D/g,'');}\n`+
`function rdsHash(password,salt){return crypto.scryptSync(String(password),String(salt),64).toString('hex');}\n`+
`function rdsToken(){return crypto.randomBytes(32).toString('hex');}\n`+
`async function rdsUser(cpf){return authRead(rdsOperatorKey(cpf));}\n`+
`app.post('/api/v1026/auth/register',async(req,res)=>{try{const cpf=String(req.body?.cpf||'').replace(/\\D/g,'');const email=String(req.body?.email||'').trim().toLowerCase();const password=String(req.body?.password||req.body?.senha||'');if(cpf.length!==11)return res.status(400).json({error:'CPF inválido.'});if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return res.status(400).json({error:'E-mail inválido.'});if(password.length<8)return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres.'});if(await rdsUser(cpf))return res.status(409).json({error:'CPF já cadastrado.'});const salt=crypto.randomBytes(16).toString('hex');await authWrite(rdsOperatorKey(cpf),{cpf,email,salt,passwordHash:rdsHash(password,salt),createdAt:nowISO(),updatedAt:nowISO()});const token=rdsToken();await authWrite('operator-session:'+token,{cpf,createdAt:nowISO()});return res.json({ok:true,token,cpf,email});}catch(e){return res.status(500).json({error:e.message});}});\n`+
`app.post('/api/v1026/auth/login',async(req,res)=>{try{const cpf=String(req.body?.cpf||'').replace(/\\D/g,'');const password=String(req.body?.password||req.body?.senha||'');if(cpf.length!==11||!password)return res.status(400).json({error:'CPF e senha obrigatórios.'});const u=await rdsUser(cpf);if(!u)return res.status(401).json({error:'CPF não cadastrado. Use Cadastro.'});if(rdsHash(password,u.salt)!==u.passwordHash)return res.status(401).json({error:'CPF ou senha inválidos.'});const token=rdsToken();await authWrite('operator-session:'+token,{cpf,createdAt:nowISO()});return res.json({ok:true,token,cpf,email:u.email||null});}catch(e){return res.status(500).json({error:e.message});}});\n`+
`app.get('/api/v1026/auth/status',async(req,res)=>{try{const token=String(req.headers.authorization||'').replace(/^Bearer /i,'');if(token){const ses=await authRead('operator-session:'+token);if(ses?.cpf){const u=await rdsUser(ses.cpf);if(u)return res.json({ok:true,authenticated:true,configured:true,cpf:u.cpf,email:u.email||null});}}return res.json({ok:true,authenticated:false,configured:true});}catch(e){return res.status(500).json({error:e.message});}});\n`+
`app.post('/api/v1026/auth/logout',async(req,res)=>{try{const token=String(req.headers.authorization||'').replace(/^Bearer /i,'');if(token)await authDelete('operator-session:'+token);return res.json({ok:true});}catch(e){return res.status(500).json({error:e.message});}});\n`;
  const idx=s.lastIndexOf('app.listen(');
  if(idx<0) throw new Error('Ponto de inicialização do servidor não encontrado.');
  s=s.slice(0,idx)+code+s.slice(idx);
}
fs.writeFileSync(serverPath,s,'utf8');
console.log('[V10.48.8] autenticação instalada e servidor preparado');
await import('./server.js');
