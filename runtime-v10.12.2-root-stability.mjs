import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const appPath=path.join(__dirname,'app.js');

await import('./runtime-v10.12-postpayment.mjs');

try{
  let a=fs.readFileSync(appPath,'utf8');
  const old="    else if(page==='orders'){ await orders(); }\n";
  if(a.includes(old)){
    a=a.replace(old,"    else if(page==='orders'){ /* V10.12.2: Compras sem rerender automático */ }\n");
    fs.writeFileSync(appPath,a,'utf8');
    console.log('[V10.12.2] auto-refresh de Compras removido na origem');
  }else{
    console.log('[V10.12.2] ramo de auto-refresh de Compras já ausente');
  }
}catch(e){
  console.error('[V10.12.2] estabilidade Compras:',e.message);
  process.exitCode=1;
}
