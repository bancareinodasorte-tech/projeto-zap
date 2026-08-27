(()=>{
 const oldPayments=window.paymentsPage;
 window.paymentsPage=async function(){
  await oldPayments();
  try{
   const d=await api('/api/v1032/reminders');
   const cards=[...document.querySelectorAll('#app .card')];
   for(const r of d.orders||[]){
    const card=cards.find(x=>x.innerText.includes(r.code)); if(!card)continue;
    const row=card.querySelector('.row:last-child')||card;
    const b=document.createElement('button'); b.className=r.paused?'btn success':'btn';
    b.textContent=r.paused?'Retomar lembretes':'Pausar lembretes';
    b.onclick=async()=>{try{await post('/api/v1032/orders/'+r.id+'/reminders',{paused:!r.paused});toast(r.paused?'Lembretes retomados.':'Lembretes pausados.');setTimeout(()=>go('payments'),250);}catch(e){toast(e.message)}};
    row.appendChild(b);
    const info=document.createElement('small'); info.className='mut'; info.style.display='block'; info.style.marginTop='10px';
    info.textContent=r.paused?'Lembretes PIX pausados para este pedido.':`Lembretes: ${r.sent||0}/${d.max}. Primeiro após ${d.delay} min; próximos a cada ${d.repeat} min.`;
    card.appendChild(info);
   }
   const title=document.querySelector('#app .page-title');
   if(title){const note=document.createElement('div');note.className='card';note.innerHTML=`<span class="eyebrow">Controle de lembretes PIX</span><p class="mut" style="margin-bottom:0">${d.enabled?'ATIVO':'DESATIVADO'} • primeiro lembrete após <b>${d.delay} min</b> • repetição a cada <b>${d.repeat} min</b> • máximo <b>${d.max}</b> por pedido. Ao receber comprovante, confirmar PIX, cancelar ou concluir o pedido, ele sai automaticamente desta rotina.</p>`;title.insertAdjacentElement('afterend',note);}
  }catch(e){console.error('V10.32 UI',e)}
 };
})();
