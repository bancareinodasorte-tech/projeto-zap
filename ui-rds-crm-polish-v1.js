(()=>{
  const Q=s=>document.querySelector(s);
  const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');
  let crmRows=[], crmPage=1;

  function crmStats(rows){
    const active=rows.filter(c=>String(c.status||'ATIVO').toUpperCase()!=='INATIVO').length;
    const valid=rows.filter(c=>c.validated===true).length;
    return {total:rows.length,active,valid,pending:Math.max(0,rows.length-valid)};
  }

  window.contacts=async function(){
    try{
      const [rows,groups]=await Promise.all([api('/api/contacts'),api('/api/groups')]);
      crmRows=Array.isArray(rows)?rows:[];
      state.contacts=crmRows;
      state.groups=Array.isArray(groups)?groups:[];
      crmPage=1;
      const st=crmStats(crmRows);
      app.innerHTML=`
        <div class="page-title rds-crm-head">
          <div><span class="eyebrow">CRM • BASE COMERCIAL</span><h1>Clientes</h1><p class="mut">Carteira comercial independente do histórico do WhatsApp.</p></div>
          <div class="row rds-crm-head-actions">${btn('Importar contatos','importModal()')}${btn('+ Novo cliente','newContact()','btn primary')}</div>
        </div>
        <div class="rds-crm-metrics">
          <div class="rds-crm-metric"><span>CLIENTES CADASTRADOS</span><strong id="crmMTotal">${st.total}</strong><small>na base comercial</small></div>
          <div class="rds-crm-metric"><span>ATIVOS</span><strong id="crmMActive">${st.active}</strong><small>disponíveis para operação</small></div>
          <div class="rds-crm-metric"><span>WHATSAPP VALIDADO</span><strong id="crmMValid">${st.valid}</strong><small>números confirmados</small></div>
          <div class="rds-crm-metric"><span>PRECISAM VALIDAR</span><strong id="crmMPending">${st.pending}</strong><small>revisar antes de disparar</small></div>
        </div>
        <div class="rds-crm-tools">
          <div class="rds-crm-search"><span>⌕</span><input id="contactSearch" placeholder="Buscar por nome ou WhatsApp..." oninput="window.rdsCrmFilter()"><button type="button" onclick="window.rdsCrmClear()">Limpar</button></div>
          <select id="contactGroup" onchange="window.rdsCrmFilter()"><option value="">Todos os grupos</option>${state.groups.map(g=>`<option value="${E(g.name)}">${E(g.name)}</option>`).join('')}</select>
          <select id="contactStatus" onchange="window.rdsCrmFilter()"><option value="">Todos os status</option><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option><option value="VALIDADO">WhatsApp validado</option><option value="PENDENTE">Precisam validar</option></select>
          <select id="crmPageSize" onchange="window.rdsCrmFilter()"><option value="10">Mostrar 10</option><option value="25">Mostrar 25</option><option value="50">Mostrar 50</option></select>
        </div>
        <section class="rds-crm-list-card">
          <div class="rds-crm-list-head"><div><span class="eyebrow">CARTEIRA</span><h2>Clientes</h2></div><strong id="crmResultCount">${st.total} cliente(s)</strong></div>
          <div id="contactsBody" class="rds-crm-list"></div>
          <button id="crmMore" class="rds-crm-more" type="button" onclick="window.rdsCrmMore()">Mostrar mais</button>
        </section>`;
      window.rdsCrmFilter();
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Clientes</h2><p class="mut">${E(e.message)}</p></div>`;}
  };

  window.rdsCrmFiltered=function(){
    const q=norm(Q('#contactSearch')?.value), g=Q('#contactGroup')?.value||'', st=Q('#contactStatus')?.value||'';
    return crmRows.filter(c=>{
      const text=norm([c.name,c.phone,c.city,c.tags].join(' '));
      if(q&&!text.includes(q))return false;
      if(g&&c.group_name!==g)return false;
      if(st==='ATIVO'&&String(c.status||'ATIVO').toUpperCase()==='INATIVO')return false;
      if(st==='INATIVO'&&String(c.status||'').toUpperCase()!=='INATIVO')return false;
      if(st==='VALIDADO'&&!c.validated)return false;
      if(st==='PENDENTE'&&c.validated)return false;
      return true;
    });
  };

  window.rdsCrmFilter=function(){
    crmPage=1; window.rdsCrmRender();
  };

  window.rdsCrmRender=function(){
    const rows=window.rdsCrmFiltered(), size=Number(Q('#crmPageSize')?.value||10), shown=rows.slice(0,crmPage*size);
    const body=Q('#contactsBody'); if(!body)return;
    body.innerHTML=shown.map(c=>{
      const initial=E(String(c.name||'?').trim().charAt(0).toUpperCase());
      const valid=c.validated===true;
      const status=String(c.status||'ATIVO').toUpperCase();
      return `<article class="rds-crm-client">
        <div class="rds-crm-avatar">${initial}</div>
        <div class="rds-crm-main"><strong>${E(c.name||'Sem nome')}</strong><span>${E(c.phone||'')}</span><small>${E(c.group_name||'SEM GRUPO')}</small></div>
        <div class="rds-crm-state ${valid?'ok':'pending'}">${valid?'WhatsApp OK':'Validar WhatsApp'}</div>
        <div class="rds-crm-actions">
          <button type="button" onclick="contactProfile('${E(c.id)}')">Perfil</button>
          <button type="button" onclick="editContact('${E(c.id)}')">Editar</button>
          ${valid?'':`<button type="button" class="primary" onclick="validateContact('${E(c.id)}')">Validar</button>`}
        </div>
      </article>`;
    }).join('')||'<div class="rds-crm-empty">Nenhum cliente encontrado para os filtros atuais.</div>';
    const count=Q('#crmResultCount'); if(count)count.textContent=`${rows.length} cliente(s)`;
    const more=Q('#crmMore'); if(more){more.style.display=shown.length<rows.length?'block':'none';more.textContent=`Mostrar mais ${Math.min(size,rows.length-shown.length)}`;}
  };

  window.rdsCrmMore=function(){crmPage++;window.rdsCrmRender()};
  window.rdsCrmClear=function(){if(Q('#contactSearch'))Q('#contactSearch').value='';if(Q('#contactGroup'))Q('#contactGroup').value='';if(Q('#contactStatus'))Q('#contactStatus').value='';window.rdsCrmFilter()};

  const style=document.createElement('style');
  style.textContent=`
    .rds-crm-head{align-items:flex-end}
    .rds-crm-head-actions{gap:8px}
    .rds-crm-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 14px}
    .rds-crm-metric{background:#fff;border:1px solid #d8e2ef;border-radius:16px;padding:15px 16px;box-shadow:0 5px 18px rgba(12,45,86,.05)}
    .rds-crm-metric span{display:block;font-size:10px;font-weight:800;letter-spacing:.12em;color:#71829a}
    .rds-crm-metric strong{display:block;font-size:28px;line-height:1.05;color:#123b70;margin:7px 0 4px}
    .rds-crm-metric small{color:#7a889c}
    .rds-crm-tools{display:grid;grid-template-columns:minmax(240px,1fr) 180px 180px 140px;gap:8px;margin-bottom:14px}
    .rds-crm-search{display:flex;align-items:center;background:#fff;border:1px solid #d8e2ef;border-radius:13px;padding:0 10px;min-height:46px}
    .rds-crm-search span{color:#8291a5;font-size:20px;margin-right:6px}
    .rds-crm-search input{border:0;outline:0;flex:1;min-width:0;background:transparent;font-size:15px}
    .rds-crm-search button{border:0;background:transparent;color:#61738d;font-weight:700}
    .rds-crm-tools select{border:1px solid #d8e2ef;border-radius:13px;background:#fff;padding:0 12px;min-height:46px;color:#203b5e}
    .rds-crm-list-card{background:#fff;border:1px solid #d8e2ef;border-radius:18px;padding:14px;box-shadow:0 7px 24px rgba(12,45,86,.05)}
    .rds-crm-list-head{display:flex;justify-content:space-between;align-items:center;padding:4px 2px 12px;border-bottom:1px solid #edf1f6}
    .rds-crm-list-head h2{margin:2px 0 0}
    .rds-crm-list-head>strong{font-size:13px;color:#728198}
    .rds-crm-client{display:grid;grid-template-columns:42px minmax(0,1fr) 120px auto;gap:12px;align-items:center;padding:12px 2px;border-bottom:1px solid #edf1f6}
    .rds-crm-avatar{width:42px;height:42px;border-radius:13px;background:#eaf2fb;color:#1762a9;display:grid;place-items:center;font-weight:800}
    .rds-crm-main{min-width:0;display:flex;flex-direction:column}
    .rds-crm-main strong{color:#163d6f;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rds-crm-main span{font-size:13px;color:#526783;margin-top:2px}
    .rds-crm-main small{font-size:10px;color:#8b98a9;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
    .rds-crm-state{font-size:11px;font-weight:800;text-align:center;border-radius:999px;padding:7px 8px}
    .rds-crm-state.ok{background:#e7f7ee;color:#16804a}.rds-crm-state.pending{background:#fff4dd;color:#99670d}
    .rds-crm-actions{display:flex;gap:5px;justify-content:flex-end}
    .rds-crm-actions button{border:1px solid #d7e0ec;background:#fff;border-radius:9px;padding:7px 9px;color:#294d75;font-weight:700}
    .rds-crm-actions button.primary{background:#1768bb;color:#fff;border-color:#1768bb}
    .rds-crm-more{display:block;width:100%;margin-top:12px;border:1px solid #d7e0ec;background:#fff;border-radius:11px;padding:10px;color:#294d75;font-weight:800}
    .rds-crm-empty{padding:28px 8px;text-align:center;color:#7c8a9e}
    @media(max-width:760px){
      .rds-crm-head{display:flex;flex-direction:column;align-items:stretch;gap:10px}
      .rds-crm-head-actions{display:grid;grid-template-columns:1fr 1fr}
      .rds-crm-head-actions .btn{width:100%}
      .rds-crm-metrics{grid-template-columns:1fr 1fr;gap:8px}
      .rds-crm-metric{padding:12px 13px;border-radius:14px}
      .rds-crm-metric strong{font-size:25px}
      .rds-crm-tools{grid-template-columns:1fr;gap:8px}
      .rds-crm-client{grid-template-columns:38px minmax(0,1fr);gap:9px;padding:12px 0}
      .rds-crm-avatar{width:38px;height:38px}
      .rds-crm-state{grid-column:2;justify-self:start;padding:5px 9px}
      .rds-crm-actions{grid-column:1/-1;justify-content:stretch}
      .rds-crm-actions button{flex:1}
    }
  `;
  document.head.appendChild(style);
  window.rdsCrmPage=window.contacts;
  const crmStyle=document.createElement('style');
  crmStyle.textContent='.rds-crm-client{cursor:pointer}.rds-crm-client .rds-crm-actions{display:none}.rds-crm-client.rds-open .rds-crm-actions{display:flex}.rds-crm-client.rds-open{background:#fbfdff;border-radius:12px}.rds-crm-client.rds-open .rds-crm-actions{grid-column:1/-1;justify-content:flex-end;margin-top:2px}.rds-crm-client.rds-open .rds-crm-actions button{min-width:86px}@media(max-width:760px){.rds-crm-client.rds-open .rds-crm-actions{display:flex;justify-content:stretch}.rds-crm-client.rds-open .rds-crm-actions button{flex:1}}';
  document.head.appendChild(crmStyle);
  document.addEventListener('click',event=>{
    const row=event.target.closest('.rds-crm-client');
    if(!row)return;
    if(event.target.closest('button'))return;
    document.querySelectorAll('.rds-crm-client.rds-open').forEach(x=>{if(x!==row)x.classList.remove('rds-open')});
    row.classList.toggle('rds-open');
  });
})();