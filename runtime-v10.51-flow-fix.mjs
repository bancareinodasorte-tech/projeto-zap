import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(dir, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const oldBlock = `  if(o && /^(COMPRAR|BILHETE|BILHETES|CPF)$/i.test(cleanText(t)) && o.status!=='COLETANDO_DADOS')return replyInbound(i,\`Pedido *\${o.code}* em andamento.\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.\`);`;
const newBlock = `  if(o && /^(COMPRAR|BILHETE|BILHETES|CPF)$/i.test(cleanText(t)) && o.status!=='COLETANDO_DADOS')return replyInbound(i,\`Pedido *\${o.code}* em andamento.\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.\`);`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
}

// V10.51: pedidos abandonados não podem bloquear uma nova compra.
// COMPRAR sempre abre uma nova intenção quando o pedido anterior está parado aguardando pagamento/conferência.
const oldBuy = `  if(isOfficeRoute(t))return replyInbound(i,'🏢 *OUTRO ASSUNTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+normalizeBR(s.office_whatsapp||OFFICE_WA_DEFAULT));if(isBuyRoute(t))return beginOrder(i,(t.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null);return replyInbound(i,routerMessage(s))}`;
const newBuy = `  if(isOfficeRoute(t))return replyInbound(i,'🏢 *OUTRO ASSUNTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+normalizeBR(s.office_whatsapp||OFFICE_WA_DEFAULT));if(isBuyRoute(t)){if(o && ['AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFERENCIA'].includes(o.status)){await patch('rds10_orders',\`id=eq.\${o.id}\`,{status:'CANCELADO',cancel_reason:'NOVA_COMPRA',updated_at:nowISO()});await cancelFutureDeliveries(i.phone,'NOVA_COMPRA');}return beginOrder(i,(t.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null)}return replyInbound(i,routerMessage(s))}`;

if (source.includes(oldBuy)) source = source.replace(oldBuy, newBuy);

// Cancelamento explícito continua tendo prioridade e interrompe entregas agendadas.
fs.writeFileSync(serverPath, source, 'utf8');
console.log('[V10.51] fluxo de pedido pendente corrigido');
await import('./server.js');
