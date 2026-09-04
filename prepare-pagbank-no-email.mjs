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
await import('./runtime-v10.71-stable.mjs');
