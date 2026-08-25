(()=>{
  const oldOrders=window.orders;

  window.confirmPay=async function(id){
    if(!confirm('Confirmar que o pagamento deste pedido foi conferido e aprovado?'))return;
    try{
      const r=await post('/api/v1012/orders/'+id+'/confirm-payment');
      toast(r.already?'Pagamento já estava confirmado.':'Pagamento confirmado. Pedido liberado para envio dos bilhetes.');
      if(typeof window.orders==='function')await window.orders();
    }catch(e){toast(e.message)}
  };

  window.ticketsSent=async function(id){
    if(!confirm('Confirmar que os bilhetes foram enviados ao cliente e concluir esta compra?'))return;
    try{
      const r=await post('/api/v1012/orders/'+id+'/complete');
      toast(r.already?'Compra já estava concluída.':'Compra concluída e registrada.');
      if(typeof window.orders==='function')await window.orders();
    }catch(e){toast(e.message)}
  };

  window.rds1012History=async function(id){
    try{
      const d=await api('/api/v1012/orders/'+id+'/history');
      const o=d.order||{},events=Array.isArray(d.events)?d.events:[];
      const labels={
        PAGAMENTO_CONFIRMADO_OPERADOR:'Pagamento confirmado',
        COMPRA_CONCLUIDA_OPERADOR:'Compra concluída',
        COMPROVANTE_RECEBIDO:'Comprovante recebido',
        PEDIDO_DADOS_COMPLETOS:'Dados do pedido recebidos',
        INTERESSE:'Pedido iniciado'
      };
      modal(`<span class=eyebrow>Histórico do pedido</span><h2>${esc(o.code||'Pedido')}</h2><p class=mut>${esc(o.customer_name||o.phone||'')} • ${money(o.total_amount)} • ${badge(o.status)}</p>${events.length?events.map(e=>`<div class=priority><div><strong>${esc(labels[e.kind]||e.kind)}</strong><small>${dt(e.created_at)}</small></div></div>`).join(''):'<p class=mut>Nenhum evento adicional registrado.</p>'}`);
    }catch(e){toast(e.message)}
  };

  window.orders=async function(){
    await oldOrders();
    try{
      const d=await api('/api/v1012/postpay/summary');
      if(d?.ok&&!document.querySelector('#rds1012Postpay')){
        const box=document.createElement('div');box.id='rds1012Postpay';box.className='card';
        box.innerHTML=`<span class=eyebrow>Fechamento pós-pagamento</span><h2>Conferência e entrega</h2><p class=mut>Confirme o pagamento antes de liberar o envio dos bilhetes. A conclusão só ocorre depois do envio.</p><div class=funnel>${[['Conferir pagamento',d.review],['Enviar bilhetes',d.tickets],['Conferência atrasada',d.reviewDelayed],['Bilhetes atrasados',d.ticketsDelayed]].map(x=>`<div><span class=eyebrow>${x[0]}</span><div class=metric>${Number(x[1]||0)}</div></div>`).join('')}</div>`;
        const title=document.querySelector('#app .page-title');if(title)title.insertAdjacentElement('afterend',box);else app.prepend(box);
      }
      for(const o of state.orders||[]){
        const card=[...document.querySelectorAll('#app .card')].find(x=>x.innerText.includes(o.code));
        if(!card||card.querySelector('.rds1012-history'))continue;
        const row=card.querySelector('.row:last-child')||card;
        const b=document.createElement('button');b.className='btn rds1012-history';b.textContent='Histórico';b.onclick=()=>rds1012History(o.id);row.appendChild(b);
      }
    }catch(e){console.error('V10.12 postpay UI',e);}
  };
})();
