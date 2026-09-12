(()=>{
  if(window.__RDS_FINAL_POLISH_V14__) return;
  window.__RDS_FINAL_POLISH_V14__=true;

  const style=document.createElement('style');
  style.id='rdsFinalPolishV14Style';
  style.textContent=`
    html.rds-p14-transition #app{visibility:hidden!important;opacity:0!important}
    #app{transition:none!important}
    @media(max-width:760px){
      .top{gap:6px!important;padding-left:10px!important;padding-right:10px!important}
      .top>div:first-child{display:flex!important;align-items:center!important;gap:6px!important;flex:1 1 auto!important;min-width:0!important;max-width:none!important;overflow:visible!important}
      .top>div:first-child .rds-v1027-top-logo{width:32px!important;height:32px!important;flex:0 0 32px!important}
      .top>div:first-child b{display:block!important;font-size:11px!important;line-height:1.05!important;letter-spacing:0!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
      .top>div:first-child small{display:none!important}
      .top-actions{gap:5px!important;flex:0 0 auto!important}
      #clock{font-size:9px!important;white-space:nowrap!important}
      #waStatusMobile{font-size:9px!important;min-width:26px!important;padding:5px!important}
    }
    .rds-p14-flow-remove{display:none!important}
    .rds-p14-duplicate-remove{display:none!important}
  `;
  document.head.appendChild(style);

  const app=()=>document.querySelector('#app');
  const premium=new Set(['home','contacts','returns','payments','settings','about']);
  const activePage=()=>{
    const b=document.querySelector('#mobileNav button.active')||document.querySelector('#nav button.active');
    return b?.dataset.page||'home';
  };
  const setActive=p=>{
    document.querySelectorAll('#nav button,#mobileNav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
  };
  const transitionOn=()=>document.documentElement.classList.add('rds-p14-transition');
  const transitionOff=()=>document.documentElement.classList.remove('rds-p14-transition');

  function finishHeader(){
    const top=document.querySelector('.top>div:first-child');
    if(!top) return;
    const b=top.querySelector('b');
    if(b){
      b.textContent='CANAL DE VENDAS RDS';
      b.style.whiteSpace='nowrap';
      b.style.overflow='visible';
      b.style.textOverflow='clip';
    }
  }

  function removeOfficialDuplicate(){
    const root=app();
    if(!root) return;
    root.querySelectorAll('*').forEach(el=>{
      if(el.children.length>8) return;
      const t=(el.textContent||'').trim();
      if(/^INTEGRAÇÃO OFICIAL V4\s*Sistema de vendas REINO DA SORTE/i.test(t) || /INTEGRAÇÃO OFICIAL V4/.test(t)){
        let target=el;
        for(let i=0;i<3 && target.parentElement && target.parentElement!==root;i++){
          const p=target.parentElement;
          if((p.textContent||'').includes('Atualizar conexão') || (p.textContent||'').includes('Vendedor oficial conectado')) target=p;
          else break;
        }
        target.classList.add('rds-p14-duplicate-remove');
      }
    });
  }

  function removePaymentFlow(){
    const root=app();
    if(!root) return;
    root.querySelectorAll('h1,h2,h3').forEach(h=>{
      if((h.textContent||'').trim().toLowerCase()==='fluxo operacional'){
        let box=h.parentElement;
        while(box && box!==root && box.children.length>1) box=box.parentElement;
        if(box && box!==root) box.classList.add('rds-p14-flow-remove');
      }
    });
  }

  async function alignCentralCount(){
    if(activePage()!=='home') return;
    try{
      const r=await fetch('/api/contacts',{cache:'no-store'});
      if(!r.ok) return;
      const data=await r.json();
      const n=Array.isArray(data)?data.length:Number(data?.count??0);
      const metrics=[...document.querySelectorAll('#app .r13-metric')];
      if(metrics[0] && Number.isFinite(n)){
        const label=metrics[0].querySelector('small');
        const value=metrics[0].querySelector('strong');
        if(label) label.textContent='Clientes';
        if(value) value.textContent=String(n);
      }
    }catch{}
  }

  function cleanup(){
    finishHeader();
    if(activePage()==='payments') removePaymentFlow();
    if(activePage()==='settings') removeOfficialDuplicate();
    alignCentralCount();
  }

  const originalRender=window.render;
  if(typeof originalRender==='function'){
    window.render=async function(){
      transitionOn();
      try{
        const r=await originalRender.apply(this,arguments);
        setTimeout(cleanup,0);
        return r;
      }finally{
        setTimeout(transitionOff,30);
      }
    };
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('#nav button,#mobileNav button');
    if(!b) return;
    const p=b.dataset.page;
    if(!premium.has(p)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setActive(p);
    transitionOn();
    if(typeof window.render==='function'){
      Promise.resolve(window.render()).then(()=>{
        window.scrollTo(0,0);
        setTimeout(()=>{cleanup();transitionOff()},35);
      }).catch(()=>setTimeout(transitionOff,80));
    }
  },true);

  new MutationObserver(()=>{finishHeader();if(activePage()==='settings')removeOfficialDuplicate();if(activePage()==='payments')removePaymentFlow()}).observe(document.body,{childList:true,subtree:true});

  function boot(){
    finishHeader();
    const p=activePage();
    if(premium.has(p) && typeof window.render==='function'){
      transitionOn();
      Promise.resolve(window.render()).then(()=>{cleanup();transitionOff()}).catch(()=>transitionOff());
    }else{
      transitionOff();
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else setTimeout(boot,0);
})();