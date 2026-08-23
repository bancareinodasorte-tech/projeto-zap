import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'app.js');
const marker = '/* RDS_LIVE_UI_V10_3_4 */';

const livePatch = `
\n${marker}
// Mantém a área atual após F5 e atualiza telas operacionais sem recarregar a página inteira.
const RDS_PAGE_KEY='rds:last-page';
const RDS_VALID_PAGES=new Set(['home','contacts','campaigns','execution','returns','orders','settings']);
const RDS_LIVE_PAGES=new Set(['home','campaigns','execution','returns','orders']);

try {
  const savedPage=localStorage.getItem(RDS_PAGE_KEY);
  if(savedPage&&RDS_VALID_PAGES.has(savedPage)&&savedPage!==page){page=savedPage;setNav();render();}
} catch {}

const rdsOriginalGo=go;
go=function(p){
  try{if(RDS_VALID_PAGES.has(p))localStorage.setItem(RDS_PAGE_KEY,p)}catch{}
  return rdsOriginalGo(p);
};

let rdsLiveBusy=false;
async function rdsLiveRefresh(){
  if(rdsLiveBusy||!RDS_LIVE_PAGES.has(page)||document.querySelector('.modal'))return;
  const active=document.activeElement?.tagName;
  if(active==='INPUT'||active==='TEXTAREA'||active==='SELECT')return;
  rdsLiveBusy=true;
  const y=window.scrollY;
  try{
    if(page==='home')await home();
    else if(page==='campaigns')await campaigns();
    else if(page==='execution')await automation();
    else if(page==='returns')await returnsPage();
    else if(page==='orders')await orders();
    setNav();
    window.scrollTo(0,y);
  }catch{}
  finally{rdsLiveBusy=false;}
}
setInterval(rdsLiveRefresh,4000);
`;

try {
  let src = fs.readFileSync(appPath, 'utf8');
  if (!src.includes(marker)) {
    src += livePatch;
    fs.writeFileSync(appPath, src, 'utf8');
    console.log('[V10.3.4] atualização automática da interface ativada');
  }
} catch (err) {
  console.error('[V10.3.4] falha ao preparar atualização automática:', err?.message || err);
}

await import('./bootstrap-v10.3.3-v10.mjs');
