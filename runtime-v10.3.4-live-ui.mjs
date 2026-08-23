import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'app.js');
const serverPath = path.join(__dirname, 'server.js');

try {
  let src = fs.readFileSync(appPath, 'utf8');

  src = src.replace(
    "fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}})",
    "fetch(url,{cache:'no-store',...opt,headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(opt.headers||{})}})"
  );

  for (const marker of ['/* RDS_LIVE_UI_V10_3_4 */','/* RDS_LIVE_UI_V10_3_7 */','/* RDS_AUTO_REFRESH_V10_4_2 */']) {
    const i = src.indexOf(marker);
    if (i >= 0) src = src.slice(0, i).trimEnd() + '\n';
  }

  src = src.replace(
    "async function render(){app.innerHTML='<div class=\"card\"><span class=mut>Carregando operação...</span></div>';try{",
    "async function render(){if(app?.dataset?.rdsPage===page&&app.children.length)return;app.dataset.rdsPage=page;app.innerHTML='<div class=\"card\"><span class=mut>Carregando operação...</span></div>';try{"
  );

  src += `\n/* RDS_AUTO_REFRESH_V10_4_2 */\nlet rdsSilentBusy=false;\nasync function rdsSilentRefresh(){\n  if(rdsSilentBusy || document.hidden || document.querySelector('.modal')) return;\n  rdsSilentBusy=true;\n  try{\n    if(page==='contacts'){ const oldSearch=$('#contactSearch')?.value||''; const oldGroup=$('#contactGroup')?.value||''; await loadContacts(); if($('#contactSearch')) $('#contactSearch').value=oldSearch; if($('#contactGroup')) $('#contactGroup').value=oldGroup; if($('#contactsBody')) filterContacts(); }\n    else if(page==='returns'){ await returnsPage(); }\n    else if(page==='orders'){ await orders(); }\n    else if(page==='home'){ await home(); }\n    else if(page==='execution'){ await automation(); }\n    else if(page==='campaigns'){ await campaigns(); }\n  }catch(e){} finally{rdsSilentBusy=false;}\n}\nsetInterval(rdsSilentRefresh,5000);\n`;

  fs.writeFileSync(appPath, src, 'utf8');
  console.log('[V10.4.2] UI: atualização automática silenciosa a cada 5s sem tela de carregamento');
} catch (err) {
  console.error('[V10.4.2] falha ao preparar interface:', err?.message || err);
}

try {
  let s = fs.readFileSync(serverPath, 'utf8');
  if(!s.includes('RDS_PHONE_EQUIV_V10_4_2')){
    s = s.replace(
      "function phoneKey(v){\n  const n = normalizeBR(v);\n  return validBRPhone(n) ? n : '';\n}",
      `function phoneKey(v){\n  const n = normalizeBR(v);\n  return validBRPhone(n) ? n : '';\n}\n// RDS_PHONE_EQUIV_V10_4_2 — CE/Brasil: considera o mesmo celular com ou sem o 9 extra.\nfunction phoneAliases(v){\n  const n=phoneKey(v); if(!n) return [];\n  const out=new Set([n]);\n  const local=n.slice(4);\n  const prefix=n.slice(0,4);\n  if(local.length===9 && local[0]==='9') out.add(prefix+local.slice(1));\n  if(local.length===8) out.add(prefix+'9'+local);\n  return [...out];\n}\nfunction sameBRPhone(a,b){\n  const aa=phoneAliases(a), bb=new Set(phoneAliases(b));\n  return aa.some(x=>bb.has(x));\n}`
    );
    s = s.replace(
      "  return rows.find(x => phoneKey(x.phone) === key) || null;",
      "  return rows.find(x => sameBRPhone(x.phone, key)) || null;"
    );
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.4.2] backend: equivalência de celular com/sem 9 ativada');
  }
}catch(err){ console.error('[V10.4.2] falha backend:',err?.message||err); }

await import('./bootstrap-v10.3.3-v10.mjs');
