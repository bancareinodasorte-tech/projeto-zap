(()=>{
 const oldPayments=window.paymentsPage;
 const css=document.createElement('style');
 css.textContent=`.review-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.review-card{border-left:4px solid #e0a100}.review-meta{font-size:13px;color:#66758c;margin-top:4px}`;
 document.head.appendChild(css);

 window.paymentsPage=async function(){
  await oldPayments();
  try{
   const d=await api('/api/payment-review/summary');
   const cards=(d.review||[]).map(o=>`<div class="priority review-card"><div><strong>${esc(o.customer_name||o.phone)}</strong><small>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</small><div class=review-meta>Comprovante recebido • aguardando decisao do operador</div></div><div class=review-actions>${btn('Confirmar pagamento',`rdsApproveProof('${o.id}')`,'btn success')}${btn('Rejeitar comprovante',`rdsRejectProof('${o.id}')`,'btn danger')}<a target=_blank href="https://wa.me/${esc(o.phone||'')}">${btn('Abrir WhatsApp','')}</a></div></div>`).join('');
   if(cards){
    const box=document.createElement('div');box.className='card';box.innerHTML=`<span class=eyebrow>Conferencia manual</span><h2>Comprovantes recebidos</h2><p class=mut>Confirme somente apos conferir o pagamento. Se o comprovante estiver incorreto, devolva o pedido para aguardando PIX.</p>${cards}`;
    app.appendChild(box);
   }
  }catch(e){console.error('V10.33 payment review UI',e)}
 };

 window.rdsApproveProof=async function(id){
  if(!confirm('Confirmar que este pagamento foi conferido e esta correto?'))return;
  try{await post(`/api/orders/${id}/payment-confirmed`);toast('Pagamento confirmado. Pedido liberado para envio dos bilhetes.');setTimeout(()=>go('payments'),250)}catch(e){toast(e.message)}
 };
 window.rdsRejectProof=async function(id){
  if(!confirm('Rejeitar este comprovante e voltar o pedido para aguardando PIX?'))return;
  try{await post(`/api/orders/${id}/proof-rejected`,{notify:true});toast('Comprovante rejeitado. Cliente avisado para enviar outro.');setTimeout(()=>go('payments'),250)}catch(e){toast(e.message)}
 };
})();
