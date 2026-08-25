(()=>{
  const oldAutomation=window.automation;
  window.automation=async function(){
    await oldAutomation();
    try{
      const d=await api('/api/v1011/followup/summary');
      if(!d?.ok)return;
      if(document.querySelector('#rds1011Followup'))return;
      const box=document.createElement('div');
      box.id='rds1011Followup';box.className='card';
      box.innerHTML=`<span class="eyebrow">Follow-up inteligente</span><h2>Acompanhamento de pedidos</h2><p class="mut">O sistema reforça pedidos próximos do limite sem repetir para quem já respondeu.</p><div class="funnel">${[['Pedidos ativos',d.active],['Próximos do limite',d.nearLimit],['Conferência crítica',d.criticalReview],['Bilhetes críticos',d.criticalTickets]].map(x=>`<div><span class="eyebrow">${x[0]}</span><div class="metric">${Number(x[1]||0)}</div></div>`).join('')}</div>`;
      const title=document.querySelector('#app .page-title');
      if(title)title.insertAdjacentElement('afterend',box);else app.prepend(box);
    }catch(e){console.error('V10.11 follow-up UI',e);}
  };
})();
