(()=>{
  if(window.__RDS_HEADER_FINAL_V1__) return;
  window.__RDS_HEADER_FINAL_V1__=true;

  const style=document.createElement('style');
  style.textContent=`
    .rds-final-top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;width:100%!important;min-width:0!important}
    .rds-final-brand{display:flex!important;align-items:center!important;gap:9px!important;min-width:0!important;flex:1 1 auto!important;overflow:hidden!important}
    .rds-final-brand img{width:36px!important;height:36px!important;border-radius:50%!important;object-fit:cover!important;flex:0 0 36px!important}
    .rds-final-brand b{display:block!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;font-size:13px!important;line-height:1.1!important}
    .rds-final-brand small{display:block!important;white-space:nowrap!important;font-size:10px!important;line-height:1.1!important;color:#718096!important}
    .rds-final-actions{display:flex!important;align-items:center!important;gap:8px!important;flex:0 0 auto!important;white-space:nowrap!important}
    .rds-final-actions #clock{white-space:nowrap!important;font-size:10px!important}
    .rds-final-actions #waStatusMobile{min-width:42px!important;width:auto!important;padding:5px 9px!important;border-radius:999px!important;white-space:nowrap!important;text-align:center!important;font-weight:800!important}
    .rds-final-actions #waStatusMobile.rds-final-on{color:#16803a!important;background:#eaf7ef!important}
    .rds-final-actions #waStatusMobile.rds-final-off{color:#c62828!important;background:#fdecec!important}
    @media(max-width:430px){.rds-final-brand b{font-size:12px!important}.rds-final-brand small{font-size:9px!important}.rds-final-brand img{width:34px!important;height:34px!important;flex-basis:34px!important}.rds-final-actions{gap:6px!important}.rds-final-actions #clock{font-size:9px!important}.rds-final-actions #waStatusMobile{min-width:36px!important;padding:4px 7px!important}}
  `;
  document.head.appendChild(style);

  function connected(){
    const a=document.getElementById('waStatusMobile');
    const b=document.getElementById('waStatus');
    const t=((a?.textContent||'')+' '+(a?.title||'')+' '+(b?.textContent||'')+' '+(b?.title||'')+' '+(b?.className||'')).toLowerCase();
    return /conectado|online|connected/.test(t) && !/offline|desconectado|disconnected/.test(t);
  }

  function enforce(){
    const top=document.querySelector('.top');
    if(!top)return;
    const oldImg=top.querySelector('.rds-v1027-top-logo');
    const src=oldImg?.getAttribute('src') || document.querySelector('.brand-mark')?.style.backgroundImage?.match(/url\\(["']?(.*?)["']?\\)/)?.[1] || '';
    const wasOn=connected();
    top.innerHTML=`<div class="rds-final-brand"><img class="rds-final-logo" alt="Reino da Sorte" ${src?`src="${src}"`:''}><div><b>CANAL DE VENDAS RDS</b><small>Operação comercial</small></div></div><div class="rds-final-actions"><span id="clock"></span><span id="waStatusMobile" class="pill ${wasOn?'rds-final-on':'rds-final-off'}" title="${wasOn?'Online':'Off'}">${wasOn?'Online':'Off'}</span></div>`;
  }

  function normalizeStatus(){
    const el=document.getElementById('waStatusMobile');
    if(!el)return;
    const side=document.getElementById('waStatus');
    const t=((side?.textContent||'')+' '+(side?.title||'')+' '+(side?.className||'')).toLowerCase();
    const on=/conectado|online|connected/.test(t) && !/offline|desconectado|disconnected/.test(t);
    el.textContent=on?'Online':'Off';
    el.title=on?'Online':'Off';
    el.classList.toggle('rds-final-on',on);
    el.classList.toggle('rds-final-off',!on);
  }

  const boot=()=>{
    enforce();
    setInterval(()=>{
      const top=document.querySelector('.top');
      const brand=top?.querySelector('.rds-final-brand b');
      const actions=top?.querySelector('.rds-final-actions');
      if(!brand || brand.textContent!=='CANAL DE VENDAS RDS' || !actions || top.querySelectorAll(':scope>div').length!==2) enforce();
      normalizeStatus();
    },500);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
