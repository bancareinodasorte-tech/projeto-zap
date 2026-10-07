(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const json=async(u,o={})=>{
    const ac=new AbortController();
    const tm=setTimeout(()=>ac.abort(),8000);
    try{
      const r=await fetch(u,{cache:'no-store',...o,signal:ac.signal});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.message||d.error||'Falha na operação.');
      return d;
    }catch(e){
      if(e?.name==='AbortError')throw new Error('A integração oficial demorou para responder.');
      throw e;
    }finally{clearTimeout(tm);}
  };

  async function loadOfficial(){
    const b=await json('/api/v1011/official-sales/bootstrap');
    let status=null,draw=null,draws=[],statusError=null,drawError=null;
    if(b?.emailConfigured){
      try{status=await json('/api/v1011/official-sales/status');}catch(e){statusError=e;}
    }
    if(status?.authenticated||b?.authorized){
      try{const d=await json('/api/v1011/official-sales/draws');draws=Array.isArray(d?.data)?d.data:[];}catch(e){drawError=e;}
      if(!draws.length){
        try{const d=await json('/api/v1011/official-sales/draw-info');draw=d?.data||d;}catch(e){if(!drawError)drawError=e;}
      }
    }
    return {bootstrap:b||{},status,draw,draws,statusError,drawError};
  }

  function authModal(){
    document.querySelector('.rds-official-auth-modal')?.remove();
    const m=document.createElement('div');
    m.className='modal rds-official-auth-modal';
    m.innerHTML='<div><div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="rdsOfficialAuthClose">✕</button></div><span class="eyebrow">AUTORIZAÇÃO DO SERVIDOR</span><h2>Autorizar dispositivo</h2><p>Digite o código gerado pelo administrador do sistema oficial do REINO DA SORTE.</p><input id="rdsOfficialAuthCode" class="input-field" autocomplete="off" placeholder="Código de autorização"><div class="row" style="margin-top:12px"><button class="btn primary" type="button" id="rdsOfficialAuthSubmit">Autorizar</button></div><p id="rdsOfficialAuthMsg" class="mut"></p></div>';
    document.body.appendChild(m);
    document.getElementById('rdsOfficialAuthClose')?.addEventListener('click',()=>m.remove());
    document.getElementById('rdsOfficialAuthSubmit')?.addEventListener('click',async()=>{
      const code=String(document.getElementById('rdsOfficialAuthCode')?.value||'').trim();
      const msg=document.getElementById('rdsOfficialAuthMsg');
      if(!code){msg.textContent='Digite o código de autorização.';return;}
      msg.textContent='Autorizando dispositivo...';
      try{
        await json('/api/v1011/official-sales/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorizationCode:code})});
        m.remove();
        alert('🟢 Dispositivo oficial autorizado com sucesso.');
        await renderOfficialCard(true);
      }catch(e){msg.textContent=e.message||'Código inválido ou expirado.';}
    });
    document.getElementById('rdsOfficialAuthCode')?.focus();
  }

  async function renderOfficialCard(force=false){
    const app=document.querySelector('#app');
    if(!app)return;
    const p=window.page||localStorage.getItem('rds_current_page')||'home';
    if(p!=='orders')return;
    const old=document.getElementById('rdsOfficialIntegrationV2');
    if(old&&!force)return;
    if(window.__rdsOfficialFinalRenderBusy)return;
    window.__rdsOfficialFinalRenderBusy=true;

    const card=old||document.createElement('section');
    const isNewCard=!old;
    if(isNewCard){
      card.id='rdsOfficialIntegrationV2';
      card.className='card rds-issuer-card';
    }

    try{
      const d=await loadOfficial();
      const b=d.bootstrap||{};
      const authorized=Boolean(d.status?.authenticated||b.authorized);
      const draw=d.draw||{};
      const draws=Array.isArray(d.draws)?d.draws:[];
      const activeDraws=draws.filter(x=>x?.active!==false && x?.isDrawClosed!==true && x?.closed!==true);
      const drawOk=Boolean(draw?.drawId&&!draw?.isDrawClosed);
      let stateHtml='';
      if(authorized){
        stateHtml='<div class="status ok">🟢 Sistema oficial autorizado</div>';
      }else if(b.emailConfigured){
        stateHtml='<div class="status bad">🔴 Sistema oficial não autorizado</div><p class="mut" style="margin-top:8px">O dispositivo do servidor precisa estar autorizado para a emissão automática.</p>';
      }else{
        stateHtml='<div class="status bad">🔴 Credenciais oficiais não configuradas</div>';
      }

      const action=authorized
        ? '<button class="btn" type="button" id="rdsOfficialRefreshV2">Atualizar integração</button>'
        : (b.emailConfigured
          ? '<div class="row"><button class="btn primary" type="button" id="rdsOfficialAuthorizeV2">Autorizar este dispositivo</button><button class="btn" type="button" id="rdsOfficialRefreshV2">Atualizar integração</button></div>'
          : '<button class="btn" type="button" id="rdsOfficialRefreshV2">Atualizar integração</button>');

      card.innerHTML='<span class="eyebrow">INTEGRAÇÃO OFICIAL</span><h2>REINO DA SORTE</h2>'+
        '<p class="mut">Emissão automática dos bilhetes depois da confirmação do pagamento.</p>'+
        stateHtml+
        (activeDraws.length?'<div style="margin-top:14px"><div class="priority" style="margin-bottom:8px"><strong>Sorteios oficiais disponíveis</strong><span class="mut">'+activeDraws.length+' ativo(s)</span></div>'+activeDraws.map(x=>{
        const available=x.available_booklets;
        const availableText=available!=null?Number(available).toLocaleString('pt-BR')+' bilhetes disponíveis':'Disponibilidade não informada';
        return '<div class="priority" style="display:block;padding:14px 16px;margin-top:8px"><div style="font-weight:700;font-size:16px;line-height:1.25">'+esc(x.title||x.drawTitle||x.name||'Sorteio sem título')+'</div><div class="mut" style="margin-top:7px;display:flex;flex-wrap:wrap;gap:6px 14px;line-height:1.35"><span>Sorteio '+esc(x.external_draw_id||x.drawId||x.id||'—')+'</span>'+(x.price_per_ticket!=null?'<span>'+money(x.price_per_ticket)+'</span>':'')+'<span>'+esc(availableText)+'</span></div></div>';
      }).join('')+'</div>':'<div class="priority" style="margin-top:10px"><strong>Sorteio oficial</strong><span class="mut">'+esc(draw?.drawTitle||draw?.title||draw?.name||'Nenhum sorteio disponível')+'</span></div>')+
        '<div class="row" style="margin-top:12px">'+action+'</div>'+
        (d.statusError&&!authorized?'<p class="mut" style="margin-top:8px">'+esc(d.statusError.message||d.statusError)+'</p>':'')+
        (d.drawError?'<p class="mut" style="margin-top:8px">'+esc(d.drawError.message||d.drawError)+'</p>':'')+
        '<p class="mut" style="margin-top:8px">Dispositivo: '+esc(b.deviceId||'—')+'</p>';

      document.getElementById('rdsOfficialAuthorizeV2')?.addEventListener('click',authModal);
      card.querySelector('#rdsOfficialRefreshV2')?.addEventListener('click',()=>renderOfficialCard(true));
      if(isNewCard && !card.isConnected) app.prepend(card);

    }catch(e){
      if(isNewCard){
        card.innerHTML='<span class="eyebrow">INTEGRAÇÃO OFICIAL</span><h2>REINO DA SORTE</h2><div class="status bad">🔴 Falha ao consultar integração</div><p class="mut">'+esc(e.message)+'</p><div class="row" style="margin-top:12px"><button class="btn" type="button" id="rdsOfficialRefreshV2">Tentar novamente</button></div>';
        card.querySelector('#rdsOfficialRefreshV2')?.addEventListener('click',()=>renderOfficialCard(true));
        if(!card.isConnected) app.prepend(card);
      }else{
        console.warn('RDS integração oficial: atualização silenciosa falhou',e);
      }
    }finally{
      window.__rdsOfficialFinalRenderBusy=false;
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
    const target=app.querySelector('#rdsOfficialIntegrationV2,.rds-issuer-card');
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
      const r=await json('/api/v1011/official-sales/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id})});
      const saleId=String(r.data?.saleId||r.data?.id||r.data?.data?.saleId||'');
      await json('/api/operator/orders/'+encodeURIComponent(id)+'/tickets-sent',{method:'POST'});
      alert('🟢 Emissão oficial concluída'+(saleId?' — venda '+saleId:'')+'.');
      if(typeof window.rdsRenderCurrentPage==='function')await window.rdsRenderCurrentPage();
    }catch(e){alert(e.message||'Falha na emissão oficial.');throw e;}
  };

  window.rdsOfficialFinalMaybeRender=()=>{
    const p=window.page||localStorage.getItem('rds_current_page')||'home';
    if(p==='orders'){renderOfficialCard();renderAutoStatus();}
  };
  setTimeout(()=>window.rdsOfficialFinalMaybeRender?.(),300);
})();