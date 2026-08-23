(()=>{
  const PAGE_SIZE=25;
  let returnsRows=[], returnsOrders=[], returnsPageNo=1;
  let ordersRows=[], ordersPageNo=1;

  const norm=s=>String(s||'').toLowerCase();
  const ageHours=v=>v?Math.max(0,(Date.now()-new Date(v).getTime())/36e5):0;
  const pager=(page,total,fn)=>{
    const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    if(pages<=1)return '';
    return `<div class="row" style="justify-content:center;margin:18px 0;gap:10px"><button class="btn" ${page<=1?'disabled':''} onclick="${fn}(${page-1})">← Anterior</button><span class="badge">Página ${page} de ${pages}</span><button class="btn" ${page>=pages?'disabled':''} onclick="${fn}(${page+1})">Próxima →</button></div>`;
  };

  window.returnsPage=async function(){
    const [rs,os]=await Promise.all([api('/api/returns'),api('/api/orders')]);
    state.returns=rs; returnsOrders=os; returnsPageNo=1;
    const latest=new Map();
    for(const r of rs){if(r.phone&&!latest.has(r.phone))latest.set(r.phone,r)}
    returnsRows=[...latest.values()];
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Caixa comercial</span><h1>Retornos</h1><p class=mut>Priorize quem exige ação e encontre qualquer cliente rapidamente.</p></div></div>
      <div class=toolbar><input id=returnSearch placeholder="Buscar telefone, mensagem ou pedido" oninput="filterReturns()"><select id=returnStage onchange="filterReturns()"><option value="PENDENTES">Pendentes primeiro</option><option value="TODOS">Todos</option><option value="NOVO">Novo retorno</option><option value="COLETANDO_DADOS">Coletando dados</option><option value="AGUARDANDO_PAGAMENTO">Aguardando PIX</option><option value="AGUARDANDO_CONFERENCIA">Conferir pagamento</option><option value="PAGO_AGUARDANDO_BILHETES">Enviar bilhetes</option></select></div>
      <div id=returnsSummary class="mini" style="margin:0 0 12px"></div><div id=returnsList></div><div id=returnsPager></div>`;
    filterReturns();
  };

  window.filterReturns=function(){
    const q=norm($('#returnSearch')?.value), stage=$('#returnStage')?.value||'PENDENTES';
    let rows=returnsRows.map(r=>{
      const o=returnsOrders.find(x=>x.phone===r.phone&&!['CONCLUIDO','CANCELADO'].includes(x.status));
      return {r,o};
    }).filter(x=>{
      if(q&&!norm([x.r.phone,x.r.body,x.o?.code,x.o?.customer_name].join(' ')).includes(q))return false;
      if(stage==='PENDENTES')return !!x.o||!x.o;
      if(stage==='NOVO')return !x.o;
      return x.o?.status===stage;
    });
    rows.sort((a,b)=>{
      const ap=a.o?0:1,bp=b.o?0:1;
      if(ap!==bp)return ap-bp;
      return new Date(b.r.created_at||0)-new Date(a.r.created_at||0);
    });
    returnsPageNo=1; renderReturnsSlice(rows);
  };

  function renderReturnsSlice(rows){
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)); returnsPageNo=Math.min(returnsPageNo,pages);
    const start=(returnsPageNo-1)*PAGE_SIZE, slice=rows.slice(start,start+PAGE_SIZE);
    $('#returnsSummary').textContent=`${rows.length} retorno(s) exibido(s) • ${returnsRows.length} cliente(s) com retorno`;
    $('#returnsList').innerHTML=slice.map(({r,o})=>{
      const hrs=ageHours(r.created_at), stale=o&&hrs>=12;
      return `<div class=card><div class=row style="justify-content:space-between"><div><h2 style="margin:0">${esc(o?.customer_name||r.phone||'Identidade pendente')}</h2><p class=mut>${esc(r.phone||'')} • ${dt(r.created_at)}${stale?` • <b style="color:#9a6700">PARADO HÁ ${Math.floor(hrs)}H</b>`:''}</p></div>${badge(o?.status||'NOVO RETORNO')}</div><p>${esc(r.body||`[${r.message_type||'mídia'} recebida]`)}</p><div class=row><a target=_blank href="https://wa.me/${esc(r.phone||'')}"><button class=btn>Abrir WhatsApp</button></a>${o?btn('Abrir pedido',"go('orders')",'btn primary'):''}</div></div>`;
    }).join('')||'<div class="card empty-state">Nenhum retorno neste filtro.</div>';
    $('#returnsPager').innerHTML=pager(returnsPageNo,rows.length,'setReturnsPage');
    window.__returnsFiltered=rows;
  }
  window.setReturnsPage=function(n){returnsPageNo=n;renderReturnsSlice(window.__returnsFiltered||[]);scrollTo(0,0)};

  window.orders=async function(){
    state.orders=await api('/api/orders'); ordersRows=state.orders; ordersPageNo=1;
    const groups={COLETANDO_DADOS:'Coletando dados',AGUARDANDO_PAGAMENTO:'Aguardando PIX',AGUARDANDO_CONFERENCIA:'Conferir pagamento',PAGO_AGUARDANDO_BILHETES:'Enviar bilhetes',CONCLUIDO:'Concluídos'};
    app.innerHTML=`<div class=page-title><div><span class=eyebrow>Funil comercial</span><h1>Compras</h1><p class=mut>Fila operacional organizada para grande volume.</p></div></div>
      <div class=funnel>${Object.entries(groups).map(([k,n])=>`<div><span class=eyebrow>${n}</span><div class=metric>${state.orders.filter(o=>o.status===k).length}</div></div>`).join('')}</div>
      <div class=toolbar><input id=orderSearch placeholder="Buscar cliente, telefone ou pedido" oninput="filterOrders()"><select id=orderStage onchange="filterOrders()"><option value="PENDENTES">Pendentes</option><option value="AGUARDANDO_CONFERENCIA">Conferir pagamento</option><option value="PAGO_AGUARDANDO_BILHETES">Enviar bilhetes</option><option value="AGUARDANDO_PAGAMENTO">Aguardando PIX</option><option value="COLETANDO_DADOS">Coletando dados</option><option value="CONCLUIDO">Concluídos</option><option value="TODOS">Todos</option></select></div>
      <div id=ordersSummary class="mini" style="margin:0 0 12px"></div><div id=ordersList></div><div id=ordersPager></div>`;
    filterOrders();
  };

  window.filterOrders=function(){
    const q=norm($('#orderSearch')?.value), stage=$('#orderStage')?.value||'PENDENTES';
    let rows=ordersRows.filter(o=>{
      if(q&&!norm([o.code,o.customer_name,o.phone].join(' ')).includes(q))return false;
      if(stage==='PENDENTES')return !['CONCLUIDO','CANCELADO'].includes(o.status);
      if(stage==='TODOS')return true;
      return o.status===stage;
    });
    const priority={AGUARDANDO_CONFERENCIA:0,PAGO_AGUARDANDO_BILHETES:1,AGUARDANDO_PAGAMENTO:2,COLETANDO_DADOS:3,CONCLUIDO:8,CANCELADO:9};
    rows.sort((a,b)=>(priority[a.status]??5)-(priority[b.status]??5)||new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));
    ordersPageNo=1;renderOrdersSlice(rows);
  };

  function renderOrdersSlice(rows){
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));ordersPageNo=Math.min(ordersPageNo,pages);
    const start=(ordersPageNo-1)*PAGE_SIZE,slice=rows.slice(start,start+PAGE_SIZE);
    $('#ordersSummary').textContent=`${rows.length} pedido(s) neste filtro • exibindo até ${PAGE_SIZE} por página`;
    $('#ordersList').innerHTML=slice.map(o=>`<div class=card><div class=row style="justify-content:space-between"><div><h2 style="margin:0">${esc(o.code)}</h2><p class=mut>${esc(o.customer_name||o.phone)} • ${o.quantity||'—'} bilhete(s) • ${money(o.total_amount)}</p></div>${badge(o.status)}</div><div class=row>${o.status==='AGUARDANDO_CONFERENCIA'?btn('Confirmar pagamento',`confirmPay('${o.id}')`,'btn success'):''}${o.status==='PAGO_AGUARDANDO_BILHETES'?btn('Bilhetes enviados',`ticketsSent('${o.id}')`,'btn primary'):''}${!['CONCLUIDO','CANCELADO'].includes(o.status)?btn('Cancelar',`cancelOrder('${o.id}')`,'btn danger'):''}</div></div>`).join('')||'<div class="card empty-state">Nenhum pedido neste filtro.</div>';
    $('#ordersPager').innerHTML=pager(ordersPageNo,rows.length,'setOrdersPage');window.__ordersFiltered=rows;
  }
  window.setOrdersPage=function(n){ordersPageNo=n;renderOrdersSlice(window.__ordersFiltered||[]);scrollTo(0,0)};
})();
