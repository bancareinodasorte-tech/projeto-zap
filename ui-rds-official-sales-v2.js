(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const clean=v=>String(v??'').trim();
  const textOf=o=>clean(o?.name||o?.sellerName||o?.fullName||o?.user?.name||o?.data?.name||o?.data?.sellerName||'');
  const drawOf=o=>o?.data||o||{};
  const modal=html=>{const m=document.createElement('div');m.className='modal';m.innerHTML=`<div><div class="row" style="justify-content:flex-end"><button class="btn" onclick="this.closest('.modal').remove()">✕</button></div>${html}</div>`;document.body.appendChild(m);return m};
  const toastSafe=m=>{try{toast(m)}catch{alert(m)}};

  async function officialStatus(){
    const r=await fetch('/api/v1011/official-sales/status',{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.message||'Falha ao consultar autenticação oficial.');
    return d;
  }
  async function officialDraw(){
    const r=await fetch('/api/v1011/official-sales/draw-info',{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.success===false)throw new Error(d.message||'Falha ao consultar o sorteio oficial.');
    return drawOf(d.data);
  }

  async function renderOfficialCard(){
    const old=document.getElementById('rdsIssuerCard');
    if(old)old.style.display='none';
    if(document.getElementById('rdsOfficialSalesCard'))return;
    const app=document.querySelector('#app');
    if(!app||!app.innerHTML.includes('<h1>Ajustes</h1>'))return;
    const card=document.createElement('div');
    card.id='rdsOfficialSalesCard';card.className='card rds-issuer-card';
    card.innerHTML='<span class="eyebrow">INTEGRAÇÃO OFICIAL</span><h2>Sistema de vendas REINO DA SORTE</h2><p class="mut">Conexão direta com o sistema oficial de emissão. O CANAL DE VENDAS usa o vendedor oficial e o sorteio ativo para emitir os bilhetes.</p><div id="rdsOfficialState" class="priority"><strong>Verificando conexão oficial...</strong></div><div id="rdsOfficialDraw" class="priority"><strong>Consultando sorteio...</strong></div><div class="row"><button class="btn primary" onclick="rdsOfficialRefreshSettings()">Atualizar conexão</button></div>';
    app.appendChild(card);
    try{
      const s=await officialStatus();
      const state=document.getElementById('rdsOfficialState');
      if(!state)return;
      if(!s.configured){
        state.innerHTML='<strong>🔴 Conexão oficial não configurada no servidor.</strong><p class="mut">A integração já está instalada, mas o acesso seguro do vendedor oficial ainda precisa ser configurado no Render. Nenhum token é exibido neste painel.</p>';
      }else if(!s.authenticated){
        state.innerHTML=`<strong>🟠 Vendedor oficial não autenticado.</strong><p class="mut">${esc(s.message||'A sessão oficial precisa ser renovada.')}</p>`;
      }else{
        const seller=textOf(s.seller)||'Vendedor oficial';
        state.innerHTML=`<strong>🟢 Vendedor oficial conectado</strong><p class="mut">${esc(seller)}</p>`;
      }
      try{
        const d=await officialDraw();
        const draw=document.getElementById('rdsOfficialDraw');
        if(draw){
          const title=clean(d.drawTitle||d.title||d.name)||'Sorteio ativo';
          const price=money(d.pricePerTicket);
          const available=d.totalBooklets??d.availableBooklets??'—';
          const closed=d.isDrawClosed===true;
          draw.innerHTML=`<strong>${closed?'🔴 Sorteio encerrado':'🟢 Sorteio oficial disponível'}</strong><p class="mut">${esc(title)} • ID ${esc(d.drawId||'—')} • ${esc(price)} • ${esc(available)} bloco(s) disponíveis</p>`;
        }
      }catch(e){
        const draw=document.getElementById('rdsOfficialDraw');if(draw)draw.innerHTML=`<strong>🟠 Sorteio não consultado</strong><p class="mut">${esc(e.message)}</p>`;
      }
    }catch(e){
      const state=document.getElementById('rdsOfficialState');if(state)state.innerHTML=`<strong>🔴 Falha na integração oficial</strong><p class="mut">${esc(e.message)}</p>`;
      const draw=document.getElementById('rdsOfficialDraw');if(draw)draw.innerHTML='<strong>—</strong><p class="mut">O sorteio será consultado após a autenticação.</p>';
    }
  }
  window.rdsOfficialRefreshSettings=()=>{const c=document.getElementById('rdsOfficialSalesCard');if(c)c.remove();renderOfficialCard()};

  window.rdsEmitTickets=async id=>{
    try{
      const orders=await fetch('/api/orders',{cache:'no-store'}).then(r=>r.json());
      const o=(orders||[]).find(x=>x.id===id);if(!o)throw new Error('Pedido não encontrado.');
      const quantity=Math.max(1,Number(o.quantity||1));
      const customerName=clean(o.customer_name||o.name||'');
      const customerPhone=clean(o.phone||o.contact_phone||o.customer_phone||'');
      if(!customerName)throw new Error('O pedido não possui nome do cliente.');
      if(!customerPhone)throw new Error('O pedido não possui telefone do cliente.');
      const m=modal('<span class="eyebrow">EMISSÃO OFICIAL</span><h2>'+esc(o.code)+'</h2><p>Pedido pago. Preparando emissão no sistema oficial REINO DA SORTE.</p><div class="card"><strong>Cliente:</strong> '+esc(customerName)+'<br><strong>Quantidade:</strong> '+quantity+' bloco(s)<br><strong>Total:</strong> '+money(o.total_amount)+'</div><p class="mut">A numeração será definida exclusivamente pelo sistema oficial.</p>');
      const r=await fetch('/api/v1011/official-sales/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName,customerPhone,quantityBooklets:quantity,paymentMethod:'pix',lotNumber:1})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||d.success===false)throw new Error(d.message||'O sistema oficial recusou a emissão.');
      const sale=d.data||{};const b=Array.isArray(sale.booklets)?sale.booklets:[];
      const allTickets=b.flatMap(x=>Array.isArray(x.tickets)?x.tickets:[]);
      const summary=b.map(x=>String(x.bookletNumber).padStart(4,'0')+'-'+String(x.lotNumber??1)).join(', ');
      m.querySelector('div').insertAdjacentHTML('beforeend',`<div class="card"><strong>🟢 EMISSÃO OFICIAL CONCLUÍDA</strong><p class="mut">Venda ${esc(sale.saleId||'—')} • ${esc(summary||'bloco emitido')} • ${allTickets.length} número(s)</p><p class="mut">Os números vieram diretamente da API oficial.</p><div class="row"><button class="btn success" onclick="document.querySelector('.modal')?.remove();rdsCompleteTickets('${esc(id)}')">Concluir entrega</button></div></div>`);
    }catch(e){document.querySelector('.modal')?.remove();toastSafe(e.message||'Falha na emissão oficial.');}
  };

  function boot(){
    renderOfficialCard();
    const obs=new MutationObserver(()=>renderOfficialCard());
    const app=document.getElementById('app');if(app)obs.observe(app,{childList:true,subtree:true});
    setInterval(()=>{if(document.querySelector('#app')?.innerHTML.includes('<h1>Ajustes</h1>'))renderOfficialCard()},2000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
