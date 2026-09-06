(()=>{
  const Q=s=>document.querySelector(s);
  const E=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const groups=[
    ['COLETANDO_DADOS','Em atendimento'],
    ['AGUARDANDO_PAGAMENTO','Aguardando PIX'],
    ['AGUARDANDO_CONFERENCIA','Comprovantes recebidos'],
    ['PAGO_AGUARDANDO_BILHETES','Pagamento confirmado'],
    ['CONCLUIDO','Concluídas'],
    ['CANCELADO','Canceladas']
  ];
  const moneyR=v=>typeof money==='function'?money(v):`R$ ${Number(v||0).toFixed(2).replace('.',',')}`;
  const dtR=v=>typeof dt==='function'?dt(v):new Date(v).toLocaleString('pt-BR');
  const badgeR=v=>typeof badge==='function'?badge(v):`<span>${E(v)}</span>`;
  const buttonR=(t,fn,cls='btn')=>typeof btn==='function'?btn(t,fn,cls):`<button class="${cls}" onclick="${fn}">${E(t)}</button>`;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  window.orders=async function(){
    try{
      state.orders=await api('/api/orders');
      const counts=groups.map(([k,n])=>({k,n,rows:state.orders.filter(o=>o.status===k)}));
      const active=counts.filter(g=>!['CONCLUIDO','CANCELADO'].includes(g.k)).reduce((a,g)=>a+g.rows.length,0);
      app.innerHTML=`
        <div class="page-title">
          <div><span class="eyebrow">Operação de vendas</span><h1>Compras</h1><p class="mut">Acompanhe cada pedido por etapa, com ações específicas e sem misturar estados.</p></div>
          <div class="row">${buttonR('Limpar +30 dias','rdsCleanupOrders()','btn danger')}</div>
        </div>
        <div class="rds-ops-summary"><div><span>EM ANDAMENTO</span><b>${active}</b></div>${counts.map(g=>`<div><span>${E(g.n).toUpperCase()}</span><b>${g.rows.length}</b></div>`).join('')}</div>
        <div class="toolbar rds-orders-toolbar"><input id="rdsOrderSearch" type="search" autocomplete="off" placeholder="Buscar pedido, cliente ou WhatsApp"><select id="rdsOrderStatus"><option value="">Todas as etapas</option>${groups.map(([k,n])=>`<option value="${E(k)}">${E(n)}</option>`).join('')}</select></div>
        <div id="rdsOrdersStages">${counts.map(g=>`<details class="rds-collapse" data-order-status="${E(g.k)}"><summary><span><b>${E(g.n)}</b><small>${g.rows.length} registro(s)</small></span><strong>${g.rows.length}</strong></summary><div class="rds-collapse-body">${g.rows.map(o=>`<div class="card rds-order-clean" data-order-search="${E([o.code,o.customer_name,o.phone,o.contact_phone].join(' '))}"><div class="rds-order-head"><div><h2>${E(o.code)}</h2><p>${E(o.customer_name||o.phone||'Cliente')} • ${o.quantity||0} bilhete(s) • <b>${moneyR(o.total_amount||0)}</b></p><span class="mini">Criado: ${dtR(o.created_at)}${o.updated_at?' • Atualizado: '+dtR(o.updated_at):''}</span></div>${badgeR(g.n)}</div><div class="rds-action-row">${buttonR('Ver detalhes',`rdsOrderDetails('${o.id}')`,'btn')}${g.k==='AGUARDANDO_PAGAMENTO'?buttonR('Pagamentos',"go('payments')",'btn primary'):''}${g.k==='AGUARDANDO_CONFERENCIA'?buttonR('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${g.k==='PAGO_AGUARDANDO_BILHETES'?buttonR('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(g.k)?buttonR('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`).join('')||'<div class="empty-state">Nenhum registro nesta etapa.</div>'}</div></details>`).join('')}</div>`;
      const search=Q('#rdsOrderSearch');
      const status=Q('#rdsOrderStatus');
      if(search)search.addEventListener('input',window.rdsFilterOrders);
      if(status)status.addEventListener('change',window.rdsFilterOrders);
      rdsFilterOrders();
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Compras</h2><p>${E(e.message)}</p></div>`}
  };

  window.rdsFilterOrders=function(){
    const term=norm(Q('#rdsOrderSearch')?.value||'');
    const status=Q('#rdsOrderStatus')?.value||'';
    document.querySelectorAll('#rdsOrdersStages .rds-collapse').forEach(d=>{
      const matchStatus=!status||d.dataset.orderStatus===status;
      d.style.display=matchStatus?'':'none';
      let visible=0;
      d.querySelectorAll('.rds-order-clean').forEach(card=>{
        const searchable=norm(card.dataset.orderSearch||'');
        const ok=!term||searchable.includes(term);
        card.style.display=ok?'':'none';
        if(ok)visible++;
      });
      const empty=d.querySelector('.empty-state');
      if(empty)empty.style.display=(!term||visible===0)?'':'none';
      if(term&&matchStatus)d.open=visible>0;
    });
  };

  const style=document.createElement('style');
  style.textContent=`
    .rds-orders-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px;align-items:center}
    .rds-orders-toolbar input,.rds-orders-toolbar select{min-height:42px}
    @media(max-width:760px){.rds-orders-toolbar{grid-template-columns:1fr}.rds-orders-toolbar input,.rds-orders-toolbar select{width:100%}}
    #rdsOrdersStages .rds-collapse{margin-top:10px}
  `;
  document.head.appendChild(style);
  setTimeout(()=>document.querySelectorAll('#rdsOrdersStages .rds-collapse').forEach(d=>d.removeAttribute('open')),0);
})();