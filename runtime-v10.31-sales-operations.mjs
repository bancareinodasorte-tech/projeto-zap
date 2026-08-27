import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  if(!s.includes('RDS_SALES_OPS_V10_31')){
    const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
    const pos=s.indexOf(marker);
    if(pos<0) throw new Error('ponto de inserção V10.31 não localizado');
    const block=`// RDS_SALES_OPS_V10_31\napp.post('/api/pagbank/orders/:id/send-pix',async(req,res)=>{\n try{\n  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`);\n  if(!o)throw new Error('Pedido não encontrado.');\n  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(o.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando PIX.');\n  const pix=await rdsPagBankCreatePix(o);\n  const customer=cleanText(o.customer_name||'');\n  const msg=\`💠 *PAGAMENTO PIX*\\nPedido *\${o.code}*\\n\${customer?\`Cliente: *\${customer}*\\n\`:''}Quantidade: *\${o.quantity||0} bilhete(s)*\\nValor: *R$ \${money(o.total_amount)}*\\n\\n*PIX Copia e Cola:*\\n\${pix.qr.text}\\n\\nApós o pagamento, aguarde a confirmação automática do sistema.\`;\n  await sendTextPhone(o.phone,msg);\n  await logEvent('PAGBANK_PIX_ENVIADO_WHATSAPP',{order_id:o.id,order:o.code,phone:o.phone,pagbank_order_id:pix.orderId,amount:pix.qr.amount});\n  res.json({ok:true,...pix,sent:true});\n }catch(e){res.status(400).json({ok:false,error:e.message});}\n});\n\n`;
    s=s.slice(0,pos)+block+s.slice(pos);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.31] operação comercial + envio PIX aplicada');
  }
}catch(e){console.error('[V10.31]',e.message);process.exitCode=1;}

await import('./runtime-v10.30-pagbank-sandbox.mjs');
