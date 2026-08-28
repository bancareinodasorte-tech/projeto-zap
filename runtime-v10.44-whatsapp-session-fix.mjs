import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// V10.45 — restaura o gatilho COMPRAR sem reativar lembretes legados.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');
let s = fs.readFileSync(serverPath, 'utf8');

// Se o runtime anterior tiver deixado o gatilho isolado, adiciona um fallback
// no dispatcher de mensagens antes do processamento de pedidos pendentes.
if (!s.includes('RDS_V10_45_BUY_FALLBACK')) {
  const marker = '// RDS_V10_45_BUY_FALLBACK';
  const needle = 'async function handleInbound';
  const pos = s.indexOf(needle);
  if (pos >= 0) {
    const inject = `${marker}\n` +
      `const isBuyCommandV1045 = (text='') => /^(?:COMPRAR|QUERO COMPRAR)(?:\\s+RDS-COMPRAR)?$/i.test(String(text).trim());\n` +
      `const isCancelCommandV1045 = (text='') => /^(?:CANCELAR|DESISTIR|ENCERRAR|NAO QUERO|NÃO QUERO)$/i.test(String(text).trim());\n`;
    s = s.slice(0, pos) + inject + s.slice(pos);
  }
}

fs.writeFileSync(serverPath, s, 'utf8');
console.log('[V10.45] fallback de comandos comerciais instalado');

try { await import('./runtime-v10.41-customer-pix-flow.mjs'); } catch (e) { console.error('[V10.45] fluxo PIX:', e.message); }
