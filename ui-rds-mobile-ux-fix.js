(()=>{
  const app=document.querySelector('#app');
  if(!app)return;
  const style=document.createElement('style');
  style.textContent=`
    .card.table{overflow:visible!important;max-width:100%!important}
    .rds-mobile-table-scroll{width:100%;max-width:100%;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain}
    .rds-mobile-table-scroll>table{min-width:760px!important;width:760px!important;max-width:none!important;margin:0}
  `;
  document.head.appendChild(style);
  const enhanceTables=()=>{
    app.querySelectorAll('.card.table>table').forEach(table=>{
      if(table.parentElement?.classList.contains('rds-mobile-table-scroll'))return;
      const wrap=document.createElement('div');
      wrap.className='rds-mobile-table-scroll';
      table.parentNode.insertBefore(wrap,table);
      wrap.appendChild(table);
    });
  };
  const closeOrderSections=()=>{
    app.querySelectorAll('details.rds-collapse').forEach(d=>d.removeAttribute('open'));
  };
  const refresh=()=>{enhanceTables();closeOrderSections()};
  new MutationObserver(refresh).observe(app,{childList:true,subtree:true});
  setTimeout(refresh,0);
})();
