(()=>{
  if(window.__RDS_SAFE_NAV_V1__) return;
  window.__RDS_SAFE_NAV_V1__=true;

  const PREMIUM=new Set(['home','contacts','returns','settings']);
  const app=()=>document.querySelector('#app');
  const setActive=p=>document.querySelectorAll('#nav button,#mobileNav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));

  const css=document.createElement('style');
  css.textContent='#app.rds-safe-pending{visibility:hidden!important}';
  document.head.appendChild(css);

  function hide(){app()?.classList.add('rds-safe-pending')}
  function showIfPremium(){if(app()?.querySelector('.rds-p12')) app().classList.remove('rds-safe-pending')}

  const originalGo=window.go;
  if(typeof originalGo==='function'){
    window.go=function(p){
      if(window.__RDS_PREMIUM_V12__ && PREMIUM.has(p)){
        hide();
        setActive(p);
        scrollTo(0,0);
        return;
      }
      return originalGo.apply(this,arguments);
    };
  }

  const observer=new MutationObserver(showIfPremium);
  const root=app();
  if(root) observer.observe(root,{childList:true,subtree:true});
  hide();
  setTimeout(showIfPremium,180);

  function normalizeHeader(){
    const title=document.querySelector('.top>div:first-child b');
    if(title) title.textContent='CANAL DE VENDAS RDS';
    const sub=document.querySelector('.top>div:first-child small');
    if(sub) sub.textContent='Operação comercial';
    const mobile=document.querySelector('#waStatusMobile');
    const side=document.querySelector('#waStatus');
    const connected=/conectado|online/i.test((mobile?.textContent||'')+' '+(side?.textContent||''));
    if(mobile){mobile.textContent=connected?'Online':'Off';mobile.title=connected?'Online':'Off';mobile.classList.toggle('rds-online',connected);mobile.classList.toggle('rds-off',!connected)}
    if(side){side.textContent=connected?'Online':'Off';side.title=connected?'Online':'Off';side.classList.toggle('rds-online',connected);side.classList.toggle('rds-off',!connected)}
  }
  const statusCss=document.createElement('style');
  statusCss.textContent='.top #waStatusMobile.rds-online,.sidebar #waStatus.rds-online{color:#16803a}.top #waStatusMobile.rds-off,.sidebar #waStatus.rds-off{color:#c62828}.top #waStatusMobile{font-weight:800}';
  document.head.appendChild(statusCss);
  normalizeHeader();
  setInterval(normalizeHeader,1000);
})();
