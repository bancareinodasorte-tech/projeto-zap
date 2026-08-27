import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
 let s=fs.readFileSync(serverPath,'utf8');
 if(!s.includes('RDS_PAYMENT_REVIEW_V10_33')){
  const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=s.indexOf(marker); if(pos<0)throw new Error('ponto de insercao V10.33 nao localizado');
  const block=`// RDS_PAYMENT_REVIEW_V10_33\napp.post('/api/orders/:id/proof-rejected',async(req,res)=>{\n try{\n  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`);\n  if(!o)throw new Error('Pedido nao encontrado.');\n  if(o.status!=='AGUARDANDO_CONFERENCIA')throw new Error('Este pedido nao esta aguardando conferencia.');\n  await patch('rds10_orders',\`id=eq.\${o.id}\`,{status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});\n  const msg=cleanText(req.body?.message||\`⚠️ Nao conseguimos confirmar o comprovante do pedido *\${o.code}*. Por favor, confira o pagamento e envie um novo comprovante para continuarmos.\`);\n  if(req.body?.notify!==false) await sendTextPhone(o.phone,msg);\n  await logEvent('COMPROVANTE_REJEITADO',{order_id:o.id,order:o.code,phone:o.phone,notify:req.body?.notify!==false});\n  res.json({ok:true,status:'AGUARDANDO_PAGAMENTO'});\n }catch(e){res.status(400).json({error:e.message});}\n});\n\napp.get('/api/payment-review/summary',async(req,res)=>{\n try{\n  const rows=await list('rds10_orders','select=id,code,customer_name,phone,quantity,total_amount,status,updated_at&status=in.(AGUARDANDO_CONFERENCIA,PAGO_AGUARDANDO_BILHETES)&order=updated_at.asc&limit=500');\n  res.json({ok:true,review:rows.filter(o=>o.status==='AGUARDANDO_CONFERENCIA'),tickets:rows.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES')});\n }catch(e){res.status(500).json({error:e.message});}\n});\n\n`;
  s=s.slice(0,pos)+block+s.slice(pos); fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.33] conferencia manual de pagamento aplicada');
 }
}catch(e){console.error('[V10.33]',e.message);process.exitCode=1;}

await import('./runtime-v10.32-reminder-guard.mjs');
