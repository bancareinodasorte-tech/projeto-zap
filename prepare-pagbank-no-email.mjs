import fs from 'node:fs';

const path='runtime-v10.60-fix.mjs';
let source=fs.readFileSync(path,'utf8');
const old="const customerReturnWithEmail=\"const email=String(process.env.PAGBANK_CUSTOMER_EMAIL||process.env.PAGBANK_MERCHANT_EMAIL||process.env.PAGBANK_EMAIL||'').trim();if(!email)throw new Error('PagBank exige customer.email. Configure PAGBANK_CUSTOMER_EMAIL no Render.');return {name,tax_id:tax,email,...(phone?{phones:[phone]}:{})};\";";
const replacement="const customerReturnWithEmail=\"return {name,tax_id:tax,...(phone?{phones:[phone]}:{})};\";";
if(source.includes(old)){source=source.replace(old,replacement);fs.writeFileSync(path,source,'utf8');console.log('[RDS] exigencia de email do PagBank removida antes do boot');}

const basePath='runtime-v10.70-stable.mjs';
const cleanPath='runtime-v10.71-stable-runtime.mjs';
let clean=fs.readFileSync(basePath,'utf8');
clean=clean.replaceAll('?v=1070','?v=1071');

const serverPath='server.js';
let server=fs.readFileSync(serverPath,'utf8');
const oldBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA/i.test(text); }";
const newBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$/i.test(text); }";
if(server.includes(oldBuy))server=server.replace(oldBuy,newBuy);
const menuFunction="function rdsRouterMessageV2(settings){const bot=normalizeBR(connectedNumber||'');const buyText=encodeURIComponent('COMPRAR');const buyLink=bot?'https://wa.me/'+bot+'?text='+buyText:'';return '🍀 *CANAL DE VENDAS RDS*\\n\\n'+'1️⃣ *COMPRAR BILHETES*'+(buyLink?'\\n👉 '+buyLink:'')+'\\n2️⃣ *CONSULTAR PEDIDO*\\n3️⃣ *ALTERAR PEDIDO*\\n4️⃣ *CANCELAR PEDIDO*\\n5️⃣ *ATENDIMENTO*\\n6️⃣ *OUTRAS OPÇÕES*\\n\\nEscolha uma opção pelo número.';}";
if(!server.includes('function rdsRouterMessageV2('))server=server.replace('function isBuyRoute',menuFunction+'\nfunction isBuyRoute');
fs.writeFileSync(serverPath,server,'utf8');
fs.writeFileSync(cleanPath,clean,'utf8');

await import('./runtime-v10.71-ops-extension-final.mjs');
await import('./runtime-rds-final-rules.mjs');
await import('./runtime-rds-interval-fix.mjs');
await import('./runtime-rds-menu-refinement.mjs');
await import('./runtime-rds-flow-hardening.mjs');
await import('./runtime-v10.71-stable-runtime.mjs');
