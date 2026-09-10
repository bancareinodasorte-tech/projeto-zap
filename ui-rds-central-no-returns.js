(()=>{
  if(window.__RDS_CENTRAL_NO_RETURNS__) return;
  window.__RDS_CENTRAL_NO_RETURNS__=true;

  function removeReturnsMetric(){
    document.querySelectorAll('#app .metric-card').forEach(card=>{
      const label=card.querySelector('.eyebrow')?.textContent?.trim()||'';
      if(/^Retornos$/i.test(label)) card.remove();
    });
  }

  const observer=new MutationObserver(removeReturnsMetric);
  observer.observe(document.body,{childList:true,subtree:true});
  removeReturnsMetric();
})();
