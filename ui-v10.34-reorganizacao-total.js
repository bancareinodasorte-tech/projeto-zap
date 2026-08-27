(()=>{
  const oldHome=window.home;
  const oldReturns=window.returnsPage;
  const oldSettings=window.settings;
  const oldCampaigns=window.campaigns;
  const oldContacts=window.contacts;

  const css=document.createElement('style');
  css.textContent=`
    .rds-clean-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
    .rds-clean-head h1{margin:4px 0 6px}.rds-clean-sub{color:#6c7d94;margin:0;line-height:1.45}
    .rds-section{margin-top:18px}.rds-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .rds-section-title h2{margin:0}.rds-compact-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 0}
    .rds-action-card{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .rds-action-card strong{display:block;font-size:17px}.rds-action-card small{display:block;color:#6c7d94;margin-top:4px}
    .rds-order-list{display:grid;gap:10px}.rds-order{border:1px solid #dbe5f0;border-radius:16px;padding:14px;background:#fff}
    .rds-order-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.rds-order h3{margin:0 0 5px}.rds-order p{margin:3px 0;color:#6c7d94}
    .rds-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.rds-empty{padding:28px;text-align:center;color:#73839a}
    .rds-mini-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rds-mini-grid .card{margin:0}
    @media(max-width:700px){.rds-mini-grid{grid-template-columns:1fr 1fr}.rds-order-top{flex-direction:column}}
  `;
  document.head.appendChild(css);

  const waLink=phone=>`https://wa.me/${String(phone||'').replace(/\D/g,'')}`;
  const statusText=s=>String(s||'').replaceAll('_',' ');

  window.home=async function(){
    const d=await api('/api/dashboard');
    const paymentPend=(d.orders||0)-(d.purchases||0);
    app.innerHTML=`
      <div class="rds-clean-head"><div><span class=eyebrow>Operação comercial</span><h1>Central de Vendas</h1><p class=rds-clean-sub>Resumo do que exige ação agora.</p></div>${btn('Nova campanha',"go('campaigns')",'btn primary')}</div>
      <div class="grid">
        ${[['Clientes',d.contacts],['Campanhas',d.campaigns],['Enviadas',d.sent],['Retornos',d.returns],['Compras',d.purchases],['Receita',money(d.revenue)]].map(x=>`<div class="card metric-card"><span class=eyebrow>${x[0]}</span><div class=metric>${x[1]}</div></div>`).join('')}
      </div>
      <div class="rds-section"><div class="rds-section-title"><h2>Ações</h2></div><div class="card">
        <div class=rds-order-list>
          ${d.proofReview?`<div class=rds-action-card><div><strong>Conferir comprovantes</strong><small>${d.proofReview} aguardando decisão</small></div>${btn('Abrir pagamentos',"go('payments')",'btn primary')}</div>`:''}
          ${d.ticketsPending?`<div class=rds-action-card><div><strong>Enviar bilhetes</strong><small>${d.ticketsPending} aguardando entrega</small></div>${btn('Abrir compras',"go('orders')",'btn primary')}</div>`:''}
          ${d.failed?`<div class=rds-action-card><div><strong>Falhas de envio</strong><small>${d.failed} para revisar</small></div>${btn('Abrir automação',"go('execution')")}</div>`:''}
          ${!d.proofReview&&!d.ticketsPending&&!d.failed?'<div class=rds-empty>Nenhuma pendência operacional.</div>':''}
        </div>
      </div></div>
      <div class="card rds-section"><div class=rds-action-card><div><strong>Próximo disparo</strong><small>${d.nextSend?dt(d.nextSend):'Nenhum envio agendado'}</small></div>${badge(d.connected?'WHATSAPP CONECTADO':'WHATSAPP OFFLINE')}</div></div>`;
  };

  window.automation=async function(){
    const [dash,exec]=await Promise.all([api('/api/dashboard'),api('/api/execution').catch(()=>[])]);
    const active=(exec||[]).filter(c=>['ATIVA','AGENDADA'].includes(String(c.status||'').toUpperCase()));
    app.innerHTML=`
      <div class="rds-clean-head"><div><span class=eyebrow>Execução</span><h1>Automação</h1><p class=rds-clean-sub>Disparos, fila e falhas. Pagamentos e pedidos ficam nas páginas próprias.</p></div>${btn('Processar fila','rdsProcessQueue()','btn primary')}</div>
      <div class=rds-mini-grid>
        <div class="card metric-card"><span class=eyebrow>Na fila</span><div class=metric>${dash.queue||0}</div></div>
        <div class="card metric-card"><span class=eyebrow>Falhas</span><div class=metric>${dash.failed||0}</div></div>
        <div class="card metric-card"><span class=eyebrow>Próximo envio</span><div class=metric style="font-size:20px">${dash.nextSend?new Date(dash.nextSend).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—'}</div></div>
      </div>
      <div class="rds-section card"><div class=rds-section-title><h2>Campanhas em execução</h2>${btn('Gerenciar campanhas',"go('campaigns')")}</div>
        ${active.length?active.map(c=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(c.name)}</h3><p>${esc(c.code||'')} • ${statusText(c.status)}</p></div>${badge(c.status)}</div><div class=rds-compact-status><span class=mini>${(c.deliveries||[]).filter(x=>x.status==='PENDENTE').length} na fila</span><span class=mini>${(c.deliveries||[]).filter(x=>x.status==='ENVIADA').length} enviadas</span><span class=mini>${(c.deliveries||[]).filter(x=>x.status==='FALHA').length} falhas</span></div></div>`).join(''):'<div class=rds-empty>Nenhuma campanha em execução.</div>'}
      </div>`;
  };
  window.rdsProcessQueue=async function(){try{await post('/api/process-now');toast('Fila processada.');setTimeout(()=>go('execution'),250)}catch(e){toast(e.message)}};

  window.paymentsPage=async function(){
    const [ordersList,pb,rem]=await Promise.all([
      api('/api/orders'),
      api('/api/pagbank/status').catch(()=>({configured:false,environment:'sandbox'})),
      api('/api/v1032/reminders').catch(()=>({orders:[]}))
    ]);
    state.orders=ordersList;
    const waiting=ordersList.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
    const proof=ordersList.filter(o=>o.status==='AGUARDANDO_CONFERENCIA');
    const total=waiting.reduce((a,o)=>a+Number(o.total_amount||0),0);
    const remMap=new Map((rem.orders||[]).map(x=>[x.id,x]));
    const orderCard=(o,kind)=>{
      const r=remMap.get(o.id);
      if(kind==='pix') return `<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('AGUARDANDO PIX')}</div><div class=rds-buttons>${btn('Gerar PIX',`rdsCreatePix('${o.id}',false)`,'btn primary')}${btn('Gerar e enviar',`rdsCreatePix('${o.id}',true)`,'btn success')}<a target=_blank href="${waLink(o.phone)}">${btn('WhatsApp','')}</a>${r?btn(r.paused?'Retomar lembretes':'Pausar lembretes',`rdsToggleReminder('${o.id}',${!r.paused})`):''}</div>${r?`<small class=mut>${r.paused?'Lembretes pausados':`Lembretes enviados: ${r.sent||0}/${rem.max||0}`}</small>`:''}</div>`;
      return `<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('CONFERIR PAGAMENTO')}</div><div class=rds-buttons>${btn('Confirmar pagamento',`rdsApproveProof('${o.id}')`,'btn success')}${btn('Rejeitar comprovante',`rdsRejectProof('${o.id}')`,'btn danger')}<a target=_blank href="${waLink(o.phone)}">${btn('WhatsApp','')}</a></div></div>`;
    };
    app.innerHTML=`
      <div class="rds-clean-head"><div><span class=eyebrow>Financeiro</span><h1>Pagamentos</h1><p class=rds-clean-sub>Somente cobranças PIX e conferência de comprovantes.</p></div><div>${badge(pb.configured?`PAGBANK ${String(pb.environment||'').toUpperCase()}`:'PAGBANK NÃO CONFIGURADO')}</div></div>
      <div class=rds-mini-grid>
        <div class="card metric-card"><span class=eyebrow>Aguardando PIX</span><div class=metric>${waiting.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Valor pendente</span><div class=metric>${money(total)}</div></div>
        <div class="card metric-card"><span class=eyebrow>Conferir comprovante</span><div class=metric>${proof.length}</div></div>
      </div>
      <div class="rds-section card"><div class=rds-section-title><h2>Aguardando PIX</h2></div><div class=rds-order-list>${waiting.length?waiting.map(o=>orderCard(o,'pix')).join(''):'<div class=rds-empty>Nenhum pagamento PIX pendente.</div>'}</div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Comprovantes para conferir</h2></div><div class=rds-order-list>${proof.length?proof.map(o=>orderCard(o,'proof')).join(''):'<div class=rds-empty>Nenhum comprovante aguardando conferência.</div>'}</div></div>`;
  };
  window.rdsToggleReminder=async function(id,paused){try{await post(`/api/v1032/orders/${id}/reminders`,{paused});toast(paused?'Lembretes pausados.':'Lembretes retomados.');setTimeout(()=>go('payments'),200)}catch(e){toast(e.message)}};

  window.orders=async function(){
    state.orders=await api('/api/orders');
    const collecting=state.orders.filter(o=>o.status==='COLETANDO_DADOS');
    const paid=state.orders.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const done=state.orders.filter(o=>o.status==='CONCLUIDO');
    const payment=state.orders.filter(o=>['AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFERENCIA'].includes(o.status));
    app.innerHTML=`
      <div class="rds-clean-head"><div><span class=eyebrow>Vendas</span><h1>Compras</h1><p class=rds-clean-sub>Pedidos em atendimento, entrega dos bilhetes e histórico concluído.</p></div>${payment.length?btn(`Pagamentos pendentes (${payment.length})`,"go('payments')",'btn primary'):''}</div>
      <div class=rds-mini-grid>
        <div class="card metric-card"><span class=eyebrow>Em atendimento</span><div class=metric>${collecting.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Enviar bilhetes</span><div class=metric>${paid.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Concluídas</span><div class=metric>${done.length}</div></div>
      </div>
      <div class="rds-section card"><div class=rds-section-title><h2>Enviar bilhetes</h2></div><div class=rds-order-list>${paid.length?paid.map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</p></div>${badge('PAGO')}</div><div class=rds-buttons>${btn('Marcar bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary')}<a target=_blank href="${waLink(o.phone)}">${btn('WhatsApp','')}</a></div></div>`).join(''):'<div class=rds-empty>Nenhum pedido aguardando bilhetes.</div>'}</div></div>
      ${collecting.length?`<div class="rds-section card"><div class=rds-section-title><h2>Pedidos em atendimento</h2></div><div class=rds-order-list>${collecting.map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)}</p></div>${badge('COLETANDO DADOS')}</div><div class=rds-buttons><a target=_blank href="${waLink(o.phone)}">${btn('Continuar no WhatsApp','btn primary')}</a></div></div>`).join('')}</div></div>`:''}
      <div class="rds-section card"><div class=rds-section-title><h2>Histórico concluído</h2></div><div class=rds-order-list>${done.length?done.slice(0,40).map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</p></div>${badge('CONCLUIDO')}</div></div>`).join(''):'<div class=rds-empty>Nenhuma compra concluída.</div>'}</div></div>`;
  };

  window.returnsPage=oldReturns;
  window.settings=oldSettings;
  window.campaigns=oldCampaigns;
  window.contacts=oldContacts;

  const oldRender=render;
  render=async function(){
    app.innerHTML='<div class="card"><span class=mut>Carregando...</span></div>';
    try{
      if(page==='home')return home();
      if(page==='execution')return automation();
      if(page==='payments')return paymentsPage();
      if(page==='orders')return orders();
      if(page==='returns')return returnsPage();
      if(page==='settings')return settings();
      if(page==='campaigns')return campaigns();
      if(page==='contacts')return contacts();
      return oldRender();
    }catch(e){app.innerHTML=`<div class=card><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p></div>`}
  };
})();
