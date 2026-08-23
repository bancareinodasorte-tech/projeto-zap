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
    if(src.includes(marker)) {
      src = src.replace(marker, replacement);
      console.log('[V10.4.5] roteamento global legado aplicado');
    } else {
      // Nas versões novas o runtime-v10.4.6 já injeta o fluxo contextual completo antes daqui.
      // Não é erro: apenas não reaplicamos um patch legado sobre código já atualizado.
      console.log('[V10.5.1] patch legado do bot ignorado: fluxo contextual novo já controla o roteamento');
    }
  }

  fs.writeFileSync(serverPath, src, 'utf8');
} catch (err) {
  console.error('[V10.5.1] falha real no patch legado do bot:', err?.message || err);
  process.exitCode = 1;
}

await import('./runtime-v10.4.1-crm-phone-fix.mjs');
