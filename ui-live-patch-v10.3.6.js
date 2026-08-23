(()=>{
  const VALID_PAGES=new Set(['home','contacts','campaigns','execution','returns','orders','settings']);
  const LIVE_PAGES=new Set(['home','campaigns','execution','returns','orders']);
  const KEY='rds:lastPage';
  let busy=false;
  let restoreDone=false;

  function currentPage(){
    const active=document.querySelector('#nav button.active[data-page]')||document.querySelector('#mobileNav button.active[data-page]');
    return active?.dataset?.page||null;
  }

  function remember(p){
    if(p&&VALID_PAGES.has(p)) localStorage.setItem(KEY,p);
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#nav button[data-page],#mobileNav button[data-page]');
    if(btn) remember(btn.dataset.page);
  },true);

  window.addEventListener('beforeunload',()=>remember(currentPage()));
  document.addEventListener('visibilitychange',()=>{if(document.hidden) remember(currentPage());});

  async function refreshCurrent(){
    if(busy||document.hidden||document.querySelector('.modal')) return;
    const p=currentPage();
    if(!p||!LIVE_PAGES.has(p)) return;
    busy=true;
    const y=window.scrollY;
    try{
      if(p==='orders'&&typeof window.orders==='function') await window.orders();
      else if(p==='returns'&&typeof window.returnsPage==='function') await window.returnsPage();
      else if(p==='campaigns'&&typeof window.campaigns==='function') await window.campaigns();
      else if(p==='execution'&&typeof window.automation==='function') await window.automation();
      else if(p==='home'&&typeof window.home==='function') await window.home();
      requestAnimationFrame(()=>window.scrollTo(0,y));
    }catch(e){
      console.warn('RDS live refresh:',e);
    }finally{
      busy=false;
    }
  }

  function restorePage(){
    if(restoreDone) return;
    const saved=localStorage.getItem(KEY);
    if(!saved||!VALID_PAGES.has(saved)||saved==='home'){restoreDone=true;return;}
    const loading=(document.querySelector('#app')?.textContent||'').includes('Carregando operação');
    if(loading){setTimeout(restorePage,250);return;}
    restoreDone=true;
    if(typeof window.go==='function') window.go(saved);
    else {
      const btn=document.querySelector(`#nav button[data-page="${saved}"]`)||document.querySelector(`#mobileNav button[data-page="${saved}"]`);
      btn?.click();
    }
  }

  setTimeout(restorePage,800);
  setInterval(refreshCurrent,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refreshCurrent,500)});
})();
