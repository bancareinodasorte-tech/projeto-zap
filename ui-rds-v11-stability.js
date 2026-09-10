(()=>{
  if(window.__RDS_V11_STABILITY__) return;
  window.__RDS_V11_STABILITY__=true;

  const cleanPhone=v=>String(v??'').replace(/\D/g,'');
  const actionable=rows=>{
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(r=>{
      const p=cleanPhone(r?.phone);
      if(!p||seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  };

  async function syncReturnsIndicator(){
    try{
      const rows=await fetch('/api/returns',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('returns');return r.json()});
      const n=actionable(rows).length;
      document.querySelectorAll('#nav button[data-page="returns"],#mobileNav button[data-page="returns"]').forEach(b=>{
        const badge=b.querySelector('.rds-nav-alert');
        if(n){
          const x=badge||Object.assign(document.createElement('span'),{className:'rds-nav-alert'});
          x.textContent=n>99?'99+':String(n);
          if(!badge)b.appendChild(x);
        }else badge?.remove();
      });
      const metric=[...document.querySelectorAll('#app .metric-card')].find(c=>/Retornos/i.test(c.querySelector('.eyebrow')?.textContent||''));
      if(metric&&Number((metric.querySelector('.metric')?.textContent||'').replace(/\D/g,''))!==n){
        const m=metric.querySelector('.metric');if(m)m.textContent=String(n);
      }
      if(!n&&document.querySelector('#rds-context-alert')) document.querySelector('#rds-context-alert').remove();
      if(document.querySelector('h1')?.textContent.trim()==='Retornos'){
        const box=[...document.querySelectorAll('.card')].find(c=>/RETORNOS PENDENTES/i.test(c.textContent||''));
        if(box){const m=box.querySelector('.metric');if(m)m.textContent=String(n)}
      }
      return n;
    }catch(e){return null}
  }

  const originalRender=window.render;
  if(typeof originalRender==='function'){
    window.render=async function(...args){
      const result=await originalRender.apply(this,args);
      await syncReturnsIndicator();
      return result;
    };
  }

  function navigate(p){
    if(p==='about'&&typeof window.rdsAbout==='function'){
      document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==='about'));
      window.rdsAbout();
      return;
    }
    if(typeof window.go==='function') window.go(p);
  }

  function bind(){
    document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(b=>{
      if(b.__rdsStableBound)return;
      b.__rdsStableBound=true;
      b.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        navigate(b.dataset.page);
      },true);
    });
  }

  bind();
  const navObserver=new MutationObserver(bind);
  navObserver.observe(document.body,{childList:true,subtree:true});
  syncReturnsIndicator();
})();
