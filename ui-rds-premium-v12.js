(()=>{
  if(window.__RDS_PREMIUM_V12__) return;
  window.__RDS_PREMIUM_V12__=true;

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dt=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
  const api=async(url,opt={})=>{const r=await fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Falha na operação');return d};
  const post=(u,b={})=>api(u,{method:'POST',body:JSON.stringify(b)});
  const del=u=>api(u,{method:'DELETE'});
  const app=()=>document.querySelector('#app');
  const nav=()=>[...document.querySelectorAll('#nav button,#mobileNav button')];
  const pageName=()=>document.querySelector('#nav button.active')?.dataset.page||document.querySelector('#mobileNav button.active')?.dataset.page||'home';
  const toast=t=>{const x=document.querySelector('#toast');if(!x)return;x.textContent=t;x.style.display='block';clearTimeout(window.__rdsToast);window.__rdsToast=setTimeout(()=>x.style.display='none',3200)};

  const style=document.createElement('style');
  style.textContent=`
  .rds-p12{display:grid;gap:16px}.rds-p12-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.rds-p12-title{display:flex;align-items:center;gap:10px}.rds-p12-title .dot{width:9px;height:9px;border-radius:50%;background:#1769d1;box-shadow:0 0 0 5px #e8f1ff}.rds-p12-muted{color:#718096;font-size:13px;line-height:1.45}.rds-p12-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.rds-p12-metric{padding:14px 15px;border:1px solid #e3eaf3;border-radius:15px;background:linear-gradient(145deg,#fff,#f8fbff);min-width:0}.rds-p12-metric small{display:block;color:#718096;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.rds-p12-metric strong{display:block;margin-top:4px;font-size:24px;line-height:1.1;color:#10233f}.rds-p12-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:14px}.rds-p12-card{border:1px solid #e0e8f2;border-radius:17px;background:#fff;box-shadow:0 8px 25px rgba(15,55,100,.06);padding:16px}.rds-p12-card h2{margin:0 0 5px;font-size:17px}.rds-p12-card h3{margin:0;font-size:14px}.rds-p12-actions{display:flex;gap:8px;flex-wrap:wrap}.rds-p12-action{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #edf1f6}.rds-p12-action:last-child{border-bottom:0}.rds-p12-count{font-size:20px;font-weight:900;color:#0b55a4}.rds-p12-groups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rds-p12-group{border:1px solid #dfe7f1;border-radius:15px;overflow:hidden;background:#fff}.rds-p12-group>button{width:100%;border:0;background:#f8fbff;padding:13px;text-align:left;cursor:pointer;font:inherit}.rds-p12-group>button strong{display:block;color:#173150}.rds-p12-group>button span{display:flex;justify-content:space-between;gap:10px;margin-top:4px;color:#718096;font-size:12px}.rds-p12-group.open>button{background:#edf5ff;border-bottom:1px solid #dce8f6}.rds-p12-group-body{padding:10px}.rds-p12-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rds-p12-toolbar input,.rds-p12-toolbar select{min-width:170px;flex:1}.rds-p12-table-wrap{overflow:auto;max-height:62vh;border:1px solid #e5ebf2;border-radius:13px}.rds-p12-table{width:100%;border-collapse:collapse;min-width:680px}.rds-p12-table th,.rds-p12-table td{padding:10px 11px;border-bottom:1px solid #edf1f6;text-align:left;font-size:13px}.rds-p12-table th{position:sticky;top:0;background:#f7faff;z-index:1;font-size:11px;text-transform:uppercase;color:#6d7d91}.rds-p12-table tr:last-child td{border-bottom:0}.rds-p12-check{width:18px;height:18px}.rds-p12-danger{color:#b42318}.rds-p12-empty{padding:28px;text-align:center;color:#718096}.rds-p12-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef5ff;color:#125aa9;font-size:11px;font-weight:800}.rds-p12-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rds-p12-setting{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px;border:1px solid #e2e9f2;border-radius:15px;background:#fff}.rds-p12-setting small{display:block;color:#718096;margin-top:3px}.rds-p12-icon{width:38px;height:38px;border-radius:12px;background:#edf5ff;display:grid;place-items:center;font-size:19px;flex:0 0 auto}.rds-p12-about{max-width:860px;margin:0 auto}.rds-p12-about .hero{padding:25px;border-radius:20px;background:linear-gradient(135deg,#0b3f86,#1769d1);color:#fff}.rds-p12-about .hero h1{margin:4px 0 7px}.rds-p12-about .hero p{margin:0;color:#dbeafe}.rds-p12-about .about-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.rds-p12-about .about-item{padding:16px;border:1px solid #e1e8f1;border-radius:15px;background:#fff}.rds-p12-dangerbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;border:1px solid #f3d0ce;background:#fff7f6;border-radius:13px}.rds-p12-help{padding:13px;border-radius:13px;background:#f7faff;border:1px solid #e2ebf6}
  @media(max-width:900px){.rds-p12-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.rds-p12-groups{grid-template-columns:repeat(2,minmax(0,1fr))}.rds-p12-grid,.rds-p12-settings{grid-template-columns:1fr}}
  @media(max-width:600px){.rds-p12-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.rds-p12-metric{padding:11px}.rds-p12-metric strong{font-size:20px}.rds-p12-groups,.rds-p12-about .about-grid{grid-template-columns:1fr}.rds-p12-card{padding:13px}.rds-p12-toolbar>*{width:100%;min-width:0}.rds-p12-head .btn{width:100%}}
  `;
  document.head.appendChild(style);

  function addAboutNav(){
    for(const id of ['nav','mobileNav']){
      const box=document.getElementById(id);if(!box||box.querySelector('[data-page="about"]'))continue;
      const b=document.createElement('button');b.dataset.page='about';b.innerHTML=id==='nav'?'<span>ⓘ</span><b>Sobre</b>':'ⓘ<small>Sobre</small>';
      b.onclick=()=>renderPremium('about');box.appendChild(b);
    }
  }

  async function renderPremium(which){
    const root=app();if(!root)return;
    if(which==='about'){renderAbout();return;}
    try{
      if(which==='home') await renderHome();
      else if(which==='contacts') await renderContacts();
      else if(which==='returns') await renderReturns();
      else if(which==='settings') await renderSettings();
    }catch(e){root.innerHTML=`<div class="rds-p12-card"><h2>Não foi possível carregar</h2><p class="rds-p12-muted">${esc(e.message)}</p></div>`}
  }

  async function renderHome(){
    const d=await api('/api/dashboard');
    const root=app();
    const attention=[['Comprovantes aguardando conferência',d.proofReview,'orders','Atenção'],['Pedidos aguardando bilhetes',d.ticketsPending,'orders','Emissão'],['Falhas de envio',d.failed,'execution','Revisar'],['Alertas não lidos',d.alerts,'execution','Alertas']].filter(x=>Number(x[1])>0);
    root.innerHTML=`<div class="rds-p12">
      <div class="rds-p12-head"><div><div class="rds-p12-title"><span class="dot"></span><span class="eyebrow">Visão operacional</span></div><h1 style="margin:6px 0 4px">Central</h1><p class="rds-p12-muted">O que precisa de atenção agora, sem misturar planejamento com operação.</p></div></div>
      <div class="rds-p12-metrics">
        ${[['Clientes',d.contacts],['Campanhas',d.campaigns],['Pedidos',d.orders],['Compras',d.purchases],['Pagamentos',d.proofReview],['Bilhetes',d.ticketsPending],['Retornos',d.returns],['Receita',money(d.revenue)]].map(x=>`<div class="rds-p12-metric"><small>${x[0]}</small><strong>${esc(x[1])}</strong></div>`).join('')}
      </div>
      <div class="rds-p12-grid">
        <section class="rds-p12-card"><h2>Atenção agora</h2><p class="rds-p12-muted">Somente itens que exigem alguma ação.</p>${attention.length?attention.map(x=>`<div class="rds-p12-action"><div><strong>${esc(x[0])}</strong><div class="rds-p12-muted">${x[1]} ocorrência(s)</div></div><button class="btn ${x[3]==='Atenção'?'danger':'primary'}" onclick="go('${x[2]}')">Abrir</button></div>`).join(''):'<div class="rds-p12-empty">✓ Nenhuma pendência crítica no momento.</div>'}</section>
        <section class="rds-p12-card"><h2>Saúde da operação</h2><p class="rds-p12-muted">Resumo dos serviços principais.</p><div class="rds-p12-action"><span>WhatsApp</span><span class="rds-p12-badge">${d.connected?'CONECTADO':'OFFLINE'}</span></div><div class="rds-p12-action"><span>Pedidos</span><span class="rds-p12-badge">${d.orders} registrados</span></div><div class="rds-p12-action"><span>Próximo envio</span><span>${d.nextSend?dt(d.nextSend):'—'}</span></div></section>
      </div>
    </div>`;
  }

  let contacts=[],groups=[],openGroup='';let selected=new Set();let contactQuery='';
  async function renderContacts(){
    [contacts,groups]=await Promise.all([api('/api/contacts'),api('/api/groups')]);
    const counts={};contacts.forEach(c=>{counts[c.group_name||'SEM GRUPO']=(counts[c.group_name||'SEM GRUPO']||0)+1});
    const allGroups=groups.map(g=>g.name);for(const n of Object.keys(counts))if(!allGroups.includes(n))allGroups.push(n);
    if(openGroup&&!allGroups.includes(openGroup))openGroup='';
    const root=app();
    root.innerHTML=`<div class="rds-p12">
      <div class="rds-p12-head"><div><span class="eyebrow">CRM</span><h1 style="margin:5px 0">Clientes</h1><p class="rds-p12-muted">Base compacta por grupos, com seleção segura e navegação sem uma lista interminável.</p></div><div class="rds-p12-actions"><button class="btn" onclick="newContact()">+ Novo cliente</button><button class="btn" onclick="newGroup()">+ Grupo</button></div></div>
      <div class="rds-p12-metrics"><div class="rds-p12-metric"><small>Total de contatos</small><strong>${contacts.length}</strong></div><div class="rds-p12-metric"><small>Grupos</small><strong>${allGroups.length}</strong></div><div class="rds-p12-metric"><small>Selecionados</small><strong id="rdsSelCount">0</strong></div><div class="rds-p12-metric"><small>Validados</small><strong>${contacts.filter(c=>c.validated).length}</strong></div></div>
      <div class="rds-p12-toolbar"><input id="rdsContactSearch" placeholder="Buscar cliente ou WhatsApp" value="${esc(contactQuery)}" oninput="window.rdsPremiumContactSearch(this.value)"><button class="btn" onclick="window.rdsPremiumClearSelection()">Limpar seleção</button><button class="btn danger" onclick="window.rdsPremiumDeleteSelected()">Excluir selecionados</button></div>
      <div class="rds-p12-groups">${allGroups.map(g=>`<div class="rds-p12-group ${openGroup===g?'open':''}"><button onclick="window.rdsPremiumOpenGroup('${encodeURIComponent(g)}')"><strong>${esc(g)}</strong><span><span>${counts[g]||0} contatos</span><span>${openGroup===g?'Fechar':'Abrir'}⌄</span></span></button>${openGroup===g?`<div class="rds-p12-group-body" id="rdsGroupBody"></div>`:''}</div>`).join('')}</div>
    </div>`;
    if(openGroup) renderGroupBody(openGroup);
  }
  function filtered(){const q=contactQuery.trim().toLowerCase();return contacts.filter(c=>(c.group_name||'SEM GRUPO')===openGroup&&(!q||[c.name,c.phone,c.city,c.tags].join(' ').toLowerCase().includes(q)))}
  function renderGroupBody(group){
    const rows=filtered();const body=document.querySelector('#rdsGroupBody');if(!body)return;
    const all=rows.length&&rows.every(c=>selected.has(c.id));
    body.innerHTML=`<div class="rds-p12-dangerbar"><label><input class="rds-p12-check" type="checkbox" ${all?'checked':''} onchange="window.rdsPremiumSelectGroup(this.checked)"> Selecionar todos os ${rows.length} mostrados</label><button class="btn danger" onclick="window.rdsPremiumDeleteGroup()">Excluir grupo</button></div><div class="rds-p12-table-wrap"><table class="rds-p12-table"><thead><tr><th></th><th>Cliente</th><th>WhatsApp</th><th>Status</th><th></th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td><input class="rds-p12-check" type="checkbox" ${selected.has(c.id)?'checked':''} onchange="window.rdsPremiumToggle('${c.id}',this.checked)"></td><td><strong>${esc(c.name)}</strong><br><small>${esc(c.city||c.origin||'')}</small></td><td>${esc(c.phone)}</td><td><span class="rds-p12-badge">${c.validated?'VALIDADO':'NÃO VALIDADO'}</span></td><td><button class="btn" onclick="window.rdsPremiumDeleteOne('${c.id}')">Excluir</button></td></tr>`).join(''):'<tr><td colspan="5" class="rds-p12-empty">Nenhum cliente encontrado.</td></tr>'}</tbody></table></div>`;
    updateSelectedCount();
  }
  function updateSelectedCount(){const x=document.querySelector('#rdsSelCount');if(x)x.textContent=selected.size}
  window.rdsPremiumOpenGroup=async g=>{openGroup=decodeURIComponent(g);contactQuery='';await renderContacts()};
  window.rdsPremiumContactSearch=v=>{contactQuery=v;renderGroupBody(openGroup)};
  window.rdsPremiumToggle=(id,on)=>{on?selected.add(id):selected.delete(id);updateSelectedCount()};
  window.rdsPremiumSelectGroup=on=>{filtered().forEach(c=>on?selected.add(c.id):selected.delete(c.id));renderGroupBody(openGroup)};
  window.rdsPremiumClearSelection=()=>{selected.clear();renderGroupBody(openGroup);updateSelectedCount()};
  window.rdsPremiumDeleteOne=async id=>{if(!confirm('Excluir este cliente?'))return;try{await del('/api/contacts/'+encodeURIComponent(id));selected.delete(id);toast('Cliente excluído.');await renderContacts()}catch(e){toast(e.message)}};
  window.rdsPremiumDeleteSelected=async()=>{if(selected.size<1)return toast('Selecione pelo menos um cliente.');if(selected.size===1)return window.rdsPremiumDeleteOne([...selected][0]);toast('Exclusão em massa exige a senha administrativa de segurança. Nenhum contato foi excluído.');};
  window.rdsPremiumDeleteGroup=()=>{const n=filtered().length;if(!n)return toast('Grupo vazio.');toast(`Exclusão de ${n} contatos exige a senha administrativa de segurança. Nenhum contato foi excluído.`)};

  async function renderReturns(){
    const msgs=await api('/api/returns');const map=new Map();
    for(const m of msgs||[]){const key=m.phone||m.lid||m.raw_payload?.remoteJid;if(!key||map.has(key))continue;map.set(key,m)}
    const rows=[...map.values()];
    app().innerHTML=`<div class="rds-p12"><div class="rds-p12-head"><div><span class="eyebrow">Acompanhamento comercial</span><h1 style="margin:5px 0">Retornos</h1><p class="rds-p12-muted">Mensagens recebidas que podem exigir nova ação. A Central mostra apenas o contador.</p></div></div><div class="rds-p12-metrics"><div class="rds-p12-metric"><small>Retornos identificados</small><strong>${rows.length}</strong></div><div class="rds-p12-metric"><small>Últimas mensagens</small><strong>${(msgs||[]).length}</strong></div></div><section class="rds-p12-card"><h2>Fila de acompanhamento</h2>${rows.length?rows.map(m=>`<div class="rds-p12-action"><div><strong>${esc(m.phone||'Contato não identificado')}</strong><div class="rds-p12-muted">${esc((m.body||'Mensagem recebida').slice(0,140))}</div><small>${dt(m.created_at)}</small></div><span class="rds-p12-badge">RECEBIDO</span></div>`).join(''):'<div class="rds-p12-empty">Nenhum retorno identificado.</div>'}</section></div>`;
  }

  async function renderSettings(){
    let status={};try{status=await api('/api/status')}catch{}
    let official={};try{official=await api('/api/v1011/official-sales/status')}catch{}
    app().innerHTML=`<div class="rds-p12"><div class="rds-p12-head"><div><span class="eyebrow">Administração</span><h1 style="margin:5px 0">Ajustes</h1><p class="rds-p12-muted">Configurações organizadas por função. Nada de blocos gigantes para uma única mensagem.</p></div></div><div class="rds-p12-settings">
      <div class="rds-p12-setting"><div class="rds-p12-title"><span class="rds-p12-icon">🎟️</span><div><strong>Vendas REINO DA SORTE</strong><small>Integração oficial e emissão de bilhetes.</small></div></div><span class="rds-p12-badge">${official.authorized?'CONECTADO':'PENDENTE'}</span></div>
      <div class="rds-p12-setting"><div class="rds-p12-title"><span class="rds-p12-icon">💬</span><div><strong>WhatsApp</strong><small>Canal de mensagens do sistema.</small></div></div><span class="rds-p12-badge">${status.connected?'CONECTADO':'OFFLINE'}</span></div>
      <div class="rds-p12-setting"><div class="rds-p12-title"><span class="rds-p12-icon">💳</span><div><strong>Pagamentos</strong><small>Operação e conferência de pagamentos.</small></div></div><button class="btn" onclick="go('payments')">Abrir</button></div>
      <div class="rds-p12-setting"><div class="rds-p12-title"><span class="rds-p12-icon">⚡</span><div><strong>Automação</strong><small>Fila e execução das campanhas.</small></div></div><button class="btn" onclick="go('execution')">Abrir</button></div>
    </div><section class="rds-p12-card"><h2>Mensagem final da compra</h2><p class="rds-p12-muted">Texto enviado após a conclusão da venda.</p><button class="btn primary" onclick="go('settings')" id="rdsFinalMessageEdit">Editar mensagem</button><div id="rdsFinalMessageEditor" style="display:none;margin-top:12px"></div></section></div>`;
    const b=document.querySelector('#rdsFinalMessageEdit');if(b)b.onclick=async()=>{try{const s=await api('/api/settings');const box=document.querySelector('#rdsFinalMessageEditor');box.style.display='block';box.innerHTML=`<textarea id="rdsFinalMessage" rows="7" style="width:100%">${esc(s.final_message||'')}</textarea><div class="rds-p12-actions" style="margin-top:8px"><button class="btn primary" onclick="window.rdsPremiumSaveFinalMessage()">Salvar</button><button class="btn" onclick="document.querySelector('#rdsFinalMessageEditor').style.display='none'">Fechar</button></div>`}catch(e){toast(e.message)}};
  }
  window.rdsPremiumSaveFinalMessage=async()=>{try{await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({final_message:document.querySelector('#rdsFinalMessage').value})});toast('Mensagem salva.')}catch(e){toast(e.message)}};

  function renderAbout(){app().innerHTML=`<div class="rds-p12 rds-p12-about"><div class="hero"><span style="opacity:.8;font-size:12px;font-weight:800;letter-spacing:.08em">SISTEMA OPERACIONAL</span><h1>CANAL DE VENDAS RDS</h1><p>Plataforma interna de relacionamento, campanhas, pedidos, pagamentos e operações de vendas da Reino da Sorte.</p></div><div class="about-grid"><div class="about-item"><span class="eyebrow">Criador</span><h3>Reino da Sorte</h3><p class="rds-p12-muted">Sistema desenvolvido para centralizar a operação comercial e reduzir tarefas manuais.</p></div><div class="about-item"><span class="eyebrow">Objetivo</span><h3>Operação em um só lugar</h3><p class="rds-p12-muted">Clientes, campanhas, automação, retornos, pagamentos e compras organizados por função.</p></div><div class="about-item"><span class="eyebrow">Como usar</span><h3>1. Clientes → 2. Campanhas → 3. Operação</h3><p class="rds-p12-muted">Cadastre ou importe contatos, planeje campanhas e acompanhe a execução.</p></div><div class="about-item"><span class="eyebrow">Vendas</span><h3>Pagamentos → Compras → Emissão</h3><p class="rds-p12-muted">Acompanhe o pagamento, a compra concluída e a emissão dos bilhetes.</p></div></div></div>`}

  function route(){
    addAboutNav();
    const p=pageName();
    if(['home','contacts','returns','settings'].includes(p)) renderPremium(p);
  }
  const obs=new MutationObserver(()=>{addAboutNav();const p=pageName();if(['home','contacts','returns','settings'].includes(p)&&!app()?.querySelector('.rds-p12')){setTimeout(()=>renderPremium(p),0)}});
  obs.observe(document.body,{childList:true,subtree:true});
  for(const b of nav()) b.addEventListener('click',()=>setTimeout(route,80));
  setTimeout(route,120);
})();