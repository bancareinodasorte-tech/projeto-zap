import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS PIX LABEL V6';
if(server.includes(marker)){
  console.log('[RDS] rótulo PIX V6 já aplicado');
  process.exit(0);
}
const target='📋 *PIX COPIA E COLA:*';
if(!server.includes(target))throw new Error('rótulo PIX V5 não localizado');
server=server.replaceAll(target,'📋 *CHAVE PIX 👇*');
server='// RDS PIX LABEL V6\n'+server;
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] rótulo PIX alterado para CHAVE PIX');
