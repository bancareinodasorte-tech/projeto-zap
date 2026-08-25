import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');

  const inboundNeedle=`  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName,rawKeys:inbound.rawKeys}});\n`;
  if(s.includes(inboundNeedle) && !s.includes("CLIENTE_RESPONDEU_V1017")){
    s=s.replace(inboundNeedle,inboundNeedle+`  // V10.17: qualquer retorno real retira o cliente dos lembretes futuros da campanha.\n  if(identity.phone){ await cancelFutureDeliveries(identity.phone,'CLIENTE_RESPONDEU_V1017'); }\n`);
  }

  const routeMarker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  if(s.includes(routeMarker) && !s.includes('/api/v1017/engagement')){
    const routes=`\n// ---------------- V10.17 Retornos x Ignorados ----------------\napp.get('/api/v1017/engagement',async(req,res)=>{\n  try{\n    const hours=Math.max(1,Math.min(168,Number(req.query.hours||12)));\n    const since=new Date(Date.now()-30*24*60*60*1000).toISOString();\n    const [sent,inbound,orders,contacts]=await Promise.all([\n      list('rds10_deliveries',\`select=id,phone,campaign_id,campaign_code,step_index,sent_at,status&status=eq.ENVIADA&sent_at=gte.\${encodeURIComponent(since)}&order=sent_at.desc&limit=5000\`),\n      list('rds10_messages',\`select=phone,created_at&direction=eq.IN&created_at=gte.\${encodeURIComponent(since)}&order=created_at.desc&limit=5000\`),\n      list('rds10_orders','select=id,phone,status,updated_at,completed_at&order=updated_at.desc&limit=3000'),\n      list('rds10_contacts','select=id,name,phone,group_name&status=eq.ATIVO')\n    ]);\n    const latest=new Map();\n    for(const d of sent){\n      const p=phoneKey(d.phone); if(!p||latest.has(p)) continue; latest.set(p,d);\n    }\n    const inboundBy=new Map();\n    for(const m of inbound){ const p=phoneKey(m.phone); if(!p) continue; if(!inboundBy.has(p)) inboundBy.set(p,[]); inboundBy.get(p).push(m); }\n    const ordersBy=new Map();\n    for(const o of orders){ const p=phoneKey(o.phone); if(!p) continue; if(!ordersBy.has(p)) ordersBy.set(p,[]); ordersBy.get(p).push(o); }\n    const contactsBy=new Map(contacts.map(c=>[phoneKey(c.phone),c]).filter(x=>x[0]));\n    const rows=[];\n    for(const [phone,d] of latest){\n      const sentAt=new Date(d.sent_at||0);\n      const ageHours=Math.max(0,(Date.now()-sentAt.getTime())/3600000);\n      const msgs=inboundBy.get(phone)||[];\n      const responded=msgs.some(m=>new Date(m.created_at)>sentAt);\n      const os=ordersBy.get(phone)||[];\n      const purchased=os.some(o=>o.status==='CONCLUIDO' && new Date(o.completed_at||o.updated_at||0)>=sentAt);\n      const active=os.some(o=>!['CONCLUIDO','CANCELADO'].includes(String(o.status||'')));\n      let engagement='AGUARDANDO';\n      if(purchased) engagement='COMPROU';\n      else if(active) engagement='EM_PEDIDO';\n      else if(responded) engagement='RESPONDEU';\n      else if(ageHours>=hours) engagement='IGNORADO';\n      const c=contactsBy.get(phone)||null;\n      rows.push({phone,name:c?.name||phone,contact_id:c?.id||null,group_name:c?.group_name||null,campaign_code:d.campaign_code||null,sent_at:d.sent_at,age_hours:Number(ageHours.toFixed(1)),engagement});\n    }\n    rows.sort((a,b)=>new Date(b.sent_at)-new Date(a.sent_at));\n    const count=x=>rows.filter(r=>r.engagement===x).length;\n    res.json({hours,summary:{sent:rows.length,responded:count('RESPONDEU'),ignored:count('IGNORADO'),in_order:count('EM_PEDIDO'),purchased:count('COMPROU'),waiting:count('AGUARDANDO')},rows});\n  }catch(e){ res.status(500).json({error:e.message}); }\n});\n\n`;
    s=s.replace(routeMarker,routes+routeMarker);
  }

  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.17] classificação Retornos x Ignorados ativada');
}catch(e){
  console.error('[V10.17] engagement:',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.16-core-media.mjs');
