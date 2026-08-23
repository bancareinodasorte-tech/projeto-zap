import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  let src = fs.readFileSync(serverPath, 'utf8');

  const marker = `  const text = inbound.text;\n  let order = identity.phone ? await activeOrder(identity.phone) : null;\n\n  // Comprovante tem prioridade quando há pedido aguardando pagamento.`;

  const replacement = `  const text = inbound.text;\n  let order = identity.phone ? await activeOrder(identity.phone) : null;\n\n  // Comandos globais sempre têm prioridade sobre o estágio do pedido.\n  // Assim ATENDENTE funciona mesmo quando já existe pedido aguardando pagamento.\n  if(isOfficeRoute(text)){\n    const office = normalizeBR(settings.office_whatsapp || OFFICE_WA_DEFAULT);\n    await logEvent('ENCAMINHADO_ESCRITORIO',{phone:identity.phone||null,order:order?.code||null,status:order?.status||null});\n    return replyInbound(identity,\`🏢 *ESCRITÓRIO*\\nFale diretamente com nosso atendimento:\\nwa.me/\${office}\`);\n  }\n\n  // Comprovante tem prioridade quando há pedido aguardando pagamento.`;

  if(!src.includes('Comandos globais sempre têm prioridade sobre o estágio do pedido.')){
    if(!src.includes(marker)) throw new Error('ponto de roteamento do bot não localizado');
    src = src.replace(marker, replacement);
  }

  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[V10.4.5] roteamento global do bot aplicado: ATENDENTE tem prioridade + mensagem curta');
} catch (err) {
  console.error('[V10.4.5] falha no patch do bot:', err?.message || err);
  process.exitCode = 1;
}

await import('./runtime-v10.4.1-crm-phone-fix.mjs');
