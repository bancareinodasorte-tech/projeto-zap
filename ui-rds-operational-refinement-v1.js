/* RDS OPERATIONAL REFINEMENT V1 — retorno útil e automação orientada a ações */
(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dt=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const badge=s=>typeof window.badge==='function'?window.badge(s):'<span class="badge">'+esc(s||'—')+'</span>';
  const btn=(t,fn,cls='btn')=>'<button class="'+cls+'" onclick="'+fn+'">'+t+'</button>';
  const apiGet=async u=>{const r=await fetch(u,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha ao carregar dados');return d;};

  window.automation=async function(){
    const root=document.getElementById('app');if(!root)return;
    root.innerHTML='<div class="card"><span class="mut">Carregando fila operacional…</span></div>';
    try{
      const results=await Promise.allSettled([
        apiGet('/api/automation-center'),
        apiGet('/api/v1011/followup/summary'),
        apiGet('/api/v1012/postpay/summary')
      ]);
      const d=results[0].status==='fulfilled'?results[0].value:{stats:{},failed:[],orders:[]};
      const f=results[1].status==='fulfilled'?results[1].value:{};
      const p=results[2].status==='fulfilled'?results[2].value:{};
      const st=d.stats||{},failed=Array.isArray(d.failed)?d.failed:[],orders=Array.isArray(d.orders)?d.orders:[];
      const active=Number(f.active||0),near=Number(f.nearLimit||0),review=Number(p.review??st.proofReview??0),tickets=Number(p.tickets??st.tickets??0);
      root.innerHTML=
        '<div class="page-title"><div><span class="eyebrow">Operação automática</span><h1>Central de Automação</h1><p class="mut">Acompanhe o que está rodando e intervenha somente nas exceções.</p></div>'+
        btn('Atualizar fila',"go('execution')")+' '+btn('Processar fila',"processNow()",'btn primary')+'</div>'+
        '<div class="grid">'+[
          ['Envios na fila',st.queue],['Falhas recuperáveis',st.failed],['Pagamentos para conferir',review],['Emissão de bilhetes',tickets]
        ].map(x=>'<div class="card metric-card"><span class="eyebrow">'+x[0]+'</span><div class="metric">'+Number(x[1]||0)+'</div></div>').join('')+'</div>'+
        '<div class="card" style="margin-top:16px"><span class="eyebrow">Acompanhamento</span><h2>Follow-up e pós-pagamento</h2><p class="mut">Pedidos são acompanhados para evitar perda de retorno; a conclusão depende da emissão oficial e do PDF arquivado.</p><div class="funnel">'+[
          ['Pedidos ativos',active],['Próximos do limite',near],['Conferência de pagamento',review],['Emissão pendente',tickets]
        ].map(x=>'<div><span class="eyebrow">'+x[0]+'</span><div class="metric">'+Number(x[1]||0)+'</div></div>').join('')+'</div>'+
        '<div class="row" style="margin-top:12px">'+btn('Abrir compras',"go('orders')",'btn primary')+' '+btn('Abrir clientes',"go('contacts')")+' '+btn('Abrir WhatsApp',"go('whatsapp')")+'</div></div>'+
        '<div class="action-center" style="margin-top:16px"><div class="card"><h2>Falhas que precisam de recuperação</h2>'+
        (failed.length?failed.slice(0,12).map(x=>'<div class="priority"><div><strong>'+esc(x.phone||'Contato sem número')+'</strong><small>'+esc(x.error_text||'Falha de envio')+' • '+dt(x.updated_at||x.created_at)+'</small></div>'+btn('Reenviar', "retryDelivery('"+esc(x.id)+"')",'btn warn')+'</div>').join(''):'<div class="empty-state">Nenhuma falha de envio registrada.</div>')+
        '</div><div class="card"><h2>Pedidos em acompanhamento</h2>'+
        (orders.length?orders.slice(0,10).map(o=>'<div class="priority"><div><strong>'+esc(o.code||'Pedido')+'</strong><small>'+esc(o.customer_name||o.phone||'Cliente')+' • '+money(o.total_amount)+(o.official_issue_status?' • Emissão: '+esc(o.official_issue_status):'')+'</small>'+(o.official_issue_status==='ERRO_RECONCILIAR'?'<small class="warn">⚠ Conferência manual no sistema oficial necessária; não reemitir sem verificar.</small>':'')+'</div>'+badge(o.status)+'</div>').join(''):'<div class="empty-state">Nenhum pedido pendente na fila de intervenção.</div>')+
        btn('Ver todos os pedidos',"go('orders')")+'</div></div>';
    }catch(e){root.innerHTML='<div class="card"><h2>Automação temporariamente indisponível</h2><p>'+esc(e.message)+'</p>'+btn('Tentar novamente',"go('execution')",'btn primary')+'</div>';}
  };

  window.returnsPage=async function(){
    const root=document.getElementById('app');if(!root)return;
    root.innerHTML='<div class="card"><span class="mut">Carregando retornos dos clientes…</span></div>';
    try{
      const [rs,os]=await Promise.all([apiGet('/api/returns'),apiGet('/api/orders')]);
      const latest=new Map();
      for(const r of (Array.isArray(rs)?rs:[])){
        const phone=String(r.phone||'').replace(/\D/g,'');
        const key=phone||('sem-numero-'+(r.id||r.created_at||Math.random()));
        if(!latest.has(key))latest.set(key,{...r,phoneDigits:phone});
      }
      const rows=[...latest.values()];
      const renderRows=(query='')=>{
        const q=query.trim().toLowerCase();
        const filtered=rows.filter(r=>[r.phone,r.body,r.message_type].join(' ').toLowerCase().includes(q));
        const list=document.getElementById('rdsReturnsList');if(!list)return;
        list.innerHTML=filtered.map(r=>{
          const order=(Array.isArray(os)?os:[]).find(x=>String(x.phone||'').replace(/\D/g,'')===r.phoneDigits&&!['CONCLUIDO','CANCELADO'].includes(x.status));
          const message=String(r.body||('Mensagem recebida ('+(r.message_type||'mídia')+')'));
          const wa=r.phoneDigits?'https://wa.me/'+r.phoneDigits+'?text='+encodeURIComponent('Olá! Recebemos seu contato no CANAL DE VENDAS REINO DA SORTE. Como podemos ajudar?'):'';
          return '<details class="card rds-return-item" style="margin-bottom:8px"><summary class="rds-return-summary"><span><strong>'+esc(r.phone||'Número não identificado')+'</strong><small>'+dt(r.created_at)+' • '+esc(r.message_type||'mensagem')+'</small><small class="rds-return-preview">'+esc(message.replace(/\s+/g,' ').slice(0,105))+'</small></span><span class="rds-return-state">'+badge(order?order.status:'RETORNO SEM PEDIDO ATIVO')+'<span class="rds-return-chevron">＋</span></span></summary><div class="rds-return-detail"><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(message)+'</p><div class="row">'+(wa?'<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+esc(wa)+'">Responder no WhatsApp</a>':'')+(order?btn('Ver compras',"go('orders')"):'')+btn('Ver cliente',"go('contacts')")+'</div></div></details>';
        }).join('')||'<div class="card empty-state">Nenhum retorno corresponde à busca.</div>';
      };
      root.innerHTML='<div class="page-title"><div><span class="eyebrow">Atendimento comercial</span><h1>Retornos</h1><p class="mut">Mensagens recebidas organizadas para localizar o cliente e continuar o atendimento.</p></div>'+btn('Atualizar',"go('returns')")+'</div>'+
        '<div class="card"><label for="rdsReturnsSearch">Buscar por telefone ou conteúdo da mensagem</label><input id="rdsReturnsSearch" placeholder="Digite telefone ou palavra da mensagem"><p class="mini">Os retornos exibem a última mensagem por número. A resposta abre uma conversa no WhatsApp; ela não envia mensagem automaticamente.</p></div><div id="rdsReturnsList" style="margin-top:12px"></div>';
      document.getElementById('rdsReturnsSearch').addEventListener('input',e=>renderRows(e.target.value));
      renderRows();
    }catch(e){root.innerHTML='<div class="card"><h2>Não foi possível carregar os retornos</h2><p>'+esc(e.message)+'</p>'+btn('Tentar novamente',"go('returns')",'btn primary')+'</div>';}
  };
})();

  // Reorganização visual sem remover configurações nem alterar suas APIs.
  (()=>{
    const css=\`
      .rds-return-item{padding:0!important;overflow:hidden}
      .rds-return-item>summary{list-style:none;cursor:pointer;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:13px 14px}
      .rds-return-item>summary::-webkit-details-marker{display:none}
      .rds-return-summary>span:first-child{min-width:0;display:flex;flex-direction:column;gap:4px}
      .rds-return-summary strong{font-size:14px;overflow-wrap:anywhere}
      .rds-return-summary small{font-size:11px;color:var(--muted,#718096)}
      .rds-return-preview{max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rds-return-state{display:flex;align-items:center;gap:7px;flex-shrink:0}
      .rds-return-chevron{font-size:18px;color:#1759a7}
      .rds-return-item[open] .rds-return-chevron{font-size:0}
      .rds-return-item[open] .rds-return-chevron:after{content:'−';font-size:20px}
      .rds-return-detail{border-top:1px solid #e5ebf4;padding:12px 14px}
      .rds-settings-fold{margin:0 0 12px}
      .rds-settings-fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:750;color:#183b68;padding:2px 0}
      .rds-settings-fold>summary::-webkit-details-marker{display:none}
      .rds-settings-fold>summary:after{content:'＋';font-size:20px;color:#1762b7}
      .rds-settings-fold[open]>summary:after{content:'−'}
      .rds-settings-fold .rds-settings-fold-body{padding-top:12px}
      .rds-settings-fold .rds-settings-fold-body> :first-child{margin-top:0}
      @media(max-width:640px){.rds-return-summary{align-items:flex-start}.rds-return-preview{max-width:190px}.rds-return-state{gap:4px}.rds-return-state .badge{max-width:115px;white-space:normal;text-align:center}}
    \`;
    if(!document.getElementById('rdsOperationalCompactStyles')){const style=document.createElement('style');style.id='rdsOperationalCompactStyles';style.textContent=css;document.head.appendChild(style);}
    function compactSettings(){
      if((window.page||localStorage.getItem('rds_current_page')||'')!=='settings')return;
      const root=document.getElementById('app');if(!root)return;
      const headings=[...root.querySelectorAll('h2')];
      for(const h of headings){
        const title=(h.textContent||'').trim();
        if(!/^(WhatsApp|Bot comercial|Regras de vendas e pagamento)$/.test(title))continue;
        const card=h.closest('.card');if(!card||card.dataset.rdsCompactDone==='1')continue;
        card.dataset.rdsCompactDone='1';
        const details=document.createElement('details');details.className='rds-settings-fold';
        const summary=document.createElement('summary');summary.textContent=title;
        const body=document.createElement('div');body.className='rds-settings-fold-body';
        const nodes=[...card.childNodes];
        for(const node of nodes){if(node===h)continue;body.appendChild(node);}
        details.appendChild(summary);details.appendChild(body);
        h.replaceWith(details);
        // Estado atual do WhatsApp fica visível no título, sem abrir a seção.
        if(title==='WhatsApp'){
          const status=card.querySelector('.badge,.status');
          if(status&&status.textContent.trim())summary.textContent='WhatsApp — '+status.textContent.trim();
        }
        if(title==='Bot comercial'||title==='Regras de vendas e pagamento')details.open=false;
      }
    }
    const app=document.getElementById('app');
    if(app&&typeof MutationObserver!=='undefined'){
      const observer=new MutationObserver(()=>compactSettings());
      observer.observe(app,{childList:true,subtree:true});
      compactSettings();
    }
    window.rdsCompactSettings=compactSettings;
  })();
