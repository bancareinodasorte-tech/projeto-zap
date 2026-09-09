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

  async function rdsOrdersFixed(){
    const rows = await rdsFetch('/api/orders');
    state.orders = Array.isArray(rows) ? rows : [];
    const groups={COLETANDO_DADOS:'Coletando dados',AGUARDANDO_PAGAMENTO:'Aguardando PIX',AGUARDANDO_CONFERENCIA:'Conferir pagamento',PAGO_AGUARDANDO_BILHETES:'Enviar bilhetes',CONCLUIDO:'Concluídos',CANCELADO:'Cancelados'};
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Funil comercial</span><h1>Compras</h1><p class=mut>Do pedido ao pós-venda, com estados claros.</p></div></div>
    <div class=funnel>${Object.entries(groups).map(([k,n])=>`<div><span class=eyebrow>${n}</span><div class=metric>${state.orders.filter(o=>o.status===k).length}</div></div>`).join('')}</div>
    ${state.orders.map(o=>`<div class=card><div class=row style="justify-content:space-between"><div><h2 style="margin:0">${esc(o.code)}</h2><p class=mut>${esc(o.customer_name||o.phone)} • ${o.quantity||'—'} bilhete(s) • ${money(o.total_amount)}</p></div>${badge(o.status)}</div><div class=row>${o.status==='AGUARDANDO_CONFERENCIA'?btn('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${o.status==='PAGO_AGUARDANDO_BILHETES'?btn('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO'].includes(o.status)?btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`).join('')||'<div class="card empty-state">Nenhum pedido.</div>'}`;
  }

  async function rdsPaymentsFixed(){
    const rows = await rdsFetch('/api/payments');
    const orders = Array.isArray(rows) ? rows : [];
    const count = s => orders.filter(o=>o.status===s).length;
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Financeiro</span><h1>Pagamentos</h1><p class=mut>Acompanhamento dos pagamentos PIX e suas confirmações.</p></div></div>
    <div class=grid><div class="card metric-card"><span class=eyebrow>Aguardando PIX</span><div class=metric>${count('AGUARDANDO_PAGAMENTO')}</div></div><div class="card metric-card"><span class=eyebrow>Em conferência</span><div class=metric>${count('AGUARDANDO_CONFERENCIA')}</div></div><div class="card metric-card"><span class=eyebrow>Pagamento confirmado</span><div class=metric>${count('PAGO_AGUARDANDO_BILHETES')}</div></div><div class="card metric-card"><span class=eyebrow>Concluídos</span><div class=metric>${count('CONCLUIDO')}</div></div></div>
    ${orders.map(o=>`<div class=card><div class=row style="justify-content:space-between"><div><h2 style="margin:0">${esc(o.code)}</h2><p class=mut>${esc(o.customer_name||o.phone)} • ${money(o.total_amount)}</p></div>${badge(o.status)}</div><p class=mini>Pagamento: ${esc(o.payment_method||'PIX')} • Atualizado: ${dt(o.updated_at)}</p></div>`).join('')||'<div class="card empty-state">Nenhum pagamento para acompanhar.</div>'}`;
  }

  render = async function(){
    app.innerHTML='<div class="card"><span class=mut>Carregando operação...</span></div>';
    try{
      if(page==='home') await rdsHomeFixed();
      else if(page==='contacts') await contacts();
      else if(page==='campaigns') await campaigns();
      else if(page==='execution') await automation();
      else if(page==='returns') await returnsPage();
      else if(page==='orders') await rdsOrdersFixed();
      else if(page==='payments') await rdsPaymentsFixed();
      else if(page==='settings') await settings();
    }catch(e){
      app.innerHTML=`<div class=card><h2>Não foi possível carregar</h2><p>${esc(e.name==='AbortError'?'A operação demorou mais que o esperado. Tente novamente.':e.message)}</p></div>`;
    }
  };
})();
