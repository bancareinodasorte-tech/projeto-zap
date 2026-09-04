(()=>{
  const returnButtons=()=>document.querySelectorAll('#nav button[data-page="returns"],#mobileNav button[data-page="returns"]');
  function removeBadges(){
    returnButtons().forEach(btn=>{
      btn.querySelectorAll('.rds-nav-return-badge,.badge,.count,.notification-badge,[data-count]').forEach(x=>x.remove());
      [...btn.querySelectorAll('span,b,strong')].forEach(x=>{
        const t=(x.textContent||'').trim();
        if(/^\d+$/.test(t)) x.remove();
      });
    });
  }
  function clearEmptyReturnAlert(){
    document.querySelectorAll('#app *').forEach(x=>{
      if(x.children.length)return;
      const t=(x.textContent||'').trim();
      if(/\d+ retorno\(s\) pendente\(s\)\.?/i.test(t)){
        x.textContent=t.replace(/\d+ retorno\(s\) pendente\(s\)\.?/i,'0 retorno(s) pendente(s).');
      }
    });
    document.querySelectorAll('#app *').forEach(x=>{
      if(!/atenção operacional/i.test(x.textContent||''))return;
      if(/retorno\(s\) pendente\(s\)/i.test(x.textContent||''))x.style.display='none';
    });
    document.querySelectorAll('#app .rds-return-count b').forEach(x=>x.textContent='0');
    document.querySelectorAll('#app .rds-return-count').forEach(x=>{
      if(/RETORNOS PENDENTES/i.test(x.textContent||''))x.querySelector('b')?.replaceChildren(document.createTextNode('0'));
    });
  }
  async function fix(){
    try{
      const rows=await api('/api/returns');
      removeBadges();
      if((rows||[]).length)return;
      clearEmptyReturnAlert();
    }catch(e){}
  }
  const s=document.createElement('style');
  s.textContent='#nav button[data-page="returns"] .rds-nav-return-badge,#nav button[data-page="returns"] .badge,#nav button[data-page="returns"] .count,#nav button[data-page="returns"] .notification-badge,#mobileNav button[data-page="returns"] .rds-nav-return-badge,#mobileNav button[data-page="returns"] .badge,#mobileNav button[data-page="returns"] .count,#mobileNav button[data-page="returns"] .notification-badge{display:none!important}';
  document.head.appendChild(s);
  const mo=new MutationObserver(()=>removeBadges());
  mo.observe(document.body,{subtree:true,childList:true});
  setTimeout(fix,500);setInterval(fix,5000);
})();
