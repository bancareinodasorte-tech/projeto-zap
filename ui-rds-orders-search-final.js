(()=>{
  const Q=s=>document.querySelector(s);
  const E=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const groups=[
    ['COLETANDO_DADOS','Em atendimento'],['AGUARDANDO_PAGAMENTO','Aguardando PIX'],['AGUARDANDO_CONFERENCIA','Comprovantes recebidos'],['PAGO_AGUARDANDO_BILHETES','Pagamento confirmado'],['CONCLUIDO','Concluídas'],['CANCELADO','Canceladas']
  ];
  const groupFor=o=>groups.find(g=>g[0]===o.status)||[o.status,o.status];
  const card=o=>{const g=groupFor(o);return `<div class="card rds-order-clean"><div class="rds-order-head"><div><h2>${E(o.code)}</h2><p>${E(o.customer_name||o.phone||'Cliente')} • ${o.quantity||0} bilhete(s) • <b>${typeof money==='function'?money(o.total_amount||0):`R$ ${Number(o.total_amount||0).toFixed(2).replace('.',',')}`}</b></p><span class="mini">Criado: ${typeof dt==='function'?dt(o.created_at):new Date(o.created_at).toLocaleString('pt-BR')}${o.updated_at?' • Atualizado: '+(typeof dt==='function'?dt(o.updated_at):new Date(o.updated_at).toLocaleString('pt-BR')):''}</span></div>${typeof badge==='function'?badge(g[1]):`<span>${E(g[1])}</span>`}</div><div class="rds-action-row">${typeof btn==='function'?btn('Ver detalhes',`rdsOrderDetails('${o.id}')`,'btn'):`<button class="btn" onclick="rdsOrderDetails('${o.id}')">Ver detalhes</button>`}${g[0]==='AGUARDANDO_PAGAMENTO'?(typeof btn==='function'?btn('Pagamentos',"go('payments')",'btn primary'):''):''}${g[0]==='AGUARDANDO_CONFERENCIA'?(typeof btn==='function'?btn('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''):''}${g[0]==='PAGO_AGUARDANDO_BILHETES'?(typeof btn==='function'?btn('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''):''}${!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(g[0])?(typeof btn==='function'?btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''):''}</div></div>`};
  const apply=()=>{
    const search=Q('#rdsOrderSearch'),status=Q('#rdsOrderStatus'),box=Q('#rdsOrderSearchResults'),stages=Q('#rdsOrdersStages');
    if(!search||!box||!stages)return;
    const term=norm(search.value),filter=status?.value||'';
    if(!term){box.innerHTML='';box.style.display='none';stages.style.display='';return}
    const matches=(state.orders||[]).filter(o=>(!filter||o.status===filter)&&norm([o.code,o.customer_name,o.phone,o.contact_phone].join(' ')).includes(term));
    stages.style.display='none';
    box.style.display='block';
    box.innerHTML=matches.length?`<div class="rds-search-heading"><b>${matches.length} pedido(s) encontrado(s)</b><span>Resultado da busca</span></div>${matches.map(card).join('')}`:`<div class="card rds-search-empty"><b>Nenhum pedido encontrado.</b><span>Confira o nome, número do pedido ou WhatsApp.</span></div>`;
  };
  const wire=()=>{
    const search=Q('#rdsOrderSearch'),status=Q('#rdsOrderStatus'),clear=Q('#rdsOrderSearchClear');
    if(!search||search.dataset.rdsSearchFinal)return;
    search.dataset.rdsSearchFinal='1';search.addEventListener('input',apply);
    if(status)status.addEventListener('change',apply);
    if(clear)clear.addEventListener('click',()=>{search.value='';search.focus();apply()});
    const icon=Q('.rds-search-icon');if(icon){icon.style.left='auto';icon.style.right='48px';icon.style.transform='rotate(-20deg)'}
    apply();
  };
  const wrapOrders=()=>{if(typeof window.orders!=='function'||window.orders.__rdsSearchWrapped)return;const original=window.orders;const wrapped=async function(){const r=await original.apply(this,arguments);setTimeout(wire,0);return r};wrapped.__rdsSearchWrapped=true;window.orders=wrapped};
  wrapOrders();new MutationObserver(()=>{wrapOrders();wire()}).observe(document.body,{childList:true,subtree:true});
  const style=document.createElement('style');style.textContent=`
    .rds-search-box{position:relative!important;display:flex!important;align-items:center!important;width:100%!important}
    .rds-search-box input{width:100%!important;padding-left:16px!important;padding-right:78px!important}
    .rds-search-icon{left:auto!important;right:48px!important}
    .rds-search-clear{right:9px!important}
    .rds-order-search-results{display:none;margin-top:10px}
    .rds-order-search-results .rds-order-clean{margin-bottom:10px}
    .rds-search-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:10px 2px;color:#213454}
    .rds-search-heading span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#71819a}
    .rds-search-empty{display:flex;flex-direction:column;gap:5px;margin-top:10px}
    .rds-search-empty span{color:#71819a}
  `;document.head.appendChild(style);
})();