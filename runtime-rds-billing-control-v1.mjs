import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS BILLING CONTROL V1';
if(s.includes(marker)){ console.log('[RDS] controle de cobrança V1 já aplicado'); }
else{
  const anchor="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=s.indexOf(anchor);
  if(pos<0)throw new Error('ponto de inserção do controle de cobrança não localizado');
  const block=String.raw`
${marker}
async function rdsBillingControlRead(){
  let hours=4, enabled=true, interval_hours=1, max_reminders=3;
  try{
    const e=await one('rds10_events','select=kind,payload,created_at&kind=in.(CONFIG_ORDER_EXPIRATION,CONFIG_PAYMENT_REMINDERS)&order=created_at.desc&limit=20');
    for(const x of (Array.isArray(e)?e:[])){
      if(x.kind==='CONFIG_ORDER_EXPIRATION' && hours===4){
        const n=Number(x?.payload?.hours);
        if(Number.isFinite(n)&&n>=0.25&&n<=168)hours=n;
      }
      if(x.kind==='CONFIG_PAYMENT_REMINDERS' && enabled===true && interval_hours===1 && max_reminders===3){
        const p=x?.payload||{};
        if(typeof p.enabled==='boolean')enabled=p.enabled;
        const ih=Number(p.interval_hours), mr=Number(p.max_reminders);
        if(Number.isFinite(ih)&&ih>=0.25&&ih<=24)interval_hours=ih;
        if(Number.isFinite(mr)&&mr>=1&&mr<=10)max_reminders=mr;
      }
    }
  }catch{}
  return {hours,enabled,interval_hours,max_reminders};
}
app.get('/api/billing-control',async(req,res)=>{
  try{res.json({ok:true,...await rdsBillingControlRead()});}
  catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.put('/api/billing-control',async(req,res)=>{
  try{
    const rawHours=Number(req.body?.hours);
    const rawInterval=Number(req.body?.interval_hours);
    const rawMax=Number(req.body?.max_reminders);
    const hours=Math.max(0.25,Math.min(168,rawHours));
    const interval_hours=Math.max(0.25,Math.min(24,rawInterval));
    const max_reminders=Math.max(1,Math.min(10,rawMax));
    if(!Number.isFinite(rawHours)||!Number.isFinite(rawInterval)||!Number.isFinite(rawMax))throw new Error('Configuração de cobrança inválida.');
    const enabled=req.body?.enabled===true;
    await logEvent('CONFIG_ORDER_EXPIRATION',{hours,source:'BILLING_CONTROL'});
    await logEvent('CONFIG_PAYMENT_REMINDERS',{enabled,interval_hours,max_reminders,source:'BILLING_CONTROL'});
    try{
      const st=await one('rds10_settings','select=id&limit=1');
      if(st?.id)await patch('rds10_settings','id=eq.'+encodeURIComponent(st.id),{order_expiration_hours:hours,updated_at:nowISO()});
    }catch{}
    const saved=await rdsBillingControlRead();
    const ok=Math.abs(Number(saved.hours)-hours)<0.0001 &&
      Boolean(saved.enabled)===enabled &&
      Math.abs(Number(saved.interval_hours)-interval_hours)<0.0001 &&
      Number(saved.max_reminders)===max_reminders;
    if(!ok)throw new Error('O controle foi gravado, mas a confirmação de leitura não coincidiu.');
    res.json({ok:true,...saved});
  }catch(e){res.status(400).json({ok:false,error:e.message});}
});
`;
  s=s.slice(0,pos)+block+'\n'+s.slice(pos);
  fs.writeFileSync(path,s,'utf8');
  console.log('[RDS] controle de cobrança V1 aplicado');
}
