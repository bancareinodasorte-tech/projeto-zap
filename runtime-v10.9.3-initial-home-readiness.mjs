import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const appPath=path.join(__dirname,'app.js');

// Aplica primeiro toda a V10.9.2 estável.
await import('./runtime-v10.9.2-stable-readiness-api.mjs');

try{
  let a=fs.readFileSync(appPath,'utf8');
  if(!a.includes('RDS_INITIAL_HOME_READINESS_V10_9_3')){
    a += `\n/* RDS_INITIAL_HOME_READINESS_V10_9_3 */\nasync function rdsEnsureInitialReadiness(){\n  try{\n    if(page!=='home') return;\n    if(document.querySelector('#rdsReadinessCard')) return;\n    const r=await api('/api/v1092/readiness');\n    if(page!=='home' || document.querySelector('#rdsReadinessCard')) return;\n    const box=document.createElement('div');\n    box.className='card';\n    box.id='rdsReadinessCard';\n    box.innerHTML='<div class="row between"><div><span class="eyebrow">Prontidão operacional</span><h2>Preparação para produção</h2><p class="mut">Verificação automática antes de empacotar o sistema como aplicativo.</p></div><div class="metric">'+Number(r.score||0)+'%</div></div><div class="row"><button class="btn primary" onclick="rdsOpenReports()">Relatórios e histórico</button><button class="btn" onclick="rdsOpenReadiness()">Ver checklist</button><button class="btn" onclick="rdsOpenAudit()">Auditoria</button></div>';\n    app.appendChild(box);\n  }catch(e){ console.error('V10.9.3 readiness inicial',e); }\n}\nsetTimeout(rdsEnsureInitialReadiness,80);\nwindow.addEventListener('load',()=>setTimeout(rdsEnsureInitialReadiness,80),{once:true});\n`;
    fs.writeFileSync(appPath,a,'utf8');
    console.log('[V10.9.3] prontidão garantida também no primeiro carregamento da Central');
  }
}catch(e){
  console.error('[V10.9.3] frontend:',e.message);
  process.exitCode=1;
}
