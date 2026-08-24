import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const centralPath=path.join(__dirname,'runtime-v10.5.6-central-settings.mjs');

try{
  let x=fs.readFileSync(centralPath,'utf8');
  if(!x.includes('RDS_SETTINGS_SAVE_FIX_V10_5_8')){
    x=x.replace("app.put('/api/automation-settings',async(req,res)=>{\\n  try{", "app.post('/api/automation-settings/save',async(req,res)=>{\\n  try{");
    x=x.replace("    await logEvent('CONFIG_AUTOMATION_SETTINGS',next);\\n    res.json({ok:true,...next});", "    await insert('rds10_events',{kind:'CONFIG_AUTOMATION_SETTINGS',payload:next,created_at:nowISO()},'minimal');\\n    const saved=await getAutomationConfig();\\n    res.json({ok:true,saved:true,...saved});");
    x=x.replace("    await put('/api/automation-settings',body);\\n    toast('Central de Ajustes salva com sucesso.');", "    const r=await fetch('/api/automation-settings/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});\\n    const txt=await r.text();\\n    let d={}; try{d=txt?JSON.parse(txt):{};}catch{}\\n    if(!r.ok||d.ok!==true) throw new Error(d.error||('Falha ao salvar Ajustes (HTTP '+r.status+'). '+String(txt||'').slice(0,180)));\\n    toast('Central de Ajustes salva e confirmada com sucesso.');");
    x += "\n// RDS_SETTINGS_SAVE_FIX_V10_5_8\n";
    fs.writeFileSync(centralPath,x,'utf8');
    console.log('[V10.5.8] salvamento robusto da Central de Ajustes aplicado');
  }
}catch(e){
  console.error('[V10.5.8] falha ao preparar correção:',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.5.7-settings-usability.mjs');
