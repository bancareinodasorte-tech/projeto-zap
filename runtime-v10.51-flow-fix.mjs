import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(dir, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

// V10.51: active order is still visible, but customer commands can control it.
// A pending payment must never trap the customer in an endless reminder loop.
const activePattern = /async function activeOrder\(phone\)\{[\s\S]*?\n\}/;
source = source.replace(activePattern, `async function activeOrder(phone){\n  return one('rds10_orders',\`select=*&phone=eq.\${encodeURIComponent(phone)}&status=in.(COLETANDO_DADOS,AGUARDANDO_PAGAMENTO,AGUARDANDO_CONFERENCIA,PAGO_AGUARDANDO_BILHETES)&order=created_at.desc\`);\n}`);

// Remove the purchase-name overwrite of the CRM's canonical contact name.
source = source.replace(/await patch\('rds10_contacts',`id=eq\.\$\{existing\.id\}`,\{\s*name:p\.name,\s*validated:true,/g,
`await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{ validated:true,`);

// Inject the definitive customer controls immediately before the existing order-state block.
const anchor = `  if(order){\n    if(order.status === 'COLETANDO_DADOS'){`;
const controls = `  const cmd = cleanText(text).toUpperCase();\n  const cancelCmd = /^(CANCELAR|CANCELA|DESISTIR|NÃO QUERO|NAO QUERO|ENCERRAR|PARAR|SAIR)$/.test(cmd);\n  const restartCmd = /^(RECOMEÇAR|RECOMECAR|NOVA COMPRA|NOVO PEDIDO)$/.test(cmd);\n  const menu = order ? \`Pedido *\${order.code}* em andamento. O que deseja fazer?\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.\` : '';\n\n  if(order && (cancelCmd || restartCmd || cmd === '4' || cmd === '3')){\n    await patch('rds10_orders',\`id=eq.\${order.id}\`,{status:'CANCELADO',cancel_reason:restartCmd || cmd === '3' ? 'RECOMECO' : 'CLIENTE',cancelled_at:nowISO(),updated_at:nowISO()});\n    await cancelFutureDeliveries(identity.phone,restartCmd || cmd === '3' ? 'RECOMECO' : 'PEDIDO_CANCELADO');\n    if(restartCmd || cmd === '3') return beginOrder(identity);\n    return replyInbound(identity,'✅ Pedido encerrado. Nenhuma nova cobrança será enviada. Para uma nova compra, envie *COMPRAR*.');\n  }\n  if(order && cmd === '5'){\n    const office = normalizeBR(settings.office_whatsapp || OFFICE_WA_DEFAULT);\n    await patch('rds10_orders',\`id=eq.\${order.id}\`,{status:'CANCELADO',cancel_reason:'ESCRITORIO',updated_at:nowISO()});\n    await cancelFutureDeliveries(identity.phone,'ESCRITORIO');\n    return replyInbound(identity,\`🏢 *ATENDIMENTO HUMANO*\\nFale diretamente com o escritório:\\nhttps://wa.me/\${office}?text=\${encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.')}\`);\n  }\n  if(order && cmd === '2'){\n    if(order.status !== 'COLETANDO_DADOS') await patch('rds10_orders',\`id=eq.\${order.id}\`,{status:'COLETANDO_DADOS',updated_at:nowISO()});\n    return replyInbound(identity,\`✏️ *CORRIGIR PEDIDO*\\n\\nQuantidade:\\nNome:\\nContato:\\n\\nPedido: \${order.code}\`);\n  }\n  if(order && (isBuyRoute(text) || (cmd && !inbound.media)) && order.status !== 'COLETANDO_DADOS'){\n    if(inbound.media && order.status === 'AGUARDANDO_PAGAMENTO') return handleProof(identity,order,inbound);\n    return replyInbound(identity,menu);\n  }\n\n  if(order){\n    if(order.status === 'COLETANDO_DADOS'){`;
if(source.includes(anchor)) source = source.replace(anchor, controls);

if(!source.includes('// V10.51_FLOW_FIX_INSTALLED')) source = `// V10.51_FLOW_FIX_INSTALLED\n${source}`;
fs.writeFileSync(serverPath, source, 'utf8');
console.log('[V10.51] fluxo comercial corrigido');
await import('./server.js');
