import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');
const appPath=path.join(__dirname,'app.js');

try{
 let s=fs.readFileSync(serverPath,'utf8');
 s=s.replace(
  "app.get('/api/returns',async(req,res)=>{ try{res.json(await list('rds10_messages','select=*&direction=eq.IN&order=created_at.desc&limit=300'));}catch(e){res.status(500).json({error:e.message});} });",
  "app.get('/api/returns',async(req,res)=>{ try{const limit=Math.min(500,Math.max(20,Number(req.query.limit||100)));res.json(await list('rds10_messages',`select=*&direction=eq.IN&order=created_at.desc&limit=${limit}`));}catch(e){res.status(500).json({error:e.message});} });"
 );
 s=s.replace(
  "app.get('/api/orders',async(req,res)=>{ try{res.json(await list('rds10_orders','select=*&order=updated_at.desc'));}catch(e){res.status(500).json({error:e.message});} });",
  "app.get('/api/orders',async(req,res)=>{ try{const limit=Math.min(1000,Math.max(50,Number(req.query.limit||300)));res.json(await list('rds10_orders',`select=*&order=updated_at.desc&limit=${limit}`));}catch(e){res.status(500).json({error:e.message});} });"
 );
 fs.writeFileSync(serverPath,s,'utf8');
 console.log('[V10.5.3] backend preparado para listas operacionais em escala');
}catch(e){console.error('[V10.5.3] backend:',e.message);process.exitCode=1;}

try{
 let a=fs.readFileSync(appPath,'utf8');
 // Retornos: pesquisa e limite de visualização para grande fluxo.
 a=a.replace(
  "<div class=card><span class=eyebrow>Fila de retorno</span><h2>Priorize quem exige ação</h2><p class=mut>Mensagens recentes entram primeiro.</p></div>",
  "<div class=card><span class=eyebrow>Fila de retorno</span><h2>Priorize quem exige ação</h2><p class=mut>Mensagens recentes entram primeiro.</p><div class=toolbar><input id=returnSearch placeholder=\"Buscar nome, telefone ou mensagem\" oninput=\"filterReturnsScale()\"><select id=returnLimit onchange=\"filterReturnsScale()\"><option value=50>50 por vez</option><option value=100 selected>100 por vez</option><option value=200>200 por vez</option></select></div></div>"
 );
 if(!a.includes('function filterReturnsScale()')){
   a += `\n/* RDS_SCALE_OPERATIONS_V10_5_3 */\nfunction filterReturnsScale(){\n const box=document.querySelector('#app'); if(!box)return; const q=(document.querySelector('#returnSearch')?.value||'').trim().toLowerCase(); const lim=Number(document.querySelector('#returnLimit')?.value||100); const cards=[...box.querySelectorAll('.card')].filter(x=>x.querySelector('a[href*=wa.me]')); let shown=0; for(const c of cards){const ok=!q||c.innerText.toLowerCase().includes(q);const vis=ok&&shown<lim;c.style.display=vis?'':'none';if(vis)shown++;}\n}\nfunction filterOrdersScale(){\n const q=(document.querySelector('#orderSearch')?.value||'').trim().toLowerCase(); const st=document.querySelector('#orderStatusScale')?.value||''; const lim=Number(document.querySelector('#orderLimitScale')?.value||100); const cards=[...document.querySelectorAll('#app .card')].filter(x=>x.querySelector('[class*=badge]')||/RDS-/.test(x.innerText));let shown=0;for(const c of cards){const txt=c.innerText.toLowerCase();const okQ=!q||txt.includes(q);const okS=!st||txt.includes(st.toLowerCase().replaceAll('_',' '));const vis=okQ&&okS&&shown<lim;c.style.display=vis?'':'none';if(vis)shown++;}\n}\n`;
 }
 // Compras: injeta barra de escala depois do título, sem alterar ações existentes.
 a=a.replace(
  "<div class=card><span class=eyebrow>Compras</span>",
  "<div class=card><span class=eyebrow>Compras</span><div class=toolbar><input id=orderSearch placeholder=\"Buscar cliente, pedido ou telefone\" oninput=\"filterOrdersScale()\"><select id=orderStatusScale onchange=\"filterOrdersScale()\"><option value=\"\">Todos os status</option><option value=COLETANDO_DADOS>Coletando dados</option><option value=AGUARDANDO_PAGAMENTO>Aguardando pagamento</option><option value=AGUARDANDO_CONFERENCIA>Aguardando conferência</option><option value=PAGO_AGUARDANDO_BILHETES>Aguardando bilhetes</option><option value=CONCLUIDO>Concluídos</option><option value=CANCELADO>Cancelados</option></select><select id=orderLimitScale onchange=\"filterOrdersScale()\"><option value=50>50</option><option value=100 selected>100</option><option value=200>200</option></select></div>"
 );
 fs.writeFileSync(appPath,a,'utf8');
 console.log('[V10.5.3] interface operacional em escala aplicada');
}catch(e){console.error('[V10.5.3] frontend:',e.message);process.exitCode=1;}

await import('./runtime-v10.5.2-dashboard-period.mjs');
