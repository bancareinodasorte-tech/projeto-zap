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

  // Trava anti-pisca: chamadas repetidas de render() na mesma tela viram no-op.
  // Navegação continua funcionando porque a variável `page` muda.
  src = src.replace(
    "async function render(){app.innerHTML='<div class=\"card\"><span class=mut>Carregando operação...</span></div>';try{",
    "async function render(){if(app?.dataset?.rdsPage===page&&app.children.length)return;app.dataset.rdsPage=page;app.innerHTML='<div class=\"card\"><span class=mut>Carregando operação...</span></div>';try{"
  );

  fs.writeFileSync(appPath, src, 'utf8');
  console.log('[V10.3.9] interface estabilizada: bloqueio de re-render repetido na mesma tela');
} catch (err) {
  console.error('[V10.3.9] falha ao preparar interface:', err?.message || err);
}

await import('./bootstrap-v10.3.3-v10.mjs');
