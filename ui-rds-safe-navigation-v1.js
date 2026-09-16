(()=>{
  if(window.__RDS_SAFE_NAV_V3__) return;
  window.__RDS_SAFE_NAV_V3__=true;
  const app=()=>document.querySelector('#app');
  const css=document.createElement('style');
  css.textContent=`.top>div:first-child{min-width:0!important;flex:1 1 auto!important}.top>div:first-child b{white-space:nowrap!important;font-size:13px!important;overflow:visible!important;text-overflow:clip!important}.top>div:first-child small{white-space:nowrap!important}.top-actions{flex:0 0 auto!important;min-width:0!important}.top-actions #clock{white-space:nowrap!important;font-size:10px!important}.top #waStatusMobile{min-width:42px!important;width:auto!important;padding:5px 9px!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}`;
  document.head.appendChild(css);

  // Navegação: não bloquear nenhuma página. O app.js é o controlador principal.
  const originalGo=window.go;
  if(typeof originalGo==='function'){
    window.go=function(p){
      try{if(typeof page!=='undefined')page=p;}catch{}
      document.querySelectorAll('#nav button,#mobileNav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
      try{scrollTo(0,0)}catch{}
      return originalGo.apply(this,arguments);
    };
  }

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
  statusCss.textContent='.top #waStatusMobile.rds-online,.sidebar #waStatus.rds-online{color:#16803a}.top #waStatusMobile.rds-off,.sidebar #waStatusMobile.rds-off{color:#c62828}.top #waStatusMobile{font-weight:800}';
  document.head.appendChild(statusCss);
  normalizeHeader();
  setInterval(normalizeHeader,1000);
})();