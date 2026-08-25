(()=>{
  const PAGE_SIZE=25;
  let rowsAll=[], pageNo=1, filtered=[];
  let selectedStage=sessionStorage.getItem('rds:returnStage')||'PENDENTES';
  let selectedSearch=sessionStorage.getItem('rds:returnSearch')||'';
  const norm=s=>String(s||'').toLowerCase();

  window.returnsPage=async function(){
    const d=await api('/api/v1010/returns');
    const rs=Array.isArray(d?.rows)?d.rows:[];
    state.returns=rs;
    const seen=new Set(); rowsAll=[];
    for(const r of rs){
      const p=String(r.phone||'').replace(/\D/g,'');
      if(!p) continue;
      const key=p.slice(-8);
      if(seen.has(key)) continue;
      seen.add(key); rowsAll.push(r);
    }
    pageNo=1;
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Caixa comercial</span><h1>Retornos</h1><p class=mut>Clientes identificados pelo CRM, com histórico comercial em um só lugar.</p></div></div>
      <div class=toolbar><input id=returnSearch placeholder="Buscar nome, telefone, mensagem ou pedido" oninput="filterReturns()"><select id=returnStage onchange="filterReturns()"><option value="PENDENTES">Pendentes primeiro</option><option value="TODOS">Todos</option><option value="NOVO">Novo retorno</option><option value="COLETANDO_DADOS">Coletando dados</option><option value="AGUARDANDO_PAGAMENTO">Aguardando PIX</option><option value="AGUARDANDO_CONFERENCIA">Conferir pagamento</option><option value="PAGO_AGUARDANDO_BILHETES">Enviar bilhetes</option><option value="CONCLUIDO">Concluídos</option></select></div>
      <div id=returnsSummary class="mini" style="margin:0 0 12px"></div><div id=returnsList></div><div id=returnsPager></div>`;
    const s=document.querySelector('#returnStage'); if(s)s.value=selectedStage;
    const q=document.querySelector('#returnSearch'); if(q)q.value=selectedSearch;
    filterReturns(false);
  };

  window.filterReturns=function(resetPage=true){
    const qEl=document.querySelector('#returnSearch'), sEl=document.querySelector('#returnStage');
    selectedSearch=qEl?.value??selectedSearch;
    selectedStage=sEl?.value||selectedStage||'PENDENTES';
    sessionStorage.setItem('rds:returnSearch',selectedSearch);
    sessionStorage.setItem('rds:returnStage',selectedStage);
    const q=norm(selectedSearch), stage=selectedStage;
    filtered=rowsAll.filter(r=>{
      if(q&&!norm([r.contact_name,r.phone,r.body,r.order_code,r.group_name].join(' ')).includes(q)) return false;
      const st=r.order_status||'NOVO RETORNO';
      if(stage==='TODOS'||stage==='PENDENTES') return true;
      if(stage==='NOVO') return st==='NOVO RETORNO';
      return st===stage;
    }).sort((a,b)=>{
      const pa=a.order_status?0:1,pb=b.order_status?0:1;
      return pa-pb||new Date(b.created_at||0)-new Date(a.created_at||0);
    });
    if(resetPage)pageNo=1; renderSlice();
  };

  function renderSlice(){
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); pageNo=Math.min(pageNo,pages);
    const slice=filtered.slice((pageNo-1)*PAGE_SIZE,pageNo*PAGE_SIZE);
    const s=document.querySelector('#returnsSummary'); if(s)s.textContent=`${filtered.length} retorno(s) exibido(s) • ${rowsAll.length} cliente(s) com retorno`;
    const list=document.querySelector('#returnsList');
    if(list) list.innerHTML=slice.map(r=>{
      const name=r.contact_name||r.phone||'Identidade pendente';
      const st=r.order_status||'NOVO RETORNO';
      return `<div class=card><div class=row style="justify-content:space-between"><div><h2 style="margin:0">${esc(name)}</h2><p class=mut>${r.contact_name?esc(r.phone)+' • ':''}${dt(r.created_at)}${r.group_name?' • '+esc(r.group_name):''}</p></div>${badge(st)}</div><p>${esc(r.body||`[${r.message_type||'mídia'} recebida]`)}</p><div class=row><a target=_blank href="https://wa.me/${esc(r.phone||'')}"><button class=btn>Abrir WhatsApp</button></a>${r.order_id?btn('Abrir pedido',"go('orders')",'btn'):''}<button class="btn primary" onclick="rds10101History('${esc(r.phone||'')}')">Histórico 360°</button></div></div>`;
    }).join('')||'<div class="card empty-state">Nenhum retorno neste filtro.</div>';
    const pager=document.querySelector('#returnsPager');
    if(pager) pager.innerHTML=pages<=1?'':`<div class="row" style="justify-content:center;margin:18px 0;gap:10px"><button class="btn" ${pageNo<=1?'disabled':''} onclick="setReturnsPage(${pageNo-1})">← Anterior</button><span class="badge">Página ${pageNo} de ${pages}</span><button class="btn" ${pageNo>=pages?'disabled':''} onclick="setReturnsPage(${pageNo+1})">Próxima →</button></div>`;
  }

  window.setReturnsPage=function(n){pageNo=n;renderSlice();scrollTo(0,0)};

  function orderRow(o){
    return `<div class="priority"><div><strong>${esc(o.code||'Pedido')}</strong><small>${Number(o.quantity||0)} bilhete(s) • ${money(o.total_amount)} • ${dt(o.created_at)}</small></div>${badge(o.status)}</div>`;
  }
  function timelineRow(x){
    const names={MENSAGEM_RECEBIDA:'Mensagem recebida',MENSAGEM_ENVIADA:'Mensagem enviada',PEDIDO:'Pedido',CAMPANHA_ENVIADA:'Campanha enviada',FALHA_ENVIO:'Falha de envio'};
    return `<div class="priority"><div><strong>${esc(names[x.kind]||x.kind||'Atividade')}</strong><small>${dt(x.at)} • ${esc(String(x.text||'').slice(0,150))}</small></div>${x.status?badge(x.status):''}</div>`;
  }

  window.rds10101History=async function(phone){
    try{
      const p=await api('/api/v1010/customer/'+encodeURIComponent(phone));
      const c=p.contact||{},m=p.metrics||{},orders=Array.isArray(p.orders)?p.orders:[],timeline=Array.isArray(p.timeline)?p.timeline:[];
      const purchases=orders.filter(o=>o.status==='CONCLUIDO').slice(0,5);
      const recentOrders=orders.slice(0,6);
      const recentTimeline=timeline.filter(x=>['MENSAGEM_RECEBIDA','MENSAGEM_ENVIADA','PEDIDO'].includes(x.kind)).slice(0,8);

      modal(`<span class=eyebrow>CRM 360°</span>
        <h2>${esc(c.name||c.phone||phone)}</h2>
        <p class=mut>${esc(c.phone||phone)}${c.group_name?' • '+esc(c.group_name):''}${c.city?' • '+esc(c.city):''}</p>
        <div class=grid>${[['Compras',m.purchases],['Total comprado',money(m.spent)],['Pedidos',m.orders],['Retornos',m.returns]].map(x=>`<div class=card><span class=eyebrow>${x[0]}</span><div class=metric>${x[1]??0}</div></div>`).join('')}</div>
        <div class=row><button class="btn primary" onclick="window.open('https://wa.me/${esc(String(c.phone||phone).replace(/\D/g,''))}','_blank')">Abrir WhatsApp</button></div>
        <h3>Compras recentes</h3>${purchases.length?purchases.map(orderRow).join(''):'<p class=mut>Nenhuma compra concluída.</p>'}
        <h3>Pedidos recentes</h3>${recentOrders.length?recentOrders.map(orderRow).join(''):'<p class=mut>Nenhum pedido.</p>'}
        <h3>Últimas interações</h3>${recentTimeline.length?recentTimeline.map(timelineRow).join(''):'<p class=mut>Nenhuma interação recente.</p>'}`);
    }catch(e){toast(e.message)}
  };
})();
