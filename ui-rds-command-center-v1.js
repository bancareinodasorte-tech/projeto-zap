
(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const M=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const F=async u=>{const r=await fetch(u,{headers:{'Content-Type':'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha na operação');return d};
const B=(t,f,c)=>typeof btn==='function'?btn(t,f,c||'btn'):'<button class="'+(c||'btn')+'" onclick="'+f+'">'+E(t)+'</button>';
const oldRender=window.render;
async function commandHome(){
 try{
  const d=await F('/api/dashboard'),rr=await F('/api/operator/orders').catch(()=>[]);
  const os=Array.isArray(rr)?rr:(rr.orders||[]);
  const attention=[
   d.proofReview&&['Conferir pagamentos',d.proofReview,'payments','amber'],
   d.ticketsPending&&['Emitir bilhetes',d.ticketsPending,'orders','blue'],
   d.failed&&['Revisar falhas',d.failed,'execution','red'],
   d.returns&&['Ver retornos',d.returns,'returns','violet']
  ].filter(Boolean);
  const recent=os.slice(0,6);
  const funnel=[
   ['Aguardando PIX','AGUARDANDO_PAGAMENTO','payments'],
   ['Conferir pagamento','AGUARDANDO_CONFERENCIA','payments'],
   ['Emitir bilhetes','PAGO_AGUARDANDO_BILHETES','orders'],
   ['Concluídas','CONCLUIDO','orders']
  ];
  app.innerHTML='<section class="rds-cc-head"><div><span class="eyebrow">Painel operacional</span><h1>Central de Vendas</h1><p>Controle clientes, vendas, pagamentos e atendimento em um único lugar.</p></div><div class="rds-cc-status"><span class="rds-live-dot"></span><div><b>'+(d.connected?'WhatsApp conectado':'WhatsApp offline')+'</b><small>'+(d.connected?(d.number||'Canal ativo'):'Verifique em Ajustes')+'</small></div></div></section>'+
  '<section class="rds-quick-actions">'+B('＋ Novo cliente',"newContact()",'btn primary')+B('＋ Nova campanha',"go('campaigns')")+B('▣ Pagamentos',"go('payments')")+B('✓ Compras',"go('orders')")+'</section>'+
  '<section class="rds-kpi-grid">'+[
   ['Clientes ativos',d.contacts,'clientes','blue'],
   ['Pedidos',d.orders,'funil de vendas','navy'],
   ['Compras concluídas',d.purchases,'vendas finalizadas','green'],
   ['Receita',M(d.revenue),'faturamento','gold']
  ].map(x=>'<button class="rds-kpi '+x[3]+'" onclick="'+(x[2]==='clientes'?"go('contacts')":"go('orders')")+'"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small><i>›</i></button>').join('')+'</section>'+
  '<section class="rds-command-grid"><div class="rds-panel"><div class="rds-panel-head"><div><span class="eyebrow">Centro de comando</span><h2>Ações que precisam de atenção</h2></div><span class="rds-count">'+attention.reduce((a,x)=>a+x[1],0)+'</span></div><div class="rds-urgent-list">'+
  (attention.length?attention.map(x=>'<button class="rds-urgent '+x[3]+'" onclick="go(\''+x[2]+'\')"><span><b>'+x[0]+'</b><small>'+x[1]+' item(ns) aguardando ação</small></span><strong>'+x[1]+'</strong><span>›</span></button>').join(''):'<div class="rds-good"><b>Operação em dia</b><span>Nenhuma pendência crítica neste momento.</span></div>')+
  '</div></div><div class="rds-panel"><div class="rds-panel-head"><div><span class="eyebrow">Fluxo de vendas</span><h2>Status do funil</h2></div></div><div class="rds-funnel">'+
  funnel.map(x=>{const n=os.filter(o=>o.status===x[1]).length;return '<button onclick="go(\''+x[2]+'\')"><span>'+x[0]+'</span><b>'+n+'</b></button>'}).join('')+
  '</div></div></section>'+
  '<section class="rds-command-grid"><div class="rds-panel"><div class="rds-panel-head"><div><span class="eyebrow">Vendas recentes</span><h2>Últimos pedidos</h2></div>'+B('Ver compras',"go('orders')")+'</div><div class="rds-recent-list">'+
  (recent.length?recent.map(o=>'<button onclick="go(\'orders\')"><span class="rds-avatar">'+E((o.customer_name||o.phone||'?').slice(0,1).toUpperCase())+'</span><span class="rds-recent-main"><b>'+E(o.customer_name||o.phone||'Cliente')+'</b><small>'+E(o.code||'Pedido')+' • '+(o.quantity||0)+' bilhete(s)</small></span><span class="rds-recent-right"><b>'+M(o.total_amount)+'</b><small>'+E(o.status||'—')+'</small></span></button>').join(''):'<div class="rds-empty">Nenhum pedido encontrado.</div>')+
  '</div></div><div class="rds-panel"><div class="rds-panel-head"><div><span class="eyebrow">Indicadores</span><h2>Operação</h2></div></div>'+
  [['Campanhas',d.campaigns],['Na fila',d.queue],['Enviadas',d.sent],['Retornos',d.returns],['Falhas',d.failed]].map(x=>'<div class="rds-stat-row"><span>'+x[0]+'</span><b class="'+(x[0]==='Falhas'&&x[1]?'rds-danger':'')+'">'+x[1]+'</b></div>').join('')+
  '<div class="rds-next"><span>Próximo disparo</span><b>'+(d.nextSend?new Date(d.nextSend).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Nenhum agendado')+'</b></div></div></section>';
 }catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>Falha ao carregar a Central</h2><p>'+E(e.message)+'</p><button class="btn primary" onclick="go(\'home\')">Tentar novamente</button></div>'}
}
async function commandContacts(){
 try{
  const rows=await F('/api/contacts'),gs=await F('/api/groups');window.rdsContactsCache=rows;
  const a=rows.filter(c=>String(c.status||'ATIVO').toUpperCase()==='ATIVO'),v=rows.filter(c=>c.validated),nv=rows.length-v.length;
  app.innerHTML='<section class="rds-cc-head"><div><span class="eyebrow">CRM</span><h1>Clientes</h1><p>Carteira organizada, pesquisa rápida e atendimento sem uma lista interminável.</p></div><div class="row">'+B('＋ Novo cliente',"newContact()",'btn primary')+B('Importar',"importModal()")+'</div></section>'+
  '<section class="rds-kpi-grid rds-crm-kpis">'+[
   ['Total cadastrados',rows.length,'base completa','blue'],['Ativos',a.length,'disponíveis para operação','green'],['WhatsApp validado',v.length,'números confirmados','gold'],['Precisam validar',nv,'revisar antes de disparar','navy']
  ].map(x=>'<div class="rds-kpi '+x[3]+'"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></div>').join('')+'</section>'+
  '<section class="rds-crm-toolbar"><div class="rds-search"><span>⌕</span><input id="rdsCrmSearch" placeholder="Buscar por nome ou WhatsApp..."><button id="rdsCrmClear">Limpar</button></div><select id="rdsCrmGroup"><option value="">Todos os grupos</option>'+gs.map(g=>'<option value="'+E(g.name)+'">'+E(g.name)+'</option>').join('')+'</select><select id="rdsCrmStatus"><option value="">Todos os status</option><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></section>'+
  '<section class="rds-crm-list-wrap"><div class="rds-crm-list-head"><b>Clientes</b><span id="rdsCrmResult"></span></div><div id="rdsCrmList"></div><button id="rdsCrmMore" class="btn rds-more">Carregar mais</button></section>';
  let filtered=rows.slice(),shown=25;
  function draw(){
   const q=String($('#rdsCrmSearch')?.value||'').toLowerCase().trim(),g=$('#rdsCrmGroup')?.value||'',s=$('#rdsCrmStatus')?.value||'';
   filtered=rows.filter(c=>(!q||[c.name,c.phone,c.city,c.tags].join(' ').toLowerCase().includes(q))&&(!g||c.group_name===g)&&(!s||String(c.status||'ATIVO').toUpperCase()===s));
   const view=filtered.slice(0,shown);$('#rdsCrmResult').textContent=filtered.length+' cliente(s)';
   $('#rdsCrmList').innerHTML=view.map(c=>'<article class="rds-client-row"><span class="rds-avatar">'+E((c.name||c.phone||'?').trim().slice(0,1).toUpperCase())+'</span><div class="rds-client-main"><b>'+E(c.name||'Sem nome')+'</b><span>'+E(c.phone||'—')+'</span><small>'+E(c.group_name||'Sem grupo')+(c.city?' • '+E(c.city):'')+'</small></div><span class="rds-client-status '+(c.validated?'ok':'pending')+'">'+(c.validated?'WhatsApp OK':'Não validado')+'</span><div class="rds-client-actions">'+B('Perfil',"contactProfile('"+c.id+"')")+B('Editar',"editContact('"+c.id+"')")+'</div></article>').join('')||'<div class="rds-empty">Nenhum cliente encontrado com esses filtros.</div>';
   $('#rdsCrmMore').style.display=shown<filtered.length?'inline-flex':'none';
  }
  $('#rdsCrmSearch').oninput=()=>{shown=25;draw()};$('#rdsCrmGroup').onchange=()=>{shown=25;draw()};$('#rdsCrmStatus').onchange=()=>{shown=25;draw()};$('#rdsCrmClear').onclick=()=>{$('#rdsCrmSearch').value='';shown=25;draw()};$('#rdsCrmMore').onclick=()=>{shown+=25;draw()};draw();
 }catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>Falha ao carregar Clientes</h2><p>'+E(e.message)+'</p></div>'}
}
window.home=commandHome;window.contacts=commandContacts;
window.render=async function(){if(page==='home')return commandHome();if(page==='contacts')return commandContacts();return oldRender.apply(this,arguments)};
})();
