import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');
const appPath=path.join(__dirname,'app.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');

  s=s.replace(
    "    const eligible=rows.filter(d=>String(d.cancel_reason||'')==='CLIENTE_EM_PEDIDO');\n    for(const d of eligible){\n      await patch('rds10_deliveries','id=eq.'+d.id,{status:'AGENDADA',scheduled_at:new Date(Math.max(Date.now(),Date.parse(d.scheduled_at||'')||0)).toISOString(),updated_at:nowISO()});\n    }",
    "    const now=Date.now();\n    const eligible=rows.filter(d=>String(d.cancel_reason||'')==='CLIENTE_EM_PEDIDO' && Number.isFinite(Date.parse(d.scheduled_at||'')) && Date.parse(d.scheduled_at)>now);\n    for(const d of eligible){\n      await patch('rds10_deliveries','id=eq.'+d.id,{status:'AGENDADA',scheduled_at:new Date(Date.parse(d.scheduled_at)).toISOString(),updated_at:nowISO()});\n    }"
  );

  if(!s.includes('RDS_PAYMENT_REMINDERS_V1')){
    const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
    const pos=s.indexOf(marker);
    if(pos<0)throw new Error('ponto de inserção dos lembretes PIX não localizado');

    const block=[
"// RDS_PAYMENT_REMINDERS_V1",
"async function rdsPaymentReminderConfig(){",
"  try{",
"    const e=await one('rds10_events','select=payload&kind=eq.CONFIG_PAYMENT_REMINDERS&order=created_at.desc&limit=1');",
"    const p=e?.payload||{};",
"    return {enabled:p.enabled!==false,interval_hours:Math.max(0.25,Math.min(24,Number(p.interval_hours||1))),max_reminders:Math.max(1,Math.min(10,Number(p.max_reminders||3)))};",
"  }catch{return {enabled:true,interval_hours:1,max_reminders:3};}",
"}",
"async function rdsPaymentReminderCount(orderId){",
"  try{const xs=await list('rds10_events','select=id&kind=like.RDS_PIX_REMINDER_'+encodeURIComponent(orderId)+'_%25&limit=20');return xs.length;}catch{return 0;}",
"}",
"async function rdsPaymentReminderProcess(){",
"  try{",
"    const cfg=await rdsPaymentReminderConfig();",
"    if(!cfg.enabled||!connected)return {sent:0,enabled:cfg.enabled};",
"    const expiration=typeof rdsOrderExpirationHours==='function'?await rdsOrderExpirationHours():4;",
"    const rows=await list('rds10_orders','select=*&status=eq.AGUARDANDO_PAGAMENTO&order=updated_at.asc&limit=500');",
"    let sent=0;",
"    for(const o of rows){",
"      if(!o?.id||!o.phone)continue;",
"      const base=Date.parse(o.updated_at||o.created_at||'');",
"      if(!Number.isFinite(base))continue;",
"      const ageHours=(Date.now()-base)/3600000;",
"      if(ageHours<0||ageHours>=expiration)continue;",
"      const count=await rdsPaymentReminderCount(o.id);",
"      if(count>=cfg.max_reminders)continue;",
"      const nextAt=cfg.interval_hours*(count+1);",
"      if(ageHours<nextAt)continue;",
"      const seq=count+1;",
"      const text='⏰ *LEMBRETE DE PAGAMENTO*\nSeu pedido *'+cleanText(o.code||'')+'* continua aguardando o pagamento PIX de *R$ '+money(o.total_amount||0)+'*.\n\nAinda está dentro do prazo para concluir o pagamento. Após pagar, envie o comprovante aqui para continuarmos.\n\nSe você não quiser mais este pedido, basta informar *CANCELAR*.';",
"      try{",
"        await sendTextPhone(o.phone,text);",
"        await logEvent('RDS_PIX_REMINDER_'+o.id+'_'+seq,{order_id:o.id,order:o.code,phone:phoneKey(o.phone),seq,interval_hours:cfg.interval_hours,max_reminders:cfg.max_reminders});",
"        sent++;",
"      }catch(e){await addAlert('ERRO_LEMBRETE_PIX','Falha no lembrete PIX — '+o.code,{order:o.code,phone:o.phone,error:e.message});}",
"    }",
"    return {sent,enabled:true};",
"  }catch(e){console.error('[RDS] lembretes PIX:',e.message);return {sent:0,enabled:false,error:e.message};}",
"}",
"app.get('/api/payment-reminders',async(req,res)=>{try{res.json(await rdsPaymentReminderConfig());}catch(e){res.status(500).json({error:e.message});}});",
"app.put('/api/payment-reminders',async(req,res)=>{try{const enabled=req.body?.enabled!==false;const interval_hours=Math.max(0.25,Math.min(24,Number(req.body?.interval_hours||1)));const max_reminders=Math.max(1,Math.min(10,Number(req.body?.max_reminders||3)));await logEvent('CONFIG_PAYMENT_REMINDERS',{enabled,interval_hours,max_reminders});res.json({ok:true,enabled,interval_hours,max_reminders});}catch(e){res.status(400).json({error:e.message});}});",
"app.post('/api/payment-reminders/run',async(req,res)=>{try{res.json(await rdsPaymentReminderProcess());}catch(e){res.status(500).json({error:e.message});}});",
"setTimeout(()=>rdsPaymentReminderProcess().catch(()=>{}),30000);",
"setInterval(()=>rdsPaymentReminderProcess().catch(()=>{}),60000);",
""
    ].join('\n');
    s=s.slice(0,pos)+block+s.slice(pos);
  }

  const oldCancel="app.post('/api/orders/:id/cancel',async(req,res)=>{ try{await patch('rds10_orders','id=eq.'+req.params.id,{status:'CANCELADO',updated_at:nowISO()});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});} });";
  const newCancel="app.post('/api/orders/:id/cancel',async(req,res)=>{ try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');if(['CONCLUIDO','CANCELADO'].includes(String(o.status||'')))throw new Error('Este pedido já foi encerrado.');await patch('rds10_orders','id=eq.'+o.id,{status:'CANCELADO',updated_at:nowISO()});if(typeof rdsRestoreQueueAfterExpiration==='function')await rdsRestoreQueueAfterExpiration(o.phone);await logEvent('PEDIDO_CANCELADO',{order:o.code,phone:o.phone,source:'OPERADOR'});res.json({ok:true,requeued:true});}catch(e){res.status(400).json({error:e.message});} });";
  if(s.includes(oldCancel))s=s.replace(oldCancel,newCancel);

  fs.writeFileSync(serverPath,s,'utf8');
}catch(e){console.error('[RDS] backend payment reminders:',e.message);process.exitCode=1;}

