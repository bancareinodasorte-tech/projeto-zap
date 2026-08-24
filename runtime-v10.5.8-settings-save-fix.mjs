import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const centralPath=path.join(__dirname,'runtime-v10.5.6-central-settings.mjs');

try{
  let x=fs.readFileSync(centralPath,'utf8');
  if(!x.includes('RDS_SETTINGS_SAVE_FIX_V10_5_8B')){
    const oldRoute="app.put('/api/automation-settings'";
    const newRoute="app.post('/api/automation-settings/save'";
    if(!x.includes(oldRoute) && !x.includes(newRoute)) throw new Error('rota base de Ajustes não localizada');
    if(x.includes(oldRoute)) x=x.replace(oldRoute,newRoute);

    const oldSave="await logEvent('CONFIG_AUTOMATION_SETTINGS',next);";
    const newSave="await insert('rds10_events',{kind:'CONFIG_AUTOMATION_SETTINGS',payload:next,created_at:nowISO()},'minimal');";
    if(x.includes(oldSave)) x=x.replace(oldSave,newSave);

    const oldFront="await put('/api/automation-settings',body);";
    const newFront="const r=await fetch('/api/automation-settings/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const txt=await r.text(); let d={}; try{d=txt?JSON.parse(txt):{};}catch{} if(!r.ok||d.ok!==true) throw new Error(d.error||('Falha ao salvar Ajustes (HTTP '+r.status+'). '+String(txt||'').slice(0,180)));";
    if(x.includes(oldFront)) x=x.replace(oldFront,newFront);

    x += "\n// RDS_SETTINGS_SAVE_FIX_V10_5_8B\n";
    fs.writeFileSync(centralPath,x,'utf8');
    console.log('[V10.5.8B] rota POST de Ajustes preparada e validada');
  }
}catch(e){
  console.error('[V10.5.8B] falha ao preparar correção:',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.5.7-settings-usability.mjs');
