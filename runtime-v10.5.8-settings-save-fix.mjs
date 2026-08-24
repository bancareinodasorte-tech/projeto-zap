import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const centralPath=path.join(__dirname,'runtime-v10.5.6-central-settings.mjs');
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  if(!s.includes('RDS_SETTINGS_SAVE_ROUTE_V10_5_8')){
    const marker="app.get('/api/settings',async(req,res)=>";
    const pos=s.indexOf(marker);
    if(pos<0) throw new Error('ponto de inserção da rota de Ajustes não localizado');
    const route=`// RDS_SETTINGS_SAVE_ROUTE_V10_5_8\napp.post('/api/automation-settings/save',async(req,res)=>{\n  try{\n    const allowed=['router_enabled','send_interval_seconds','pix_city','msg_router_intro','msg_router_buy','msg_router_office','msg_no_phone','msg_order_start','msg_order_form','msg_missing_fields','msg_payment','msg_proof_received','msg_order_active','msg_waiting_payment','msg_waiting_review','msg_waiting_tickets','msg_payment_confirmed','msg_office_redirect','msg_final'];\n    const current=await getAutomationConfig();\n    const next={...current};\n    for(const k of allowed) if(Object.prototype.hasOwnProperty.call(req.body||{},k)) next[k]=req.body[k];\n    next.router_enabled=next.router_enabled!==false;\n    next.send_interval_seconds=Math.max(0.5,Math.min(120,Number(next.send_interval_seconds||1)));\n    await insert('rds10_events',{kind:'CONFIG_AUTOMATION_SETTINGS',payload:next,created_at:nowISO()},'minimal');\n    const saved=await getAutomationConfig();\n    res.json({ok:true,saved:true,...saved});\n  }catch(e){\n    console.error('[AJUSTES SAVE]',e.message);\n    res.status(400).json({ok:false,error:e.message});\n  }\n});\n\n`;
    s=s.slice(0,pos)+route+s.slice(pos);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.5.8] rota POST de salvamento inserida diretamente no server.js');
  }
}catch(e){
  console.error('[V10.5.8] backend:',e.message);
  process.exitCode=1;
}

try{
  let x=fs.readFileSync(centralPath,'utf8');
  if(!x.includes('RDS_SETTINGS_SAVE_FIX_V10_5_8_DIRECT')){
    const oldFront="await put('/api/automation-settings',body);";
    const newFront="const r=await fetch('/api/automation-settings/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const txt=await r.text(); let d={}; try{d=txt?JSON.parse(txt):{};}catch{} if(!r.ok||d.ok!==true) throw new Error(d.error||('Falha ao salvar Ajustes (HTTP '+r.status+'). '+String(txt||'').slice(0,180)));";
    if(x.includes(oldFront)) x=x.replace(oldFront,newFront);
    x += "\n// RDS_SETTINGS_SAVE_FIX_V10_5_8_DIRECT\n";
    fs.writeFileSync(centralPath,x,'utf8');
    console.log('[V10.5.8] frontend apontado para rota robusta');
  }
}catch(e){
  console.error('[V10.5.8] frontend:',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.5.7-settings-usability.mjs');
