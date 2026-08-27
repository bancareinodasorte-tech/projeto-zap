(()=>{
 const SYS_KEY='rds:reinoSystemUrl';
 const cleanUrl=v=>{try{const u=new URL(String(v||'').trim());return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
 const systemUrl=serverUrl=>cleanUrl(localStorage.getItem(SYS_KEY))||cleanUrl(serverUrl)||'';
 let lastOpsFingerprint='';

 async function flowStatus(){return api('/api/v1036/flow-status').catch(()=>({orders:[],system_url:''}))}
 function fingerprint(d){return JSON.stringify((d.orders||[]).map(o=>[o.id,o.status,o.updated_at]))}

 const previousSettings=window.settings;
 window.settings=async function(){
   await previousSettings();
   const d=await flowStatus();
   const current=systemUrl(d.system_url);
   const box=document.createElement('div');
   box.className='card';
   box.innerHTML=`<span class=eyebrow>Integração operacional</span><h2>Sistema Reino da Sorte</h2><p class=mut>Atalho usado na etapa de emissão dos bilhetes pagos.</p><label>Endereço do sistema</label><input id=rdsSystemUrl type=url inputmode=url placeholder="https://..." value="${esc(current)}"><div class=row>${btn('Salvar acesso','rdsSaveSystemUrl()','btn primary')}${current?`<a href="${esc(current)}" target=_blank>${btn('Abrir sistema','')}</a>`:''}</div>`;
   app.appendChild(box);
 };
 window.rdsSaveSystemUrl=function(){
   const raw=document.querySelector('#rdsSystemUrl')?.value||'';
   const url=cleanUrl(raw);
   if(raw&&!url)return toast('Informe um endereço iniciado por https://');
   if(url)localStorage.setItem(SYS_KEY,url);else localStorage.removeItem(SYS_KEY);
   toast('Acesso ao Sistema Reino da Sorte salvo.');
 };

 window.orders=async function(){
   const [ordersList,flow]=await Promise.all([api('/api/orders'),flowStatus()]);
   state.orders=ordersList;
   lastOpsFingerprint=fingerprint(flow);
   const collecting=ordersList.filter(o=>o.status==='COLETANDO_DADOS');
   const paid=ordersList.filter(o=>o.status==='PAGO_AGUARDANDO_BILHETES');
   const done=ordersList.filter(o=>o.status==='CONCLUIDO');
   const payment=ordersList.filter(o=>['AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFERENCIA'].includes(o.status));
   const sys=systemUrl(flow.system_url);
   const paidCards=paid.map(o=>`<div class=rds-order>
     <div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money(o.total_amount)}</b></p></div>${badge('PAGO')}</div>
     <div class="rds-flow-strip"><span class=ok>1 Pagamento confirmado</span><span class=active>2 Gerar bilhetes</span><span>3 Enviar ao cliente</span></div>
     <div class=rds-buttons>
       ${sys?`<a target=_blank href="${esc(sys)}">${btn('Abrir Sistema Reino da Sorte','', 'btn primary')}</a>`:btn('Configurar Sistema Reino da Sorte',"go('settings')",'btn primary')}
       <a target=_blank href="https://wa.me/${String(o.phone||'').replace(/\D/g,'')}">${btn('Abrir WhatsApp','')}</a>
       ${btn('Marcar bilhetes enviados',`ticketsSent('${o.id}')`,'btn success')}
     </div>
   </div>`).join('');
   app.innerHTML=`
     <div class=rds-clean-head><div><span class=eyebrow>Vendas</span><h1>Compras</h1><p class=rds-clean-sub>Pagamento confirmado → emissão → envio dos bilhetes → conclusão.</p></div>${payment.length?btn(`Abrir pagamentos (${payment.length})`,"go('payments')",'btn primary'):''}</div>
     <div class=rds-mini-grid>
       <div class="card metric-card"><span class=eyebrow>Em atendimento</span><div class=metric>${collecting.length}</div></div>
       <div class="card metric-card"><span class=eyebrow>Gerar/enviar bilhetes</span><div class=metric>${paid.length}</div></div>
       <div class="card metric-card"><span class=eyebrow>Concluídas</span><div class=metric>${done.length}</div></div>
     </div>
     <div class="rds-section card"><div class=rds-section-title><h2>Bilhetes pagos para emitir</h2></div><div class=rds-order-list>${paidCards||'<div class=rds-empty>Nenhum pedido pago aguardando bilhetes.</div>'}</div></div>
     ${collecting.length?`<div class="rds-section card"><div class=rds-section-title><h2>Pedidos em atendimento</h2></div><div class=rds-order-list>${collecting.map(o=>`<div class=rds-order><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)}</p></div><div class=rds-buttons><a target=_blank href="https://wa.me/${String(o.phone||'').replace(/\D/g,'')}">${btn('Continuar no WhatsApp','btn primary')}</a></div></div>`).join('')}</div></div>`:''}
     <div class="rds-section card"><div class=rds-section-title><h2>Histórico concluído</h2></div><div class=rds-order-list>${done.length?done.slice(0,40).map(o=>`<div class=rds-order><div class=rds-order-top><div><h3>${esc(o.customer_name||o.phone)}</h3><p>${esc(o.code)} • ${o.quantity||0} bilhete(s) • ${money(o.total_amount)}</p></div>${badge('CONCLUIDO')}</div></div>`).join(''):'<div class=rds-empty>Nenhuma compra concluída.</div>'}</div></div>`;
 };

 window.rdsApproveProof=async function(id){
   if(!confirm('Confirmar que este pagamento foi conferido e está correto?'))return;
   try{await post(`/api/orders/${id}/payment-confirmed`);toast('Pagamento confirmado. Pedido enviado para emissão dos bilhetes.');go('orders')}catch(e){toast(e.message)}
 };
 window.ticketsSent=async function(id){
   try{await post(`/api/orders/${id}/tickets-sent`);toast('Bilhetes enviados. Compra concluída.');await orders()}catch(e){toast(e.message)}
 };

 const css=document.createElement('style');
 css.textContent=`.rds-flow-strip{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.rds-flow-strip span{font-size:11px;font-weight:800;border-radius:999px;padding:7px 9px;background:#eef3f9;color:#61728a}.rds-flow-strip .ok{background:#e5f6eb;color:#267342}.rds-flow-strip .active{background:#e7f0ff;color:#0d55a5}`;
 document.head.appendChild(css);

 // Atualização operacional instantânea: detecta mudança de status criada pelo bot,
 // pagamento PagBank ou ação de outro dispositivo sem exigir troca de aba.
 setInterval(async()=>{
   if(!['home','payments','orders'].includes(page)||document.hidden||document.querySelector('.modal'))return;
   try{
     const d=await flowStatus();
     const fp=fingerprint(d);
     if(!lastOpsFingerprint){lastOpsFingerprint=fp;return;}
     if(fp!==lastOpsFingerprint){lastOpsFingerprint=fp;await render();}
   }catch{}
 },4000);
 window.addEventListener('focus',()=>{if(['home','payments','orders'].includes(page))render().catch(()=>{})});
})();
