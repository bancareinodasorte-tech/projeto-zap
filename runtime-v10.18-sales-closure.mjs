import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  if(s.includes(marker) && !s.includes('/api/v1018/sales-pipeline')){
    const routes=`\n// ---------------- V10.18 Fechamento comercial ----------------\napp.get('/api/v1018/sales-pipeline',async(req,res)=>{\n  try{\n    const rows=await list('rds10_orders','select=*&order=updated_at.desc&limit=500');\n    const active=rows.filter(o=>!['CONCLUIDO','CANCELADO'].includes(String(o.status||'')));\n    const concluded=rows.filter(o=>String(o.status||'')==='CONCLUIDO');\n    const sum=xs=>Number(xs.reduce((a,o)=>a+Number(o.total_amount||0),0).toFixed(2));\n    const byStatus={}; for(const o of active) byStatus[o.status]=(byStatus[o.status]||0)+1;\n    res.json({summary:{active:active.length,collecting:byStatus.COLETANDO_DADOS||0,waiting_payment:(byStatus.AGUARDANDO_PAGAMENTO||0)+(byStatus.AGUARDANDO_COMPROVANTE||0),checking:byStatus.AGUARDANDO_CONFERENCIA||0,waiting_tickets:byStatus.PAGO_AGUARDANDO_BILHETES||0,concluded:concluded.length,revenue:sum(concluded)},orders:active});\n  }catch(e){res.status(500).json({error:e.message});}\n});\napp.post('/api/v1018/orders/:id/confirm-payment',async(req,res)=>{\n  try{\n    const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`); if(!o) throw new Error('Pedido não encontrado.');\n    if(String(o.status)!=='AGUARDANDO_CONFERENCIA') throw new Error('Pedido não está aguardando conferência.');\n    await patch('rds10_orders',\`id=eq.\${o.id}\`,{status:'PAGO_AGUARDANDO_BILHETES',payment_confirmed_at:nowISO(),updated_at:nowISO()});\n    await cancelFutureDeliveries(o.phone,'PAGAMENTO_CONFIRMADO');\n    await sendTextPhone(o.phone,\`✅ Pagamento confirmado!\\nPedido *\${o.code}*.\\nAgora vamos preparar e enviar seus bilhetes.\`);\n    await logEvent('PAGAMENTO_CONFIRMADO',{phone:o.phone,order:o.code});\n    res.json({ok:true});\n  }catch(e){res.status(400).json({error:e.message});}\n});\napp.post('/api/v1018/orders/:id/complete',async(req,res)=>{\n  try{\n    const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`); if(!o) throw new Error('Pedido não encontrado.');\n    if(String(o.status)!=='PAGO_AGUARDANDO_BILHETES') throw new Error('Confirme o pagamento antes de concluir.');\n    await patch('rds10_orders',\`id=eq.\${o.id}\`,{status:'CONCLUIDO',completed_at:nowISO(),updated_at:nowISO()});\n    await cancelFutureDeliveries(o.phone,'COMPRA_CONCLUIDA');\n    await sendTextPhone(o.phone,\`🎟️ Bilhetes enviados!\\nPedido *\${o.code}* concluído com sucesso. Obrigado pela compra!\`);\n    await logEvent('COMPRA_CONCLUIDA',{phone:o.phone,order:o.code,total:o.total_amount});\n    res.json({ok:true});\n  }catch(e){res.status(400).json({error:e.message});}\n});\n\n`;
    s=s.replace(marker,routes+marker);
  }
  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.18] fechamento comercial ativado');
}catch(e){console.error('[V10.18]',e.message);process.exitCode=1;}

await import('./runtime-v10.17-engagement.mjs');
