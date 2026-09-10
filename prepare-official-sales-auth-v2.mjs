import fs from 'node:fs';
const path='prepare-pagbank-no-email.mjs';
let s=fs.readFileSync(path,'utf8');
const marker="await import('./runtime-rds-official-sales-auth-v2.mjs');";
if(s.includes(marker)){console.log('[RDS] auth oficial V2 já está no boot');process.exit(0);}
const anchor="await import('./runtime-rds-official-sales-auth-v1.mjs');";
if(s.includes(anchor)){
  s=s.replace(anchor,anchor+'\n'+marker);
}else{
  const fallback="await import('./runtime-rds-official-sales-auth-v1.mjs');";
  const p=s.indexOf(fallback);
  if(p<0)throw new Error('Import da autenticação oficial V1 não localizado.');
  s=s.slice(0,p)+marker+'\n'+s.slice(p);
}
fs.writeFileSync(path,s,'utf8');
console.log('[RDS] autenticação oficial V2 adicionada ao boot');
