import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const appPath=path.join(__dirname,'app.js');

// Aplica primeiro toda a V10.9 e a cadeia estável anterior.
await import('./runtime-v10.9-reports-readiness.mjs');

try{
  let a=fs.readFileSync(appPath,'utf8');
  if(!a.includes('RDS_STABLE_REPORTS_UI_V10_9_1')){
    // A Central deixa de ser reconstruída pelo refresh silencioso de 5s.
    a=a.replace(
      "else if(page==='home'){ await home(); }",
      "else if(page==='home'){ /* V10.9.1: Central estável; sem rerender automático */ }"
    );

    // Torna o checklist tolerante a resposta incompleta e evita quebra de UI.
    a=a.replace(
      "async function rdsOpenReadiness(){try{const r=await api('/api/readiness');modal('<span class=\"eyebrow\">Prontidão operacional</span><h2>Checklist de produção • '+Number(r.score||0)+'%</h2>'+r.checks.map(x=>'<div class=\"priority\"><div><strong>'+esc(x.label)+'</strong><small>'+esc(x.detail||'')+'</small></div>'+badge(x.ok?'OK':'PENDENTE')+'</div>').join('')+'<p class=\"mut\">Fila: '+Number(r.operational?.queue||0)+' • pedidos ativos: '+Number(r.operational?.activeOrders||0)+' • falhas: '+Number(r.operational?.failed||0)+'</p>')}catch(e){toast(e.message)}}",
      "async function rdsOpenReadiness(){try{const r=await api('/api/readiness');const checks=Array.isArray(r?.checks)?r.checks:[];if(!checks.length)throw new Error('Checklist ainda não disponível. Atualize a página após o deploy.');modal('<span class=\"eyebrow\">Prontidão operacional</span><h2>Checklist de produção • '+Number(r.score||0)+'%</h2>'+checks.map(x=>'<div class=\"priority\"><div><strong>'+esc(x.label||'Verificação')+'</strong><small>'+esc(x.detail||'')+'</small></div>'+badge(x.ok?'OK':'PENDENTE')+'</div>').join('')+'<p class=\"mut\">Fila: '+Number(r.operational?.queue||0)+' • pedidos ativos: '+Number(r.operational?.activeOrders||0)+' • falhas: '+Number(r.operational?.failed||0)+'</p>')}catch(e){toast(e.message)}}"
    );

    // Relatórios nunca exibem undefined; se a API vier incompleta, usa zero.
    a=a.replace(
      "function rdsRenderReport(d){const m=d.metrics||{};modal('",
      "function rdsRenderReport(d){d=d&&typeof d==='object'?d:{};const m=d.metrics&&typeof d.metrics==='object'?d.metrics:{};const safe={sent:Number(m.sent||0),uniqueInbound:Number(m.uniqueInbound||0),orders:Number(m.orders||0),purchases:Number(m.purchases||0),conversion:Number(m.conversion||0),revenue:Number(m.revenue||0)};modal('"
    );
    a=a.replace("[['Enviadas',m.sent],['Retornos únicos',m.uniqueInbound],['Pedidos',m.orders],['Compras',m.purchases],['Conversão',Number(m.conversion||0)+'%'],['Receita',money(m.revenue)]]",
                "[['Enviadas',safe.sent],['Retornos únicos',safe.uniqueInbound],['Pedidos',safe.orders],['Compras',safe.purchases],['Conversão',safe.conversion+'%'],['Receita',money(safe.revenue)]]");

    // Se a rota responder HTML/objeto vazio, informa claramente em vez de quebrar.
    a=a.replace(
      "async function rdsOpenReports(){try{const d=await api('/api/reports/overview?period=30d');window.rdsReportPeriod='30d';rdsRenderReport(d)}catch(e){toast(e.message)}}",
      "async function rdsOpenReports(){try{const d=await api('/api/reports/overview?period=30d');if(!d||d.ok!==true||!d.metrics)throw new Error('Relatórios ainda não disponíveis. Atualize a página após o deploy.');window.rdsReportPeriod='30d';rdsRenderReport(d)}catch(e){toast(e.message)}}"
    );
    a=a.replace(
      "async function rdsReloadReport(p){try{const modalEl=document.querySelector('.modal');if(modalEl)modalEl.remove();const d=await api('/api/reports/overview?period='+encodeURIComponent(p));window.rdsReportPeriod=p;rdsRenderReport(d)}catch(e){toast(e.message)}}",
      "async function rdsReloadReport(p){try{const d=await api('/api/reports/overview?period='+encodeURIComponent(p));if(!d||d.ok!==true||!d.metrics)throw new Error('Relatório indisponível neste momento.');const modalEl=document.querySelector('.modal');if(modalEl)modalEl.remove();window.rdsReportPeriod=p;rdsRenderReport(d)}catch(e){toast(e.message)}}"
    );

    a += `\n/* RDS_STABLE_REPORTS_UI_V10_9_1 */\nasync function rdsRefreshHomeNow(){ if(page==='home') await home(); }\n`;
    fs.writeFileSync(appPath,a,'utf8');
    console.log('[V10.9.1] Central estabilizada e relatórios protegidos contra resposta incompleta');
  }
}catch(e){
  console.error('[V10.9.1] frontend:',e.message);
  process.exitCode=1;
}
