import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(dir, 'runtime-v10.60-pagbank.mjs');
const fixedPath = path.join(dir, 'runtime-v10.60-pagbank-fixed.mjs');

let source = fs.readFileSync(sourcePath, 'utf8');
const bs = String.fromCharCode(92);

source = source.split("const fs=require('node:fs');").join("import fs from 'node:fs';");
source = source.split("const path=require('node:path');").join("import path from 'node:path';");
source = source.split("const {fileURLToPath,pathToFileURL}=require('node:url');").join("import { fileURLToPath, pathToFileURL } from 'node:url';");
source = source.split('match(/' + bs + bs + 'd+/)').join('match(/[0-9]+/)');
source = source.split('return /quantidade' + bs + bs + 's*[:' + bs + bs + '-]/i.test(text)&&/nome' + bs + bs + 's*[:' + bs + bs + '-]/i.test(text)&&/cpf' + bs + bs + 's*[:' + bs + bs + '-]/i.test(text);').join('return /quantidade/i.test(text)&&/nome/i.test(text)&&/cpf/i.test(text);');
source = source.split('if(!/^' + bs + bs + 'd{11}$/.test(cpf)||/^([0-9])' + bs + bs + '1{10}$/.test(cpf))return false;').join('if(cpf.length!==11||new Set(cpf).size===1)return false;');
source = source.split('replace(/' + bs + bs + 'D/g,\'\')').join("replace(/[^0-9]/g,'')");
source = source.split('.replace(/' + bs + bs + '/+$/,\'\')').join('');

const customerReturn="return {name,tax_id:tax,...(phone?{phones:[phone]}:{})};";
const customerReturnWithEmail="const email=String(process.env.PAGBANK_CUSTOMER_EMAIL||process.env.PAGBANK_MERCHANT_EMAIL||process.env.PAGBANK_EMAIL||'').trim();if(!email)throw new Error('PagBank exige customer.email. Configure PAGBANK_CUSTOMER_EMAIL no Render.');return {name,tax_id:tax,email,...(phone?{phones:[phone]}:{})};";
source = source.split(customerReturn).join(customerReturnWithEmail);

fs.writeFileSync(fixedPath, source, 'utf8');
await import(pathToFileURL(fixedPath).href + '?v=1060fixed5');
