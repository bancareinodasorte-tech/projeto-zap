import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');
const appPath=path.join(__dirname,'app.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  if(!s.includes('RDS_EDITABLE_TIMEOUTS_V10_5_5')){
    const marker="app.get('/api/settings',async(req,res)=>";
    const pos=s.indexOf(marker);
    if(pos<0) throw new Error('rota de ajustes não localizada');
    const api=`// RDS_EDITABLE_TIMEOUTS_V10_5_5\nasync function getOrderTimeoutConfig(){\n  try{\n    const e=await one('rds10_events','select=payload&kind=eq.CONFIG_ORDER_TIMEOUTS&order=created_at.desc');\n    const p=e?.payload||{};\n    return {collect_hours:Math.max(1,Number(p.collect_hours||2)),payment_hours:Math.max(1,Number(p.payment_hours||12))};\n  }catch{return {collect_hours:2,payment_hours:12};}\n}\napp.get('/api/order-timeouts',async(req,res)=>{ try{res.json(await getOrderTimeoutConfig());}catch(e){res.status(500).json({error:e.message});} });\napp.put('/api/order-timeouts',async(req,res)=>{\n  try{\n    const collect_hours=Math.max(1,Math.min(168,Number(req.body.collect_hours||2)));\n    const payment_hours=Math.max(1,Math.min(720,Number(req.body.payment_hours||12)));\n    await logEvent('CONFIG_ORDER_TIMEOUTS',{collect_hours,payment_hours});\n    res.json({ok:true,collect_hours,payment_hours});\n  }catch(e){res.status(400).json({error:e.message});}\n});\n\n`;
    s=s.slice(0,pos)+api+s.slice(pos);

    s=s.replace(
      "const ORDER_TIMEOUTS_MIN={COLETANDO_DADOS:120,AGUARDANDO_PAGAMENTO:720};\nfunction orderExpired(o){\n  const lim=ORDER_TIMEOUTS_MIN[o?.status];",
      "const ORDER_TIMEOUTS_MIN={COLETANDO_DADOS:120,AGUARDANDO_PAGAMENTO:720};\nasync function currentOrderTimeoutMinutes(){ const c=await getOrderTimeoutConfig(); return {COLETANDO_DADOS:c.collect_hours*60,AGUARDANDO_PAGAMENTO:c.payment_hours*60}; }\nasync function orderExpired(o){\n  const cfg=await currentOrderTimeoutMinutes();\n  const lim=cfg[o?.status];"
    );
    s=s.replace("if(!o?.id || !orderExpired(o)) return false;","if(!o?.id || !(await orderExpired(o))) return false;");
    s=s.replace("timeout_minutes:ORDER_TIMEOUTS_MIN[o.status]","timeout_minutes:(await currentOrderTimeoutMinutes())[o.status]");
  }
  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.5.5] tempos de abandono editáveis no backend aplicados');
}catch(e){console.error('[V10.5.5] backend:',e.message);process.exitCode=1;}

try{
  let a=fs.readFileSync(appPath,'utf8');
  if(!a.includes('RDS_EDITABLE_TIMEOUTS_UI_V10_5_5')){
    a += `\n/* RDS_EDITABLE_TIMEOUTS_UI_V10_5_5 */\nconst rdsSettingsOriginal=settings;\nsettings=async function(){\n  await rdsSettingsOriginal();\n  try{\n    const c=await api('/api/order-timeouts');\n    const box=document.createElement('div');\n    box.className='card';\n    box.innerHTML='<span class="eyebrow">Ciclo automático do pedido</span><h2>Tempo limite sem resposta</h2><p class="mut">Defina quando um pedido parado deve ser encerrado automaticamente para liberar um novo atendimento.</p><div class="grid"><div><label>Coleta de dados — horas</label><input id="rdsCollectHours" type="number" min="1" max="168" value="'+Number(c.collect_hours||2)+'"></div><div><label>Aguardando pagamento — horas</label><input id="rdsPaymentHours" type="number" min="1" max="720" value="'+Number(c.payment_hours||12)+'"></div></div><div class="row"><button class="btn primary" onclick="saveOrderTimeouts()">Salvar tempos</button></div>';\n    app.appendChild(box);\n  }catch(e){console.error('timeouts UI',e);}\n};\nasync function saveOrderTimeouts(){\n  try{\n    const collect_hours=Number(document.querySelector('#rdsCollectHours')?.value||2);\n    const payment_hours=Number(document.querySelector('#rdsPaymentHours')?.value||12);\n    await put('/api/order-timeouts',{collect_hours,payment_hours});\n    toast('Tempos do ciclo automático salvos.');\n  }catch(e){toast(e.message);}\n}\n`;
  }
  fs.writeFileSync(appPath,a,'utf8');
  console.log('[V10.5.5] controles de tempo adicionados em Ajustes');
}catch(e){console.error('[V10.5.5] frontend:',e.message);process.exitCode=1;}

await import('./runtime-v10.5.4-order-lifecycle.mjs');
