import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const appPath=path.join(__dirname,'app.js');

// Aplica toda a cadeia V10.9.3 primeiro. Depois integra a prontidão diretamente
// à função home original, que é a função executada no primeiro carregamento.
await import('./runtime-v10.9.3-initial-home-readiness.mjs');

try{
  let a=fs.readFileSync(appPath,'utf8');
  if(!a.includes('RDS_NATIVE_HOME_READINESS_V10_9_4')){
    const oldStart="async function home(){\n const d=await api('/api/dashboard');";
    const newStart="async function home(){\n const [d,rdsReadyNative]=await Promise.all([api('/api/dashboard'),api('/api/v1092/readiness').catch(()=>null)]);";
    if(!a.includes(oldStart)) throw new Error('função home base não localizada');
    a=a.replace(oldStart,newStart);

    const beforeDiag="\nasync function showDiag(){";
    const nativeBlock=`\n // RDS_NATIVE_HOME_READINESS_V10_9_4\n if(rdsReadyNative && rdsReadyNative.ok===true && !document.querySelector('#rdsReadinessCard')){\n   const box=document.createElement('div');\n   box.className='card';\n   box.id='rdsReadinessCard';\n   box.innerHTML='<div class="row between"><div><span class="eyebrow">Prontidão operacional</span><h2>Preparação para produção</h2><p class="mut">Verificação automática antes de empacotar o sistema como aplicativo.</p></div><div class="metric">'+Number(rdsReadyNative.score||0)+'%</div></div><div class="row"><button class="btn primary" onclick="rdsOpenReports()">Relatórios e histórico</button><button class="btn" onclick="rdsOpenReadiness()">Ver checklist</button><button class="btn" onclick="rdsOpenAudit()">Auditoria</button></div>';\n   app.appendChild(box);\n }\n}\n\nasync function showDiag(){`;
    if(!a.includes(beforeDiag)) throw new Error('fim da função home não localizado');
    // A chave imediatamente anterior a showDiag fecha a home original.
    a=a.replace("\n}\n\nasync function showDiag(){",nativeBlock);

    // A extensão V10.9 não deve adicionar uma segunda cópia quando home já trouxe o card.
    a=a.replace(
      "const r=await api('/api/v1092/readiness');\n    const box=document.createElement('div');box.className='card';box.id='rdsReadinessCard';",
      "const r=await api('/api/v1092/readiness');\n    if(document.querySelector('#rdsReadinessCard')) return;\n    const box=document.createElement('div');box.className='card';box.id='rdsReadinessCard';"
    );

    // Os antigos timers tornam-se apenas fallback, sem duplicar nem reconstruir a página.
    a += `\n/* RDS_NATIVE_HOME_READINESS_V10_9_4 */\n`;
    fs.writeFileSync(appPath,a,'utf8');
    console.log('[V10.9.4] Prontidão integrada nativamente ao primeiro carregamento da Central');
  }
}catch(e){
  console.error('[V10.9.4] frontend:',e.message);
  process.exitCode=1;
}
