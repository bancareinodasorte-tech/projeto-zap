(()=>{
  function inject(){
    document.querySelectorAll('#app button').forEach(b=>{
      const t=(b.textContent||'').trim();
      if(t!=='Bilhetes enviados'||b.dataset.rdsEmitAdded)return;
      const m=(b.getAttribute('onclick')||'').match(/ticketsSent\('([^']+)'\)/);
      if(!m)return;
      const x=document.createElement('button');
      x.className='btn primary';
      x.textContent='🎟 Emitir bilhetes';
      x.setAttribute('onclick',`rdsEmitTickets('${m[1]}')`);
      b.parentNode.insertBefore(x,b);
      b.dataset.rdsEmitAdded='1';
    });
  }
  window.rdsInjectEmitOrders=inject;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});
  else inject();
})();
