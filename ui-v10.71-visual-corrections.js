(()=>{
  const Q=s=>document.querySelector(s);
  const E=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const money2=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dt2=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const b2=(t,f,c='btn')=>`<button class="${c}" onclick="${f}">${t}</button>`;

  // CRM: corrige o conflito de nome que causava "Cannot access 'q' before initialization".
  window.filterContacts=function(){
    const term=(Q('#contactSearch')?.value||'').toLowerCase();
    const group=Q('#contactGroup')?.value||'';
    const rows=(state.contacts||[]).filter(c=>(!group||c.group_name===group)&&(!term||[c.name,c.phone,c.city,c.tags,c.origin].join(' ').toLowerCase().includes(term)));
    const body=Q('#contactsBody');
    if(!body)return;
    body.innerHTML=rows.map(c=>`<tr><td><span class="crm-name">${E(c.name)}</span><br><span class="mini">${E(c.city||'')}</span></td><td>${E(c.phone)}</td><td>${E(c.origin||'MANUAL')} • ${E(c.group_name||'NOVOS')}</td><td>${badge(c.validated?'VALIDADO':'NÃO VALIDADO')}</td><td><div class="rds-action-row">${b2('Perfil',`contactProfile('${c.id}')`,'btn primary')}${b2('Editar',`editContact('${c.id}')`,'btn')}${b2('Validar',`validateContact('${c.id}')`,'btn')}</div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state">Nenhum cliente qualificado neste filtro.</div></td></tr>';
  };

  // Relógio único: o relógio antigo #clock fica definitivamente oculto para não haver duas datas/horas.
  function cleanClock(){
    const old=Q('#clock');
    if(old)old.style.setProperty('display','none','important');
    const x=Q('#rdsClockFinal');
    if(x)x.style.display='inline-flex';
  }
  cleanClock();
  setInterval(cleanClock,1000);

  // Pagamentos: cada operação passa a ter seu próprio quadro recolhível e contador.
  window.paymentsPage=async function(){
    try{
      const [ordersList,pb]=await Promise.all([api('/api/orders'),api('/api/pagbank/status').catch(()=>({configured:false,environment:'sandbox'}))]);
      state.orders=ordersList;
      const groups=[
        ['waiting','Cobranças PIX','AGUARDANDO_PAGAMENTO'],
        ['proof','Comprovantes recebidos','AGUARDANDO_CONFERENCIA'],
        ['paid','Pagamentos confirmados','PAGO_AGUARDANDO_BILHETES']
      ].map(([id,title,status])=>({id,title,status,rows:ordersList.filter(o=>o.status===status)}));
      const total=groups[0].rows.reduce((a,o)=>a+Number(o.total_amount||0),0);
      const waLink=p=>`https://wa.me/${String(p||'').replace(/\D/g,'')}`;
      const statusLabel=o=>o.pagbank_status?String(o.pagbank_status):'SEM PIX';
      const renderRow=(o,type)=>`<div class="rds-order"><div class="rds-order-top"><div><h3>${E(o.customer_name||o.phone)}</h3><p>${E(o.code)} • ${o.quantity||0} bilhete(s) • <b>${money2(o.total_amount)}</b></p><p class="mini">${dt2(o.created_at)}${o.pagbank_order_id?' • PagBank: '+E(o.pagbank_order_id):''}${o.pix_expires_at?' • Expira: '+dt2(o.pix_expires_at):''}</p></div>${badge(type==='paid'?'PAGO':type==='proof'?'COMPROVANTE RECEBIDO':statusLabel(o))}</div><div class="rds-buttons">${type==='waiting'?b2(o.pix_copy_paste?'Ver PIX':'Gerar PIX',`rdsCreatePix('${o.id}',false)`,'btn primary')+b2('Gerar e enviar no WhatsApp',`rdsCreatePix('${o.id}',true)`,'btn success')+(o.pix_copy_paste?b2('Consultar PagBank',`rdsReconcilePix('${o.id}')`,'btn'):''):''}${type==='proof'?b2('Confirmar pagamento',`rdsApproveProof('${o.id}')`,'btn success')+b2('Rejeitar e voltar ao PIX',`rdsRejectProof('${o.id}')`,'btn danger')+b2('Consultar PagBank',`rdsReconcilePix('${o.id}')`,'btn'):''}<a target="_blank" href="${waLink(o.phone)}">${b2('Abrir WhatsApp','','btn')}</a></div></div>`;
      const section=(g,open)=>`<details class="rds-pay-section" ${open?'open':''}><summary><span><b>${g.title}</b><small>${g.rows.length} registro(s)</small></span><strong>${g.rows.length}</strong></summary><div class="rds-pay-body">${g.rows.map(o=>renderRow(o,g.id)).join('')||'<div class="rds-empty">Nenhum registro nesta etapa.</div>'}</div></details>`;
      app.innerHTML=`<div class="rds-clean-head"><div><span class="eyebrow">Operação financeira</span><h1>Pagamentos</h1><p class="rds-clean-sub">PIX automático PagBank, QR Code, Copia e Cola e confirmação automática.</p></div>${badge(pb.configured?'PAGBANK '+String(pb.environment||'').toUpperCase():'PAGBANK NÃO CONFIGURADO')}</div><div class="rds-mini-grid"><div class="card metric-card"><span class="eyebrow">Cobranças PIX</span><div class="metric">${groups[0].rows.length}</div></div><div class="card metric-card"><span class="eyebrow">Valor pendente</span><div class="metric">${money2(total)}</div></div><div class="card metric-card"><span class="eyebrow">Comprovantes</span><div class="metric">${groups[1].rows.length}</div></div><div class="card metric-card"><span class="eyebrow">Pagamento confirmado</span><div class="metric">${groups[2].rows.length}</div></div></div>${section(groups[0],true)}${section(groups[1],groups[1].rows.length>0)}${section(groups[2],groups[2].rows.length>0)}`;
    }catch(e){app.innerHTML=`<div class="card"><h2>Não foi possível carregar Pagamentos</h2><p>${E(e.message)}</p></div>`}
  };

  // Nova campanha: recoloca as regras críticas dentro do planejamento, sem duplicar a área "Regras".
  const originalNewCampaign=window.newCampaign;
  window.newCampaign=async function(){
    await loadContacts();
    window.campSteps=[{message:'',delay_minutes:0}];
    modal(`<span class="eyebrow">Nova campanha</span><h2>Planejamento</h2><label>Nome</label><input id="cpname"><label>Preço do bilhete</label><input id="cpprice" type="number" step=".01" value="3"><label>Primeiro envio</label><input id="cpstart" type="datetime-local"><label>Público</label><select id="cptarget" onchange="targetUI()"><option value="all">Todos os clientes qualificados</option><option value="group">Grupo</option><option value="individual">Seleção individual</option></select><div id="targetbox"></div><div id="stepsbox"></div><details class="rds-campaign-rules" open><summary><b>Regras de disparo</b><span>proteção e limites</span></summary><div class="rds-rule-grid"><label>Máximo por dia <input id="crDay" type="number" min="0" value="0"></label><label>Máximo por hora <input id="crHour" type="number" min="0" value="0"></label><label>Intervalo por cliente (min) <input id="crInt" type="number" min="0" value="0"></label><label>Limite por ciclo <input id="crBatch" type="number" min="0" value="0"></label><label>Início permitido <input id="crStart" type="time" value="08:00"></label><label>Fim permitido <input id="crEnd" type="time" value="20:00"></label><label class="wide">Grupo de embaralhamento <input id="crPool" placeholder="Ex.: SEXTA-01"></label></div><label class="rds-check"><input id="crShuffle" type="checkbox"> Embaralhar destinatários entre campanhas do mesmo grupo</label><label class="rds-check"><input id="crAvoid" type="checkbox" checked> Bloquear repetição da mesma mensagem para o mesmo cliente</label><label class="rds-check"><input id="crStop" type="checkbox" checked> Retirar cliente automaticamente ao entrar em pedido</label><p class="mini">O horário da campanha encerra os disparos automaticamente. Limites são aplicados pelo motor.</p></details><div class="row">${b2('+ Lembrete','addStep()','btn')}${b2('Salvar e configurar','saveCampaign()','btn primary')}</div>`);
    renderSteps();targetUI();
  };

  window.saveCampaign=async function(){
    try{
      const mode=Q('#cptarget').value,selected=[...document.querySelectorAll('.cpcontact:checked')].map(x=>x.value),sv=Q('#cpstart').value;
      if(!Q('#cpname').value.trim())throw new Error('Informe o nome da campanha.');
      if(!sv)throw new Error('Informe o primeiro envio.');
      if(!window.campSteps?.some(s=>String(s.message||'').trim()))throw new Error('Informe pelo menos uma mensagem.');
      const created=await post('/api/campaigns',{name:Q('#cpname').value.trim(),unit_price:Q('#cpprice').value,start_at:new Date(sv).toISOString(),target_mode:mode,target_group:mode==='group'?Q('#cpgroup').value:null,selected_contact_ids:selected,cta_enabled:true,steps:campSteps});
      const id=created?.id||created?.campaign?.id;
      if(id){
        await put(`/api/campaigns/${id}/rules`,{max_per_day:Number(Q('#crDay').value||0),max_per_hour:Number(Q('#crHour').value||0),interval_minutes:Number(Q('#crInt').value||0),window_start:Q('#crStart').value||'08:00',window_end:Q('#crEnd').value||'20:00',batch_limit:Number(Q('#crBatch').value||0),shuffle:Q('#crShuffle').checked,avoid_repeat:Q('#crAvoid').checked,stop_on_order:Q('#crStop').checked,shuffle_pool:Q('#crPool').value.trim()});
      }
      document.querySelector('.modal')?.remove();toast(id?'Campanha salva com regras de proteção.':'Campanha salva; abra Regras para concluir a configuração.');campaigns();
    }catch(e){toast(e.message)}
  };

  const style=document.createElement('style');style.textContent=`
    #clock{display:none!important}.rds-clock-final{display:inline-flex!important}
    .top-actions{align-items:center}.top>div:first-child b{font-size:14px;line-height:1.05;max-width:128px}.top>div:first-child small{font-size:9px;line-height:1.1;max-width:82px}
    .rds-pay-section{background:#fff;border:1px solid #dce6f2;border-radius:17px;margin:12px 0;overflow:hidden;box-shadow:0 8px 24px rgba(19,54,96,.05)}.rds-pay-section summary{cursor:pointer;list-style:none;padding:15px 17px;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(90deg,#f8fbff,#fff)}.rds-pay-section summary::-webkit-details-marker{display:none}.rds-pay-section summary span{display:flex;flex-direction:column;gap:3px}.rds-pay-section summary small{color:#6f7e94;font-size:10px}.rds-pay-section summary>strong{min-width:30px;height:30px;border-radius:999px;display:grid;place-items:center;background:#eaf1fa;color:#092d5e}.rds-pay-body{padding:2px 12px 12px}.rds-campaign-rules{margin:14px 0;padding:0;border:1px solid #dce6f2;border-radius:14px;background:#f8fbff}.rds-campaign-rules summary{padding:13px 14px;cursor:pointer;display:flex;justify-content:space-between;color:#17365d}.rds-campaign-rules summary span{font-size:10px;color:#718197}.rds-rule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 14px 10px}.rds-rule-grid label{font-size:10px;font-weight:800;color:#53677f}.rds-rule-grid label.wide{grid-column:1/-1}.rds-rule-grid input{margin-top:5px}.rds-check{display:block;padding:6px 14px;font-size:10px!important;font-weight:700!important;color:#435a74}.rds-check input{width:auto!important;margin-right:6px}.rds-campaign-rules .mini{padding:4px 14px 12px;display:block}@media(max-width:760px){.top>div:first-child b{font-size:12px;max-width:106px}.top>div:first-child small{display:none}.rds-rule-grid{grid-template-columns:1fr}.rds-rule-grid label.wide{grid-column:auto}.rds-pay-section summary{padding:13px}}
  `;document.head.appendChild(style);
})();