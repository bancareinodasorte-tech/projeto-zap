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
    const exp=await one('rds10_events','select=payload,created_at&kind=eq.CONFIG_ORDER_EXPIRATION&order=created_at.desc&limit=1');
    const rem=await one('rds10_events','select=payload,created_at&kind=eq.CONFIG_PAYMENT_REMINDERS&order=created_at.desc&limit=1');
    const eh=Number(exp?.payload?.hours);
    if(Number.isFinite(eh)&&eh>=0.25&&eh<=168)hours=eh;
    const p=rem?.payload||{};
    if(typeof p.enabled==='boolean')enabled=p.enabled;
    const ih=Number(p.interval_hours), mr=Number(p.max_reminders);
    if(Number.isFinite(ih)&&ih>=0.25&&ih<=24)interval_hours=ih;
    if(Number.isFinite(mr)&&mr>=1&&mr<=10)max_reminders=mr;
  }catch{}
  return rdsNormalizeBillingControl({hours,enabled,interval_hours,max_reminders});
}
function rdsNormalizeBillingControl(input){
  const hours=Math.max(0.25,Math.min(168,Number(input?.hours)||4));
  const enabled=input?.enabled!==false;
  let interval=Math.max(0.25,Math.min(24,Number(input?.interval_hours)||1));
  let max=Math.max(1,Math.min(10,Math.floor(Number(input?.max_reminders)||3)));
  if(enabled){
    if(interval>=hours){
      const candidates=[0.5,1,2,3,4,6,12].filter(x=>x<hours);
      interval=candidates.length?candidates[candidates.length-1]:Math.max(0.25,hours/2);
    }
    const safeMax=Math.max(1,Math.min(10,Math.ceil(hours/interval)-1));
    max=Math.min(max,safeMax);
  }
  return {hours,enabled,interval_hours:interval,max_reminders:max};
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
    if(!Number.isFinite(rawHours)||!Number.isFinite(rawInterval)||!Number.isFinite(rawMax))throw new Error('Configuração de cobrança inválida.');
    const normalized=rdsNormalizeBillingControl({hours:rawHours,enabled:req.body?.enabled===true,interval_hours:rawInterval,max_reminders:rawMax});
    const hours=normalized.hours;
    const interval_hours=normalized.interval_hours;
    const max_reminders=normalized.max_reminders;
    const enabled=normalized.enabled;
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
