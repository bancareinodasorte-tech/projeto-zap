(()=>{
  const oldHome=window.home;
  const oldAutomation=window.automation;

  function count(v){return Number(v||0)}
  function action(label,value,page,kind=''){
    return `<div class="priority"><div><strong>${label}</strong><small>${count(value)} item(ns)</small></div>${value?`<button class="btn ${kind}" onclick="go('${page}')">Abrir</button>`:`<span class="badge ok">OK</span>`}</div>`;
  }

  async function loadOperatorSnapshot(){
    const [dash,follow,postpay]=await Promise.all([
      api('/api/dashboard'),
      api('/api/v1011/followup/summary').catch(()=>({})),
      api('/api/v1012/postpay/summary').catch(()=>({}))
    ]);
    const queue=count(dash.queue), failed=count(dash.failed), alerts=count(dash.alerts),
      review=count(postpay.review), tickets=count(postpay.tickets),
      near=count(follow.nearLimit), criticalReview=count(follow.criticalReview), criticalTickets=count(follow.criticalTickets);
    const total=queue+failed+alerts+review+tickets+near+criticalReview+criticalTickets;
    return {dash,follow,postpay,total,queue,failed,alerts,review,tickets,near,criticalReview,criticalTickets};
  }

  window.rds1013Operator=async function(){
    try{
      const d=await loadOperatorSnapshot();
      modal(`<span class="eyebrow">Central do operador</span><h2>${d.total?'Ações que exigem atenção':'Operação em dia'}</h2><p class="mut">Fila consolidada sem alterar automaticamente a tela atual.</p>
        <div class="priority-list">
          ${action('Falhas de envio',d.failed,'execution','bad')}
          ${action('Alertas operacionais',d.alerts,'execution','warn')}
          ${action('Próximos do limite',d.near,'execution','warn')}
          ${action('Conferir pagamento',d.review,'orders','warn')}
          ${action('Enviar bilhetes',d.tickets,'orders','warn')}
        </div>`);
    }catch(e){toast(e.message)}
  };

  window.home=async function(){
    await oldHome();
    try{
      const d=await loadOperatorSnapshot();
      if(document.querySelector('#rds1013OperatorCard'))return;
      const box=document.createElement('div');
      box.id='rds1013OperatorCard';box.className='card';
      box.innerHTML=`<div class="row" style="justify-content:space-between;align-items:center"><div><span class="eyebrow">Operação assistida</span><h2 style="margin:.35rem 0">Central do operador</h2><p class="mut" style="margin:0">${d.total?`${d.total} ação(ões) para revisar.`:'Nenhuma pendência operacional crítica.'}</p></div><button class="btn primary" onclick="rds1013Operator()">Abrir fila</button></div>`;
      const center=document.querySelector('#app .action-center');
      if(center)center.insertAdjacentElement('beforebegin',box);else app.appendChild(box);
    }catch(e){console.error('V10.13 operator UI',e)}
  };

  window.automation=async function(){
    await oldAutomation();
    try{
      if(document.querySelector('#rds1013QuickActions'))return;
      const box=document.createElement('div');box.id='rds1013QuickActions';box.className='card';
      box.innerHTML=`<span class="eyebrow">Operação assistida</span><h2>Ações rápidas</h2><p class="mut">Concentre falhas, pagamentos e entregas em uma única fila manual.</p><button class="btn primary" onclick="rds1013Operator()">Abrir central do operador</button>`;
      const title=document.querySelector('#app .page-title');if(title)title.insertAdjacentElement('afterend',box);else app.prepend(box);
    }catch(e){console.error('V10.13 automation UI',e)}
  };
})();
