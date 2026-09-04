import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS ORDER EXPIRATION CRM FINAL V2';
if(s.includes(marker)){
  console.log('[RDS] expiração/CRM final V2 já aplicada');
  process.exit(0);
}

const block = String.raw`
${marker}

async function rdsOrderExpirationHours(){
  try{
    const st=await getSettings();
    const n=Number(st?.order_expiration_hours||3);
    return Math.max(0.25,Math.min(168,n));
  }catch{return 3;}
}

async function rdsEnsureInterestedContact(phone,name,lid){
  try{
    const p=normalizeBR(phone);
    if(!validBRPhone(p))return;
    const existing=await one('rds10_contacts','select=*&phone=eq.'+encodeURIComponent(p));
    const data={name:cleanText(name)||'SEM NOME',phone:p,group_name:'INTERESSADOS',status:'ATIVO',origin:'PEDIDO',whatsapp_validated:true,validated:true,last_seen_at:nowISO(),updated_at:nowISO()};
    if(lid)data.lid=String(lid);
    if(existing){
      await patch('rds10_contacts','id=eq.'+existing.id,data);
    }else{
      await insert('rds10_contacts',data,'minimal');
    }
  }catch(e){console.error('[RDS] CRM interessado:',e.message);}
}

async function rdsRestoreQueueAfterExpiration(phone){
  try{
    const p=normalizeBR(phone);
    if(!validBRPhone(p))return;
    const rows=await list('rds10_deliveries','select=id,scheduled_at,cancel_reason&phone=eq.'+encodeURIComponent(p)+'&status=eq.CANCELADA&limit=1000');
    const eligible=rows.filter(d=>String(d.cancel_reason||'')==='CLIENTE_EM_PEDIDO');
    for(const d of eligible){
      await patch('rds10_deliveries','id=eq.'+d.id,{status:'AGENDADA',scheduled_at:new Date(Math.max(Date.now(),Date.parse(d.scheduled_at||'')||0)).toISOString(),updated_at:nowISO()});
    }
    if(eligible.length)console.log('[RDS] fila restaurada após expiração:',eligible.length);
  }catch(e){console.error('[RDS] fila após expiração:',e.message);}
}

async function rdsExpireOneOrder(order){
  if(!order?.id)return false;
  const status=String(order.status||'');
  if(!['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(status))return false;
  const created=Date.parse(order.created_at||'');
  const hours=await rdsOrderExpirationHours();
  if(!Number.isFinite(created)||Date.now()-created < hours*3600000)return false;
  await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',updated_at:nowISO()});
  await rdsRestoreQueueAfterExpiration(order.phone);
  console.log('[RDS] pedido expirado:',order.code,'após',hours,'h');
  return true;
}

async function rdsExpireActiveOrders(){
  try{
    const rows=await list('rds10_orders','select=*&status=in.(COLETANDO_DADOS,AGUARDANDO_PAGAMENTO)&order=created_at.asc&limit=500');
    for(const order of rows)await rdsExpireOneOrder(order);
  }catch(e){console.error('[RDS] expiração automática:',e.message);}
}

app.get('/api/order-expiration',async(req,res)=>{
  try{res.json({hours:await rdsOrderExpirationHours(),default_hours:3});}
  catch(e){res.status(500).json({error:e.message});}
});

app.put('/api/order-expiration',async(req,res)=>{
  try{
    const hours=Math.max(0.25,Math.min(168,Number(req.body?.hours||3)));
    const st=await one('rds10_settings','select=id&limit=1');
    if(!st?.id)throw new Error('Configuração principal não encontrada.');
    await patch('rds10_settings','id=eq.'+encodeURIComponent(st.id),{order_expiration_hours:hours,updated_at:nowISO()});
    res.json({ok:true,hours});
  }catch(e){res.status(400).json({error:e.message});}
});

const rdsOriginalHandleInboundForExpiration=handleInbound;
handleInbound=async function(message){
  const identity=resolveInboundIdentity(message);
  try{
    if(identity.phone){
      const before=await activeOrder(identity.phone);
      if(before)await rdsExpireOneOrder(before);
    }
  }catch(e){console.error('[RDS] pré-expiração inbound:',e.message);}
  await rdsOriginalHandleInboundForExpiration(message);
  try{
    if(identity.phone){
      const after=await activeOrder(identity.phone);
      if(after && Number(after.quantity||0)>0 && cleanText(after.customer_name) && cleanText(after.customer_tax_id)){
        await rdsEnsureInterestedContact(identity.phone,after.customer_name,identity.lid);
      }
    }
  }catch(e){console.error('[RDS] CRM pós-pedido:',e.message);}
};

setTimeout(()=>rdsExpireActiveOrders().catch(()=>{}),15000);
setInterval(()=>rdsExpireActiveOrders().catch(()=>{}),60000);
console.log('[RDS] expiração 3h editável + CRM de interessados + retorno de fila instalados');
`;

const anchor='app.listen(PORT,async()=>{';
const pos=s.indexOf(anchor);
if(pos<0)throw new Error('ponto de inserção não localizado');
s=s.slice(0,pos)+block+'\n'+s.slice(pos);
fs.writeFileSync(path,s,'utf8');
console.log('[RDS] expiração/CRM final V2 aplicada');