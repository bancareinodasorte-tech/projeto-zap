import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  if(s.includes(marker) && !s.includes('/api/v1023/readiness')){
    const block=`\n// ---------------- V10.23 FINAL READINESS ----------------\nasync function v1023Readiness(){\n  const checks={database:false,whatsapp:Boolean(connected),settings:false,automation:false};\n  const details={};\n  try{await one('rds10_settings','select=*&limit=1');checks.database=true;}catch(e){details.database=e.message;}\n  try{const st=await getSettings();checks.settings=Boolean(st);details.unit_price=Number(st?.unit_price||0);}catch(e){details.settings=e.message;}\n  try{const cfg=typeof v1020Config==='function'?await v1020Config():null;checks.automation=Boolean(cfg);details.automation_enabled=cfg?.enabled!==false;}catch(e){details.automation=e.message;}\n  details.connected_number=connectedNumber||'';\n  details.last_connection_at=lastConnectionAt||null;\n  details.last_error=lastError||'';\n  const required=['database','whatsapp','settings','automation'];\n  const passed=required.filter(k=>checks[k]).length;\n  return {ok:passed===required.length,status:passed===required.length?'PRONTO':'ATENCAO',passed,total:required.length,checks,details,checked_at:nowISO()};\n}\napp.get('/api/v1023/readiness',async(req,res)=>{try{res.json(await v1023Readiness());}catch(e){res.status(500).json({ok:false,status:'ERRO',error:e.message});}});\napp.get('/api/v1023/diagnostic',async(req,res)=>{\n  try{\n    const ready=await v1023Readiness();\n    const orders=await list('rds10_orders','select=id,status&limit=1000').catch(()=>[]);\n    const deliveries=await list('rds10_deliveries','select=id,status&limit=1000').catch(()=>[]);\n    const messages=await list('rds10_messages','select=id,direction,status&limit=1000').catch(()=>[]);\n    const count=(xs,key,val)=>xs.filter(x=>String(x?.[key]||'')===val).length;\n    res.json({...ready,operational:{orders_total:orders.length,orders_active:orders.filter(x=>!['CONCLUIDO','CANCELADO'].includes(x.status)).length,deliveries_pending:count(deliveries,'status','PENDENTE'),deliveries_sent:count(deliveries,'status','ENVIADA'),messages_in:count(messages,'direction','IN'),messages_out:count(messages,'direction','OUT')}});\n  }catch(e){res.status(500).json({ok:false,error:e.message});}\n});\n\n`;
    s=s.replace(marker,block+marker);
  }
  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.23] diagnóstico final e prontidão operacional ativados');
}catch(e){console.error('[V10.23]',e.message);process.exitCode=1;}

await import('./runtime-v10.22-reminder-consolidation.mjs');
