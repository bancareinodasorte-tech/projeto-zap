import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.39 — fechamento de ativação real PagBank.
// A versão publicada força o ambiente PagBank para PRODUÇÃO.
// O token real continua exclusivamente no ambiente do Render.
process.env.PAGBANK_ENV = 'production';

await import('./runtime-v10.38-final.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  let s = fs.readFileSync(serverPath, 'utf8');

  if (!s.includes('RDS_PAGBANK_OPERATOR_CUSTOMER_V10_39')) {
    const oldPix = "app.post('/api/pagbank/orders/:id/pix',async(req,res)=>{try{const o=await one('rds10_orders',`select=*&id=eq.${req.params.id}`);if(!o)throw new Error('Pedido não encontrado.');const pix=await rdsPagBankCreatePix(o);res.json({ok:true,...pix});}catch(e){res.status(400).json({ok:false,error:e.message});}});";
    const newPix = "app.post('/api/pagbank/orders/:id/pix',async(req,res)=>{try{const o=await one('rds10_orders',`select=*&id=eq.${req.params.id}`);if(!o)throw new Error('Pedido não encontrado.');const customer_email=cleanText(req.body?.customer_email||o.customer_email||'');const customer_tax_id=String(req.body?.customer_tax_id||o.customer_tax_id||o.tax_id||o.cpf||'').replace(/\\D/g,'');if(!customer_email||!customer_tax_id)throw new Error('Para gerar PIX em produção informe e-mail e CPF/CNPJ do pagador.');await patch('rds10_orders',`id=eq.${o.id}`,{customer_email,customer_tax_id,updated_at:nowISO()});const fresh=await one('rds10_orders',`select=*&id=eq.${o.id}`);const pix=await rdsPagBankCreatePix(fresh);res.json({ok:true,...pix});}catch(e){res.status(400).json({ok:false,error:e.message});}});";
    if (s.includes(oldPix)) s = s.replace(oldPix, newPix);

    const oldSend = "app.post('/api/pagbank/orders/:id/send-pix',async(req,res)=>{\n try{\n  const o=await one('rds10_orders',`select=*&id=eq.${req.params.id}`);\n  if(!o)throw new Error('Pedido não encontrado.');\n  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(o.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando PIX.');\n  const pix=await rdsPagBankCreatePix(o);";
    const newSend = "app.post('/api/pagbank/orders/:id/send-pix',async(req,res)=>{\n try{\n  const o=await one('rds10_orders',`select=*&id=eq.${req.params.id}`);\n  if(!o)throw new Error('Pedido não encontrado.');\n  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(o.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando PIX.');\n  const customer_email=cleanText(req.body?.customer_email||o.customer_email||'');\n  const customer_tax_id=String(req.body?.customer_tax_id||o.customer_tax_id||o.tax_id||o.cpf||'').replace(/\\D/g,'');\n  if(!customer_email||!customer_tax_id)throw new Error('Para gerar PIX em produção informe e-mail e CPF/CNPJ do pagador.');\n  await patch('rds10_orders',`id=eq.${o.id}`,{customer_email,customer_tax_id,updated_at:nowISO()});\n  const fresh=await one('rds10_orders',`select=*&id=eq.${o.id}`);\n  const pix=await rdsPagBankCreatePix(fresh);";
    if (s.includes(oldSend)) s = s.replace(oldSend, newSend);

    fs.writeFileSync(serverPath, s, 'utf8');
    console.log('[V10.39] PagBank produção + dados fiscais/e-mail do pagador aplicados');
  }
} catch (e) {
  console.error('[V10.39]', e.message);
  process.exitCode = 1;
}
