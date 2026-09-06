(()=>{
  const apply=()=>{
    const input=document.querySelector('#crShuffle');
    if(input){
      input.checked=true;
      input.disabled=true;
      const label=input.closest('label');
      if(label)label.innerHTML='<input id="crShuffle" type="checkbox" checked disabled> Distribuição inteligente — ativa por padrão';
    }
    const pool=document.querySelector('#crPool');
    if(pool){
      const label=pool.closest('label');
      if(label)label.style.display='none';
    }
  };
  const obs=new MutationObserver(apply);
  obs.observe(document.body,{childList:true,subtree:true});
  apply();
})();
