(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const moneyR=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateR=v=>typeof dt==='function'?dt(v):(v?new Date(v).toLocaleString('pt-BR'):'—');
  const statusName=s=>({COLETANDO_DADOS:'Coletando dados',AGUARDANDO_PAGAMENTO:'Aguardando PIX',AGUARDANDO_CONFERENCIA:'Pagamento recebido',PAGO_AGUARDANDO_BILHETES:'Pagamento confirmado',CONCLUIDO:'Concluído',CANCELADO:'Cancelado'}[String(s||'').toUpperCase()]||String(s||'—').replaceAll('_',' '));
  const cancelName=r=>({EXPIRADO_PAGAMENTO:'Expirado por falta de pagamento',CANCELAMENTO_MANUAL:'Cancelado manualmente',CANCELAMENTO_CLIENTE:'Cancelado pelo cliente'}[String(r||'').toUpperCase()]||(r?String(r).replaceAll('_',' '):'Natureza não registrada'));
  const findOrder=async id=>{
    const sid=String(id||'');
    const local=(Array.isArray(window.state?.orders)?window.state.orders:[]).find(x=>String(x.id)===sid);
    if(local)return local;
    const res=await fetch('/api/operator/orders/'+encodeURIComponent(sid),{headers:{'Accept':'application/json'}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data?.error||'Não foi possível consultar este pedido.');
    if(data?.order){return data.order;}
    throw new Error('Pedido não encontrado para este vendedor.');
  };
  window.rdsOrderDetails=async function(id){
    try{
      const o=await findOrder(id);
      const status=String(o.status||'').toUpperCase();
      const reason=cancelName(o.cancel_reason);
      const action=[];
      if(status==='AGUARDANDO_CONFERENCIA')action.push(typeof btn==='function'?btn('Confirmar pagamento',"confirmPay('"+esc(o.id)+"')",'btn success'):'');
      if(status==='PAGO_AGUARDANDO_BILHETES')action.push(typeof btn==='function'?btn('Bilhetes enviados',"ticketsSent('"+esc(o.id)+"')",'btn primary'):'');
      if(!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(status))action.push(typeof btn==='function'?btn('Cancelar pedido',"cancelOrder('"+esc(o.id)+"')",'btn danger'):'');
      const box='<span class="eyebrow">Detalhes da compra</span><h2>'+esc(o.code)+'</h2>'+
        '<div class="card" style="margin:10px 0">'+
        '<p><b>Cliente:</b> '+esc(o.customer_name||'Não informado')+'</p>'+
        '<p><b>WhatsApp:</b> '+esc(o.phone||o.contact_phone||'—')+'</p>'+
        '<p><b>Quantidade:</b> '+esc(o.quantity||0)+' bilhete(s)</p>'+
        '<p><b>Total:</b> '+moneyR(o.total_amount||0)+'</p>'+
        '<p><b>Status:</b> '+esc(statusName(status))+'</p>'+
        '<p><b>Criado:</b> '+dateR(o.created_at)+'</p>'+
        (o.order_expires_at?'<p><b>Prazo do pedido:</b> '+dateR(o.order_expires_at)+'</p>':'')+
        (o.updated_at?'<p><b>Atualizado:</b> '+dateR(o.updated_at)+'</p>':'')+
        (o.payment_method?'<p><b>Pagamento:</b> '+esc(String(o.payment_method).replaceAll('_',' '))+'</p>':'')+
        (o.payment_created_at?'<p><b>PIX criado:</b> '+dateR(o.payment_created_at)+'</p>':'')+
        (o.payment_confirmed_at?'<p><b>Pagamento confirmado:</b> '+dateR(o.payment_confirmed_at)+'</p>':'')+
        (status==='CANCELADO'?'<p><b>Encerrado em:</b> '+dateR(o.cancelled_at||o.updated_at)+'</p><p><b>Natureza do encerramento:</b> '+esc(reason)+'</p>':'')+
        (o.pagbank_status?'<p><b>Mercado Pago:</b> '+esc(o.pagbank_status)+'</p>':'')+
        '</div><div class="row">'+action.join('')+'</div>';
      if(typeof modal==='function')modal(box);
      else{
        const m=document.createElement('div');m.className='modal';m.innerHTML='<div>'+box+'</div>';document.body.appendChild(m);
      }
    }catch(e){if(typeof toast==='function')toast(e.message||'Não foi possível abrir os detalhes do pedido.');else alert(e.message||'Não foi possível abrir os detalhes do pedido.');}
  };
})();