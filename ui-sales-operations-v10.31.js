(()=>{
  const oldRender=render;
  const oldReturns=returnsPage;

  const style=document.createElement('style');
  style.textContent=`
    .pix-code{width:100%;min-height:110px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
    .pix-qr{display:block;max-width:240px;width:100%;margin:16px auto;border-radius:18px;background:#fff;padding:12px}
    .ops-note{padding:12px 14px;border-radius:14px;background:#eef6ff;color:#184a83;margin:10px 0}
    .mobile-nav{overflow-x:auto;justify-content:flex-start}.mobile-nav button{min-width:72px;flex:0 0 72px}
  `;
  document.head.appendChild(style);

  window.paymentsPage=async function(){
    const [ordersList,pb]=await Promise.all([api('/api/orders'),api('/api/pagbank/status').catch(()=>({configured:false,environment:'sandbox'}))]);
    state.orders=ordersList;
    const waiting=ordersList.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
    const proof=ordersList.filter(o=>o.status==='AGUARDANDO_CONFERENCIA');
    const paid=ordersList.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const total=waiting.reduce((a,o)=>a+Number(o.total_amount||0),0);
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Operação financeira</span><h1>Pagamentos</h1><p class=mut>Gerar, enviar e acompanhar o PIX de cada pedido.</p></div></div>
      <div class=grid>
        <div class="card metric-card"><span class=eyebrow>Aguardando PIX</span><div class=metric>${waiting.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>Valor pendente</span><div class=metric>${money(total)}</div></div>
        <div class="card metric-card"><span class=eyebrow>Comprovante manual</span><div class=metric>${proof.length}</div></div>
        <div class="card metric-card"><span class=eyebrow>PIX confirmado</span><div class=metric>${paid.length}</div></div>
      </div>
      <div class=card><div class=row style="justify-content:space-between"><div><span class=eyebrow>PagBank</span><h2 style="margin:4px 0">PIX automático</h2></div>${badge(pb.configured?'CONFIGURADO':'NÃO CONFIGURADO')}</div><p class=mut>Ambiente: ${esc((pb.environment||'sandbox').toUpperCase())}. Cada pedido recebe cobrança com o valor atual calculado pelo sistema.</p></div>
      ${waiting.map(o=>`<div class=card><div class=row style="justify-content:space-between"><div><h2 style="margin:0">${esc(o.customer_name||o.phone)}</h2><p class=mut>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('AGUARDANDO PIX')}</div><div class=row>${btn('Gerar PIX',`rdsCreatePix('${o.id}',false)`,'btn primary')}${btn('Gerar e enviar no WhatsApp',`rdsCreatePix('${o.id}',true)`,'btn success')}<a target=_blank href="https://wa.me/${esc(o.phone||'')}">${btn('Abrir WhatsApp','')}</a></div></div>`).join('')||'<div class="card empty-state">Nenhum pedido aguardando PIX.</div>'}
      ${proof.length?`<div class=card><span class=eyebrow>Contingência</span><h2>Comprovantes para conferência manual</h2>${proof.map(o=>`<div class=priority><div><strong>${esc(o.customer_name||o.phone)}</strong><small>${esc(o.code)} • ${money(o.total_amount)}</small></div>${btn('Confirmar manualmente',`confirmPay('${o.id}');setTimeout(()=>go('payments'),350)`,'btn success')}</div>`).join('')}</div>`:''}`;
  };

  window.rdsCreatePix=async function(id,send){
    try{
      const o=state.orders.find(x=>x.id===id)||{};
      const currentCpf=String(o.customer_tax_id||o.tax_id||o.cpf||'').replace(/\D/g,'');
      const currentEmail=String(o.customer_email||o.email||'');
      modal(`<span class=eyebrow>PIX PagBank — PRODUÇÃO</span><h2>Dados do pagador</h2><p>O PagBank exige <b>CPF/CNPJ e e-mail reais do pagador</b> para criar a cobrança.</p><label>CPF/CNPJ</label><input id=rdsPagCpf inputmode=numeric value="${esc(currentCpf)}" placeholder="CPF ou CNPJ"><label>E-mail</label><input id=rdsPagEmail type=email value="${esc(currentEmail)}" placeholder="cliente@email.com"><div class=row>${btn('Continuar',`rdsCreatePixConfirm('${id}',${send})`,'btn primary')}${btn('Cancelar',"this.closest('.modal').remove()")}</div>`);
    }catch(e){toast(e.message)}
  };

  window.rdsCreatePixConfirm=async function(id,send){
    try{
      const cpf=String(document.querySelector('#rdsPagCpf')?.value||'').replace(/\D/g,'');
      const email=String(document.querySelector('#rdsPagEmail')?.value||'').trim();
      if(!cpf || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Informe CPF/CNPJ e um e-mail válido.');
      document.querySelector('.modal')?.remove();
      const o=state.orders.find(x=>x.id===id)||{};
      const r=await post(send?`/api/pagbank/orders/${id}/send-pix`:`/api/pagbank/orders/${id}/pix`,{customer_tax_id:cpf,customer_email:email});
      const code=r?.qr?.text||'';
      const img=r?.qr?.png||r?.qr?.base64||'';
      modal(`<span class=eyebrow>PIX PagBank — PRODUÇÃO</span><h2>${send?'PIX enviado ao cliente':'PIX gerado'}</h2><p><b>${esc(o.customer_name||o.phone||'Cliente')}</b><br>${esc(o.code||'')} • ${money(o.total_amount)}</p><div class=ops-note>${send?'A cobrança foi enviada pelo WhatsApp e continua aguardando a confirmação automática.':'Copie o código ou use o QR Code abaixo.'}</div>${img?`<img class=pix-qr src="${esc(img)}" alt="QR Code PIX">`:''}<label>PIX Copia e Cola</label><textarea id=rdsPixCode class=pix-code readonly>${esc(code)}</textarea><div class=row>${btn('Copiar PIX','rdsCopyPix()','btn primary')}${btn('Fechar',"this.closest('.modal').remove()")}</div>`);
      toast(send?'PIX gerado e enviado no WhatsApp.':'PIX gerado com sucesso.');
    }catch(e){toast(e.message)}
  };

  window.rdsCopyPix=async function(){
    const t=document.querySelector('#rdsPixCode')?.value||'';
    if(!t)return;
    try{await navigator.clipboard.writeText(t);toast('PIX copiado.')}catch{const el=document.querySelector('#rdsPixCode');el.select();document.execCommand('copy');toast('PIX copiado.')}
  };

  window.returnsPage=oldReturns;

  window.orders=async function(){
    state.orders=await api('/api/orders');
    const active=state.orders.filter(o=>!['CONCLUIDO','CANCELADO'].includes(o.status));
    const collecting=state.orders.filter(o=>o.status==='COLETANDO_DADOS');
    const paid=state.orders.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
    const done=state.orders.filter(o=>o.status==='CONCLUIDO');
    const waiting=state.orders.filter(o=>['AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFERENCIA'].includes(o.status));
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Operação de vendas</span><h1>Compras</h1><p class=mut>Pedidos, entrega dos bilhetes e vendas concluídas.</p></div>${waiting.length?btn(`Pagamentos (${waiting.length})`,"go('payments')",'btn primary'):''}</div>
      <div class=grid><div class="card metric-card"><span class=eyebrow>Coletando dados</span><div class=metric>${collecting.length}</div></div><div class="card metric-card"><span class=eyebrow>Enviar bilhetes</span><div class=metric>${paid.length}</div></div><div class="card metric-card"><span class=eyebrow>Concluídas</span><div class=metric>${done.length}</div></div><div class="card metric-card"><span class=eyebrow>Em pagamento</span><div class=metric>${waiting.length}</div></div></div>
      ${paid.length?`<div class=card><span class=eyebrow>Ação necessária</span><h2>Bilhetes para entregar</h2>${paid.map(o=>`<div class=priority><div><strong>${esc(o.customer_name||o.phone)}</strong><small>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</small></div><div class=row>${btn('Marcar bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary')}${btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger')}</div></div>`).join('')}</div>`:''}
      ${collecting.length?`<div class=card><span class=eyebrow>Pedidos em andamento</span><h2>Coletando dados</h2>${collecting.map(o=>`<div class=priority><div><strong>${esc(o.customer_name||o.phone)}</strong><small>${esc(o.code)}</small></div><div class=row><a target=_blank href="https://wa.me/${esc(o.phone||'')}">${btn('Abrir WhatsApp','')}</a>${btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger')}</div></div>`).join('')}</div>`:''}
      ${waiting.length?`<div class=card><span class=eyebrow>Pedidos aguardando</span><h2>Pagamento / conferência</h2>${waiting.map(o=>`<div class=priority><div><strong>${esc(o.customer_name||o.phone)}</strong><small>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</small></div><div class=row>${badge(o.status)}${btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger')}</div></div>`).join('')}</div>`:''}
      <div class=card><span class=eyebrow>Histórico</span><h2>Compras concluídas</h2>${done.slice(0,30).map(o=>`<div class=priority><div><strong>${esc(o.customer_name||o.phone)}</strong><small>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</small></div>${badge('CONCLUIDO')}</div>`).join('')||'<div class=empty-state>Nenhuma compra concluída.</div>'}</div>`;
  };

  window.render=async function(){
    if(page==='payments') return paymentsPage();
    return oldRender();
  };
})();