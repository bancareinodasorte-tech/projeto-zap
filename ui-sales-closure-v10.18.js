(()=>{
  const oldOrders=window.orders;
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  function statusName(s){return ({COLETANDO_DADOS:'Coletando dados',AGUARDANDO_PAGAMENTO:'Aguardando PIX',AGUARDANDO_COMPROVANTE:'Aguardando comprovante',AGUARDANDO_CONFERENCIA:'Conferir pagamento',PAGO_AGUARDANDO_BILHETES:'Enviar bilhetes'})[s]||s}
  async function loadPipeline(){return api('/api/v1018/sales-pipeline')}
  window.rds1018Confirm=async id=>{try{await api(`/api/v1018/orders/${id}/confirm-payment`,{method:'POST'});toast('Pagamento confirmado.');await orders()}catch(e){toast(e.message)}};
  window.rds1018Complete=async id=>{try{await api(`/api/v1018/orders/${id}/complete`,{method:'POST'});toast('Compra concluída.');await orders()}catch(e){toast(e.message)}};
  window.orders=async function(){
    await oldOrders();
    try{
      const d=await loadPipeline();
      let box=document.querySelector('#rds1018Sales');
      if(!box){box=document.createElement('section');box.id='rds1018Sales';box.className='card';const title=document.querySelector('#app .page-title');if(title)title.insertAdjacentElement('afterend',box);else app.prepend(box)}
      const s=d.summary||{};
      const active=d.orders||[];
      box.innerHTML=`<span class="eyebrow">FECHAMENTO DE VENDAS</span><h2>Pedidos para concluir</h2><p class="mut">Somente o fluxo essencial: receber pedido, conferir pagamento e entregar bilhetes.</p><div class="grid"><div class="card"><span class="eyebrow">ATIVOS</span><div class="metric">${s.active||0}</div></div><div class="card"><span class="eyebrow">AGUARDANDO PIX</span><div class="metric">${s.waiting_payment||0}</div></div><div class="card"><span class="eyebrow">CONFERIR PAGAMENTO</span><div class="metric">${s.checking||0}</div></div><div class="card"><span class="eyebrow">ENVIAR BILHETES</span><div class="metric">${s.waiting_tickets||0}</div></div><div class="card"><span class="eyebrow">COMPRAS</span><div class="metric">${s.concluded||0}</div></div><div class="card"><span class="eyebrow">RECEITA</span><div class="metric">${money(s.revenue)}</div></div></div><div style="margin-top:14px">${active.length?active.map(o=>`<div class="priority"><div><strong>${esc(o.customer_name||o.phone||'Cliente')}</strong><small>${esc(o.code||'')} • ${esc(statusName(o.status))} • ${money(o.total_amount)}</small></div><div class="row">${o.status==='AGUARDANDO_CONFERENCIA'?`<button class="btn primary" onclick="rds1018Confirm('${o.id}')">Confirmar pagamento</button>`:''}${o.status==='PAGO_AGUARDANDO_BILHETES'?`<button class="btn primary" onclick="rds1018Complete('${o.id}')">Bilhetes enviados</button>`:''}</div></div>`).join(''):'<div class="empty-state">Nenhum pedido pendente.</div>'}</div>`;
    }catch(e){console.error('V10.18 UI',e)}
  };
})();
