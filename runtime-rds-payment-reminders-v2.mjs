import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS PAYMENT REMINDERS V2';
if(server.includes(marker)){console.log('[RDS] lembretes PIX V2 já aplicados');process.exit(0);}
const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para lembretes PIX V2.');

const block=[
  marker,
  "async function rdsPaymentReminderProcess(){",
  "  try{",
  "    const cfg=await rdsPaymentReminderConfig();",
  "    if(!cfg.enabled)return {sent:0,enabled:false};",
  "    const expiration=typeof rdsOrderExpirationHours==='function'?await rdsOrderExpirationHours():4;",
  "    const rows=await list('rds10_orders','select=*&status=eq.AGUARDANDO_PAGAMENTO&order=created_at.asc&limit=500');",
  "    let sent=0;",
  "    for(const o of rows){",
  "      if(!o?.id||!o.phone)continue;",
  "      const base=Date.parse(o.payment_created_at||o.created_at||'');",
  "      if(!Number.isFinite(base))continue;",
  "      const ageHours=(Date.now()-base)/3600000;",
  "      if(ageHours<0||ageHours>=expiration)continue;",
  "      const count=await rdsPaymentReminderCount(o.id);",
  "      if(count>=cfg.max_reminders)continue;",
  "      if(ageHours < cfg.interval_hours*(count+1))continue;",
  "      const seq=count+1;",
  "      const text='⏰ LEMBRETE DE PAGAMENTO: seu pedido '+cleanText(o.code||'')+' continua aguardando o pagamento PIX de R$ '+money(o.total_amount||0)+'. Ainda está dentro do prazo. Após pagar, aguarde a confirmação automática. Se não quiser mais este pedido, informe CANCELAR.';",
  "      try{",
  "        if(typeof sendTextPhone==='function')await sendTextPhone(o.phone,text);",
  "        else if(typeof replyInbound==='function')await replyInbound({phone:o.phone},text);",
  "        else throw new Error('Nenhum canal WhatsApp disponível para envio do lembrete.');",
  "        await logEvent('RDS_PIX_REMINDER_'+o.id+'_'+seq,{order_id:o.id,order:o.code,phone:phoneKey(o.phone),seq,interval_hours:cfg.interval_hours,max_reminders:cfg.max_reminders});",
  "        console.log('[RDS] lembrete PIX enviado',o.code,seq);",
  "        sent++;",
  "      }catch(e){",
  "        await addAlert('ERRO_LEMBRETE_PIX','Falha no lembrete PIX — '+o.code,{order:o.code,phone:o.phone,error:e.message});",
  "        console.error('[RDS] falha lembrete PIX',o.code,e.message);",
  "      }",
  "    }",
  "    return {sent,enabled:true};",
  "  }catch(e){console.error('[RDS] lembretes PIX V2:',e.message);return {sent:0,enabled:false,error:e.message};}",
  "}",
].join('\\n');
server=server.slice(0,pos)+block+'\\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] lembretes PIX V2 aplicados');