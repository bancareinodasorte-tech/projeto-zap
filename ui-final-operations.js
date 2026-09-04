(()=>{
  const statusNames={
    COLETANDO_DADOS:'Coletando dados',
    AGUARDANDO_PAGAMENTO:'Aguardando PIX',
    AGUARDANDO_CONFERENCIA:'Comprovante recebido',
    PAGO_AGUARDANDO_BILHETES:'Pagamento confirmado',
    CONCLUIDO:'Concluído',
    CANCELADO:'Cancelado'
  };
  const statusText=s=>statusNames[String(s||'')]||String(s||'—').replaceAll('_',' ');
  const esc2=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  window.rdsOrderDetails=async function(id){
    try{
      const o=(state.orders||[]).find(x=>x.id===id)||await api('/api/orders').then(xs=>xs.find(x=>x.id===id));
      if(!o)throw new Error('Pedido não encontrado.');
      const paid=['PAGO_AGUARDANDO_BILHETES','CONCLUIDO'].includes(String(o.status||''));
      modal(`<span class=eyebrow>Detalhes da compra</span><h2>${esc2(o.code)}</h2><div class=card style="margin:10px 0"><p><b>Cliente:</b> ${esc2(o.customer_name||'Não informado')}</p><p><b>WhatsApp:</b> ${esc2(o.phone||o.contact_phone||'—')}</p><p><b>Quantidade:</b> ${o.quantity||0} bilhete(s)</p><p><b>Total:</b> ${money(o.total_amount||0)}</p><p><b>Status:</b> ${badge(statusText(o.status))}</p><p><b>Criado:</b> ${dt(o.created_at)}</p>${o.updated_at?`<p><b>Atualizado:</b> ${dt(o.updated_at)}</p>`:''}${o.pagbank_status?`<p><b>PagBank:</b> ${esc2(o.pagbank_status)}</p>`:''}${o.pix_expires_at&&o.status==='AGUARDANDO_PAGAMENTO'?`<p><b>PIX válido até:</b> ${dt(o.pix_expires_at)}</p>`:''}</div><div class=row>${o.status==='AGUARDANDO_CONFERENCIA'?btn('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${o.status==='PAGO_AGUARDANDO_BILHETES'?btn('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!paid&&!['CANCELADO'].includes(String(o.status||''))?btn('Cancelar pedido',`cancelOrder('${o.id}')`,'btn danger'):''}</div>`);
    }catch(e){toast(e.message)}
  };

  window.orders=async function(){
    state.orders=await api('/api/orders');
    const groups={COLETANDO_DADOS:'Coletando dados',AGUARDANDO_PAGAMENTO:'Aguardando PIX',AGUARDANDO_CONFERENCIA:'Comprovante',PAGO_AGUARDANDO_BILHETES:'Pagamento confirmado',CONCLUIDO:'Concluídos',CANCELADO:'Cancelados'};
    const active=state.orders.filter(o=>!['CONCLUIDO','CANCELADO'].includes(String(o.status||''))).length;
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Operação de vendas</span><h1>Compras</h1><p class=mut>Controle completo do pedido, pagamento e envio dos bilhetes.</p></div><div class=row>${badge(active+' pedido(s) em andamento')}</div></div>
    <div class=funnel>${Object.entries(groups).map(([k,n])=>`<div><span class=eyebrow>${n}</span><div class=metric>${state.orders.filter(o=>o.status===k).length}</div></div>`).join('')}</div>
    ${state.orders.map(o=>`<div class="card rds-final-order"><div class=row style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${esc2(o.code)}</h2><p class=mut>${esc2(o.customer_name||o.phone||'Cliente')} • ${o.quantity||'—'} bilhete(s) • <b>${money(o.total_amount||0)}</b></p><p class=mini>${dt(o.created_at)}${o.pagbank_status?' • PagBank: '+esc2(o.pagbank_status):''}</p></div>${badge(statusText(o.status))}</div><div class=row>${btn('Ver detalhes',`rdsOrderDetails('${o.id}')`)}${o.status==='AGUARDANDO_PAGAMENTO'?btn('Pagamentos',"go('payments')",'btn primary'):''}${o.status==='AGUARDANDO_CONFERENCIA'?btn('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${o.status==='PAGO_AGUARDANDO_BILHETES'?btn('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(o.status||''))?btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`).join('')||'<div class="card empty-state">Nenhum pedido registrado.</div>'}`;
  };

  window.settings=async function(){
    state.settings=await api('/api/settings');
    const [wa,pb]=await Promise.all([api('/api/status'),api('/api/pagbank/status').catch(()=>({configured:false,environment:'sandbox'}))]);
    const connected=!!wa.connected;
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Configuração protegida</span><h1>Ajustes</h1><p class=mut>Conexão do canal, regras comerciais e integração de pagamentos.</p></div>${btn('Diagnóstico','showDiag()')}</div>
    <div class=action-center>
      <div class=card><h2>WhatsApp</h2><p>${badge(connected?'CONECTADO':'DESCONECTADO')} ${esc2(wa.number||'')}</p>${wa.qrDataUrl?`<img src="${wa.qrDataUrl}" style="max-width:260px;border-radius:14px">`:''}<p class=mut>${connected?'A sessão está ativa e persistida. Não é necessário gerar novo QR.':'A conexão ainda não está ativa.'}</p><div class=row>${!connected?btn('Iniciar conexão','connectWA()', 'btn primary'):''}</div><label>Telefone para teste</label><input id=testphone placeholder="DDD + número"><div class=row>${btn('Enviar teste','testWA()')}</div></div>
      <div class=card><h2>Bot comercial</h2><label><input type=checkbox id=botEnabled style="width:auto" ${state.settings.bot_enabled?'checked':''}> Bot ativo</label><label>WhatsApp do escritório</label><input id=office value="${esc2(state.settings.office_whatsapp||'')}"><label>Preço padrão</label><input id=unitPrice type=number step=.01 value="${state.settings.unit_price||3}"><label>Chave PIX</label><input id=pixKey value="${esc2(state.settings.pix_key||'')}"><label>Favorecido</label><input id=pixName value="${esc2(state.settings.pix_name||'')}"><label>Mensagem final</label><textarea id=finalMsg>${esc2(state.settings.final_message||'')}</textarea><div class=row>${btn('Salvar ajustes','saveSettings()','btn primary')}</div></div>
    </div>
    <div class=card><h2>PagBank</h2><div class=row>${badge(pb.configured?'PAGBANK '+String(pb.environment||'').toUpperCase():'NÃO CONFIGURADO')}</div><p class=mut>${pb.environment==='production'?'Ambiente de Produção configurado. A liberação/homologação da API Orders está pendente no PagBank.':'Ambiente Sandbox.'}</p><p class=mini>O token não é exibido neste painel.</p></div>`;
  };

  // Nunca forçar reconexão pela tela de Ajustes: a sessão persistida não deve ser substituída sem necessidade.
  window.connectWA=async function(){try{await post('/api/whatsapp/connect',{force:false});toast('Conexão iniciada.');setTimeout(settings,1200)}catch(e){toast(e.message)}};
  // A função permanece disponível para compatibilidade interna, mas não é oferecida como botão no painel.
  window.logoutWA=async function(){toast('Desconexão manual desabilitada nesta tela para proteger a sessão do WhatsApp.');};

  const oldRender=window.render;
  window.render=async function(){
    app.innerHTML='<div class="card"><span class=mut>Carregando operação...</span></div>';
    try{
      if(page==='home')await home();
      else if(page==='contacts')await contacts();
      else if(page==='campaigns')await campaigns();
      else if(page==='execution')await automation();
      else if(page==='returns')await returnsPage();
      else if(page==='payments')await paymentsPage();
      else if(page==='orders')await orders();
      else if(page==='settings')await settings();
    }catch(e){app.innerHTML=`<div class=card><h2>Não foi possível carregar</h2><p>${esc2(e.message)}</p></div>`}
  };

  const style=document.createElement('style');
  style.textContent='.rds-final-order{transition:transform .15s ease,box-shadow .15s ease}.rds-final-order:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(19,54,96,.11)}';
  document.head.appendChild(style);
})();
