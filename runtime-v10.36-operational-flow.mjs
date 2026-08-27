import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');

  // Proteção definitiva do CRM: nome informado no PEDIDO nunca substitui
  // o nome principal de um telefone que já existe na agenda.
  const crmOld=`      await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{\n        name:p.name,\n        validated:true,`;
  const crmNew=`      await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{\n        validated:true,`;
  if(s.includes(crmOld)) s=s.replace(crmOld,crmNew);

  // Ao concluir o formulário, cria a cobrança PagBank automaticamente e
  // devolve o PIX dinâmico ao cliente. Mantém a chave estática apenas como contingência.
  const payOld=`  const s = await getSettings();\n  const pix = cleanText(s.pix_key || 'PIX NÃO CONFIGURADO');\n  const payMsg = \`✅ *PEDIDO RECEBIDO*\\n\\n👤 \${p.name}\\n🎟 \${p.quantity} bilhete(s)\\n💰 Total: *R$ \${money(total)}*\\n🧾 Pedido: \${order.code}\\n\\n💳 *PAGAMENTO PIX*\\nChave: \${pix}\\nFavorecido: \${cleanText(s.pix_name || 'REINO DA SORTE')}\\nValor: *R$ \${money(total)}*\\n\\nApós pagar, envie o comprovante aqui 👇\`;\n  await replyInbound(identity,payMsg);`;
  const payNew=`  const s = await getSettings();\n  let payMsg='';\n  try{\n    if(typeof rdsPagBankConfigured==='function' && rdsPagBankConfigured()){\n      const pixOrder={...order,customer_name:p.name,quantity:p.quantity,total_amount:total};\n      const pg=await rdsPagBankCreatePix(pixOrder);\n      const copy=cleanText(pg?.qr?.text||'');\n      payMsg=\`✅ *PEDIDO RECEBIDO*\\n\\n👤 \${p.name}\\n🎟 \${p.quantity} bilhete(s)\\n💰 Total: *R$ \${money(total)}*\\n🧾 Pedido: \${order.code}\\n\\n💠 *PIX PAGBANK*\\n\\n*PIX Copia e Cola:*\\n\${copy}\\n\\nApós pagar, aguarde a confirmação automática do sistema. Se desejar, também pode enviar o comprovante aqui.\`;\n      await logEvent('PIX_ENVIADO_AUTOMATICAMENTE',{order_id:order.id,order:order.code,phone:identity.phone,pagbank_order_id:pg?.orderId||null});\n    }\n  }catch(e){\n    await logEvent('PIX_AUTOMATICO_FALHOU',{order_id:order.id,order:order.code,error:e.message});\n  }\n  if(!payMsg){\n    const pix=cleanText(s.pix_key||'PIX NÃO CONFIGURADO');\n    payMsg=\`✅ *PEDIDO RECEBIDO*\\n\\n👤 \${p.name}\\n🎟 \${p.quantity} bilhete(s)\\n💰 Total: *R$ \${money(total)}*\\n🧾 Pedido: \${order.code}\\n\\n💳 *PAGAMENTO PIX*\\nChave: \${pix}\\nFavorecido: \${cleanText(s.pix_name||'REINO DA SORTE')}\\nValor: *R$ \${money(total)}*\\n\\nApós pagar, envie o comprovante aqui 👇\`;\n  }\n  await replyInbound(identity,payMsg);`;
  if(s.includes(payOld)) s=s.replace(payOld,payNew);

  if(!s.includes('RDS_OPERATIONAL_FLOW_V10_36')){
    const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
    const pos=s.indexOf(marker);
    if(pos<0) throw new Error('ponto de inserção V10.36 não localizado');
    const block=`// RDS_OPERATIONAL_FLOW_V10_36\nlet rdsReconciling=false;\nasync function rdsAutoReconcileAll(){\n if(rdsReconciling||typeof rdsPagBankConfigured!=='function'||!rdsPagBankConfigured())return {checked:0,paid:0};\n rdsReconciling=true;let checked=0,paid=0;\n try{\n  const pending=await list('rds10_orders','select=*&status=in.(AGUARDANDO_PAGAMENTO,AGUARDANDO_CONFERENCIA)&order=created_at.desc&limit=100');\n  for(const o of pending||[]){\n   try{\n    const ev=await rdsLatestPagBankEvent(o);const remoteId=String(ev?.payload?.pagbank_order_id||'');if(!remoteId)continue;\n    const data=await rdsPagBankRequest('/orders/'+encodeURIComponent(remoteId));checked++;\n    const status=rdsPagBankPrimaryStatus(data);const isPaid=rdsPagBankPaid(data)||status==='PAID';\n    if(isPaid){const changed=await rdsApplyPagBankPaid(o,data);if(changed)paid++;}\n   }catch(e){await logEvent('PAGBANK_RECONCILIACAO_FALHA',{order_id:o.id,order:o.code,error:e.message});}\n  }\n }finally{rdsReconciling=false;}\n return {checked,paid};\n}\napp.post('/api/v1036/reconcile-all',async(req,res)=>{try{res.json({ok:true,...await rdsAutoReconcileAll()});}catch(e){res.status(400).json({ok:false,error:e.message});}});\napp.get('/api/v1036/flow-status',async(req,res)=>{\n try{const orders=await list('rds10_orders','select=id,code,phone,customer_name,status,total_amount,quantity,updated_at&status=not.in.(CONCLUIDO,CANCELADO)&order=updated_at.desc&limit=100');res.json({ok:true,orders,pagbank:{configured:typeof rdsPagBankConfigured==='function'?rdsPagBankConfigured():false,environment:typeof PAGBANK_ENV==='string'?PAGBANK_ENV:'unknown'},system_url:cleanText(process.env.RDS_SYSTEM_URL||'')});}\n catch(e){res.status(400).json({ok:false,error:e.message});}\n});\nsetInterval(()=>rdsAutoReconcileAll().catch(()=>{}),30000);\nsetTimeout(()=>rdsAutoReconcileAll().catch(()=>{}),8000);\n\n`;
    s=s.slice(0,pos)+block+s.slice(pos);
  }

  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.36] fluxo operacional automático aplicado');
}catch(e){console.error('[V10.36]',e.message);process.exitCode=1;}

await import('./runtime-v10.35-payment-reconcile.mjs');
