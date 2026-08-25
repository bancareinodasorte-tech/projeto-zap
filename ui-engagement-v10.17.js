(()=>{
  const oldAutomation=window.automation;
  window.rds1017Hours=12;
  window.rds1017Data=null;

  async function load(){
    const d=await api(`/api/v1017/engagement?hours=${window.rds1017Hours}`);
    window.rds1017Data=d;
    return d;
  }
  function card(label,value){return `<div class="card"><span class="eyebrow">${label}</span><div class="metric">${Number(value||0)}</div></div>`}
  window.rds1017Refresh=async function(){
    const sel=document.querySelector('#rds1017Hours');
    if(sel) window.rds1017Hours=Number(sel.value||12);
    const host=document.querySelector('#rds1017Body');
    if(host)host.innerHTML='<p class="mut">Atualizando...</p>';
    try{const d=await load();renderBody(d)}catch(e){if(host)host.innerHTML=`<p>${esc(e.message)}</p>`}
  };
  function renderBody(d){
    const host=document.querySelector('#rds1017Body'); if(!host)return;
    const ignored=(d.rows||[]).filter(r=>r.engagement==='IGNORADO');
    host.innerHTML=`<div class="grid">${card('Enviados',d.summary.sent)}${card('Responderam',d.summary.responded)}${card('Ignorados',d.summary.ignored)}${card('Em pedido',d.summary.in_order)}${card('Compraram',d.summary.purchased)}${card('Aguardando',d.summary.waiting)}</div>
      ${ignored.length?`<div class="row" style="margin-top:14px;justify-content:space-between"><div><strong>${ignored.length} cliente(s) sem resposta</strong><div class="mini">Apenas clientes sem retorno após o prazo escolhido.</div></div><button class="btn primary" onclick="rds1017CampaignIgnored()">Criar campanha para ignorados</button></div>
      <div style="margin-top:10px">${ignored.slice(0,20).map(r=>`<div class="priority"><div><strong>${esc(r.name)}</strong><small>${esc(r.phone)} • ${r.age_hours}h sem resposta</small></div><span class="badge warn">IGNORADO</span></div>`).join('')}</div>`:'<div class="empty-state" style="margin-top:12px">Nenhum ignorado neste prazo.</div>'}`;
  }
  window.rds1017CampaignIgnored=async function(){
    try{
      const d=window.rds1017Data||await load();
      const ids=(d.rows||[]).filter(r=>r.engagement==='IGNORADO'&&r.contact_id).map(r=>r.contact_id);
      if(!ids.length)return toast('Nenhum contato ignorado disponível para campanha.');
      await newCampaign();
      const target=document.querySelector('#cptarget');
      if(target){target.value='individual';targetUI();}
      document.querySelectorAll('.cpcontact').forEach(x=>{x.checked=ids.includes(x.value)});
      const name=document.querySelector('#cpname');if(name)name.value='Reenvio para ignorados';
      const start=document.querySelector('#cpstart');
      if(start){const d2=new Date(Date.now()+60*60*1000);const pad=n=>String(n).padStart(2,'0');start.value=`${d2.getFullYear()}-${pad(d2.getMonth()+1)}-${pad(d2.getDate())}T${pad(d2.getHours())}:${pad(d2.getMinutes())}`;}
      toast(`${ids.length} ignorado(s) selecionado(s). Escreva uma nova mensagem e salve.`);
    }catch(e){toast(e.message)}
  };

  window.automation=async function(){
    await oldAutomation();
    try{
      if(document.querySelector('#rds1017Engagement'))return;
      const box=document.createElement('div');box.id='rds1017Engagement';box.className='card';
      box.innerHTML=`<span class="eyebrow">Retorno das campanhas</span><h2>Responderam x ignorados</h2><p class="mut">Quem respondeu sai automaticamente dos lembretes futuros. Quem não respondeu pode entrar em uma nova campanha.</p><div class="row"><label style="margin:0">Considerar ignorado após</label><select id="rds1017Hours" onchange="rds1017Refresh()" style="width:auto"><option value="6">6 horas</option><option value="12" selected>12 horas</option><option value="24">24 horas</option><option value="48">48 horas</option></select></div><div id="rds1017Body"><p class="mut">Carregando...</p></div>`;
      const title=document.querySelector('#app .page-title'); if(title)title.insertAdjacentElement('afterend',box); else app.prepend(box);
      const d=await load();renderBody(d);
    }catch(e){console.error('V10.17 UI',e)}
  };
})();
