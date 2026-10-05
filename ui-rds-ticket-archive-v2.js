(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const moneyR=v=>typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dtR=v=>typeof dt==='function'?dt(v):new Date(v).toLocaleString('pt-BR');
  const groups=[['COLETANDO_DADOS','Em atendimento'],['AGUARDANDO_PAGAMENTO','Aguardando PIX'],['AGUARDANDO_CONFERENCIA','Comprovantes recebidos'],['PAGO_AGUARDANDO_BILHETES','Pagamento confirmado'],['CONCLUIDO','Concluídas'],['CANCELADO','Canceladas']];
  const q=s=>document.querySelector(s);
  let archiveRows=[];
  function statusLabel(s){return groups.find(x=>x[0]===s)?.[1]||String(s||'—').replaceAll('_',' ')}
  function sentLabel(o){return o.status==='CONCLUIDO'?'✓ Enviado':'—'}
  async function loadArchive(search=''){
    try{const r=await fetch('/api/rds/ticket-archive?search='+encodeURIComponent(search||'')+'&rds='+Date.now(),{cache:'no-store'});const d=await r.json();archiveRows=Array.isArray(d.rows)?d.rows:[];}catch{archiveRows=[]}
  }
  function openPdf(id){window.open('/api/rds/ticket-pdf/'+encodeURIComponent(id)+'?rds='+Date.now(),'_blank','noopener,noreferrer')}
  window.rdsResendTicketPdf=async id=>{
    try{
      const r=await fetch('/api/rds/ticket-pdf/'+encodeURIComponent(id)+'/resend',{method:'POST',headers:{'Content-Type':'application/json'}});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Falha ao reenviar o PDF.');
      toast('PDF reenviado pelo WhatsApp.');
      await window.orders();
    }catch(e){toast(e.message)}
  };
  function archiveCard(orders){
    const completed=orders.filter(o=>o.status==='CONCLUIDO'&&o.official_sale_id);
    return `<section class="card rds-ticket-archive-card">
      <div class="rds-ticket-archive-head">
        <div><span class="eyebrow">PÓS-VENDA</span><h2>Arquivo de bilhetes enviados</h2><p class="mut">Cada compra concluída mantém o PDF disponível para consulta e reenvio.</p></div>
        <span class="rds-ticket-archive-count">${completed.length} compra(s)</span>
      </div>
      <div class="toolbar rds-ticket-archive-search"><input id="rdsTicketArchiveSearch" placeholder="Buscar pedido, cliente ou WhatsApp" autocomplete="off"><button class="btn" type="button" id="rdsTicketArchiveClear">Limpar</button></div>
      <div id="rdsTicketArchiveTable"></div>
    </section>`;
  }
  function renderArchiveTable(){
    const box=q('#rdsTicketArchiveTable');if(!box)return;
    const term=(q('#rdsTicketArchiveSearch')?.value||'').trim().toLowerCase();
    const rows=(state.orders||[]).filter(o=>o.status==='CONCLUIDO'&&o.official_sale_id).filter(o=>!term||[o.code,o.customer_name,o.phone,o.contact_phone].join(' ').toLowerCase().includes(term));
    if(!rows.length){box.innerHTML='<div class="empty-state">Nenhuma compra concluída encontrada para esta busca.</div>';return}
    box.innerHTML=`<div class="rds-ticket-table-wrap"><table class="rds-ticket-table"><thead><tr><th>Pedido</th><th>Emissão</th><th>PDF WhatsApp</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map(o=>`<tr>
      <td><b>${esc(o.code)}</b><small>${esc(o.customer_name||o.phone||'Cliente')}</small></td>
      <td>Venda oficial ${esc(o.official_sale_id)}<small>${o.official_issue_at?esc(dtR(o.official_issue_at)):'—'}</small></td>
      <td><span class="rds-pdf-sent">${sentLabel(o)}</span></td>
      <td><span class="badge ok">CONCLUÍDO</span></td>
      <td><div class="rds-ticket-actions"><button class="btn" onclick="rdsOpenTicketPdf('${esc(o.id)}')">📄 Abrir PDF</button><button class="btn primary" onclick="rdsResendTicketPdf('${esc(o.id)}')">WhatsApp</button></div></td>
    </tr>`).join('')}</tbody></table></div>`;
  }
  window.rdsOpenTicketPdf=openPdf;
  function enhance(){
    if(typeof window.orders!=='function'||window.orders.__rdsTicketArchive)return;
    const original=window.orders;
    const wrapped=async function(){
      const r=await original.apply(this,arguments);
      if(!document.getElementById('rdsTicketArchiveCard')){
        const title=[...document.querySelectorAll('.page-title h1')].find(x=>x.textContent.trim()==='Compras');
        if(title){
          const host=title.closest('.page-title');
          const card=document.createElement('div');card.id='rdsTicketArchiveCard';card.innerHTML=archiveCard(state.orders||[]);
          host.parentNode.insertBefore(card.firstElementChild,host.nextSibling);
          const input=q('#rdsTicketArchiveSearch'),clear=q('#rdsTicketArchiveClear');
          input?.addEventListener('input',renderArchiveTable);clear?.addEventListener('click',()=>{if(input){input.value='';renderArchiveTable()}});
          renderArchiveTable();
        }
      }
      return r;
    };
    wrapped.__rdsTicketArchive=true;window.orders=wrapped;
  }
  enhance();
  const st=document.createElement('style');st.textContent=`
    .rds-ticket-archive-card{margin:14px 0}
    .rds-ticket-archive-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .rds-ticket-archive-head h2{margin:5px 0}
    .rds-ticket-archive-count{background:#edf5ff;border:1px solid #cfe0f3;border-radius:999px;padding:8px 12px;color:#124d88;font-weight:800;font-size:11px;white-space:nowrap}
    .rds-ticket-archive-search{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0}
    .rds-ticket-table-wrap{overflow:auto;border:1px solid #dce6f2;border-radius:14px;background:#fff}
    .rds-ticket-table{width:100%;border-collapse:collapse;min-width:720px}
    .rds-ticket-table th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#71819a;background:#f7faff;text-align:left;padding:11px}
    .rds-ticket-table td{padding:12px 11px;border-top:1px solid #e7edf5;color:#203552;font-size:12px;vertical-align:middle}
    .rds-ticket-table td small{display:block;color:#71819a;margin-top:4px}
    .rds-pdf-sent{font-weight:900;color:#15925a}
    .rds-ticket-actions{display:flex;gap:6px;flex-wrap:wrap}
    .rds-ticket-actions .btn{min-height:34px;padding:7px 10px;font-size:10px}
    @media(max-width:760px){.rds-ticket-archive-head{display:block}.rds-ticket-archive-count{display:inline-block;margin-top:8px}.rds-ticket-archive-search{grid-template-columns:1fr}.rds-ticket-table-wrap{margin-left:-2px;margin-right:-2px}}
  `;document.head.appendChild(st);
})();