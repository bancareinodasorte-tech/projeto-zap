(()=>{
const F=async(u,ms=8000)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(u,{headers:{'Content-Type':'application/json'},signal:c.signal}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha na operação');return d}finally{clearTimeout(t)}};
const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const M=v=>typeof money==='function'?money(v):`R$ ${Number(v||0).toFixed(2).replace('.',',')}`,D=v=>typeof dt==='function'?dt(v):new Date(v).toLocaleString('pt-BR'),B=v=>typeof badge==='function'?badge(v):`<span class="badge">${E(v)}</span>`,T=(t,f,c='btn')=>typeof btn==='function'?btn(t,f,c):`<button class="${c}" onclick="${f}">${E(t)}</button>`,W=p=>`https://wa.me/${String(p||'').replace(/\D/g,'')}`;
const G=[['COLETANDO_DADOS','Em atendimento'],['AGUARDANDO_PAGAMENTO','Aguardando PIX'],['AGUARDANDO_CONFERENCIA','Conferir pagamento'],['PAGO_AGUARDANDO_BILHETES','Enviar bilhetes'],['CONCLUIDO','Concluídas'],['CANCELADO','Cancelados']];
async function home(){const d=await F('/api/dashboard'),cs=await F('/api/contacts').catch(()=>[]),n=cs.filter(c=>!c.opted_out&&String(c.status||'').toUpperCase()!=='INATIVO'&&/INTERESSADOS/i.test(String(c.group_name||''))).length;app.innerHTML=`<div class="page-title"><div><span class="eyebrow">Operação comercial</span><h1>Central de Vendas</h1><p class="mut">O que precisa de atenção agora, sem ruído.</p></div>${T('Nova campanha',"go('campaigns')",'btn primary')}</div><div class="grid">${[['Clientes ativos',n],['Campanhas',d.campaigns],['Na fila',d.queue],['Enviadas',d.sent],['Retornos',d.returns],['Pedidos',d.orders],['Compras',d.purchases],['Receita',M(d.revenue)]].map(x=>`<div class="card metric-card"><span class="eyebrow">${x[0]}</span><div class="metric">${x[1]}</div></div>`).join('')}</div>`}
async function orders(){const rows=await F('/api/operator/orders');state.orders=Array.isArray(rows)?rows:(rows.orders||[]);const cs=G.map(([k,n])=>({k,n,r:state.orders.filter(o=>o.status===k)}));const active=cs.filter(x=>!['CONCLUIDO','CANCELADO'].includes(x.k)).reduce((a,x)=>a+x.r.length,0);app.innerHTML=`<div class="rds-clean-head"><div><span class="eyebrow">Vendas</span><h1>Compras</h1><p class="rds-clean-sub">Pagamento confirmado → emissão → envio dos bilhetes → conclusão.</p></div></div><div class="rds-mini-grid"><div class="card metric-card"><span class="eyebrow">Em andamento</span><div class="metric">${active}</div></div>${cs.slice(0,3).map(x=>`<div class="card metric-card"><span class="eyebrow">${x.n}</span><div class="metric">${x.r.length}</div></div>`).join('')}</div><div class="toolbar rds-orders-toolbar"><input id="rdsOrderSearch" placeholder="Buscar pedido, cliente ou WhatsApp"><select id="rdsOrderStatus"><option value="">Todas as etapas</option>${G.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div><div id="rdsOrdersStages">${cs.map(x=>`<details class="rds-collapse" data-status="${x.k}"><summary><span><b>${x.n}</b><small>${x.r.length} registro(s)</small></span><strong>${x.r.length}</strong></summary><div class="rds-collapse-body">${x.r.map(o=>`<div class="card rds-order-clean"><div class="rds-order-head"><div><h2>${E(o.code)}</h2><p>${E(o.customer_name||o.phone||'Cliente')} • ${o.quantity||0} bilhete(s) • <b>${M(o.total_amount)}</b></p><span class="mini">Criado: ${D(o.created_at)}</span></div>${B(x.n)}</div><div class="rds-action-row">${T('Ver detalhes',`rdsOrderDetails('${o.id}')`)}${x.k==='AGUARDANDO_PAGAMENTO'?T('Pagamentos',"go('payments')",'btn primary'):''}${x.k==='AGUARDANDO_CONFERENCIA'?T('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${x.k==='PAGO_AGUARDANDO_BILHETES'?T('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(x.k)?T('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`).join('')||'<div class="empty-state">Nenhum registro nesta etapa.</div>'}</div></details>`).join('')}</div>`;const s=document.querySelector('#rdsOrderSearch'),f=document.querySelector('#rdsOrderStatus');const apply=()=>{const q=String(s?.value||'').toLowerCase().trim(),st=f?.value||'';document.querySelectorAll('#rdsOrdersStages details').forEach(d=>d.style.display=!st||d.dataset.status===st?'':'none');document.querySelectorAll('.rds-order-clean').forEach(c=>c.style.display=!q||c.textContent.toLowerCase().includes(q)?'':'none')};s?.addEventListener('input',apply);f?.addEventListener('change',apply)}
async function payments(){
  const [rows,fin,control]=await Promise.all([
    F('/api/operator/orders'),
    F('/api/operator/financial-status').catch(()=>({financial:{configured:false,environment:'production'},mercadoPago:{connected:false}})),
    F('/api/billing-control').catch(()=>({hours:4,enabled:true,interval_hours:1,max_reminders:3}))
  ]);
  const exp={hours:Number(control.hours||4)};
  const rem={enabled:control.enabled!==false,interval_hours:Number(control.interval_hours||1),max_reminders:Number(control.max_reminders||3)};
  state.orders=Array.isArray(rows)?rows:(rows.orders||[]);
  const w=state.orders.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
  const p=state.orders.filter(o=>o.status==='AGUARDANDO_CONFERENCIA');
  const paid=state.orders.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
  const done=state.orders.filter(o=>o.status==='CONCLUIDO');
  const cancelled=state.orders.filter(o=>o.status==='CANCELADO'&&!o.cancel_history_hidden_at);
  const mp=fin.mercadoPago||{};
  const configured=Boolean(fin.financial?.configured);
  const provider=configured?'Mercado Pago':'Mercado Pago não configurado';
  const cancelReason=o=>String(o.cancel_reason||'').toUpperCase()==='EXPIRADO_PAGAMENTO'?'Expirado por falta de pagamento':String(o.cancel_reason||'').toUpperCase()==='CANCELAMENTO_MANUAL'?'Cancelado manualmente':String(o.cancel_reason||'').toUpperCase()==='CANCELAMENTO_CLIENTE'?'Cancelado pelo cliente':o.cancel_reason?'Cancelado: '+String(o.cancel_reason).replaceAll('_',' '):'Natureza não registrada';
  const stageLabel=o=>{
    const s=String(o?.status||'').toUpperCase();
    if(s==='AGUARDANDO_PAGAMENTO') return o?.payment_id||o?.payment_provider_id||o?.payment_created_at ? 'PIX enviado • aguardando pagamento' : 'Gerando PIX';
    if(s==='AGUARDANDO_CONFERENCIA') return 'Pagamento recebido • aguardando conferência';
    if(s==='PAGO_AGUARDANDO_BILHETES') return 'Pagamento confirmado • emitindo bilhetes';
    if(s==='CONCLUIDO') return 'Venda concluída';
    if(s==='CANCELADO') return 'Pedido cancelado';
    return 'Em atendimento';
  };
  const waitingCard=o=>`<div class="rds-order rds-payment-open">
    <div class="rds-order-top"><div><h3>${E(o.customer_name||o.phone)}</h3><p>${E(o.code)} • ${o.quantity||0} bilhete(s) • <b>${M(o.total_amount)}</b></p><small class=mini>Criado: ${D(o.created_at)} • Prazo: ${D(o.order_expires_at||new Date(new Date(o.created_at).getTime()+Number(exp.hours||4)*3600000).toISOString())}</small></div><span class="rds-live-stage"><i></i>${E(stageLabel(o))}</span></div>
    <div class="rds-stage-pills"><span class="done">Pedido</span><span class="active">PIX</span><span>Pagamento</span><span>Bilhetes</span><span>Conclusão</span></div>
    <div class="rds-buttons rds-payment-min-actions">
      ${T('Ver detalhes',`rdsOrderDetails('${o.id}')`)}
    </div>
  </div>`;
  const proofCard=o=>`<div class="rds-order">
    <div class="rds-order-top"><div><h3>${E(o.customer_name||o.phone)}</h3><p>${E(o.code)} • ${o.quantity||0} bilhete(s) • <b>${M(o.total_amount)}</b></p><small class=mini>Comprovante recebido: ${D(o.proof_received_at||o.updated_at)}</small></div>${B('CONFERIR PAGAMENTO')}</div>
    <div class=rds-buttons>${T('Confirmar pagamento',`rdsApproveProof('${o.id}')`,'btn success')}${T('Rejeitar comprovante',`rdsRejectProof('${o.id}')`,'btn danger')}${T('Consultar Mercado Pago',`rdsReconcilePix('${o.id}')`)}<a target="_blank" href="${W(o.phone)}">${T('Abrir WhatsApp','')}</a>${T('Ver detalhes',`rdsOrderDetails('${o.id}')`)}</div>
  </div>`;
  const paidCard=o=>`<div class="rds-order">
    <div class="rds-order-top"><div><h3>${E(o.customer_name||o.phone)}</h3><p>${E(o.code)} • ${o.quantity||0} bilhete(s) • <b>${M(o.total_amount)}</b></p><small class=mini>Pagamento confirmado: ${D(o.payment_confirmed_at||o.updated_at)}</small></div><span class="rds-paid-wait-status">PAGO — AGUARDA BILHETES</span></div>
    <div class=rds-buttons>${T('Ver detalhes',`rdsOrderDetails('${o.id}')`)}</div>
  </div>`;
  app.innerHTML=`<div class="rds-clean-head"><div><span class="eyebrow">Financeiro e pós-pagamento</span><h1>Pagamentos</h1><p class="rds-clean-sub">Uma central para cobrar, confirmar, conciliar e encaminhar cada pedido sem perder o histórico.</p></div><div class="row">${T('Configurar Mercado Pago',`go('account')`,'btn')}${B(provider, '', configured?'btn success':'btn danger')}</div></div>
  <div class="rds-mini-grid">
    <div class="card metric-card"><span class=eyebrow>Aguardando PIX</span><div class=metric>${w.length}</div><small>${w.length?'Cobranças abertas':'Nenhuma cobrança pendente'}</small></div>
    <div class="card metric-card"><span class=eyebrow>Conferir pagamento</span><div class=metric>${p.length}</div><small>Comprovantes recebidos</small></div>
    <div class="card metric-card"><span class=eyebrow>Emitir bilhetes</span><div class=metric>${paid.length}</div><small>Pagamentos confirmados</small></div>
    <div class="card metric-card"><span class=eyebrow>Concluídas</span><div class=metric>${done.length}</div><small>Compras finalizadas</small></div>
  </div>
  <div class="rds-section card rds-billing-control"><div class=rds-section-title><div><h2>Controle da cobrança</h2><p class=mut>Mercado Pago ${mp.connected?'conectado':'não confirmado'} • Expiração do pedido: <b>${Number(exp.hours||4)}h</b> • Lembretes: <b>${rem.enabled!==false?'ativos':'desativados'}</b> a cada <b>${Number(rem.interval_hours||1)}h</b>, máximo <b>${Number(rem.max_reminders||3)}</b></p></div><span class="rds-control-status ${rem.enabled!==false?'on':'off'}">${rem.enabled!==false?'COBRANÇA ATIVA':'COBRANÇA INATIVA'}</span></div>
    <div class="rds-control-grid">
      <label class="rds-control-toggle"><span><b>Lembretes de pagamento</b><small>Envia automaticamente o lembrete para pedidos que continuam aguardando PIX.</small></span><input id="rdsReminderEnabled" type="checkbox" ${rem.enabled!==false?'checked':''}></label>
      <label><span>Expiração do pedido</span><select id="rdsExpirationHours"><option value="1" ${Number(exp.hours)==1?'selected':''}>1 hora</option><option value="2" ${Number(exp.hours)==2?'selected':''}>2 horas</option><option value="3" ${Number(exp.hours)==3?'selected':''}>3 horas</option><option value="4" ${Number(exp.hours)==4?'selected':''}>4 horas</option><option value="6" ${Number(exp.hours)==6?'selected':''}>6 horas</option><option value="12" ${Number(exp.hours)==12?'selected':''}>12 horas</option><option value="24" ${Number(exp.hours)==24?'selected':''}>24 horas</option></select></label>
      <label><span>Intervalo dos lembretes</span><select id="rdsReminderInterval"><option value="0.5" ${Number(rem.interval_hours)==0.5?'selected':''}>A cada 30 minutos</option><option value="1" ${Number(rem.interval_hours)==1?'selected':''}>A cada 1 hora</option><option value="2" ${Number(rem.interval_hours)==2?'selected':''}>A cada 2 horas</option><option value="3" ${Number(rem.interval_hours)==3?'selected':''}>A cada 3 horas</option><option value="6" ${Number(rem.interval_hours)==6?'selected':''}>A cada 6 horas</option><option value="12" ${Number(rem.interval_hours)==12?'selected':''}>A cada 12 horas</option></select></label>
      <label><span>Máximo de lembretes</span><select id="rdsReminderMax"><option value="1" ${Number(rem.max_reminders)==1?'selected':''}>1 lembrete</option><option value="2" ${Number(rem.max_reminders)==2?'selected':''}>2 lembretes</option><option value="3" ${Number(rem.max_reminders)==3?'selected':''}>3 lembretes</option><option value="4" ${Number(rem.max_reminders)==4?'selected':''}>4 lembretes</option><option value="5" ${Number(rem.max_reminders)==5?'selected':''}>5 lembretes</option></select></label>
    </div>
    <div class="rds-control-footer"><small>O sistema ajusta automaticamente o intervalo e o máximo de lembretes para que nenhum lembrete coincida com a expiração. As alterações valem para os próximos ciclos; pedidos pagos ou encerrados não recebem novos lembretes.</small><button class="btn primary" type="button" id="rdsSaveBillingControl">Salvar controle</button></div>
  </div>
  <div class="rds-section card"><div class=rds-section-title><h2>Cobranças PIX abertas</h2><span class=mini>${w.length} pedido(s)</span></div><div class=rds-order-list>${w.map(waitingCard).join('')||'<div class=rds-empty>Nenhum pedido aguardando PIX no momento.</div>'}</div></div>
  <div class="rds-section card"><div class=rds-section-title><h2>Comprovantes recebidos</h2><span class=mini>${p.length} pedido(s)</span></div><div class=rds-order-list>${p.map(proofCard).join('')||'<div class=rds-empty>Nenhum comprovante aguardando conferência.</div>'}</div></div>
  <div class="rds-section card"><div class=rds-section-title><h2>Pagamentos confirmados</h2><span class=mini>${paid.length} pedido(s)</span></div><div class=rds-order-list>${paid.map(paidCard).join('')||'<div class=rds-empty>Nenhum pagamento confirmado aguardando emissão.</div>'}</div></div>
  <div class="rds-section card rds-cancel-history"><div class=rds-section-title><h2>Histórico de cancelamentos</h2><span class=mini id=rdsCancelCount>${cancelled.length} pedido(s)</span></div>
  <div class="toolbar rds-cancel-toolbar"><input id="rdsCancelSearch" type="search" placeholder="Buscar pedido, cliente ou WhatsApp" autocomplete="off"><select id="rdsCancelLimit" aria-label="Quantidade de cancelamentos"><option value="10" selected>Mostrar 10</option><option value="25">Mostrar 25</option><option value="50">Mostrar 50</option><option value="100">Mostrar 100</option></select><button class="btn danger" type="button" id="rdsCancelClear">Limpar histórico</button></div>
  <div id="rdsCancelList" class="rds-order-list">${cancelled.slice(0,10).map(o=>{const label=String(o.customer_name||o.phone||"Cliente");const reason=cancelReason(o);const search=String([o.code,label,o.phone,reason].filter(Boolean).join(" ")).toLowerCase().replace(/"/g,"&quot;");return '<details class="rds-cancel-item" data-search="'+search+'"><summary><span><b>'+E(o.code)+'</b><small>'+E(label)+' • Encerrado: '+D(o.cancelled_at||o.updated_at)+'</small></span><strong>›</strong></summary><div class="rds-cancel-body"><div class="rds-cancel-meta"><span>'+(o.quantity||0)+' bilhete(s)</span><b>'+M(o.total_amount)+'</b><span>CANCELADO</span></div><p class=mut><b>Natureza:</b> '+E(reason)+'</p><div class=rds-buttons><button class="btn" onclick="rdsOrderDetails(\'${o.id}\')">Ver detalhes</button></div></div></details>'}).join("")||"<div class=rds-empty>Nenhum cancelamento registrado.</div>"}</div>
  </div>`;;
}
  function bindBillingControl(){
    const b=document.getElementById('rdsSaveBillingControl'); if(!b||b.dataset.bound==='1')return; b.dataset.bound='1';
    const enabled=document.getElementById('rdsReminderEnabled'), expH=document.getElementById('rdsExpirationHours'), interval=document.getElementById('rdsReminderInterval'), max=document.getElementById('rdsReminderMax'), status=document.querySelector('.rds-control-status');
    const sync=()=>{if(status){status.textContent=enabled?.checked?'COBRANÇA ATIVA':'COBRANÇA INATIVA';status.className='rds-control-status '+(enabled?.checked?'on':'off');}};
    const reconcile=()=>{
      const h=Number(expH?.value||4);
      const allowed=[0.5,1,2,3,4,6,12].filter(x=>x<h);
      if(enabled?.checked && interval && allowed.length && !allowed.includes(Number(interval.value))) interval.value=String(allowed[allowed.length-1]);
      if(enabled?.checked && max && interval){
        const safe=Math.max(1,Math.min(5,Math.ceil(h/Number(interval.value||1))-1));
        if(Number(max.value)>safe)max.value=String(safe);
      }
    };
    enabled?.addEventListener('change',()=>{sync();reconcile();});
    expH?.addEventListener('change',reconcile);
    interval?.addEventListener('change',reconcile);
    sync(); reconcile();
    b.addEventListener('click',async()=>{
      b.disabled=true;b.textContent='Salvando...';
      try{
        const x=await fetch('/api/billing-control',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:Boolean(enabled?.checked),hours:Number(expH?.value||4),interval_hours:Number(interval?.value||1),max_reminders:Number(max?.value||3)})});
        const xd=await x.json().catch(()=>({}));if(!x.ok||xd.ok!==true)throw new Error(xd.error||'Não foi possível confirmar o controle da cobrança.');
        toast?.('Controle da cobrança salvo e confirmado.'); await payments();
      }catch(e){toast?.(e.message||'Não foi possível salvar.');b.disabled=false;b.textContent='Salvar controle';}
    });
  }
  function ensureBillingStyles(){
    if(document.getElementById('rdsBillingStyles'))return;const s=document.createElement('style');s.id='rdsBillingStyles';
    s.textContent=".rds-billing-control .rds-section-title{align-items:flex-start}.rds-control-status{font-size:10px;font-weight:900;letter-spacing:.08em;border-radius:999px;padding:7px 10px;white-space:nowrap}.rds-control-status.on{background:#e6f7ed;color:#207444}.rds-control-status.off{background:#f8e9e9;color:#a13c3c}.rds-control-grid{display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:12px;margin-top:14px;align-items:stretch}.rds-control-grid label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:800;color:#5e7089}.rds-control-grid label>span{font-size:12px}.rds-control-grid select{min-height:42px;border:1px solid rgba(30,70,120,.18);border-radius:12px;padding:0 11px;background:#fff;color:#17355d;font-weight:800}.rds-control-toggle{display:flex!important;flex-direction:row!important;justify-content:space-between;align-items:center;border:1px solid rgba(30,70,120,.12);border-radius:14px;padding:10px 12px;background:#f8fbff}.rds-control-toggle span{display:flex;flex-direction:column;gap:3px}.rds-control-toggle b{color:#17355d}.rds-control-toggle small{font-weight:500;color:#71809a;line-height:1.25}.rds-control-toggle input{width:46px;height:24px;accent-color:#1684dc}.rds-control-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:13px;padding-top:12px;border-top:1px solid rgba(30,70,120,.10)}.rds-control-footer small{color:#71809a;line-height:1.3}.rds-live-stage{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:900;color:#1f6e49;background:#eaf8ef;border-radius:999px;padding:7px 9px;white-space:nowrap}.rds-live-stage i{width:7px;height:7px;border-radius:50%;background:#27a565;box-shadow:0 0 0 4px rgba(39,165,101,.10)}.rds-payment-min-actions{margin-top:9px}.rds-payment-open{transition:transform .15s,box-shadow .15s}.rds-payment-open:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(23,53,93,.08)}@media(max-width:760px){.rds-control-grid{grid-template-columns:1fr 1fr}.rds-control-toggle{grid-column:1/-1}.rds-control-footer{align-items:stretch;flex-direction:column}.rds-control-footer .btn{width:100%}}";
    document.head.appendChild(s);
  }
  ensureBillingStyles();
  function bindBillingObserver(){bindBillingControl();}

  function bindCancelHistory(){
    const input=document.getElementById("rdsCancelSearch");const list=document.getElementById("rdsCancelList");const count=document.getElementById("rdsCancelCount");const limit=document.getElementById("rdsCancelLimit");const clear=document.getElementById("rdsCancelClear");
    if(!input||!list||input.dataset.bound==="1")return;input.dataset.bound="1";
    const items=[...list.querySelectorAll(".rds-cancel-item")];
    const apply=()=>{const q=String(input.value||"").toLowerCase().trim();const n=Math.max(1,Number(limit?.value||10));let visible=0;items.forEach((item,i)=>{const match=!q||String(item.dataset.search||"").includes(q);const ok=match&&i<n;item.style.display=ok?"":"none";if(ok)visible++;});if(count)count.textContent=q?visible+" encontrado(s)":Math.min(items.length,n)+" de "+items.length+" pedido(s)";};
    input.addEventListener("input",apply);limit?.addEventListener("change",apply);
    clear?.addEventListener("click",async()=>{if(!confirm("Deseja limpar histórico?"))return;try{await fetch("/api/operator/cancel-history/clear",{method:"POST",headers:{"Content-Type":"application/json"}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Não foi possível limpar o histórico.");return d;});toast?.("Histórico limpo.");await payments();}catch(e){toast?.(e.message||"Não foi possível limpar o histórico.");}});
    apply();
  }
  function ensureCancelStyles(){
    if(document.getElementById("rdsCancelHistoryStyles"))return;const s=document.createElement("style");s.id="rdsCancelHistoryStyles";
    s.textContent=".rds-cancel-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.rds-cancel-toolbar input{flex:1;min-width:190px}.rds-cancel-toolbar select{min-width:120px}.rds-cancel-toolbar .danger{white-space:nowrap}.rds-cancel-item{border:1px solid rgba(30,70,120,.16);border-radius:16px;background:#fff;margin:8px 0;overflow:hidden}.rds-cancel-item summary{list-style:none;cursor:pointer;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.rds-cancel-item summary::-webkit-details-marker{display:none}.rds-cancel-item summary span{min-width:0;display:flex;flex-direction:column;gap:4px}.rds-cancel-item summary b{font-size:16px;color:#17355d}.rds-cancel-item summary small{font-size:12px;color:#71809a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rds-cancel-item summary strong{font-size:25px;color:#6680a5;transition:transform .15s}.rds-cancel-item[open] summary strong{transform:rotate(90deg)}.rds-cancel-body{padding:0 16px 15px;border-top:1px solid rgba(30,70,120,.10)}.rds-cancel-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 0 6px;color:#566b88}.rds-cancel-meta span:last-child{font-size:11px;font-weight:800;color:#a13c3c;background:#fae9e9;border-radius:999px;padding:5px 9px}.rds-cancel-history .rds-empty{padding:14px 0}.rds-cancel-history .rds-buttons{margin-top:10px}";
    document.head.appendChild(s);
  }
  ensureCancelStyles();
  if(!document.getElementById('rdsPaidWaitStatusStyles')){
    const s=document.createElement('style');s.id='rdsPaidWaitStatusStyles';
    s.textContent=".rds-paid-wait-status{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:9px;font-weight:900;letter-spacing:.02em;color:#8a5a00;background:#fff3cd;border:1px solid #f0d27a;border-radius:999px;padding:7px 9px;white-space:nowrap}.rds-paid-wait-status:before{content:'●';font-size:8px;color:#d89b18}@media(max-width:430px){.rds-paid-wait-status{font-size:8px;padding:6px 7px}}";
    document.head.appendChild(s);
  }

  if(!document.getElementById('rdsPaymentStageStyles')){
    const s=document.createElement('style');s.id='rdsPaymentStageStyles';
    s.textContent=".rds-stage-pills{display:flex;gap:5px;align-items:center;flex-wrap:nowrap;margin-top:9px;overflow:hidden}.rds-stage-pills span{font-size:9px;font-weight:800;color:#71809a;background:#f1f5fa;border:1px solid rgba(30,70,120,.08);border-radius:999px;padding:4px 7px;white-space:nowrap}.rds-stage-pills span.done{color:#24764c;background:#eaf8ef}.rds-stage-pills span.active{color:#1c5f96;background:#eaf4ff;border-color:rgba(28,95,150,.16)}@media(max-width:430px){.rds-stage-pills{gap:3px}.rds-stage-pills span{font-size:8px;padding:4px 5px}}";
    document.head.appendChild(s);
  }
  bindBillingControl();
  bindCancelHistory();
  window.paymentsPage=payments;
  window.rdsPaymentsRefined=payments;
  window.rdsLegacyPaymentsPage=payments;
})();