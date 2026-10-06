(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dtR=v=>typeof dt==='function'?dt(v):new Date(v).toLocaleString('pt-BR');
  const q=s=>document.querySelector(s);
  let archiveRows=[];
  let archiveOpen=false;
  const pad=n=>String(n).padStart(2,'0');
  const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  function periodRange(value){
    const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if(value==='today')return [ymd(today),ymd(today)];
    if(value==='yesterday'){const d=new Date(today);d.setDate(d.getDate()-1);return [ymd(d),ymd(d)];}
    if(value==='7d'){const d=new Date(today);d.setDate(d.getDate()-6);return [ymd(d),ymd(today)];}
    if(value==='30d'){const d=new Date(today);d.setDate(d.getDate()-29);return [ymd(d),ymd(today)];}
    if(value==='month')return [ymd(new Date(today.getFullYear(),today.getMonth(),1)),ymd(today)];
    return ['',''];
  }
  function rowDate(o){return String(o.created_at||o.sent_at||o.updated_at||'').slice(0,10);}
  function statusLabel(o){return o.sent_at?'✓ PDF arquivado':'PDF arquivado';}
  function openPdf(id){window.open('/api/rds/ticket-pdf/'+encodeURIComponent(id)+'?rds='+Date.now(),'_blank','noopener,noreferrer')}
  window.rdsOpenTicketPdf=openPdf;
  window.rdsResendTicketPdf=async id=>{
    try{
      const r=await fetch('/api/rds/ticket-pdf/'+encodeURIComponent(id)+'/resend',{method:'POST',headers:{'Content-Type':'application/json'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Falha ao reenviar o PDF.');
      toast('PDF reenviado pelo WhatsApp.');
      await loadArchive();renderArchiveTable();
    }catch(e){toast(e.message||'Falha ao reenviar o PDF.')}
  };
  async function loadArchive(){
    try{const r=await fetch('/api/rds/ticket-archive?rds='+Date.now(),{cache:'no-store'});const d=await r.json();archiveRows=Array.isArray(d.rows)?d.rows:[];}
    catch{archiveRows=[]}
    const liveOrders=Array.isArray(window.state?.orders)?window.state.orders:[];
    const byId=new Map((archiveRows||[]).map(o=>[String(o.order_id||o.id),o]));
    for(const o of liveOrders){
      if(o?.status!=='CONCLUIDO'||!o?.official_sale_id)continue;
      const id=String(o.id||'');if(!id||byId.has(id))continue;
      byId.set(id,{id:o.id,order_id:o.id,order_code:o.code||'',customer_name:o.customer_name||null,customer_phone:o.phone||o.contact_phone||null,official_sale_id:o.official_sale_id||null,created_at:o.created_at||o.completed_at||null,sent_at:null,updated_at:o.updated_at||null,pdf_base64:null});
    }
    archiveRows=[...byId.values()];
  }
  function archiveCard(){
    return '<section class="card rds-ticket-archive-card" id="rdsTicketArchiveCard">'+
      '<div class="rds-ticket-archive-head"><div><span class="eyebrow">PÓS-VENDA</span><h2>Histórico de bilhetes / compras concluídas</h2><p class="mut">Histórico fechado para não alongar a página. Abra quando precisar consultar ou reenviar um bilhete.</p></div><button class="btn primary" type="button" id="rdsTicketArchiveToggle">Abrir histórico</button></div>'+
      '<div id="rdsTicketArchiveBody" hidden><div class="rds-ticket-filters">'+
      '<select id="rdsTicketPeriod" aria-label="Período"><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="month">Este mês</option><option value="all">Todos</option><option value="custom">Período personalizado</option></select>'+
      '<input id="rdsTicketFrom" type="date" aria-label="Data inicial" hidden><input id="rdsTicketTo" type="date" aria-label="Data final" hidden>'+
      '<input id="rdsTicketSearch" placeholder="Buscar pedido, cliente, telefone ou venda oficial" autocomplete="off"><button class="btn" type="button" id="rdsTicketRefresh">Atualizar</button></div>'+
      '<div id="rdsTicketArchiveSummary" class="rds-ticket-summary"></div><div id="rdsTicketArchiveTable"></div></div></section>';
  }
  function getFilteredRows(){
    const period=q('#rdsTicketPeriod')?.value||'today';let from='',to='';
    if(period==='custom'){from=q('#rdsTicketFrom')?.value||'';to=q('#rdsTicketTo')?.value||from;}else [from,to]=periodRange(period);
    const term=(q('#rdsTicketSearch')?.value||'').trim().toLowerCase();
    const byId=new Map((archiveRows||[]).map(o=>[String(o.order_id||o.id),o]));
    for(const o of (state.orders||[])){
      if(o.status!=='CONCLUIDO'||!o.official_sale_id)continue;
      const id=String(o.id||'');if(!id||byId.has(id))continue;
      byId.set(id,{id:o.id,order_id:o.id,order_code:o.code||'',customer_name:o.customer_name||null,customer_phone:o.phone||o.contact_phone||null,official_sale_id:o.official_sale_id||null,created_at:o.created_at||o.completed_at||null,sent_at:null,updated_at:o.updated_at||null,pdf_base64:null});
    }
    return [...byId.values()].filter(o=>{const d=rowDate(o),inDate=!from||(d>=from&&d<=to),hay=[o.order_code,o.customer_name,o.customer_phone,o.official_sale_id].join(' ').toLowerCase();return inDate&&(!term||hay.includes(term));}).sort((a,b)=>new Date(b.created_at||b.updated_at||0)-new Date(a.created_at||a.updated_at||0));
  }
  function renderArchiveTable(){
    const box=q('#rdsTicketArchiveTable'),sum=q('#rdsTicketArchiveSummary');if(!box)return;const rows=getFilteredRows();
    if(sum)sum.innerHTML='<b>'+rows.length+'</b> compra(s) no período selecionado.';
    if(!rows.length){box.innerHTML='<div class="empty-state">Nenhuma compra concluída encontrada neste período ou busca.</div>';return;}
    box.innerHTML='<div class="rds-ticket-table-wrap"><table class="rds-ticket-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Venda oficial</th><th>Data</th><th>PDF</th><th>Ações</th></tr></thead><tbody>'+rows.map(o=>'<tr><td><b>'+esc(o.order_code||'—')+'</b></td><td><b>'+esc(o.customer_name||'Cliente')+'</b><small>'+esc(o.customer_phone||'—')+'</small></td><td>'+esc(o.official_sale_id||'—')+'</td><td>'+esc(dtR(o.created_at||o.sent_at||o.updated_at))+'</td><td><span class="rds-pdf-sent">'+statusLabel(o)+'</span></td><td><div class="rds-ticket-actions"><button class="btn" onclick="rdsOpenTicketPdf(\''+esc(o.id)+'\')">📄 Abrir PDF</button><button class="btn primary" onclick="rdsResendTicketPdf(\''+esc(o.id)+'\')">WhatsApp</button></div></td></tr>').join('')+'</tbody></table></div>';
  }
  async function refreshArchive(){await loadArchive();renderArchiveTable();}
  function bind(){
    const toggle=q('#rdsTicketArchiveToggle'),body=q('#rdsTicketArchiveBody');
    if(toggle&&!toggle.__bound){toggle.__bound=true;toggle.addEventListener('click',async()=>{archiveOpen=!archiveOpen;body.hidden=!archiveOpen;toggle.textContent=archiveOpen?'Fechar histórico':'Abrir histórico';if(archiveOpen)await refreshArchive();});}
    const period=q('#rdsTicketPeriod'),from=q('#rdsTicketFrom'),to=q('#rdsTicketTo'),search=q('#rdsTicketSearch'),refresh=q('#rdsTicketRefresh');
    if(period&&!period.__bound){period.__bound=true;period.addEventListener('change',()=>{const custom=period.value==='custom';from.hidden=!custom;to.hidden=!custom;if(custom&&!from.value){const r=periodRange('today');from.value=r[0];to.value=r[1];}renderArchiveTable();});}
    if(from&&!from.__bound){from.__bound=true;from.addEventListener('change',renderArchiveTable);}
    if(to&&!to.__bound){to.__bound=true;to.addEventListener('change',renderArchiveTable);}
    if(search&&!search.__bound){search.__bound=true;search.addEventListener('input',renderArchiveTable);}
    if(refresh&&!refresh.__bound){refresh.__bound=true;refresh.addEventListener('click',refreshArchive);}
  }
  function enhance(){
    if(typeof window.orders!=='function'||window.orders.__rdsTicketArchive)return;
    const original=window.orders;
    const wrapped=async function(){
      const r=await original.apply(this,arguments);const title=[...document.querySelectorAll('.page-title h1')].find(x=>x.textContent.trim()==='Compras');
      if(title&&!document.getElementById('rdsTicketArchiveCard')){const host=title.closest('.page-title'),holder=document.createElement('div');holder.innerHTML=archiveCard();host.parentNode.insertBefore(holder.firstElementChild,host.nextSibling);bind();}
      else if(document.getElementById('rdsTicketArchiveCard'))bind();return r;
    };wrapped.__rdsTicketArchive=true;window.orders=wrapped;
  }
  enhance();
  const st=document.createElement('style');st.textContent='.rds-ticket-archive-card{margin:14px 0}.rds-ticket-archive-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.rds-ticket-archive-head h2{margin:5px 0}.rds-ticket-filters{display:grid;grid-template-columns:150px 145px 145px minmax(220px,1fr) auto;gap:8px;margin:14px 0}.rds-ticket-filters input,.rds-ticket-filters select{min-height:38px}.rds-ticket-summary{font-size:11px;color:#71819a;margin:0 0 10px}.rds-ticket-table-wrap{overflow:auto;border:1px solid #dce6f2;border-radius:14px;background:#fff}.rds-ticket-table{width:100%;border-collapse:collapse;min-width:900px}.rds-ticket-table th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#71819a;background:#f7faff;text-align:left;padding:11px}.rds-ticket-table td{padding:12px 11px;border-top:1px solid #e7edf5;color:#203552;font-size:12px;vertical-align:middle}.rds-ticket-table td small{display:block;color:#71819a;margin-top:4px}.rds-pdf-sent{font-weight:900;color:#15925a}.rds-ticket-actions{display:flex;gap:6px;flex-wrap:wrap}.rds-ticket-actions .btn{min-height:34px;padding:7px 10px;font-size:10px}@media(max-width:900px){.rds-ticket-filters{grid-template-columns:1fr 1fr}.rds-ticket-filters input#rdsTicketSearch{grid-column:1/-1}.rds-ticket-filters button{grid-column:1/-1}}@media(max-width:600px){.rds-ticket-archive-head{display:block}.rds-ticket-filters{grid-template-columns:1fr}.rds-ticket-filters input#rdsTicketSearch{grid-column:auto}.rds-ticket-filters button{grid-column:auto}}';document.head.appendChild(st);
})();