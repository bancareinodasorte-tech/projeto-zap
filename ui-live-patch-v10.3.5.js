(()=>{
  const VALID_PAGES=new Set(['home','contacts','campaigns','execution','returns','orders','settings']);
  const saved=localStorage.getItem('rds:lastPage');

  function rememberFromButton(btn){
    const p=btn?.dataset?.page;
    if(p&&VALID_PAGES.has(p)) localStorage.setItem('rds:lastPage',p);
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#nav button[data-page],#mobileNav button[data-page]');
    if(btn) rememberFromButton(btn);
  },true);

  window.addEventListener('load',()=>{
    if(saved&&VALID_PAGES.has(saved)&&saved!=='home'){
      setTimeout(()=>{
        const btn=document.querySelector(`#nav button[data-page="${saved}"]`)||document.querySelector(`#mobileNav button[data-page="${saved}"]`);
        if(btn) btn.click();
      },250);
    }
  });

  let busy=false;
  async function liveRefresh(){
    if(busy||document.hidden) return;
    const active=document.querySelector('#nav button.active[data-page],#mobileNav button.active[data-page]');
    const current=active?.dataset?.page;
    if(!current||!VALID_PAGES.has(current)) return;
    if(!['home','campaigns','execution','returns','orders'].includes(current)) return;
    if(document.querySelector('.modal')) return;
    busy=true;
    try{
      if(typeof window.render==='function') await window.render();
      else if(current==='orders'&&typeof window.orders==='function') await window.orders();
      else if(current==='returns'&&typeof window.returnsPage==='function') await window.returnsPage();
      else if(current==='campaigns'&&typeof window.campaigns==='function') await window.campaigns();
      else if(current==='execution'&&typeof window.automation==='function') await window.automation();
      else if(current==='home'&&typeof window.home==='function') await window.home();
    }catch(e){
      console.warn('RDS live refresh:',e);
    }finally{
      busy=false;
    }
  }

  setInterval(liveRefresh,3000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) setTimeout(liveRefresh,300)});
})();
