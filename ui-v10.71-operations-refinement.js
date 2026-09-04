(()=>{
  const q=s=>document.querySelector(s);
  const escR=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const orderGroups=[
    ['COLETANDO_DADOS','Em atendimento'],
    ['AGUARDANDO_PAGAMENTO','Aguardando PIX'],
    ['AGUARDANDO_CONFERENCIA','Comprovantes recebidos'],
    ['PAGO_AGUARDANDO_BILHETES','Pagamento confirmado'],
    ['CONCLUIDO','Concluídas'],
    ['CANCELADO','Canceladas']
  ];
  const qualified=c=>['MANUAL','IMPORTACAO','PEDIDO','COMPRA'].includes(String(c.origin||'').toUpperCase())||!['ENTRADA WHATSAPP','NOVOS'].includes(String(c.group_name||'').toUpperCase());

  function clockFinal(){
    const old=q('#clock');
    if(old) old.style.display='none';
    let x=q('#rdsClockFinal');
    if(!x){
      const host=q('.top-actions');
      if(!host)return;
      x=document.createElement('span');x.id='rdsClockFinal';x.className='rds-clock-final';host.insertBefore(x,host.firstChild);
    }
    const now=new Date();
    const d=now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).replace('.','');
    const t=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    x.innerHTML=`<b>${d}</b><span>${t}</span>`;
  }
  setInterval(clockFinal,1000);clockFinal();

  window.rdsCleanupOrders=async function(){
    if(!confirm('Limpar somente compras concluídas/canceladas com mais de 30 dias?'))return;
    try{const r=await post('/api/orders/cleanup');toast(`${r.deleted||0} registro(s) antigo(s) removido(s).`);orders()}catch(e){toast(e.message)}
  };

  window.orders=async function(){
    try{
      state.orders=await api('/api/orders');
      const groups=orderGroups.map(([k,n])=>({k,n,rows:state.orders.filter(o=>o.status===k)}));
      const active=groups.filter(g=>!['CONCLUIDO','CANCELADO'].includes(g.k)).reduce((a,g)=>a+g.rows.length,0);
      app.innerHTML=`<div class="page-title"><div><span class="eyebrow">Operação de vendas</span><h1>Compras</h1><p class="mut">Cada etapa tem seu próprio quadro, contador e ações.</p></div><div class="row">${btn('Limpar +30 dias','rdsCleanupOrders()','btn danger')}</div></div>
      <div class="rds-ops-summary"><div><span>EM ANDAMENTO</span><b>${active}</b></div>${groups.map(g=>`<div><span>${escR(g.n).toUpperCase()}</span><b>${g.rows.length}</b></div>`).join('')}</div>
      ${groups.map((g,i)=>`<details class="rds-collapse" ${i<4?'open':''}><summary><span><b>${escR(g.n)}</b><small>${g.rows.length} registro(s)</small></span><strong>${g.rows.length}</strong></summary><div class="rds-collapse-body">${g.rows.map(o=>`<div class="card rds-order-clean"><div class="rds-order-head"><div><h2>${escR(o.code)}</h2><p>${escR(o.customer_name||o.phone||'Cliente')} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount||0)}</b></p><span class="mini">Criado: ${dt(o.created_at)}${o.updated_at?' • Atualizado: '+dt(o.updated_at):''}</span></div>${badge(g.n)}</div><div class="rds-action-row">${btn('Ver detalhes',`rdsOrderDetails('${o.id}')`,'btn')}${g.k==='AGUARDANDO_PAGAMENTO'?btn('Pagamentos',"go('payments')",'btn primary'):''}${g.k==='AGUARDANDO_CONFERENCIA'?btn('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${g.k==='PAGO_AGUARDANDO_BILHETES'?btn('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(g.k)?btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`).join('')||'<div class="empty-state">Nenhum registro nesta etapa.</div>'}</div></details>`).join('')}`;
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Compras</h2><p>${escR(e.message)}</p></div>`}
  };

  window.returnsPage=async function(){
    try{
      const [rs,os]=await Promise.all([api('/api/returns'),api('/api/orders')]);state.returns=rs;
      const latest=new Map();for(const r of rs||[]){if(r.phone&&!latest.has(r.phone))latest.set(r.phone,r)}
      const rows=[...latest.values()];
      app.innerHTML=`<div class="page-title"><div><span class="eyebrow">Caixa comercial</span><h1>Retornos</h1><p class="mut">Somente retornos que realmente precisam de intervenção.</p></div></div><div class="rds-return-count"><span>RETORNOS PENDENTES</span><b>${rows.length}</b></div>${rows.map(r=>{const o=os.find(x=>x.phone===r.phone&&!['CONCLUIDO','CANCELADO'].includes(x.status));return `<div class="card rds-return"><div class="rds-order-head"><div><h2>${escR(r.phone||'Identidade pendente')}</h2><span class="mini">${dt(r.created_at)}</span></div>${badge(o?.status||'ATENDIMENTO')}</div><p>${escR(r.body||`[${r.message_type||'mídia'} recebida]`)}</p><div class="rds-action-row"><a target="_blank" href="https://wa.me/${escR(r.phone||'')}">${btn('Abrir WhatsApp','')}</a>${o?btn('Abrir pedido',"go('orders')",'btn primary'):''}</div></div>`}).join('')||'<div class="card empty-state">Nenhum retorno pendente.</div>'}`;
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Retornos</h2><p>${escR(e.message)}</p></div>`}
  };

  window.contacts=async function(){
    try{
      await loadContacts();
      const visible=state.contacts.filter(qualified);
      app.innerHTML=`<div class="page-title"><div><span class="eyebrow">CRM</span><h1>Clientes</h1><p class="mut">Só entra na carteira quem demonstrou intenção de compra ou foi salvo pelo operador.</p></div><div class="row">${btn('Importar VCF/CSV','importModal()')}${btn('+ Novo cliente','newContact()','btn primary')}${btn('+ Grupo','newGroup()')}</div></div><div class="rds-intent-note"><b>Regra da carteira</b><span>Mensagem recebida sozinha não cria cliente. Pedido preenchido ou cadastro manual/importado pode entrar nas campanhas.</span></div><div class="toolbar"><input id="contactSearch" placeholder="Buscar nome, WhatsApp, cidade ou tag" oninput="filterContacts()"><select id="contactGroup" onchange="filterContacts()"><option value="">Todos os grupos</option>${groupOptions('')}</select></div><div class="card table"><table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Origem / Grupo</th><th>Status</th><th>Ações</th></tr></thead><tbody id="contactsBody"></tbody></table></div>`;
      state.contacts=visible;filterContacts();
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Clientes</h2><p>${escR(e.message)}</p></div>`}
  };
  window.filterContacts=function(){const q=(q('#contactSearch')?.value||'').toLowerCase(),g=q('#contactGroup')?.value||'';const rows=state.contacts.filter(c=>(!g||c.group_name===g)&&(!q||[c.name,c.phone,c.city,c.tags,c.origin].join(' ').toLowerCase().includes(q)));q('#contactsBody').innerHTML=rows.map(c=>`<tr><td><span class="crm-name">${escR(c.name)}</span><br><span class="mini">${escR(c.city||'')}</span></td><td>${escR(c.phone)}</td><td>${escR(c.origin||'MANUAL')} • ${escR(c.group_name||'NOVOS')}</td><td>${badge(c.validated?'VALIDADO':'NÃO VALIDADO')}</td><td><div class="rds-action-row">${btn('Perfil',`contactProfile('${c.id}')`,'btn primary')}${btn('Editar',`editContact('${c.id}')`,'btn')}${btn('Validar',`validateContact('${c.id}')`,'btn')}</div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state">Nenhum cliente qualificado neste filtro.</div></td></tr>'};

  async function loadCampaignStats(c){try{return await api(`/api/campaigns/${c.id}/stats`)}catch{return {total:c.metrics?.total||0,queued:c.metrics?.queue||0,sent:c.metrics?.sent||0,failed:c.metrics?.failed||0,cancelled:c.metrics?.cancelled||0,replies:0}}}
  window.campaignRules=async function(id){
    try{
      const c=state.campaigns.find(x=>x.id===id)||await api(`/api/campaigns/${id}`);
      const r=await api(`/api/campaigns/${id}/rules`).catch(()=>({}));
      const v=Object.assign({max_per_day:0,max_per_hour:0,interval_minutes:0,window_start:'08:00',window_end:'20:00',batch_limit:0,shuffle:false,avoid_repeat:true,stop_on_order:true,shuffle_pool:''},r||{});
      modal(`<span class="eyebrow">Proteção de disparo</span><h2>Regras — ${escR(c.name)}</h2><p class="mut">Estas regras são aplicadas pelo motor, não apenas visualmente.</p><label>Máximo de mensagens por dia (0 = sem limite)</label><input id=crDay type=number min=0 value="${v.max_per_day}"><label>Máximo por hora (0 = sem limite)</label><input id=crHour type=number min=0 value="${v.max_per_hour}"><label>Intervalo mínimo por cliente (minutos)</label><input id=crInt type=number min=0 value="${v.interval_minutes}"><label>Início permitido</label><input id=crStart type=time value="${v.window_start}"><label>Fim permitido</label><input id=crEnd type=time value="${v.window_end}"><label>Limite por ciclo do motor (0 = sem limite)</label><input id=crBatch type=number min=0 value="${v.batch_limit}"><label>Grupo de embaralhamento compartilhado</label><input id=crPool value="${escR(v.shuffle_pool)}" placeholder="Ex.: SEXTA-01"><label><input id=crShuffle type=checkbox style="width:auto" ${v.shuffle?'checked':''}> Embaralhar destinatários</label><label><input id=crAvoid type=checkbox style="width:auto" ${v.avoid_repeat!==false?'checked':''}> Não repetir a mesma mensagem para o mesmo cliente</label><label><input id=crStop type=checkbox style="width:auto" ${v.stop_on_order!==false?'checked':''}> Retirar automaticamente quem entrar em pedido</label><div class="row">${btn('Salvar regras',`saveCampaignRules('${id}')`,'btn primary')}</div>`);
    }catch(e){toast(e.message)}
  };
  window.saveCampaignRules=async function(id){try{const body={max_per_day:Number(q('#crDay').value||0),max_per_hour:Number(q('#crHour').value||0),interval_minutes:Number(q('#crInt').value||0),window_start:q('#crStart').value||'08:00',window_end:q('#crEnd').value||'20:00',batch_limit:Number(q('#crBatch').value||0),shuffle:q('#crShuffle').checked,avoid_repeat:q('#crAvoid').checked,stop_on_order:q('#crStop').checked,shuffle_pool:q('#crPool').value.trim()};await put(`/api/campaigns/${id}/rules`,body);document.querySelector('.modal')?.remove();toast('Regras de campanha salvas.');campaigns()}catch(e){toast(e.message)}};
  window.campaigns=async function(){
    try{
      state.campaigns=await api('/api/campaigns');
      const stats=await Promise.all(state.campaigns.map(loadCampaignStats));
      app.innerHTML=`<div class="page-title"><div><span class="eyebrow">Planejamento comercial</span><h1>Campanhas</h1><p class="mut">Configuração, proteção de disparos e acompanhamento por campanha.</p></div>${btn('+ Nova campanha','newCampaign()','btn primary')}</div><div class="rds-campaign-grid">${state.campaigns.map((c,i)=>{const s=stats[i]||{};return `<section class="card rds-campaign-card"><div class="rds-order-head"><div><h2>${escR(c.name)}</h2><p class="mut">${c.start_at?dt(c.start_at):'Sem início'} • ${escR(c.code||'')}</p></div>${badge(c.status)}</div><div class="rds-campaign-counters"><span><b>${s.total??c.metrics?.total??0}</b><small>destinatários</small></span><span><b>${s.sent??c.metrics?.sent??0}</b><small>receberam</small></span><span><b>${s.queued??c.metrics?.queue??0}</b><small>na fila</small></span><span><b>${s.failed??c.metrics?.failed??0}</b><small>falhas</small></span><span><b>${s.replies??0}</b><small>responderam</small></span></div><div class="rds-rule-strip"><span>${c.ruleSummary||'Regras padrão'}</span><span>${c.metrics?.cancelled||0} canceladas</span></div><div class="rds-action-row">${btn('Detalhes',`campaignDetails('${c.id}')`,'btn')}${btn('Regras',`campaignRules('${c.id}')`,'btn warn')}${c.status==='RASCUNHO'?btn('Ativar',`activateCampaign('${c.id}')`,'btn primary'):''}${btn('Duplicar',`duplicateCampaign('${c.id}')`,'btn')}</div></section>`}).join('')||'<div class="card empty-state">Nenhuma campanha.</div>'}</div>`;
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Campanhas</h2><p>${escR(e.message)}</p></div>`}
  };

  const css=document.createElement('style');css.textContent=`
    .rds-clock-final{display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.05;color:#17365d;font-size:10px;min-width:125px;font-variant-numeric:tabular-nums}.rds-clock-final b{font-size:10px}.rds-clock-final span{margin-top:3px;font-size:11px;color:#6f7e94}
    .rds-ops-summary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:12px}.rds-ops-summary>div{background:#fff;border:1px solid #dce6f2;border-radius:14px;padding:10px 11px}.rds-ops-summary span{display:block;font-size:8px;font-weight:900;letter-spacing:.06em;color:#718197}.rds-ops-summary b{display:block;margin-top:5px;font-size:22px;color:#092d5e}.rds-collapse{background:#fff;border:1px solid #dce6f2;border-radius:17px;margin:12px 0;overflow:hidden;box-shadow:0 8px 24px rgba(19,54,96,.05)}.rds-collapse summary{cursor:pointer;list-style:none;padding:15px 17px;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,#f8fbff,#fff)}.rds-collapse summary::-webkit-details-marker{display:none}.rds-collapse summary span{display:flex;flex-direction:column;gap:3px}.rds-collapse summary small{color:#6f7e94;font-size:10px}.rds-collapse summary>strong{min-width:30px;height:30px;border-radius:999px;display:grid;place-items:center;background:#eaf1fa;color:#092d5e}.rds-collapse-body{padding:2px 12px 12px}.rds-order-clean{margin:10px 0;border-radius:14px;padding:14px}.rds-order-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.rds-order-head h2{margin:0 0 5px;font-size:17px;color:#17365d}.rds-order-head p{margin:0 0 5px;color:#52657d;font-size:12px}.rds-action-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}.rds-action-row .btn{padding:8px 11px;font-size:11px;min-height:34px}.rds-return-count{display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #dce6f2;border-radius:15px;padding:13px 16px;margin-bottom:12px}.rds-return-count span{font-size:10px;font-weight:900;color:#6f7e94}.rds-return-count b{font-size:24px;color:#092d5e}.rds-intent-note{display:flex;gap:9px;align-items:flex-start;background:#eef6ff;border:1px solid #cfe1f5;border-radius:14px;padding:12px 14px;margin-bottom:14px;color:#17365d;font-size:11px}.rds-intent-note b{white-space:nowrap}.rds-campaign-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rds-campaign-card{margin:0}.rds-campaign-counters{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:13px 0}.rds-campaign-counters span{background:#f6f9fd;border-radius:10px;padding:8px;text-align:center}.rds-campaign-counters b{display:block;font-size:18px;color:#092d5e}.rds-campaign-counters small{font-size:8px;color:#6f7e94}.rds-rule-strip{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:9px;color:#63758b;margin-bottom:8px}.rds-rule-strip span:first-child{font-weight:800;color:#0d55a5}.rds-ops-summary>div:nth-child(2) b{color:#0d55a5}.rds-ops-summary>div:nth-child(5) b{color:#15925a}.rds-ops-summary>div:nth-child(6) b{color:#187247}.rds-ops-summary>div:nth-child(7) b{color:#c53c46}
    @media(max-width:900px){.rds-ops-summary{grid-template-columns:repeat(3,1fr)}.rds-campaign-grid{grid-template-columns:1fr}.rds-campaign-counters{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:760px){.rds-clock-final{min-width:104px;font-size:9px}.rds-clock-final b{font-size:9px}.rds-clock-final span{font-size:10px}.rds-ops-summary{grid-template-columns:repeat(2,1fr)}.rds-order-head{gap:8px}.rds-order-head h2{font-size:15px}.rds-action-row .btn{min-height:32px;padding:7px 9px;font-size:10px}.rds-collapse summary{padding:13px}.rds-campaign-counters{grid-template-columns:repeat(3,1fr)}}
  `;document.head.appendChild(css);
})();