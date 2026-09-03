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
source = source.split("const {fileURLToPath,pathToFilePath}=require('node:url');").join("import { fileURLToPath, pathToFileURL } from 'node:url';");
source = source.split("const {fileURLToFilePath,pathToFileURL}=require('node:url');").join("import { fileURLToPath, pathToFileURL } from 'node:url';");
source = source.split("const {fileURLToPath,pathToFileURL}=require('node:url');").join("import { fileURLToPath, pathToFileURL } from 'node:url';");
source = source.split('match(/' + bs + bs + 'd+/)').join('match(/[0-9]+/)');
source = source.split('return /quantidade' + bs + bs + 's*[:' + bs + bs + '-]/i.test(text)&&/nome' + bs + bs + 's*[:' + bs + bs + '-]/i.test(text)&&/cpf' + bs + bs + 's*[:' + bs + bs + '-]/i.test(text);').join('return /quantidade/i.test(text)&&/nome/i.test(text)&&/cpf/i.test(text);');
source = source.split('if(!/^' + bs + bs + 'd{11}$/.test(cpf)||/^([0-9])' + bs + bs + '1{10}$/.test(cpf))return false;').join('if(cpf.length!==11||new Set(cpf).size===1)return false;');
source = source.split('replace(/' + bs + bs + 'D/g,\'\')').join("replace(/[^0-9]/g,'')");
source = source.split('.replace(/' + bs + bs + '/+$/,\'\')').join('');

const customerReturn="return {name,tax_id:tax,...(phone?{phones:[phone]}:{})};";
const customerReturnWithEmail="const email=String(process.env.PAGBANK_CUSTOMER_EMAIL||process.env.PAGBANK_MERCHANT_EMAIL||process.env.PAGBANK_EMAIL||'').trim();if(!email)throw new Error('PagBank exige customer.email. Configure PAGBANK_CUSTOMER_EMAIL no Render.');return {name,tax_id:tax,email,...(phone?{phones:[phone]}:{})};";
source = source.split(customerReturn).join(customerReturnWithEmail);

// Corrige o escape duplicado que fazia o WhatsApp receber "\\n" em vez de quebra de linha.
source = source.split('\\\\n').join('\\n');

// V10.67 — injeta a deduplicação no código interno que realmente lê o server.js.
// A V10.66 gerava \n literal fora de strings no módulo interno; aqui cada linha é
// construída explicitamente para que o arquivo gerado seja JavaScript válido.
const innerSourceNeedle="let source=fs.readFileSync(serverPath,'utf8');";
const innerSourcePatch=[
  "const inboundProcessedIds=new Map();",
  "const inboundRememberNeedle='        rememberMessage(m);';",
  "const inboundRememberReplacement=[",
  "  '        const inboundEventId=String(m?.key?.id||\\'\\');',",
  "  '        if(inboundEventId){',",
  "  '          const seenAt=inboundProcessedIds.get(inboundEventId);',",
  "  '          if(seenAt)continue;',",
  "  '          inboundProcessedIds.set(inboundEventId,Date.now());',",
  "  '          if(inboundProcessedIds.size>10000){const first=inboundProcessedIds.keys().next().value;inboundProcessedIds.delete(first);}',",
  "  '        }',",
  "  '        rememberMessage(m);'",
  "].join('\\n');",
  "source=source.replace(inboundRememberNeedle,inboundRememberReplacement);",
  "console.log('[V10.67] deduplicacao inbound instalada no messages.upsert');"
].join('\n');
const innerSourceReplacement=innerSourceNeedle+'\n'+innerSourcePatch;
if(!source.includes('V10.67] deduplicacao inbound instalada')){
  source=source.replace(innerSourceNeedle,innerSourceReplacement);
}

// Reconciliação automática do PagBank.
const autoBlockCode = [
  '// RDS_PAGBANK_AUTO_RECONCILE_V10_61',
  'const RDS_PAGBANK_AUTO_RECONCILE_MS=Math.max(15000,Number(process.env.PAGBANK_AUTO_RECONCILE_MS||30000));',
  'let rdsPagBankAutoBusy=false;',
  'async function rdsPagBankAutoReconcile(){',
  '  if(rdsPagBankAutoBusy||!rdsPagBankConfigured())return;',
  '  rdsPagBankAutoBusy=true;',
  '  try{',
  "    const orders=await list('rds10_orders','select=*&status=eq.AGUARDANDO_PAGAMENTO&pagbank_order_id=not.is.null&order=created_at.asc&limit=20');",
  '    for(const order of orders){',
  '      try{',
  "        const data=await rdsPagBankRequest('/orders/'+encodeURIComponent(order.pagbank_order_id));",
  "        await rdsApplyPagBankResult(order,data,'auto_reconcile');",
  '      }catch(e){',
  "        await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e?.message||e),payment_updated_at:nowISO(),updated_at:nowISO()}).catch(()=>{});",
  '      }',
  '    }',
  '  }finally{rdsPagBankAutoBusy=false;}',
  '}',
  'setTimeout(()=>rdsPagBankAutoReconcile().catch(()=>{}),5000);',
  'setInterval(()=>rdsPagBankAutoReconcile().catch(()=>{}),RDS_PAGBANK_AUTO_RECONCILE_MS);'
].join('\n');

if(!source.includes('RDS_PAGBANK_AUTO_RECONCILE_V10_61')){
  const autoBlockLiteral=JSON.stringify(autoBlockCode);
  source += "\nconst autoBlockCode=" + autoBlockLiteral + ";const autoPos=source.indexOf(marker);if(autoPos<0)throw new Error('Ponto de insercao da reconciliacao automatica nao localizado');source=source.slice(0,autoPos)+autoBlockCode+'\\n'+source.slice(autoPos);\n";
}

fs.writeFileSync(fixedPath, source, 'utf8');
console.log('[V10.67] generated runtime with valid inner inbound dedupe + automatic PagBank reconciliation');
await import(pathToFileURL(fixedPath).href + '?v=1067');
