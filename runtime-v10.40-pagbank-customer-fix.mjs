import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.40 — correção final do envio dos dados do pagador para o PagBank.
// O V10.39 já havia preparado o ambiente de PRODUÇÃO, mas a rota antiga
// podia continuar recebendo o pedido sem CPF/e-mail porque o patch textual
// dependia de uma formatação específica do runtime anterior.
await import('./runtime-v10.39-pagbank-production.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  let s = fs.readFileSync(serverPath, 'utf8');

  if (!s.includes('RDS_PAGBANK_CUSTOMER_FIX_V10_40')) {
    const marker = "app.post('/api/pagbank/orders/:id/pix'";
    const pos = s.indexOf(marker);
    if (pos < 0) throw new Error('rota PagBank PIX não localizada para o fechamento V10.40');

    const block = `// RDS_PAGBANK_CUSTOMER_FIX_V10_40
function rdsPagBankCustomerFromOperator(req, order){
  const customer_email=cleanText(req.body?.customer_email||order.customer_email||order.email||'');
  const customer_tax_id=String(req.body?.customer_tax_id||order.customer_tax_id||order.tax_id||order.cpf||'').replace(/\\D/g,'');
  if(!customer_email||!customer_tax_id) throw new Error('Para gerar PIX em produção informe e-mail e CPF/CNPJ do pagador.');
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(customer_email)) throw new Error('E-mail do pagador inválido.');
  if(![11,14].includes(customer_tax_id.length)) throw new Error('CPF/CNPJ do pagador inválido.');
  return {customer_email,customer_tax_id};
}

app.post('/api/pagbank/orders/:id/pix',async(req,res)=>{
 try{
  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`);
  if(!o)throw new Error('Pedido não encontrado.');
  const customer=rdsPagBankCustomerFromOperator(req,o);
  await patch('rds10_orders',\`id=eq.\${o.id}\`,{...customer,updated_at:nowISO()});
  const fresh=await one('rds10_orders',\`select=*&id=eq.\${o.id}\`);
  const pix=await rdsPagBankCreatePix(fresh);
  res.json({ok:true,...pix});
 }catch(e){res.status(400).json({ok:false,error:e.message});}
});

app.post('/api/pagbank/orders/:id/send-pix',async(req,res)=>{
 try{
  const o=await one('rds10_orders',\`select=*&id=eq.\${req.params.id}\`);
  if(!o)throw new Error('Pedido não encontrado.');
  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(o.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando PIX.');
  const customer=rdsPagBankCustomerFromOperator(req,o);
  await patch('rds10_orders',\`id=eq.\${o.id}\`,{...customer,updated_at:nowISO()});
  const fresh=await one('rds10_orders',\`select=*&id=eq.\${o.id}\`);
  const pix=await rdsPagBankCreatePix(fresh);
  const customerName=cleanText(fresh.customer_name||'');
  const msg=\`💠 *PAGAMENTO PIX*\\nPedido *\${fresh.code}*\\n\${customerName?\`Cliente: *\${customerName}*\\n\`:''}Quantidade: *\${fresh.quantity||0} bilhete(s)*\\nValor: *R$ \${money(fresh.total_amount)}*\\n\\n*PIX Copia e Cola:*\\n\${pix.qr.text}\\n\\nApós o pagamento, aguarde a confirmação automática do sistema.\`;
  await sendTextPhone(fresh.phone,msg);
  await logEvent('PAGBANK_PIX_ENVIADO_WHATSAPP',{order_id:fresh.id,order:fresh.code,phone:fresh.phone,pagbank_order_id:pix.orderId,amount:pix.qr.amount,environment:'production'});
  res.json({ok:true,...pix,sent:true});
 }catch(e){res.status(400).json({ok:false,error:e.message});}
});

`;

    s = s.slice(0, pos) + block + s.slice(pos);
    fs.writeFileSync(serverPath, s, 'utf8');
    console.log('[V10.40] dados do pagador ligados às rotas PIX de produção');
  }
} catch (e) {
  console.error('[V10.40]', e.message);
  process.exitCode = 1;
}
