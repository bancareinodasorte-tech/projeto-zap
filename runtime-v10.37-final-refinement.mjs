import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');
try{
 let s=fs.readFileSync(serverPath,'utf8');
 if(!s.includes('RDS_AUTH_PERSISTENT_V10_37')){
  const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=s.indexOf(marker); if(pos<0)throw new Error('ponto de inserção V10.37 não localizado');
  const block=`// RDS_AUTH_PERSISTENT_V10_37\nconst rdsAuthLegacySession=v1026Session;\nconst rdsAuthSecret=crypto.createHash('sha256').update(String(process.env.RDS_AUTH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_URL||'RDS_AUTH_V10_37')).digest();\nfunction rdsAuthB64(v){return Buffer.from(String(v)).toString('base64url');}\nfunction rdsAuthUnb64(v){return Buffer.from(String(v),'base64url').toString('utf8');}\nfunction rdsAuthIssuePersistent(cpf,remember=true){const ttl=remember?30*24*60*60*1000:12*60*60*1000;const p={cpf:String(cpf),exp:Date.now()+ttl};const body=rdsAuthB64(JSON.stringify(p));const sig=crypto.createHmac('sha256',rdsAuthSecret).update(body).digest('base64url');return {token:'rds37.'+body+'.'+sig,expires:p.exp};}\nfunction rdsAuthPersistentSession(req){const t=v1026Token(req);if(!t.startsWith('rds37.'))return rdsAuthLegacySession(req);const a=t.split('.');if(a.length!==3)return null;const body=a[1],sig=a[2],expected=crypto.createHmac('sha256',rdsAuthSecret).update(body).digest('base64url');if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;let p;try{p=JSON.parse(rdsAuthUnb64(body));}catch{return null;}if(!p?.cpf||Date.now()>Number(p.exp||0))return null;return {cpf:String(p.cpf),created:Date.now(),expires:Number(p.exp),token:t};}\nv1026IssueSession=(cpf,remember=true)=>{const x=rdsAuthIssuePersistent(cpf,remember);return {token:x.token,expires:x.expires};};\nv1026Session=rdsAuthPersistentSession;\n// /RDS_AUTH_PERSISTENT_V10_37\n`;
  s=s.slice(0,pos)+block+s.slice(pos); fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.37] sessão persistente do operador aplicada');
 }
}catch(e){console.error('[V10.37]',e.message);process.exitCode=1;}
await import('./runtime-v10.36-operational-flow.mjs');
