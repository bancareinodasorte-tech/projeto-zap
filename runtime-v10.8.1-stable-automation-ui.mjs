import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const appPath=path.join(__dirname,'app.js');

// Primeiro aplica toda a V10.8 e a cadeia estável anterior.
await import('./runtime-v10.8-action-center.mjs');

try{
  let a=fs.readFileSync(appPath,'utf8');
  if(!a.includes('RDS_STABLE_AUTOMATION_UI_V10_8_1')){
    // A tela Automação não deve ser reconstruída a cada 5 segundos.
    // Mantemos refresh automático das demais páginas, porém Automação atualiza
    // ao entrar nela e depois das ações explícitas do operador.
    a=a.replace(
      "else if(page==='execution'){ await automation(); }",
      "else if(page==='execution'){ /* V10.8.1: tela estável; sem rerender automático */ }"
    );

    // Identificador fixo para a Central de Ação, útil para atualizações pontuais futuras.
    a=a.replace(
      "const box=document.createElement('div');box.className='card';",
      "const box=document.createElement('div');box.className='card';box.id='rdsActionCenter';"
    );

    a += `\n/* RDS_STABLE_AUTOMATION_UI_V10_8_1 */\nasync function rdsRefreshAutomationNow(){\n  if(page!=='execution') return;\n  await automation();\n}\n`;
    fs.writeFileSync(appPath,a,'utf8');
    console.log('[V10.8.1] Automação estabilizada: removido rerender automático de 5s');
  }
}catch(e){
  console.error('[V10.8.1] frontend:',e.message);
  process.exitCode=1;
}
