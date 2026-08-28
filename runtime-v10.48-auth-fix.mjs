import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(dir, 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

// V10.48.4 — autenticação persistente do operador na tabela zap_auth.
// Registros usam prefixos operator: e operator-session: para não misturar
// credenciais do operador com as credenciais do WhatsApp.
if (!s.includes('RDS_V10_48_4_OPERATOR_AUTH')) {
  const marker = '// RDS_V10_48_4_OPERATOR_AUTH';
  const code = marker + `\n` + String.raw`
function operatorKey(cpf){ return 'operator:' + digits(cpf); }
function operatorHash(password,salt){ return crypto.scryptSync(String(password),String(salt),64).toString('hex'); }
function operatorPassword(password){ const salt=crypto.randomBytes(16).toString('hex'); return {salt,hash:operatorHash(password,salt)}; }
function operatorToken(){ return crypto.randomBytes(32).toString('hex'); }
async function operatorRecord(cpf){ return authRead(operatorKey(cpf)); }
async function operatorSession(req){ const token=String(req.headers.authorization||'').replace(/^Bearer\\s+/i,''); if(!token)return null; const ses=await authRead('operator-session:'+token); if(!ses?.cpf)return null; const u=await operatorRecord(ses.cpf); return u?{...u,token}:null; }
app.post('/api/v1026/auth/register',async(req,res)=>{try{const cpf=digits(req.body?.cpf);const email=String(req.body?.email||'').trim().toLowerCase();const password=String(req.body?.password||req.body?.senha||'');if(cpf.length!==11)return res.status(400).json({error:'CPF inválido.'});if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return res.status(400).json({error:'E-mail inválido.'});if(password.length<8)return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres.'});if(await operatorRecord(cpf))return res.status(409).json({error:'CPF já cadastrado.'});const hp=operatorPassword(password);await authWrite(operatorKey(cpf),{cpf,email,salt:hp.salt,passwordHash:hp.hash,createdAt:nowISO(),updatedAt:nowISO()});const token=operatorToken();await authWrite('operator-session:'+token,{cpf,createdAt:nowISO()});res.json({ok:true,token,cpf,email});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/v1026/auth/login',async(req,res)=>{try{const cpf=digits(req.body?.cpf);const password=String(req.body?.password||req.body?.senha||'');if(cpf.length!==11||!password)return res.status(400).json({error:'CPF e senha obrigatórios.'});const u=await operatorRecord(cpf);if(!u)return res.status(401).json({error:'CPF não cadastrado. Use Cadastro para criar o acesso.'});const h=operatorHash(password,u.salt);const ok=h===u.passwordHash;if(!ok)return res.status(401).json({error:'CPF ou senha inválidos.'});const token=operatorToken();await authWrite('operator-session:'+token,{cpf,createdAt:nowISO()});res.json({ok:true,token,cpf,email:u.email||null});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/v1026/auth/status',async(req,res)=>{try{const u=await operatorSession(req);if(u)return res.json({ok:true,authenticated:true,configured:true,cpf:u.cpf,email:u.email||null});const rows=await list('zap_auth','select=id&limit=1000');const configured=rows.some(x=>String(x.id||'').startsWith('operator:'));res.json({ok:true,authenticated:false,configured});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/v1026/auth/logout',async(req,res)=>{try{const token=String(req.headers.authorization||'').replace(/^Bearer\\s+/i,'');if(token)await authDelete('operator-session:'+token);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
`;
  const idx = s.indexOf("app.get('/api/settings'");
  if (idx < 0) throw new Error('Ponto de inserção das rotas de autenticação não encontrado.');
  s = s.slice(0, idx) + code + s.slice(idx);
}

fs.writeFileSync(serverPath, s, 'utf8');
console.log('[V10.48.4] autenticação persistente do operador instalada');
await import('./server.js');
