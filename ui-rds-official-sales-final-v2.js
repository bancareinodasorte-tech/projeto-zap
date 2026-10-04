(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const json=async(u,o={})=>{const ac=new AbortController();const tm=setTimeout(()=>ac.abort(),8000);try{const r=await fetch(u,{cache:'no-store',...o,signal:ac.signal});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||'Falha na operação.');return d;}catch(e){if(e?.name==='AbortError')throw new Error('A integração oficial demorou para responder.');throw e;}finally{clearTimeout(tm);}};

  async function loadOfficial(){
    const [b,d]=await Promise.allSettled([
      json('/api/v1012/official-sales/bootstrap'),
      json('/api/v1012/official-sales/draw-info')
    ]);
    return {
      bootstrap:b.status==='fulfilled'?b.value:null,
      draw:d.status==='fulfilled'?(d.value.data||d.value):null,
      error:b.status==='rejected'?b.reason?.message:(d.status==='rejected'?d.reason?.message:null)
    };
  }

  async function renderOfficialCard(){
    const app=document.querySelector('#app');
    if(!app)return;
    const p=window.page||localStorage.getItem('rds_current_page')||'home';
    if(!['orders','account'].includes(p))return;
    if(document.getElementById('rdsOfficialIntegrationV2'))return;

    const card=document.createElement('section');
    card.id='rdsOfficialIntegrationV2';
    card.className='card rds-issuer-card';
    card.innerHTML='<span class="eyebrow">INTEGRAÇÃO OFICIAL</span><h2>REINO DA SORTE</h2><p class="mut">Emissão dos bilhetes após pagamento confirmado.</p><div class="priority"><strong>Verificando conexão...</strong></div>';
    if(p==='orders')app.prepend(card);else app.appendChild(card);

    try{
      const d=await loadOfficial();
      const b=d.bootstrap||{};
      const authorized=Boolean(b.authorized);
      const draw=d.draw||{};
      const drawOk=Boolean(draw&&draw.drawId&&!draw.isDrawClosed);
      const status=authorized&&drawOk?'ok':authorized?'warn':'bad';
      card.innerHTML='<span class="eyebrow">INTEGRAÇÃO OFICIAL</span><h2>REINO DA SORTE</h2>'+
        '<p class="mut">Emissão automática dos bilhetes depois da confirmação do pagamento.</p>'+
        '<div class="status '+status+'">'+(authorized?'🟢 Sistema oficial conectado':'🔴 Sistema oficial não autorizado')+'</div>'+
        '<div class="priority" style="margin-top:10px"><strong>Sorteio</strong><span class="mut">'+esc(draw?.drawTitle||draw?.title||draw?.name||'Não consultado')+' • '+(draw?.drawId?'Disponível':'Indisponível')+'</span></div>'+
        (draw?.pricePerTicket!=null?'<div class="priority"><strong>Valor oficial</strong><span class="mut">'+money(draw.pricePerTicket)+'</span></div>':'')+
        (draw?.totalBooklets!=null?'<div class="priority"><strong>Disponibilidade</strong><span class="mut">'+esc(draw.totalBooklets)+'</span></div>':'')+
        '<div class="row" style="margin-top:12px"><button class="btn" type="button" id="rdsOfficialRefreshV2">Atualizar integração</button></div>'+
        (d.error?'<p class="mut" style="margin-top:8px">'+esc(d.error)+'</p>':'');
      document.getElementById('rdsOfficialRefreshV2')?.addEventListener('click',async()=>{
        card.remove();
        await renderOfficialCard();
      });
    }catch(e){
      card.innerHTML='<span class="eyebrow">INTEGRAÇÃO OFICIAL</span><h2>REINO DA SORTE</h2><div class="status bad">🔴 Falha ao consultar integração</div><p class="mut">'+esc(e.message)+'</p>';
    }
  }

  async function renderAutoStatus(){
    const p=window.page||localStorage.getItem('rds_current_page')||'home';
    if(p!=='orders')return;
    const box=document.getElementById('rdsOfficialAutoStatusV2');
    if(box)return;
    const app=document.querySelector('#app');if(!app)return;
    const holder=document.createElement('section');
    holder.id='rdsOfficialAutoStatusV2';
    holder.className='card';
    holder.innerHTML='<span class="eyebrow">PÓS-PAGAMENTO</span><h2>Emissão automática</h2><p class="mut">Pagamento confirmado → emissão oficial → envio ao WhatsApp → conclusão.</p>';
    const target=app.querySelector('.rds-issuer-card,#rdsOfficialIntegrationV2');
    if(target)target.after(holder);else app.prepend(holder);
    try{
      const d=await json('/api/v1012/official-sales/auto-status');
      const pending=Array.isArray(d.pending)?d.pending:[];
      holder.innerHTML='<span class="eyebrow">PÓS-PAGAMENTO</span><h2>Emissão automática</h2><p class="mut">Pagamento confirmado → emissão oficial → envio ao WhatsApp → conclusão.</p>'+
        (pending.length?pending.map(o=>'<div class="priority"><div><strong>'+esc(o.code)+'</strong><small>'+esc(o.official_issue_status||'AGUARDANDO EMISSÃO')+'</small></div><span class="badge warn">'+esc(o.official_issue_error||'Na fila')+'</span></div>').join(''):'<div class="status ok">🟢 Nenhum pedido aguardando emissão.</div>');
    }catch(e){holder.innerHTML+='<p class="mut">Status automático indisponível neste momento.</p>';}
  }

  window.rdsEmitTickets=async id=>{
    try{
      const d=await json('/api/operator/orders');
      const orders=Array.isArray(d?.orders)?d.orders:[];
      const o=orders.find(x=>String(x.id)===String(id));
      if(!o)throw new Error('Pedido não encontrado para este vendedor.');
      if(o.status!=='PAGO_AGUARDANDO_BILHETES')throw new Error('O pedido precisa estar em PAGO_AGUARDANDO_BILHETES.');
      const r=await json('/api/v1012/official-sales/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:o.customer_name,customerPhone:o.phone||o.contact_phone,quantityBooklets:o.quantity,paymentMethod:o.payment_method||'pix'})});
      const saleId=String(r.data?.saleId||r.data?.id||r.data?.data?.saleId||'');
      await json('/api/operator/orders/'+encodeURIComponent(id)+'/tickets-sent',{method:'POST'});
      alert('🟢 Emissão oficial concluída'+(saleId?' — venda '+saleId:'')+'.');
      if(typeof window.rdsRenderCurrentPage==='function')await window.rdsRenderCurrentPage();
    }catch(e){alert(e.message||'Falha na emissão oficial.');throw e;}
  };

  window.rdsOfficialFinalMaybeRender=()=>{
    const p=window.page||localStorage.getItem('rds_current_page')||'home';
    if(['orders','account'].includes(p)){renderOfficialCard();if(p==='orders')renderAutoStatus();}
  };
  setTimeout(()=>window.rdsOfficialFinalMaybeRender?.(),300);
})();