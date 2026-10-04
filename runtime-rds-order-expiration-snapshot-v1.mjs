import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS ORDER EXPIRATION SNAPSHOT V1';
if(s.includes(marker)){
  console.log('[RDS] snapshot de expiração já aplicado');
}else{
  const anchor='app.listen(PORT,async()=>{';
  const pos=s.indexOf(anchor);
  if(pos<0)throw new Error('ponto de inserção do snapshot de expiração não localizado');
  const block=String.raw`
// RDS ORDER EXPIRATION SNAPSHOT V1
async function rdsSnapshotOrderExpiration(order){
  try{
    if(!order?.id)return order;
    const existing=order?.order_expires_at?Date.parse(order.order_expires_at):NaN;
    if(Number.isFinite(existing))return order;
    const hours=typeof rdsOrderExpirationHours==='function'?await rdsOrderExpirationHours():4;
    const created=Date.parse(order.created_at||'');
    if(!Number.isFinite(created))return order;
    const expiresAt=new Date(created+Number(hours)*3600000).toISOString();
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{order_expires_at:expiresAt,updated_at:nowISO()});
    return {...order,order_expires_at:expiresAt};
  }catch(e){
    console.warn('[RDS] snapshot de expiração não gravado:',e?.message||e);
    return order;
  }
}
const rdsOriginalCreateOrderForExpiration=createOrder;
createOrder=async function(phone,campaignCode=null){
  const order=await rdsOriginalCreateOrderForExpiration(phone,campaignCode);
  return rdsSnapshotOrderExpiration(order);
};
`;
  s=s.slice(0,pos)+block+'\n'+s.slice(pos);
  fs.writeFileSync(path,s,'utf8');
  console.log('[RDS] snapshot de expiração aplicado');
}