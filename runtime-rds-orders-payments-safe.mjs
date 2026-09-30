import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS ORDERS PAYMENTS SAFE V1';
if(server.includes(marker)){
  console.log('[RDS] API segura de Compras/Pagamentos já aplicada');
  process.exit(0);
}
const markerRoute="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(markerRoute);
if(pos<0)throw new Error('ponto de inserção das APIs de Compras/Pagamentos não localizado');
const block=`// RDS ORDERS PAYMENTS SAFE V2\napp.get('/api/payments',async(req,res)=>{\n  try{\n    if(typeof rdsOpSession!=='function')return res.status(503).json({error:'Autenticação de vendedor indisponível.'});\n    const s=await rdsOpSession(req);\n    if(!s)return res.status(401).json({error:'Sessão do vendedor inválida, expirada ou bloqueada.'});\n    const rows=await list('rds10_orders','select=id,code,phone,customer_name,quantity,total_amount,status,payment_method,pagbank_status,payment_created_at,payment_updated_at,payment_confirmed_at,updated_at&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&order=updated_at.desc&limit=100');\n    res.json(rows||[]);\n  }catch(e){res.status(500).json({error:e.message});}\n});\n`;
server=server.slice(0,pos)+block+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] API segura de Pagamentos aplicada');
