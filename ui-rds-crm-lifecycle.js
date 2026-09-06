(()=>{
  const Q=s=>document.querySelector(s);
  const E=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const b=t=>badge(t||'—');
  const statusOptions=[
    ['','Todos os status'],
    ['INTERESSADOS','🟢 INTERESSADOS'],
    ['PEDIDO','🛒 PEDIDO'],
    ['CONCLUIU PAGAMENTO','💰 CONCLUIU PAGAMENTO'],
    ['COMPRA CONCLUÍDA','🎟️ COMPRA CONCLUÍDA'],
    ['NÃO PAGOU','⏰ NÃO PAGOU'],
    ['RECUSOU OFERTAS','🚫 RECUSOU OFERTAS'],
    ['SAIU DA LISTA','🔕 SAIU DA LISTA'],
    ['ATENDIMENTO','🏢 ATENDIMENTO']
  ];
  const crmStatus=c=>String(c?.status||'').trim()||'';

  window.contacts=async function(){
    await loadContacts();
    app.innerHTML=`<div class="page-title"><div><span class="eyebrow">CRM</span><h1>Clientes</h1><p class="mut">Carteira comercial única, com ciclo de atendimento visível.</p></div><div class="row">${btn('Importar VCF/CSV','importModal()')}${btn('+ Novo cliente','newContact()','btn primary')}${btn('+ Grupo','newGroup()')}</div></div>
      <div class="toolbar rds-crm-toolbar"><input id="contactSearch" placeholder="Buscar nome, WhatsApp, cidade ou tag" oninput="filterContacts()"><select id="contactGroup" onchange="filterContacts()"><option value="">Todos os grupos</option>${groupOptions('')}</select><select id="contactStatus" onchange="filterContacts()">${statusOptions.map(([v,t])=>`<option value="${E(v)}">${E(t)}</option>`).join('')}</select></div>
      <div class="card table"><table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Origem / Grupo</th><th>Status CRM</th><th>Ações</th></tr></thead><tbody id="contactsBody"></tbody></table></div>`;
    filterContacts();
  };

  window.filterContacts=function(){
    const term=(Q('#contactSearch')?.value||'').toLowerCase();
    const group=Q('#contactGroup')?.value||'';
    const wanted=Q('#contactStatus')?.value||'';
    const rows=(state.contacts||[]).filter(c=>{
      const text=[c.name,c.phone,c.city,c.tags,c.origin,c.group_name,c.status].join(' ').toLowerCase();
      return (!group||c.group_name===group)&&(!wanted||crmStatus(c).toUpperCase()===wanted)&&(!term||text.includes(term));
    });
    const body=Q('#contactsBody');
    if(!body)return;
    body.innerHTML=rows.map(c=>{
      const s=crmStatus(c);
      const shown=s|| (c.validated?'VALIDADO':'NÃO VALIDADO');
      return `<tr><td><span class="crm-name">${E(c.name)}</span><br><span class="mini">${E(c.city||'')}</span></td><td>${E(c.phone)}</td><td>${E(c.origin||'MANUAL')} • ${E(c.group_name||'NOVOS')}</td><td>${b(shown)}</td><td><div class="rds-action-row">${btn('Perfil',`contactProfile('${c.id}')`,'btn primary')}${btn('Editar',`editContact('${c.id}')`,'btn')}${btn('Validar',`validateContact('${c.id}')`,'btn')}</div></td></tr>`;
    }).join('')||'<tr><td colspan="5"><div class="empty-state">Nenhum cliente neste filtro.</div></td></tr>';
  };

  const style=document.createElement('style');
  style.textContent=`
    .rds-crm-toolbar{align-items:center}
    .rds-crm-toolbar select{min-width:180px}
    .rds-crm-toolbar #contactStatus{min-width:210px}
    @media(max-width:760px){.rds-crm-toolbar{display:grid;grid-template-columns:1fr;gap:8px}.rds-crm-toolbar input,.rds-crm-toolbar select{width:100%;min-width:0}}
  `;
  document.head.appendChild(style);
})();