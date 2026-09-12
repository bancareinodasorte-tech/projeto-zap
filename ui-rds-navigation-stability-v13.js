(()=>{
 if(window.__RDS_NAV_V13__)return;window.__RDS_NAV_V13__=true;
 const app=()=>document.querySelector('#app');
 const premium=new Set(['home','contacts','returns','payments','settings','about']);
 const oldRender=window.render;
 window.render=async function(){
  document.documentElement.classList.add('rds-p13-boot');
  const r=app();if(r)r.classList.remove('rds-p13-ready');
  try{return await oldRender.apply(this,arguments)}finally{if(r)r.classList.add('rds-p13-ready');document.documentElement.classList.remove('rds-p13-boot')}
 };
 const ensure=()=>{const r=app();if(!r)return;const active=document.querySelector('#nav button.active,#mobileNav button.active')?.dataset.page||'home';if(premium.has(active)&&!r.querySelector('.rds-p13')){clearTimeout(window.__rdsNavRepair);window.__rdsNavRepair=setTimeout(()=>{if(premium.has(active)&&!r.querySelector('.rds-p13')&&typeof window.render==='function')window.render()},80)}};
 new MutationObserver(ensure).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
 setTimeout(ensure,250);
})();