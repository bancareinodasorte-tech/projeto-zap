import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS PIX LABEL V6';
if(server.includes(marker)){
  console.log('[RDS] rótulo PIX V6 já aplicado');
  process.exit(0);
}
const targets=['📋 *PIX COPIA E COLA:*','📋 *CHAVE PIX 👇*'];
let changed=false;
for(const target of targets){
  if(server.includes(target)){
    server=server.replaceAll(target,'🔑 *CHAVE PIX*');
    changed=true;
  }
}
server='// RDS PIX LABEL V6\n'+server;
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] rótulo PIX normalizado'+(changed?'':' (sem texto legado para substituir)'));
