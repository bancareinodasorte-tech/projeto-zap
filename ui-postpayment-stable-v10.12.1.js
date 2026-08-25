(()=>{
  const realOrders=window.orders;
  let lastRender=0;
  let force=false;

  function comprasVisivel(){
    const title=document.querySelector('#app .page-title h1');
    return title && title.textContent.trim()==='Compras';
  }

  window.orders=async function(){
    const now=Date.now();
    if(!force && comprasVisivel() && (now-lastRender)<60000){
      return;
    }
    force=false;
    lastRender=now;
    return await realOrders();
  };

  window.rds10121ForceOrdersRefresh=async function(){
    force=true;
    return await window.orders();
  };

  window.confirmPay=async function(id){
    if(!confirm('Confirmar que o pagamento deste pedido foi conferido e aprovado?'))return;
    try{
      const r=await post('/api/v1012/orders/'+id+'/confirm-payment');
      toast(r.already?'Pagamento já estava confirmado.':'Pagamento confirmado. Pedido liberado para envio dos bilhetes.');
      await rds10121ForceOrdersRefresh();
    }catch(e){toast(e.message)}
  };

  window.ticketsSent=async function(id){
    if(!confirm('Confirmar que os bilhetes foram enviados ao cliente e concluir esta compra?'))return;
    try{
      const r=await post('/api/v1012/orders/'+id+'/complete');
      toast(r.already?'Compra já estava concluída.':'Compra concluída e registrada.');
      await rds10121ForceOrdersRefresh();
    }catch(e){toast(e.message)}
  };
})();
