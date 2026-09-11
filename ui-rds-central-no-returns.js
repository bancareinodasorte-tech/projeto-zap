(()=>{
  if(window.__RDS_CENTRAL_NO_ACTIVE_CLIENTS__) return;
  window.__RDS_CENTRAL_NO_ACTIVE_CLIENTS__=true;

  function removeClientsActiveMetric(){
    document.querySelectorAll('#app .metric-card').forEach(card=>{
      const label=card.querySelector('.eyebrow')?.textContent?.trim()||'';
      if(/^Clientes ativos$/i.test(label)) card.remove();
    });
  }

  const observer=new MutationObserver(removeClientsActiveMetric);
  observer.observe(document.body,{childList:true,subtree:true});
  removeClientsActiveMetric();
})();
