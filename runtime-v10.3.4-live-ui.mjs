import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'app.js');

try {
  let src = fs.readFileSync(appPath, 'utf8');

  // Garante leitura sempre atual dos endpoints, sem cache do navegador/PWA.
  src = src.replace(
    "fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}})",
    "fetch(url,{cache:'no-store',...opt,headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(opt.headers||{})}})"
  );

  // Remove qualquer patch antigo já injetado no filesystem do deploy.
  for (const marker of ['/* RDS_LIVE_UI_V10_3_4 */','/* RDS_LIVE_UI_V10_3_7 */']) {
    const i = src.indexOf(marker);
    if (i >= 0) src = src.slice(0, i).trimEnd() + '\n';
  }

  fs.writeFileSync(appPath, src, 'utf8');
  console.log('[V10.3.8] interface preparada sem polling duplicado');
} catch (err) {
  console.error('[V10.3.8] falha ao preparar interface:', err?.message || err);
}

await import('./bootstrap-v10.3.3-v10.mjs');
