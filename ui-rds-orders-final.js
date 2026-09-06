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

  const orderCard=(o,g)=>`<div class="card rds-order-clean" data-order-search="${E([o.code,o.customer_name,o.phone,o.contact_phone].join(' '))}"><div class="rds-order-head"><div><h2>${E(o.code)}</h2><p>${E(o.customer_name||o.phone||'Cliente')} • ${o.quantity||0} bilhete(s) • <b>${moneyR(o.total_amount||0)}</b></p><span class="mini">Criado: ${dtR(o.created_at)}${o.updated_at?' • Atualizado: '+dtR(o.updated_at):''}</span></div>${badgeR(g.n)}</div><div class="rds-action-row">${buttonR('Ver detalhes',`rdsOrderDetails('${o.id}')`,'btn')}${g.k==='AGUARDANDO_PAGAMENTO'?buttonR('Pagamentos',"go('payments')",'btn primary'):''}${g.k==='AGUARDANDO_CONFERENCIA'?buttonR('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${g.k==='PAGO_AGUARDANDO_BILHETES'?buttonR('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(g.k)?buttonR('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`;

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
        <div class="toolbar rds-orders-toolbar">
          <label class="rds-search-box"><span class="rds-search-icon" aria-hidden="true">⌕</span><input id="rdsOrderSearch" type="search" autocomplete="off" placeholder="Buscar pedido, cliente ou WhatsApp"><button type="button" id="rdsOrderSearchClear" class="rds-search-clear" aria-label="Limpar busca" title="Limpar busca">×</button></label>
          <select id="rdsOrderStatus"><option value="">Todas as etapas</option>${groups.map(([k,n])=>`<option value="${E(k)}">${E(n)}</option>`).join('')}</select>
        </div>
        <div id="rdsOrderSearchResults" class="rds-order-search-results" aria-live="polite"></div>
        <div id="rdsOrdersStages">${counts.map(g=>`<details class="rds-collapse" data-order-status="${E(g.k)}"><summary><span><b>${E(g.n)}</b><small>${g.rows.length} registro(s)</small></span><strong>${g.rows.length}</strong></summary><div class="rds-collapse-body">${g.rows.map(o=>orderCard(o,g)).join('')||'<div class="empty-state">Nenhum registro nesta etapa.</div>'}</div></details>`).join('')}</div>`;
      const search=Q('#rdsOrderSearch');
      const status=Q('#rdsOrderStatus');
      const clear=Q('#rdsOrderSearchClear');
      if(search)search.addEventListener('input',window.rdsFilterOrders);
      if(status)status.addEventListener('change',window.rdsFilterOrders);
      if(clear)clear.addEventListener('click',()=>{if(search){search.value='';search.focus();window.rdsFilterOrders()}});
      rdsFilterOrders();
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Compras</h2><p>${E(e.message)}</p></div>`}
  };

  window.rdsFilterOrders=function(){
    const term=norm(Q('#rdsOrderSearch')?.value||'');
    const status=Q('#rdsOrderStatus')?.value||'';
    const resultBox=Q('#rdsOrderSearchResults');
    const all=[];
    document.querySelectorAll('#rdsOrdersStages .rds-collapse').forEach(d=>{
      const matchStatus=!status||d.dataset.orderStatus===status;
      d.style.display=term?'none':(matchStatus?'':'none');
      let visible=0;
      d.querySelectorAll('.rds-order-clean').forEach(card=>{
        const searchable=norm(card.dataset.orderSearch||'');
        const ok=!term||searchable.includes(term);
        card.style.display=ok?'':'none';
        if(ok)visible++;
      });
      const empty=d.querySelector('.empty-state');
      if(empty)empty.style.display=(!term||visible===0)?'':'none';
      if(term&&matchStatus)d.open=false;
      if(term&&matchStatus&&visible)all.push(...Array.from(d.querySelectorAll('.rds-order-clean')).filter(card=>card.style.display!=='none').map(card=>({card,status:d.dataset.orderStatus})));
    });

    if(resultBox){
      if(!term){
        resultBox.innerHTML='';
        resultBox.style.display='none';
      }else{
        const matches=[];
        all.forEach(x=>{
          const source=state.orders.find(o=>String(o.id)===String(x.card.querySelector('.rds-action-row button')?.getAttribute('onclick')||'').match(/['\"]([^'\"]+)['\"]/)?.[1]);
          if(source)matches.push({card:x.card,status:x.status,order:source});
        });
        if(!matches.length){
          resultBox.innerHTML=`<div class="card rds-search-empty"><b>Nenhum pedido encontrado.</b><span>Confira o nome, número do pedido ou WhatsApp.</span></div>`;
        }else{
          resultBox.innerHTML=`<div class="rds-search-heading"><b>${matches.length} pedido(s) encontrado(s)</b><span>Resultado da busca</span></div>${matches.map(m=>m.card.outerHTML).join('')}`;
          resultBox.querySelectorAll('.rds-order-clean').forEach(card=>card.style.display='');
        }
        resultBox.style.display='block';
      }
    }
  };

  const style=document.createElement('style');
  style.textContent=`
    .rds-orders-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px;align-items:center}
    .rds-orders-toolbar input,.rds-orders-toolbar select{min-height:42px}
    .rds-search-box{position:relative;display:flex;align-items:center;width:100%}
    .rds-search-box input{width:100%;padding-left:44px!important;padding-right:42px!important}
    .rds-search-icon{position:absolute;left:15px;z-index:2;font-size:26px;line-height:1;color:#60708a;pointer-events:none;transform:rotate(-20deg)}
    .rds-search-clear{position:absolute;right:9px;z-index:2;width:30px;height:30px;border:0;background:transparent;font-size:24px;line-height:28px;color:#71819a;cursor:pointer;padding:0}
    .rds-order-search-results{display:none;margin-top:10px}
    .rds-search-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:10px 2px;color:#213454}
    .rds-search-heading span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#71819a}
    .rds-search-empty{display:flex;flex-direction:column;gap:5px;margin-top:10px}
    .rds-search-empty span{color:#71819a}
    @media(max-width:760px){.rds-orders-toolbar{grid-template-columns:1fr}.rds-orders-toolbar input,.rds-orders-toolbar select{width:100%}.rds-search-heading{margin-top:12px}.rds-order-search-results .rds-order-clean{margin-bottom:10px}}
    #rdsOrdersStages .rds-collapse{margin-top:10px}
  `;
  document.head.appendChild(style);
  setTimeout(()=>document.querySelectorAll('#rdsOrdersStages .rds-collapse').forEach(d=>d.removeAttribute('open')),0);
})();