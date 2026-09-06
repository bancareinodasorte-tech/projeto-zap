(()=>{
  const app=document.querySelector('#app');
  if(!app)return;
  const style=document.createElement('style');
  style.textContent='.card.table{overflow-x:auto!important;overflow-y:hidden;-webkit-overflow-scrolling:touch;touch-action:pan-x}.card.table>table{min-width:760px}.card.table::-webkit-scrollbar{height:8px}';
  document.head.appendChild(style);
  const closeOrderSections=()=>{
    app.querySelectorAll('details.rds-collapse').forEach(d=>d.removeAttribute('open'));
  };
  new MutationObserver(()=>closeOrderSections()).observe(app,{childList:true,subtree:true});
  setTimeout(closeOrderSections,0);
})();
