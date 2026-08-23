import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'app.js');
const marker = '/* RDS_LIVE_UI_V10_3_7 */';

const livePatch = `
\n${marker}
// V10.3.7: mantém a página atual e atualiza dados operacionais sem F5.
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
  if(rdsLiveBusy||document.hidden||!RDS_LIVE_PAGES.has(page)||document.querySelector('.modal'))return;
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
    requestAnimationFrame(()=>window.scrollTo(0,y));
  }catch(e){console.warn('[V10.3.7] live refresh',e?.message||e)}
  finally{rdsLiveBusy=false;}
}
setInterval(rdsLiveRefresh,3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(rdsLiveRefresh,250)});
`;

try {
  let src = fs.readFileSync(appPath, 'utf8');

  // Evita resposta GET antiga do cache do Safari/Chrome/PWA.
  src = src.replace(
    "fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}})",
    "fetch(url,{cache:'no-store',...opt,headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(opt.headers||{})}})"
  );

  // Remove patches antigos injetados em deploys anteriores do filesystem efêmero.
  const oldMarker = src.indexOf('/* RDS_LIVE_UI_V10_3_4 */');
  if (oldMarker >= 0) src = src.slice(0, oldMarker).trimEnd() + '\n';

  if (!src.includes(marker)) src += livePatch;
  fs.writeFileSync(appPath, src, 'utf8');
  console.log('[V10.3.7] atualização automática real ativada (no-cache, sem F5)');
} catch (err) {
  console.error('[V10.3.7] falha ao preparar interface:', err?.message || err);
}

await import('./bootstrap-v10.3.3-v10.mjs');
