(()=>{
  const waLink=phone=>`https://wa.me/${String(phone||'').replace(/\D/g,'')}`;
  const showError=e=>toast(e?.message||'Falha na operação PagBank.');

  window.paymentsPage=async function(){
    const [ordersList,pb]=await Promise.all([
      api('/api/orders'),
      api('/api/pagbank/status').catch(()=>({configured:false,environment:'sandbox'}))
    ]);
    state.orders=ordersList;
    const waiting=ordersList.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
    const proof=ordersList.filter(o=>o.status==='AGUARDANDO_CONFERENCIA');
    const paid=ordersList.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const total=waiting.reduce((a,o)=>a+Number(o.total_amount||0),0);
    const statusLabel=o=>o.pagbank_status?String(o.pagbank_status):'SEM PIX';
    const pixButtons=o=>{
      const hasPix=!!o.pix_copy_paste;
      return `${btn(hasPix?'Ver PIX':'Gerar PIX',`rdsCreatePix('${o.id}',false)`,'btn primary')}${btn('Gerar e enviar no WhatsApp',`rdsCreatePix('${o.id}',true)`,'btn success')}${hasPix?btn('Consultar PagBank',`rdsReconcilePix('${o.id}')`):''}<a target=_blank href="${waLink(o.phone)}">${btn('Abrir WhatsApp','')}</a>`;
    };
    app.innerHTML=`
      <div class="rds-clean-head"><div><span class=eyebrow>Operação financeira</span><h1>Pagamentos</h1><p class=rds-clean-sub>PIX automático PagBank, QR Code, Copia e Cola e confirmação automática.</p></div>${badge(pb.configured?'PAGBANK '+String(pb.environment||'').toUpperCase():'PAGBANK NÃO CONFIGURADO')}</div>
      <div class=rds-mini-grid>
        <div class="card metric-card"><span class=eyebrow>Aguardando PIX</span><div class=metric>${waiting.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Valor pendente</span><div class=metric>${money(total)}</div></div>
        <div class="card metric-card"><span class=eyebrow>Conferência manual</span><div class=metric>${proof.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Pagamento confirmado</span><div class=metric>${paid.length}</div></div>
      </div>
      <div class="rds-section card"><div class=rds-section-title><h2>Cobranças PIX</h2></div><div class=rds-order-list>${waiting.length?waiting.map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge(statusLabel(o))}</div><p class=mut>${o.pagbank_order_id?'PagBank: '+esc(o.pagbank_order_id):'PIX ainda não gerado.'}${o.pix_expires_at?' • Expira: '+dt(o.pix_expires_at):''}</p><div class=rds-buttons>${pixButtons(o)}</div></div>`).join(''):'<div class=rds-empty>Nenhum pedido aguardando PIX.</div>'}</div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Comprovantes recebidos</h2></div><div class=rds-order-list>${proof.length?proof.map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('COMPROVANTE RECEBIDO')}</div><div class=rds-buttons>${btn('Confirmar pagamento',`rdsApproveProof('${o.id}')`,'btn success')}${btn('Rejeitar e voltar ao PIX',`rdsRejectProof('${o.id}')`,'btn danger')}${btn('Consultar PagBank',`rdsReconcilePix('${o.id}')`)}<a target=_blank href="${waLink(o.phone)}">${btn('Abrir WhatsApp','')}</a></div></div>`).join(''):'<div class=rds-empty>Nenhum comprovante aguardando decisão.</div>'}</div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Pagamentos confirmados</h2></div><div class=rds-order-list>${paid.length?paid.map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('PAGO')}</div></div>`).join(''):'<div class=rds-empty>Nenhum pagamento confirmado aguardando bilhetes.</div>'}</div></div>
    `;
  };

  window.rdsCreatePix=async function(id,send){
    try{
      const o=state.orders.find(x=>x.id===id)||await api('/api/orders').then(xs=>xs.find(x=>x.id===id));
      if(!o)throw new Error('Pedido não encontrado.');
      const r=await post(send?`/api/pagbank/orders/${id}/send-pix`:`/api/pagbank/orders/${id}/pix`,{});
      const code=r?.qr?.text||o.pix_copy_paste||'';
      if(!code)throw new Error('PIX não retornado pelo PagBank.');
      modal(`<span class=eyebrow>PIX PAGBANK • ${(r.environment||'sandbox').toUpperCase()}</span><h2>${send?'PIX gerado e enviado':'PIX gerado'}</h2><p><b>${esc(o.customer_name||o.phone)}</b><br>${esc(o.code)} • ${money(o.total_amount)}</p><img class=pix-qr src="/api/pagbank/orders/${id}/qrcode.png?v=${Date.now()}" alt="QR Code PIX"><label>PIX Copia e Cola</label><textarea id=rdsPixCode class=pix-code readonly>${esc(code)}</textarea><div class=row>${btn('Copiar PIX','rdsCopyPix()','btn primary')}${btn('Fechar',"this.closest('.modal').remove()")}</div>`);
      toast(send?'PIX gerado e enviado no WhatsApp.':'PIX gerado com sucesso.');
      setTimeout(()=>paymentsPage(),400);
    }catch(e){showError(e)}
  };

  window.rdsReconcilePix=async function(id){
    try{const d=await post(`/api/pagbank/orders/${id}/reconcile`,{});toast(d.paid?'Pagamento confirmado pelo PagBank.':`PagBank: ${d.status||'aguardando pagamento'}`);if(d.paid)go('orders');else setTimeout(()=>go('payments'),250);}catch(e){showError(e)}
  };

  window.rdsCopyPix=async function(){
    const t=document.querySelector('#rdsPixCode')?.value||'';if(!t)return;
    try{await navigator.clipboard.writeText(t);toast('PIX copiado.')}catch{const el=document.querySelector('#rdsPixCode');el.select();document.execCommand('copy');toast('PIX copiado.')}
  };

  window.rdsApproveProof=async function(id){if(!confirm('Confirmar este pagamento manualmente?'))return;try{await post(`/api/orders/${id}/payment-confirmed`);toast('Pagamento confirmado.');go('orders')}catch(e){showError(e)}};
  window.rdsRejectProof=async function(id){if(!confirm('Rejeitar o comprovante e voltar ao PIX?'))return;try{await post(`/api/orders/${id}/proof-rejected`,{notify:true});toast('Comprovante rejeitado.');setTimeout(()=>go('payments'),250)}catch(e){showError(e)}};
})();
