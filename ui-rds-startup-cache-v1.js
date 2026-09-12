(()=>{
  if(window.__RDS_STARTUP_CACHE_V1__) return;
  window.__RDS_STARTUP_CACHE_V1__=true;

  const KEY='rds:p12:central:v1';
  const VERSION='1';
  const app=()=>document.querySelector('#app');

  // Restaura somente a última Central premium conhecida, sem tocar em fetch/render.
  // A versão impede que uma alteração futura de layout reutilize HTML antigo.
  try{
    const raw=localStorage.getItem(KEY);
    if(raw){
      const data=JSON.parse(raw);
      if(data?.version===VERSION && data?.html && location.pathname!=='/login'){
        const root=app();
        if(root && !root.querySelector('.rds-p12')) root.innerHTML=data.html;
      }
    }
  }catch{}

  function save(){
    try{
      const root=app();
      const box=root?.querySelector('.rds-p12');
      if(!box) return;
      localStorage.setItem(KEY,JSON.stringify({version:VERSION,html:box.outerHTML,savedAt:Date.now()}));
    }catch{}
  }

  const root=app();
  if(root){
    const observer=new MutationObserver(()=>save());
    observer.observe(root,{childList:true,subtree:true});
    setTimeout(save,1200);
    setTimeout(save,3000);
  }
})();
