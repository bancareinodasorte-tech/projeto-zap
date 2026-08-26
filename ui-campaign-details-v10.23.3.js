(()=>{
  function cleanCampaignStepMessage(raw){
    const text=String(raw||'');
    const hasImage=/^\[\[RDS_IMAGE:data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(text);
    const cleaned=text.replace(/^\[\[RDS_IMAGE:data:image\/(?:png|jpeg|jpg|webp);base64,[\s\S]*?\]\]\s*/i,'').trim();
    return {hasImage,text:cleaned};
  }

  window.campaignDetails=async function(id){
    try{
      const d=await api(`/api/campaigns/${id}/details`);
      modal(`<h2>${esc(d.campaign.name)}</h2><p>${badge(d.campaign.status)} • início ${dt(d.campaign.start_at)}</p>${d.steps.map(s=>{
        const m=cleanCampaignStepMessage(s.message);
        return `<div class=step><b>Etapa ${s.step_index}</b>${s.step_index>1?` • +${s.delay_minutes} min`:''}${m.hasImage?'<p><span class="badge ok">IMAGEM ANEXADA</span></p>':''}<p>${esc(m.text||'Sem texto')}</p></div>`;
      }).join('')}<h3>Fila por destinatário</h3><div class=table><table><tr><th>WhatsApp</th><th>Etapa</th><th>Horário</th><th>Status</th></tr>${d.deliveries.map(x=>`<tr><td>${esc(x.phone)}</td><td>${x.step_index}</td><td>${dt(x.scheduled_at)}</td><td>${badge(x.status)}</td></tr>`).join('')}</table></div>`);
    }catch(e){toast(e.message)}
  };
})();
