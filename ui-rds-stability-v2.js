(()=>{
  const appEl=document.querySelector('#app');
  let refreshBusy=false;

  async function stableRender(){
    const target=window.page||localStorage.getItem('rds_current_page')||'home';
    window.page=target;
    try{
      if(target==='home' && typeof window.home==='function') return await window.home();
      if(target==='contacts' && typeof window.rdsCrmPage==='function') return await window.rdsCrmPage();
      if(target==='whatsapp' && typeof window.rdsWaReload==='function') return await window.rdsWaReload();
      if(target==='campaigns' && typeof window.campaigns==='function') return await window.campaigns();
      if(target==='execution' && typeof window.automation==='function') return await window.automation();
      if(target==='returns' && typeof window.returnsPage==='function') return await window.returnsPage();
      if(target==='payments' && typeof window.paymentsPage==='function') return await window.paymentsPage();
      if(target==='orders' && typeof window.orders==='function') return await window.orders();
      if(target==='account' && typeof window.renderAccountNative==='function') return await window.renderAccountNative();
      if(target==='settings' && typeof window.settings==='function') return await window.settings();
      if(target==='about' && typeof window.rdsAbout==='function') return await window.rdsAbout();
      throw new Error('Página não disponível: '+target);
    }catch(e){
      if(e?.code==='NAV_STALE'||e?.message==='NAV_STALE')return;
      if(appEl)appEl.innerHTML='<div class="card"><h2>Não foi possível carregar o painel</h2><p class="mut">'+String(e?.message||e).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))+'</p><button class="btn primary" type="button" onclick="window.rdsRenderCurrentPage()">Tentar novamente</button></div>';
    }
  }

  function stableSetNav(){
    const p=window.page||localStorage.getItem('rds_current_page')||'home';
    document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(b=>{
      b.classList.toggle('active',b.dataset.page===p);
    });
  }
  async function stableGo(p){
    const target=String(p||'home');
    window.page=target;
    localStorage.setItem('rds_current_page',target);
    if(typeof window.navSeq==='number')window.navSeq++;
    stableSetNav();
    window.scrollTo(0,0);
    await stableRender();
    stableSetNav();
  }

  window.setNav=stableSetNav;
  window.go=stableGo;
  window.rdsRenderCurrentPage=stableRender;
  window.render=stableRender;

  const revealBoot=()=>{document.body.classList.remove('rds-booting');stableSetNav();};
  window.rdsRefreshCurrentPage=async()=>{
    if(refreshBusy)return;
    refreshBusy=true;
    const b=document.getElementById('rdsRefreshBtn');
    const old=b?.textContent||'↻ Atualizar';
    if(b){b.disabled=true;b.textContent='↻ Atualizando…';b.setAttribute('aria-busy','true');}
    try{
      if(typeof window.navSeq==='number')window.navSeq++;
      stableSetNav();
      await stableRender();
      stableSetNav();
      if(typeof window.refreshStatus==='function')window.refreshStatus();
    }finally{
      if(b){b.disabled=false;b.textContent=old;b.removeAttribute('aria-busy');}
      revealBoot();
      refreshBusy=false;
    }
  };

  function bindNavigation(){
    document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(b=>{
      if(b.dataset.rdsStableNav==='1')return;
      b.dataset.rdsStableNav='1';
      b.onclick=async e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        const p=b.dataset.page||'home';
        window.page=p;
        localStorage.setItem('rds_current_page',p);
        if(typeof window.navSeq==='number')window.navSeq++;
        stableSetNav();
        window.scrollTo(0,0);
        await stableRender();
      };
    });
  }

  bindNavigation();
  window.addEventListener('load',revealBoot,{once:true});
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bindNavigation,{once:true});
  }
  new MutationObserver(bindNavigation).observe(document.body,{childList:true,subtree:true});
})();