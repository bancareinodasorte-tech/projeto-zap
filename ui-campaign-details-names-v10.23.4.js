(()=>{
  const digits=v=>String(v||'').replace(/\D/g,'');
  const key=v=>{const d=digits(v);return d.length>11?d.slice(-11):d};
  const cleanStepMessage=v=>{const raw=String(v||'');const m=raw.match(/^\[\[RDS_IMAGE:data:image\/(?:png|jpeg|jpg|webp);base64,[^\]]+\]\]\s*/i);return {hasImage:!!m,text:(m?raw.slice(m[0].length):raw).trim()}};
  window.campaignDetails=async function(id){
    try{
      const [d,contacts,orders]=await Promise.all([
        api(`/api/campaigns/${id}/details`),
        api('/api/contacts').catch(()=>[]),
        api('/api/orders').catch(()=>[])
      ]);
      const contactByPhone=new Map();
      for(const c of contacts||[]){const k=key(c.phone);if(k&&!contactByPhone.has(k)&&String(c.name||'').trim())contactByPhone.set(k,String(c.name).trim())}
      const orderByPhone=new Map();
      for(const o of orders||[]){const k=key(o.phone);const name=String(o.customer_name||'').trim();if(k&&name&&!orderByPhone.has(k))orderByPhone.set(k,name)}
      const resolveName=phone=>contactByPhone.get(key(phone))||orderByPhone.get(key(phone))||'';
      modal(`<h2>${esc(d.campaign.name)}</h2><p>${badge(d.campaign.status)} • início ${dt(d.campaign.start_at)}</p>${d.steps.map(s=>{const x=cleanStepMessage(s.message);return `<div class=step><b>Etapa ${s.step_index}</b>${s.step_index>1?` • +${s.delay_minutes} min`:''}${x.hasImage?'<p><span class="badge ok">IMAGEM ANEXADA</span></p>':''}<p>${esc(x.text||'Sem texto')}</p></div>`}).join('')}<h3>Fila por destinatário</h3><div class=table><table><tr><th>WhatsApp</th><th>Etapa</th><th>Horário</th><th>Status</th></tr>${d.deliveries.map(x=>{const name=resolveName(x.phone);return `<tr><td><strong>${esc(x.phone)}</strong>${name?`<br><span class="mini">${esc(name)}</span>`:''}</td><td>${x.step_index}</td><td>${dt(x.scheduled_at)}</td><td>${badge(x.status)}</td></tr>`}).join('')}</table></div>`)
    }catch(e){toast(e.message)}
  };
})();
