import fs from 'node:fs';

const path='runtime-v10.60-fix.mjs';
let source=fs.readFileSync(path,'utf8');
const old="const customerReturnWithEmail=\"const email=String(process.env.PAGBANK_CUSTOMER_EMAIL||process.env.PAGBANK_MERCHANT_EMAIL||process.env.PAGBANK_EMAIL||'').trim();if(!email)throw new Error('PagBank exige customer.email. Configure PAGBANK_CUSTOMER_EMAIL no Render.');return {name,tax_id:tax,email,...(phone?{phones:[phone]}:{})};\";";
const replacement="const customerReturnWithEmail=\"return {name,tax_id:tax,...(phone?{phones:[phone]}:{})};\";";
if(source.includes(old)){
  source=source.replace(old,replacement);
  fs.writeFileSync(path,source,'utf8');
  console.log('[RDS] exigencia de email do PagBank removida antes do boot');
}else{
  console.log('[RDS] fonte PagBank já está sem exigência de email');
}

// A versão V10.71 estável já contém um bloco experimental que não deve ser interpretado.
// Removemos apenas esse bloco textual antes do import e mantemos o restante da base intacto.
const stablePath='runtime-v10.71-stable.mjs';
let stable=fs.readFileSync(stablePath,'utf8');
const badStart=stable.indexOf("const opsMarker='// RDS V10.71 OPERATIONAL EXTENSION';");
const badEnd=stable.indexOf("console.log('[V10.71] menu refinado",badStart);
if(badStart>=0&&badEnd>badStart){stable=stable.slice(0,badStart)+stable.slice(badEnd);fs.writeFileSync(stablePath,stable,'utf8');console.log('[RDS] bloco experimental inválido removido antes do boot');}

await import('./runtime-v10.71-ops-extension-final.mjs');
await import('./runtime-v10.71-stable.mjs');
