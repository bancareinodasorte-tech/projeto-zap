import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));

// Desativa o disparador PIX legado V10.20. O novo motor abaixo passa a ser a unica fonte de lembretes PIX.
try{
 const p=path.join(__dirname,'runtime-v10.20-production-final.mjs');
 let s=fs.readFileSync(p,'utf8');
 const old="if(['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(o.status)&&cfg.payment_enabled&&age>=cfg.payment_delay){";
 const neu="if(false && ['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(o.status)&&cfg.payment_enabled&&age>=cfg.payment_delay){";
 if(s.includes(old)){s=s.replace(old,neu);fs.writeFileSync(p,s,'utf8');}
}catch(e){console.error('[V10.32 legacy guard]',e.message);}

const serverPath=path.join(__dirname,'server.js');
try{
 let s=fs.readFileSync(serverPath,'utf8');
 if(!s.includes('RDS_REMINDER_GUARD_V10_32')){
  const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=s.indexOf(marker); if(pos<0)throw new Error('ponto de insercao V10.32 nao localizado');
  const block=`// RDS_REMINDER_GUARD_V10_32\nasync function v1032Paused(orderId){\n const xs=await list('rds10_events',\`select=kind,created_at&kind=in.(V1032_PAUSE_\${orderId},V1032_RESUME_\${orderId})&order=created_at.desc&limit=1\`).catch(()=>[]);\n return xs[0]?.kind===\`V1032_PAUSE_\${orderId}\`;\n}\nasync function v1032Count(o){\n const xs=await list('rds10_events',\`select=kind,created_at&kind=like.V1032_PIX_\${o.id}_%25&order=created_at.desc&limit=20\`).catch(()=>[]); return xs.length;\n}\nasync function v1032Last(o){\n const xs=await list('rds10_events',\`select=created_at&kind=like.V1032_PIX_\${o.id}_%25&order=created_at.desc&limit=1\`).catch(()=>[]); return xs[0]?.created_at||null;\n}\nasync function v1032Process(){\n const cfg=await v1020Config();\n if(!cfg.enabled||!cfg.payment_enabled||!connected)return {ok:true,sent:0};\n const rows=await list('rds10_orders','select=*&status=in.(AGUARDANDO_PAGAMENTO,AGUARDANDO_COMPROVANTE)&order=updated_at.asc&limit=500').catch(()=>[]);\n let sent=0; const now=Date.now();\n for(const o of rows){\n  if(await v1032Paused(o.id))continue;\n  const n=await v1032Count(o); if(n>=cfg.payment_max)continue;\n  const base=new Date(o.updated_at||o.created_at||0).getTime(); if(!Number.isFinite(base)||base<=0)continue;\n  const last=await v1032Last(o);\n  const due=last ? new Date(last).getTime()+cfg.payment_repeat*60000 : base+cfg.payment_delay*60000;\n  if(now<due)continue;\n  const guard=await v1020CanSend(o,cfg); if(!guard.ok)continue;\n  const seq=n+1;\n  await sendTextPhone(o.phone,v1020Message(cfg.payment_message,o));\n  await logEvent(\`V1032_PIX_\${o.id}_\${seq}\`,{phone:phoneKey(o.phone),order_id:o.id,order:o.code,seq,delay:cfg.payment_delay,repeat:cfg.payment_repeat,max:cfg.payment_max});\n  sent++;\n }\n return {ok:true,sent};\n}\napp.get('/api/v1032/reminders',async(req,res)=>{try{\n const cfg=await v1020Config(); const rows=await list('rds10_orders','select=id,code,status&status=in.(AGUARDANDO_PAGAMENTO,AGUARDANDO_COMPROVANTE)&limit=500').catch(()=>[]);\n const orders=[]; for(const o of rows)orders.push({id:o.id,code:o.code,paused:await v1032Paused(o.id),sent:await v1032Count(o)});\n res.json({ok:true,enabled:cfg.enabled&&cfg.payment_enabled,delay:cfg.payment_delay,repeat:cfg.payment_repeat,max:cfg.payment_max,orders});\n}catch(e){res.status(500).json({error:e.message});}});\napp.post('/api/v1032/orders/:id/reminders',async(req,res)=>{try{\n const pause=req.body?.paused!==false; const o=await one('rds10_orders',\`select=id,code,status&id=eq.\${req.params.id}\`); if(!o)throw new Error('Pedido nao encontrado.');\n await logEvent(pause?\`V1032_PAUSE_\${o.id}\`:\`V1032_RESUME_\${o.id}\`,{order_id:o.id,order:o.code});\n res.json({ok:true,paused:pause});\n}catch(e){res.status(400).json({error:e.message});}});\nsetTimeout(()=>v1032Process().catch(()=>{}),30000);\nsetInterval(()=>v1032Process().catch(()=>{}),300000);\n\n`;
  s=s.slice(0,pos)+block+s.slice(pos); fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.32] motor PIX protegido aplicado');
 }
}catch(e){console.error('[V10.32]',e.message);process.exitCode=1;}

await import('./runtime-v10.31-sales-operations.mjs');
