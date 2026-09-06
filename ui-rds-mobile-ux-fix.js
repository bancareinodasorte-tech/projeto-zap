(()=>{
  const app=document.querySelector('#app');
  if(!app)return;
  const closeOrderSections=()=>{
    app.querySelectorAll('details.rds-collapse').forEach(d=>d.removeAttribute('open'));
  };
  new MutationObserver(()=>closeOrderSections()).observe(app,{childList:true,subtree:true});
  setTimeout(closeOrderSections,0);
})();
