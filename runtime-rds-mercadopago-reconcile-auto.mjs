import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS MERCADO PAGO AUTO RECONCILE V1';
if(server.includes(marker)){
  console.log('[RDS] reconciliação automática Mercado Pago já aplicada');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para reconciliação Mercado Pago.');

const block=`${marker}
const RDS_MP_RECONCILE_MS=Math.max(15000,Number(process.env.MERCADOPAGO_RECONCILE_INTERVAL_MS||30000));
let rdsMpReconciling=false;
async function rdsRunMercadoPagoReconcile(){
  if(rdsMpReconciling)return;
  rdsMpReconciling=true;
  try{await rdsPagBankAutoReconcile();}
  catch(e){console.error('[RDS] Mercado Pago reconcile:',e?.message||e);}
  finally{rdsMpReconciling=false;}
}
setTimeout(()=>rdsRunMercadoPagoReconcile().catch(()=>{}),5000);
setInterval(()=>rdsRunMercadoPagoReconcile().catch(()=>{}),RDS_MP_RECONCILE_MS);
console.log('[RDS] Mercado Pago reconciliação automática ativa — intervalo '+RDS_MP_RECONCILE_MS+' ms');
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] reconciliação automática Mercado Pago instalada');
