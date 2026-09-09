import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS ORDERS API LEAN V1';
if(server.includes(marker)){
  console.log('[RDS] API de pedidos leve já aplicada');
  process.exit(0);
}

const old="app.get('/api/orders',async(req,res)=>{ try{res.json(await list('rds10_orders','select=*&order=updated_at.desc'));}catch(e){res.status(500).json({error:e.message});} });";
const neu="// RDS ORDERS API LEAN V1\napp.get('/api/orders',async(req,res)=>{ try{res.json(await list('rds10_orders','select=id,code,contact_id,phone,customer_name,contact_phone,quantity,unit_price,total_amount,status,proof_type,proof_received_at,payment_confirmed_at,completed_at,last_inbound_text,created_at,updated_at,campaign_code,pagbank_order_id,pagbank_charge_id,pagbank_status,payment_method,payment_created_at,payment_updated_at,payment_last_error&order=updated_at.desc'));}catch(e){res.status(500).json({error:e.message});} });";
if(!server.includes(old)) throw new Error('Rota /api/orders original não localizada.');
server=server.replace(old,neu);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] API de pedidos leve aplicada');
