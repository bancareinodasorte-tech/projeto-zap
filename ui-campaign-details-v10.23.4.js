(()=>{
  const cleanStepMessage=raw=>{
    const text=String(raw||'');
    const hasImage=/^\[\[RDS_IMAGE:data:image\/(png|jpeg|jpg|webp);base64,/i.test(text);
    const body=text.replace(/^\[\[RDS_IMAGE:data:image\/(?:png|jpeg|jpg|webp);base64,[\s\S]*?\]\]\s*/i,'').trim();
    return {hasImage,body};
  };
  const key=p=>String(p||'').replace(/\D/g,'').slice(-13);
  window.campaignDetails=async function(id){
    try{
      const [d,contacts,orders]=await Promise.all([
        api(`/api/campaigns/${id}/details`),
        api('/api/contacts').catch(()=>[]),
        api('/api/orders').catch(()=>[])
      ]);
      const contactNames=new Map();
      for(const c of contacts||[]){const k=key(c.phone);if(k&&c.name)contactNames.set(k,String(c.name).trim())}
      const orderNames=new Map();
      for(const o of orders||[]){const k=key(o.phone);if(k&&o.customer_name&&!orderNames.has(k))orderNames.set(k,String(o.customer_name).trim())}
      const displayName=phone=>contactNames.get(key(phone))||orderNames.get(key(phone))||'';
      modal(`<h2>${esc(d.campaign.name)}</h2><p>${badge(d.campaign.status)} • início ${dt(d.campaign.start_at)}</p>${d.steps.map(s=>{const m=cleanStepMessage(s.message);return `<div class=step><b>Etapa ${s.step_index}</b>${s.step_index>1?` • +${s.delay_minutes} min`:''}${m.hasImage?'<p><span class="badge ok">IMAGEM ANEXADA</span></p>':''}${m.body?`<p>${esc(m.body)}</p>`:''}</div>`}).join('')}<h3>Fila por destinatário</h3><div class=table><table><tr><th>WhatsApp / Cliente</th><th>Etapa</th><th>Horário</th><th>Status</th></tr>${d.deliveries.map(x=>{const n=displayName(x.phone);return `<tr><td><strong>${esc(x.phone)}</strong>${n?`<br><span class="mini">${esc(n)}</span>`:''}</td><td>${x.step_index}</td><td>${dt(x.scheduled_at)}</td><td>${badge(x.status)}</td></tr>`}).join('')}</table></div>`)
    }catch(e){toast(e.message)}
  };
})();
