(() => {
  const rdsFetch = async (url, ms=8000) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, {headers:{'Content-Type':'application/json'}, signal:c.signal});
      const d = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error || 'Falha na operação');
      return d;
    } finally { clearTimeout(t); }
  };

  async function rdsHomeFixed(){
    const d = await rdsFetch('/api/dashboard');
    let contacts=[];
    try { contacts = await rdsFetch('/api/contacts'); } catch {}
    const activeClients = contacts.filter(c =>
      !c.opted_out &&
      String(c.status||'').toUpperCase() !== 'INATIVO' &&
      /INTERESSADOS/i.test(String(c.group_name||''))
    ).length;
    const actions = [
      d.proofReview ? ['Comprovantes aguardando conferência',d.proofReview,"go('orders')",'warn'] : null,
      d.ticketsPending ? ['Pedidos aguardando envio dos bilhetes',d.ticketsPending,"go('orders')",'warn'] : null,
      d.failed ? ['Falhas de envio para revisar',d.failed,"go('execution')",'bad'] : null,
      d.alerts ? ['Alertas não lidos',d.alerts,"go('execution')",'warn'] : null
    ].filter(Boolean);
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Operação comercial</span><h1>Central de Vendas</h1><p class=mut>O que precisa de atenção agora, sem ruído.</p></div>${btn('Nova campanha',"go('campaigns')",'btn primary')}</div>
    <div class=grid>${[
      ['Clientes ativos',activeClients],['Campanhas',d.campaigns],['Na fila',d.queue],['Enviadas',d.sent],
      ['Retornos',d.returns],['Pedidos',d.orders],['Compras',d.purchases],['Receita',money(d.revenue)]
    ].map(x=>`<div class="card metric-card"><span class=eyebrow>${x[0]}</span><div class=metric>${x[1]}</div></div>`).join('')}</div>
    <div class=action-center><div class=card><h2>Ações agora</h2><div class=priority-list>${actions.length?actions.map(a=>`<div class=priority><div><strong>${a[0]}</strong><small>${a[1]} pendência(s)</small></div>${btn('Abrir',a[2],`btn ${a[3]}`)}</div>`).join(''):'<div class=empty-state>Nenhuma pendência crítica. Operação em dia.</div>'}</div></div>
    <div class=card><h2>Próximo disparo</h2><div class=metric>${d.nextSend?new Date(d.nextSend).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—'}</div><p class=mut>${d.nextSend?dt(d.nextSend):'Nenhum envio agendado.'}</p><p>${badge(d.connected?'WHATSAPP CONECTADO':'WHATSAPP OFFLINE')}</p></div></div>`;
  }

  const previousRender = render;
  render = async function(){
    if(page==='home'){
      app.innerHTML='<div class="card"><span class=mut>Carregando central...</span></div>';
      try { return await rdsHomeFixed(); }
      catch(e){ app.innerHTML=`<div class=card><h2>Não foi possível carregar a Central</h2><p>${esc(e.name==='AbortError'?'A operação demorou mais que o esperado. Tente novamente.':e.message)}</p></div>`; }
      return;
    }
    if(page==='orders'){
      app.innerHTML='<div class="card"><span class=mut>Carregando compras...</span></div>';
      try {
        if(typeof window.orders==='function') return await window.orders();
        return await previousRender();
      } catch(e){
        app.innerHTML=`<div class=card><h2>Não foi possível carregar Compras</h2><p>${esc(e.name==='AbortError'?'A operação demorou mais que o esperado. Tente novamente.':e.message)}</p></div>`;
      }
      return;
    }
    if(page==='payments'){
      app.innerHTML='<div class="card"><span class=mut>Carregando pagamentos...</span></div>';
      try {
        if(typeof window.paymentsPage==='function') return await window.paymentsPage();
        return await previousRender();
      } catch(e){
        app.innerHTML=`<div class=card><h2>Não foi possível carregar Pagamentos</h2><p>${esc(e.name==='AbortError'?'A operação demorou mais que o esperado. Tente novamente.':e.message)}</p></div>`;
      }
      return;
    }
    return previousRender();
  };
})();