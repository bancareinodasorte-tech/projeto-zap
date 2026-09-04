(()=>{
  const escA=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let snapshot={};
  let lastSignature='';

  const counts=async()=>{
    const [d,os]=await Promise.all([
      api('/api/dashboard'),
      api('/api/orders').catch(()=>[])
    ]);
    const orders=Array.isArray(os)?os:[];
    const waiting=orders.filter(o=>o.status==='AGUARDANDO_PAGAMENTO').length;
    const proof=orders.filter(o=>o.status==='AGUARDANDO_CONFERENCIA').length;
    const tickets=orders.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES').length;
    const collecting=orders.filter(o=>o.status==='COLETANDO_DADOS').length;
    const failed=Number(d.failed||0);
    const returns=Number(d.returns||0);
    const alerts=Number(d.alerts||0);
    return {waiting,proof,tickets,collecting,failed,returns,alerts,connected:!!d.connected};
  };

  function navBadge(page,n){
    const nodes=[...document.querySelectorAll(`#nav button[data-page="${page}"],#mobileNav button[data-page="${page}"]`)];
    nodes.forEach(b=>{
      let x=b.querySelector('.rds-nav-alert');
      if(!n){x?.remove();return;}
      if(!x){x=document.createElement('span');x.className='rds-nav-alert';b.appendChild(x)}
      x.textContent=n>99?'99+':String(n);
    });
  }

  function contextualBox(s){
    const items={
      payments:[s.waiting+s.proof?1:0,s.waiting?`<b>${s.waiting}</b> pedido(s) aguardando PIX.`:'',s.proof?`<b>${s.proof}</b> comprovante(s) aguardando conferência.`:''],
      orders:[s.proof+s.tickets?1:0,s.proof?`<b>${s.proof}</b> pagamento(s) precisam de conferência.`:'',s.tickets?`<b>${s.tickets}</b> pedido(s) pagos aguardam envio dos bilhetes.`:''],
      execution:[s.failed+s.alerts?1:0,s.failed?`<b>${s.failed}</b> falha(s) de automação para revisar.`:'',s.alerts?`<b>${s.alerts}</b> alerta(s) operacional(is) não lido(s).`:''],
      returns:[s.returns?1:0,s.returns?`<b>${s.returns}</b> retorno(s) pendente(s).`:''],
      home:[s.waiting+s.proof+s.tickets+s.failed+s.alerts?1:0,'','']
    };
    const d=items[page]||[0,'',''];
    let box=document.querySelector('#rds-context-alert');
    if(!d[0]){box?.remove();return}
    if(!box){box=document.createElement('div');box.id='rds-context-alert';box.className='rds-context-alert';const title=document.querySelector('#app .page-title');if(title)title.insertAdjacentElement('afterend',box);else app.prepend(box)}
    const text=[d[1],d[2]].filter(Boolean).join(' &nbsp;•&nbsp; ');
    box.innerHTML=`<span class="rds-alert-icon">!</span><div><strong>Atenção operacional</strong><p>${text||'Existem alterações ou esperas que precisam de acompanhamento.'}</p></div>`;
  }

  function paintNav(s){
    navBadge('execution',s.failed+s.alerts);
    navBadge('payments',s.waiting+s.proof);
    navBadge('orders',s.proof+s.tickets);
    navBadge('returns',s.returns);
  }

  async function refresh(){
    try{
      const s=await counts();
      snapshot=s;
      paintNav(s);
      contextualBox(s);
      const sig=JSON.stringify(s);
      if(lastSignature&&lastSignature!==sig && page!=='home')toast('A operação foi atualizada. Confira o indicador da área correspondente.');
      lastSignature=sig;
    }catch(e){console.warn('RDS alerts',e)}
  }

  function clock(){
    const x=document.querySelector('#clock');
    if(!x)return;
    const now=new Date();
    const date=now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).replace('.', '');
    const time=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    x.textContent=`${date} • ${time}`;
    x.title='Data e hora locais';
  }

  const style=document.createElement('style');
  style.textContent=`
    #clock{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap}
    .rds-nav-alert{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:999px;display:inline-grid;place-items:center;background:#d94747;color:#fff;font-size:9px;font-weight:900;line-height:1;box-shadow:0 2px 8px rgba(160,30,40,.22)}
    .rds-context-alert{display:flex;align-items:center;gap:12px;margin:-8px 0 18px;padding:13px 15px;border:1px solid #ecd8a3;border-radius:15px;background:#fff8e8;color:#5f4a15;box-shadow:0 8px 22px rgba(19,54,96,.05)}
    .rds-alert-icon{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#f0c35a;color:#5b4300;font-weight:900;flex:0 0 auto}
    .rds-context-alert strong{display:block;font-size:12px}.rds-context-alert p{margin:3px 0 0;font-size:12px;line-height:1.4}
    @media(max-width:760px){#clock{display:inline!important;font-size:9px;max-width:145px;overflow:hidden;text-overflow:ellipsis}.top-actions{gap:6px}.rds-context-alert{margin:-3px 0 14px;padding:11px 12px}.rds-context-alert p{font-size:11px}}
  `;
  document.head.appendChild(style);

  const oldRender=window.render;
  window.render=async function(){
    await oldRender();
    contextualBox(snapshot);
    paintNav(snapshot);
  };

  clock();
  setInterval(clock,1000);
  refresh();
  setInterval(refresh,15000);
})();
