(()=>{
  const app=document.querySelector('#app');
  if(!app)return;
  const style=document.createElement('style');
  style.textContent=`
    .rds-mobile-table-viewport{width:100%!important;max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain;display:block!important}
    .rds-mobile-table-viewport>.card.table{width:max-content!important;min-width:100%!important;max-width:none!important;overflow:visible!important;margin:0!important}
    .rds-mobile-table-viewport>.card.table>table{width:1000px!important;min-width:1000px!important;max-width:none!important;table-layout:auto!important}
  `;
  document.head.appendChild(style);
  const enhanceTables=()=>{
    app.querySelectorAll('.card.table').forEach(card=>{
      if(card.parentElement?.classList.contains('rds-mobile-table-viewport'))return;
      const wrap=document.createElement('div');
      wrap.className='rds-mobile-table-viewport';
      card.parentNode.insertBefore(wrap,card);
      wrap.appendChild(card);
    });
  };
  // Apenas o primeiro carregamento pode aplicar o estado inicial fechado.
  // Não fechar novamente durante mutações evita o efeito de abrir e retrair imediatamente.
  const closeOrderSectionsInitially=()=>{
    app.querySelectorAll('details.rds-collapse').forEach(d=>d.removeAttribute('open'));
  };
  enhanceTables();
  closeOrderSectionsInitially();
  new MutationObserver(enhanceTables).observe(app,{childList:true,subtree:true});
})();
