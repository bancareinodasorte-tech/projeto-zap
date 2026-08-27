import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  if(!s.includes('RDS_PAGBANK_RECONCILE_V10_35')){
    const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
    const pos=s.indexOf(marker);
    if(pos<0) throw new Error('ponto de inserção V10.35 não localizado');
    const block=`// RDS_PAGBANK_RECONCILE_V10_35\nasync function rdsLatestPagBankEvent(order){\n const ev=await list('rds10_events','select=*&kind=eq.PAGBANK_PIX_CRIADO&order=created_at.desc&limit=200');\n return (ev||[]).find(x=>String(x?.payload?.order_id||'')===String(order.id)||String(x?.payload?.order||'')===String(order.code))||null;\n}\nfunction rdsPagBankPrimaryStatus(data){\n const c=Array.isArray(data?.charges)?data.charges[0]:null;\n return String(c?.status||data?.status||'WAITING').toUpperCase();\n}\nasync function rdsApplyPagBankPaid(order,data){\n if(!order||['CONCLUIDO','PAGO_AGUARDANDO_BILHETES'].includes(order.status))return false;\n await patch('rds10_orders',\`id=eq.\${order.id}\`,{status:'PAGO_AGUARDANDO_BILHETES',updated_at:nowISO()});\n await addAlert('PIX_CONFIRMADO',\`PIX confirmado automaticamente — \${order.code}\`,{order:order.code,phone:order.phone,pagbank_order_id:data?.id||null});\n await logEvent('PAGAMENTO_CONFIRMADO_PAGBANK',{order_id:order.id,order:order.code,pagbank_order_id:data?.id||null,source:'consulta'});\n try{await sendTextPhone(order.phone,\`✅ *PIX CONFIRMADO*\\nPedido *\${order.code}*.\\nPagamento identificado pelo PagBank. Seus bilhetes serão emitidos e enviados em seguida.\`);}catch{}\n return true;\n}\napp.post('/api/pagbank/orders/:id/reconcile',async(req,res)=>{\n try{\n  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`);if(!o)throw new Error('Pedido não encontrado.');\n  const ev=await rdsLatestPagBankEvent(o);const remoteId=String(ev?.payload?.pagbank_order_id||'');\n  if(!remoteId)throw new Error('Este pedido ainda não possui PIX PagBank gerado.');\n  const data=await rdsPagBankRequest('/orders/'+encodeURIComponent(remoteId));\n  const status=rdsPagBankPrimaryStatus(data);const paid=rdsPagBankPaid(data)||status==='PAID';\n  let updated=false;if(paid)updated=await rdsApplyPagBankPaid(o,data);\n  await logEvent('PAGBANK_CONSULTA',{order_id:o.id,order:o.code,pagbank_order_id:remoteId,status,paid});\n  res.json({ok:true,status,paid,updated,pagbank_order_id:remoteId,environment:PAGBANK_ENV});\n }catch(e){res.status(400).json({ok:false,error:e.message});}\n});\n\n`;
    s=s.slice(0,pos)+block+s.slice(pos);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.35] consulta/reconciliação PagBank aplicada');
  }
}catch(e){console.error('[V10.35]',e.message);process.exitCode=1;}

await import('./runtime-v10.33-payment-review.mjs');
