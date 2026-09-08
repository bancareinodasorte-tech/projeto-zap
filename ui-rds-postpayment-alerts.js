(()=>{
  const apply=()=>{
    const app=document.querySelector('#app');
    if(!app||typeof page==='undefined'||page!=='orders')return;
    const orders=Array.isArray(state?.orders)?state.orders:[];
    const pending=orders.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const old=app.querySelector('#rdsPostPaymentAlert');
    if(!pending.length){old?.remove();return}
    if(old){
      const count=old.querySelector('[data-count]');
      if(count)count.textContent=String(pending.length);
      return;
    }
    const anchor=app.querySelector('.rds-ops-summary');
    if(!anchor)return;
    const box=document.createElement('div');
    box.id='rdsPostPaymentAlert';
    box.className='rds-postpayment-alert';
    box.innerHTML=`<div><span class="rds-postpayment-icon">✓</span><div><b>Pagamento confirmado — emitir bilhetes</b><small><span data-count>${pending.length}</span> pedido(s) aguardando envio dos bilhetes.</small></div></div><button class="btn primary" type="button">Abrir</button>`;
    box.querySelector('button')?.addEventListener('click',()=>{
      const target=app.querySelector('[data-order-status="PAGO_AGUARDANDO_BILHETES"]');
      target?.scrollIntoView({behavior:'smooth',block:'start'});
      target?.setAttribute('open','');
    });
    anchor.insertAdjacentElement('afterend',box);
  };
  const style=document.createElement('style');
  style.textContent=`
    .rds-postpayment-alert{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0;padding:14px 16px;border:1px solid rgba(18,96,194,.22);border-radius:16px;background:linear-gradient(135deg,rgba(232,243,255,.96),rgba(248,251,255,.98));box-shadow:0 8px 24px rgba(20,58,105,.08)}
    .rds-postpayment-alert>div{display:flex;align-items:center;gap:12px;min-width:0}
    .rds-postpayment-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:12px;background:#e7f1ff;color:#1260c2;font-weight:800}
    .rds-postpayment-alert b{display:block;color:#17345f;font-size:14px}
    .rds-postpayment-alert small{display:block;margin-top:3px;color:#64748b}
    .rds-postpayment-alert .btn{flex:0 0 auto}
    @media(max-width:760px){.rds-postpayment-alert{align-items:stretch;flex-direction:column}.rds-postpayment-alert .btn{width:100%}}
  `;
  document.head.appendChild(style);
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  setTimeout(apply,0);
})();