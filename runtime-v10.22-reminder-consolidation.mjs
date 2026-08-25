import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));

function patchFile(file,fn){
  const p=path.join(__dirname,file);
  let s=fs.readFileSync(p,'utf8');
  const out=fn(s);
  if(out!==s) fs.writeFileSync(p,out,'utf8');
}

try{
  patchFile('runtime-v10.7-production-reminders.mjs',s=>{
    s=s.replace("if(['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(o.status)){","if(false && ['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(o.status)){" );
    s=s.replace("if(!a.includes('RDS_PRODUCTION_REMINDERS_UI_V10_7')){","if(false && !a.includes('RDS_PRODUCTION_REMINDERS_UI_V10_7')){");
    return s;
  });
  patchFile('runtime-v10.4.6-bot-control.mjs',s=>s.replace(
    "const timeoutMin = Math.max(30, Number(process.env.ORDER_TIMEOUT_MINUTES || 360));",
    "const timeoutCfg = typeof currentOrderTimeoutMinutes==='function' ? await currentOrderTimeoutMinutes() : {COLETANDO_DADOS:120,AGUARDANDO_PAGAMENTO:720};\n    const timeoutMin = Math.max(30, Number(timeoutCfg[order.status] || 360));"
  ));
  console.log('[V10.22] motor legado de lembretes desduplicado e timeout unificado');
}catch(e){console.error('[V10.22]',e.message);process.exitCode=1}

await import('./runtime-v10.21-flow-consistency.mjs');
