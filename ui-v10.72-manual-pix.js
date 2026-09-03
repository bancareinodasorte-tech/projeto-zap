(()=>{
  const waLink=phone=>`https://wa.me/${String(phone||'').replace(/\D/g,'')}`;
  const copy=async(text)=>{try{await navigator.clipboard.writeText(text);toast('PIX copiado.')}catch{toast('Não foi possível copiar automaticamente.')}};
  window.paymentsPage=async function(){
    const [ordersList,s]=await Promise.all([api('/api/orders'),api('/api/settings')]);
    state.orders=ordersList;
    const waiting=ordersList.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
    const proof=ordersList.filter(o=>o.status==='AGUARDANDO_CONFERENCIA');
    const paid=ordersList.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const total=waiting.reduce((a,o)=>a+Number(o.total_amount||0),0);
    const pixKey=String(s.pix_key||'').trim();
    const pixName=String(s.pix_name||'REINO DA SORTE').trim();
    const waitingCard=o=>`<div class=rds-order>
      <div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('AGUARDANDO PAGAMENTO')}</div>
      <p class=mut>PIX manual • ${esc(pixName)}${pixKey?` • chave: <b>${esc(pixKey)}</b>`:' • chave PIX não configurada.'}</p>
      <div class=rds-buttons>${pixKey?btn('Copiar chave PIX',`rdsCopyManualPix('${encodeURIComponent(pixKey)}')`,'btn primary'):''}${btn('Enviar instruções no WhatsApp',`rdsSendManualPix('${o.id}')`,'btn success')}<a target=_blank href="${waLink(o.phone)}">${btn('Abrir WhatsApp','')}</a>${btn('Cancelar pedido',`rdsCancelManualOrder('${o.id}')`,'btn danger')}</div>
    </div>`;
    const proofCard=o=>`<div class=rds-order>
      <div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('COMPROVANTE RECEBIDO')}</div>
      <p class=mut>Comprovante recebido e aguardando conferência do operador.</p>
      <div class=rds-buttons>${btn('Confirmar pagamento',`rdsApproveManualPayment('${o.id}')`,'btn success')}<a target=_blank href="${waLink(o.phone)}">${btn('Abrir WhatsApp','')}</a></div>
    </div>`;
    const paidCard=o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('PAGO • AGUARDANDO BILHETES')}</div><p class=mut>Pagamento confirmado. O operador deve emitir e enviar os bilhetes.</p></div>`;
    app.innerHTML=`<div class="rds-clean-head"><div><span class=eyebrow>Operação financeira</span><h1>Pagamentos</h1><p class=rds-clean-sub>PIX manual do Reino da Sorte, conferência de comprovantes e liberação para emissão dos bilhetes.</p></div>${badge(pixKey?'PIX CONFIGURADO':'PIX NÃO CONFIGURADO')}</div>
      <div class=rds-mini-grid><div class="card metric-card"><span class=eyebrow>Aguardando pagamento</span><div class=metric>${waiting.length}</div></div><div class="card metric-card"><span class=eyebrow>Valor pendente</span><div class=metric>${money(total)}</div></div><div class="card metric-card"><span class=eyebrow>Conferir comprovante</span><div class=metric>${proof.length}</div></div><div class="card metric-card"><span class=eyebrow>Enviar bilhetes</span><div class=metric>${paid.length}</div></div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Pedidos aguardando pagamento</h2></div><div class=rds-order-list>${waiting.length?waiting.map(waitingCard).join(''):'<div class=rds-empty>Nenhum pedido aguardando pagamento.</div>'}</div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Comprovantes recebidos</h2></div><div class=rds-order-list>${proof.length?proof.map(proofCard).join(''):'<div class=rds-empty>Nenhum comprovante aguardando decisão.</div>'}</div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Pagamentos confirmados</h2></div><div class=rds-order-list>${paid.length?paid.map(paidCard).join(''):'<div class=rds-empty>Nenhum pagamento confirmado aguardando bilhetes.</div>'}</div></div>`;
  };
  window.rdsCopyManualPix=async encoded=>copy(decodeURIComponent(encoded));
  window.rdsSendManualPix=async id=>{try{const o=state.orders.find(x=>x.id===id)||await api('/api/orders').then(xs=>xs.find(x=>x.id===id));const s=await api('/api/settings');if(!o)throw new Error('Pedido não encontrado.');const key=String(s.pix_key||'').trim();if(!key)throw new Error('Chave PIX não configurada.');const text=`💳 *PAGAMENTO PIX*\n\nPedido ${o.code}\nQuantidade: ${o.quantity||0} bilhete(s)\nValor: ${money(o.total_amount)}\n\nChave PIX: ${key}\nRecebedor: ${String(s.pix_name||'REINO DA SORTE')}\n\nApós o pagamento, envie o comprovante nesta conversa.`;await post('/api/whatsapp/test',{phone:o.phone,text});toast('Instruções de PIX enviadas.');}catch(e){toast(e.message||'Falha ao enviar PIX.')}};
  window.rdsApproveManualPayment=async id=>{if(!confirm('Confirmar manualmente este pagamento?'))return;try{await post(`/api/orders/${id}/payment-confirmed`);toast('Pagamento confirmado.');go('orders')}catch(e){toast(e.message||'Falha ao confirmar pagamento.')}};
  window.rdsCancelManualOrder=async id=>{if(!confirm('Cancelar este pedido?'))return;try{await post(`/api/orders/${id}/cancel`);toast('Pedido cancelado.');setTimeout(()=>go('payments'),250)}catch(e){toast(e.message||'Falha ao cancelar pedido.')}};
  const previousRender=render;
  render=async function(){if(page==='payments'){app.innerHTML='<div class="card"><span class=mut>Carregando pagamentos...</span></div>';try{return await paymentsPage()}catch(e){app.innerHTML=`<div class=card><h2>Não foi possível carregar pagamentos</h2><p>${esc(e.message)}</p></div>`;return}}return previousRender()};
})();