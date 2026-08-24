import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');

  if(!s.includes('RDS_ORDER_LIFECYCLE_V10_5_4')){
    const old=`async function activeOrder(phone){\n  return one('rds10_orders',\`select=*&phone=eq.\${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc\`);\n}`;
    const neu=`// RDS_ORDER_LIFECYCLE_V10_5_4\nconst ORDER_TIMEOUTS_MIN={COLETANDO_DADOS:120,AGUARDANDO_PAGAMENTO:720};\nasync function currentOrderTimeoutMinutes(){\n  if(typeof getOrderTimeoutConfig==='function'){ const c=await getOrderTimeoutConfig(); return {COLETANDO_DADOS:Number(c.collect_hours||2)*60,AGUARDANDO_PAGAMENTO:Number(c.payment_hours||12)*60}; }\n  return ORDER_TIMEOUTS_MIN;\n}\nasync function orderExpired(o){\n  const cfg=await currentOrderTimeoutMinutes();\n  const lim=cfg[o?.status];\n  if(!lim) return false;\n  const t=new Date(o.updated_at||o.created_at||0).getTime();\n  return Number.isFinite(t) && t>0 && (Date.now()-t) >= lim*60000;\n}\nasync function expireOrder(o,source='AUTO'){\n  if(!o?.id || !(await orderExpired(o))) return false;\n  const cfg=await currentOrderTimeoutMinutes();\n  await patch('rds10_orders',\`id=eq.\${o.id}\`,{status:'CANCELADO',updated_at:nowISO()});\n  await logEvent('PEDIDO_EXPIRADO',{order:o.code,phone:o.phone,status:o.status,source,timeout_minutes:cfg[o.status]});\n  return true;\n}\nasync function activeOrder(phone){\n  const o=await one('rds10_orders',\`select=*&phone=eq.\${encodeURIComponent(phone)}&status=not.in.(CONCLUIDO,CANCELADO)&order=created_at.desc\`);\n  if(!o) return null;\n  if(await expireOrder(o,'ACTIVE_ORDER')) return null;\n  return o;\n}\nasync function cleanupExpiredOrders(){\n  try{\n    const rows=await list('rds10_orders','select=*&status=in.(COLETANDO_DADOS,AGUARDANDO_PAGAMENTO)&order=updated_at.asc&limit=500');\n    let n=0;\n    for(const o of rows) if(await expireOrder(o,'SCHEDULED_CLEANUP')) n++;\n    if(n) console.log(\`[V10.5.4] \${n} pedido(s) abandonado(s) encerrado(s) automaticamente\`);\n  }catch(e){ console.error('[V10.5.4] cleanup:',e.message); }\n}`;
    if(!s.includes(old)) throw new Error('activeOrder não localizado');
    s=s.replace(old,neu);

    const listen=`app.listen(PORT,async()=>{\n  console.log(\`CANAL DE VENDAS RDS V10 FINAL 10.3 — porta \${PORT}\`);\n  try{ await startWhatsApp(false); }catch(e){ console.error('WhatsApp aguardando:',e.message); }\n});`;
    const listenNew=`app.listen(PORT,async()=>{\n  console.log(\`CANAL DE VENDAS RDS V10 FINAL 10.3 — porta \${PORT}\`);\n  try{ await startWhatsApp(false); }catch(e){ console.error('WhatsApp aguardando:',e.message); }\n  setTimeout(()=>cleanupExpiredOrders().catch(()=>{}),15000);\n  setInterval(()=>cleanupExpiredOrders().catch(()=>{}),300000);\n});`;
    if(!s.includes(listen)) throw new Error('app.listen não localizado');
    s=s.replace(listen,listenNew);
  }

  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.5.4] ciclo automático de pedidos aplicado: tempos padrão 2h / 12h');
}catch(e){
  console.error('[V10.5.4] falha:',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.5.3-scale-operations.mjs');
