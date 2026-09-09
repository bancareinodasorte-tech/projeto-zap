(()=>{
  const waLink=phone=>`https://wa.me/${String(phone||'').replace(/\D/g,'')}`;
  const withTimeout=(promise,ms,fallback)=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(fallback),ms))]);

  window.paymentsPage=async function(){
    const ordersList=await withTimeout(api('/api/orders'),12000,[]);
    const [pb,rem]=await Promise.all([
      withTimeout(api('/api/pagbank/status').catch(()=>({configured:false,environment:'sandbox'})),4000,{configured:false,environment:'sandbox',provider:'mercadopago'}),
      withTimeout(api('/api/v1032/reminders').catch(()=>({orders:[]})),4000,{orders:[]})
    ]);
    state.orders=ordersList;
    const waiting=ordersList.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
    const proof=ordersList.filter(o=>o.status==='AGUARDANDO_CONFERENCIA');
    const paid=ordersList.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const total=waiting.reduce((a,o)=>a+Number(o.total_amount||0),0);
    const remMap=new Map((rem.orders||[]).map(x=>[x.id,x]));
    const provider=String(pb.provider||'').toLowerCase()==='mercadopago'?'MERCADO PAGO':'PAGBANK';

    const pixCard=o=>{
      const r=remMap.get(o.id);
      return `<div class=rds-order>
        <div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('AGUARDANDO PIX')}</div>
        <div class=rds-buttons>
          ${btn('Gerar PIX',`rdsCreatePix('${o.id}',false)`,'btn primary')}
          ${btn('Gerar e enviar no WhatsApp',`rdsCreatePix('${o.id}',true)`,'btn success')}
          ${btn('Consultar Mercado Pago',`rdsReconcilePix('${o.id}')`)}
          <a target=_blank href="${waLink(o.phone)}">${btn('Abrir WhatsApp','')}</a>
          ${r?btn(r.paused?'Retomar lembretes':'Pausar lembretes',`rdsToggleReminder('${o.id}',${!r.paused})`):''}
        </div>
      </div>`;
    };

    const proofCard=o=>`<div class=rds-order>
      <div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('COMPROVANTE RECEBIDO')}</div>
      <div class=rds-buttons>
        ${btn('Confirmar pagamento',`rdsApproveProof('${o.id}')`,'btn success')}
        ${btn('Rejeitar e voltar ao PIX',`rdsRejectProof('${o.id}')`,'btn danger')}
        ${btn('Consultar Mercado Pago',`rdsReconcilePix('${o.id}')`)}
        <a target=_blank href="${waLink(o.phone)}">${btn('Abrir WhatsApp','')}</a>
      </div>
    </div>`;

    app.innerHTML=`
      <div class="rds-clean-head"><div><span class=eyebrow>Operação financeira</span><h1>Pagamentos</h1><p class=rds-clean-sub>Gerar PIX, enviar cobrança, conferir comprovante e validar o pagamento.</p></div>${badge(pb.configured?`${provider} ${String(pb.environment||'').toUpperCase()}`:`${provider} NÃO CONFIGURADO`)}</div>
      <div class=rds-mini-grid>
        <div class="card metric-card"><span class=eyebrow>Aguardando PIX</span><div class=metric>${waiting.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Conferir comprovante</span><div class=metric>${proof.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Enviar bilhetes</span><div class=metric>${paid.length}</div></div>
      </div>
      <div class="rds-section card"><div class=rds-section-title><h2>Cobranças PIX</h2></div><div class=rds-order-list>${waiting.length?waiting.map(pixCard).join(''):'<div class=rds-empty>Nenhum pedido aguardando PIX.</div>'}</div></div>
      <div class="rds-section card"><div class=rds-section-title><h2>Comprovantes recebidos</h2></div><div class=rds-order-list>${proof.length?proof.map(proofCard).join(''):'<div class=rds-empty>Nenhum comprovante aguardando decisão.</div>'}</div></div>
    `;
  };

  window.rdsReconcilePix=async function(id){
    try{
      const d=await post(`/api/pagbank/orders/${id}/reconcile`,{});
      if(d.paid){toast('Pagamento confirmado pelo Mercado Pago.');setTimeout(()=>go('orders'),400);return;}
      toast(`Mercado Pago: ${d.status||'aguardando pagamento'}`);
      setTimeout(()=>go('payments'),350);
    }catch(e){toast(e.message||'Falha ao consultar Mercado Pago.')}
  };

  const previousRender=render;
  render=async function(){
    if(page==='payments'){
      app.innerHTML='<div class="card"><span class=mut>Carregando pagamentos...</span></div>';
      try{return await paymentsPage()}catch(e){app.innerHTML=`<div class=card><h2>Não foi possível carregar pagamentos</h2><p>${esc(e.message)}</p></div>`;return}
    }
    return previousRender();
  };
})();
