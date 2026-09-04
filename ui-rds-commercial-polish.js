(()=>{
  const q=s=>document.querySelector(s);
  const E=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const b=(t,f,c='btn')=>`<button class="${c}" onclick="${f}">${t}</button>`;

  // Retornos: o indicador deve refletir somente retornos realmente pendentes.
  function cleanReturnBadges(){
    document.querySelectorAll('#nav button[data-page="returns"],#mobileNav button[data-page="returns"]').forEach(btn=>{
      btn.querySelectorAll('.rds-nav-return-badge').forEach(x=>x.remove());
      btn.querySelectorAll('.badge,.count,.notification-badge,[data-count]').forEach(x=>{ if(x!==btn) x.remove(); });
    });
  }
  async function syncReturnBadge(){
    try{
      const rows=await api('/api/returns');
      const seen=new Set();
      for(const r of rows||[]){const p=String(r.phone||'');if(p)seen.add(p);}
      const n=seen.size;
      cleanReturnBadges();
      if(!n)return;
      document.querySelectorAll('#nav button[data-page="returns"],#mobileNav button[data-page="returns"]').forEach(btn=>{
        const x=document.createElement('span');x.className='rds-nav-return-badge';x.textContent=n>99?'99+':String(n);btn.appendChild(x);
      });
    }catch{}
  }
  const badgeStyle=document.createElement('style');
  badgeStyle.textContent='.rds-nav-return-badge{display:inline-grid!important;place-items:center!important;min-width:18px!important;height:18px!important;padding:0 5px!important;margin-left:4px!important;border-radius:999px!important;background:#c53c46!important;color:#fff!important;font-size:10px!important;font-weight:900!important;line-height:18px!important}.mobile-nav .rds-nav-return-badge{position:absolute!important;transform:translate(8px,-6px)!important}.mobile-nav button[data-page="returns"]{position:relative!important}.side-nav button[data-page="returns"]::after,.mobile-nav button[data-page="returns"]::after{content:none!important;display:none!important}';
  document.head.appendChild(badgeStyle);
  setInterval(syncReturnBadge,10000);setTimeout(syncReturnBadge,700);document.addEventListener('click',e=>{if(e.target.closest('button[data-page="returns"]'))setTimeout(syncReturnBadge,300);});

  // Ajustes: transforma o quadro genérico "Bot comercial" em um bloco operacional útil.
  const baseSettings=window.settings;
  if(typeof baseSettings==='function'){
    window.settings=async function(){
      await baseSettings();
      const card=[...document.querySelectorAll('#app .card')].find(x=>x.querySelector('h2')?.textContent.trim()==='Bot comercial');
      if(!card)return;
      const s=state.settings||{};
      card.innerHTML=`<span class="eyebrow">Operação de vendas</span><h2>Regras de vendas e pagamento</h2><p class="mut">Configurações usadas pelo atendimento, pelos pedidos e pelo encerramento da compra.</p><label><input type="checkbox" id="botEnabled" style="width:auto" ${s.bot_enabled?'checked':''}> Bot de vendas ativo</label><label>WhatsApp do escritório</label><input id="office" value="${E(s.office_whatsapp||'')}"><label>Preço padrão do bilhete</label><input id="unitPrice" type="number" min="0.01" step=".01" value="${Number(s.unit_price||s.default_unit_price||3)}"><p class="mini">Este é o preço central dos pedidos. As campanhas não precisam repetir esse valor.</p><label>Chave PIX</label><input id="pixKey" value="${E(s.pix_key||'')}"><label>Favorecido</label><input id="pixName" value="${E(s.pix_name||'')}"><label>Mensagem final da compra</label><textarea id="finalMsg">${E(s.final_message||'')}</textarea><div class="row">${b('Salvar configurações','saveSettings()','btn primary')}</div>`;
    };
  }

  // Campanhas: somente parâmetros que têm função operacional direta.
  window.newCampaign=async function(){
    await loadContacts();window.campSteps=[{message:'',delay_minutes:0,image:''}];
    modal(`<span class="eyebrow">Nova campanha</span><h2>Planejamento inteligente</h2><label>Nome</label><input id="cpname"><label>Primeiro envio</label><input id="cpstart" type="datetime-local"><label>Público</label><select id="cptarget" onchange="targetUI()"><option value="all">Todos os clientes qualificados</option><option value="group">Grupo</option><option value="individual">Seleção individual</option></select><div id="targetbox"></div><details class="rds-campaign-rules" open><summary><b>CTA de compra</b><span>EDITÁVEL</span></summary><label class="rds-check"><input id="crCtaEnabled" type="checkbox" checked> Ativar CTA de compra</label><label>Texto do CTA <input id="crCtaText" value="🛒 COMPRAR BILHETES" maxlength="60"></label><p class="mini">O CTA abre diretamente a conversa de compra. O texto pode ser adaptado à campanha.</p></details><div id="stepsbox"></div><details class="rds-campaign-rules" open><summary><b>Distribuição inteligente</b><span>ATIVA POR PADRÃO</span></summary><div class="rds-smart-note">🔀 Campanhas compatíveis compartilham a audiência automaticamente. Cada cliente recebe mensagens de campanhas diferentes entre as etapas, com novo embaralhamento a cada onda. <b>São necessárias no mínimo 2 campanhas compatíveis.</b></div><div class="rds-rule-grid"><label>Máximo por dia <input id="crDay" type="number" min="0" value="0"></label><label>Intervalo global entre envios (segundos) <input id="crIntSec" type="number" min="15" value="15"></label><label>Início permitido <input id="crStart" type="time" value="08:00"></label><label>Fim permitido <input id="crEnd" type="time" value="20:00"></label></div><label class="rds-check"><input id="crAvoid" type="checkbox" checked> Bloquear repetição da mesma mensagem para o mesmo cliente</label><label class="rds-check"><input id="crStop" type="checkbox" checked> Retirar cliente automaticamente ao entrar em pedido</label></details><div class="row">${b('+ Mensagem / lembrete','addStep()','btn')}${b('Salvar campanha','saveCampaign()','btn primary')}</div>`);
    renderSteps();targetUI();
  };

  window.saveCampaign=async function(){
    try{
      const mode=q('#cptarget').value,selected=[...document.querySelectorAll('.cpcontact:checked')].map(x=>x.value),sv=q('#cpstart').value;
      if(!q('#cpname').value.trim())throw new Error('Informe o nome da campanha.');
      if(!sv)throw new Error('Informe o primeiro envio.');
      if(!window.campSteps?.some(s=>String(s.message||'').trim()||s.image))throw new Error('Informe pelo menos uma mensagem.');
      const steps=(campSteps||[]).map(s=>({delay_minutes:Number(s.delay_minutes||0),message:(s.image?`[[RDS_IMAGE:${s.image}]]\n`:'')+String(s.message||'')}));
      const created=await post('/api/campaigns',{name:q('#cpname').value.trim(),start_at:new Date(sv).toISOString(),target_mode:mode,target_group:mode==='group'?q('#cpgroup')?.value:null,selected_contact_ids:selected,cta_enabled:q('#crCtaEnabled').checked,cta_text:q('#crCtaText').value.trim()||'🛒 COMPRAR BILHETES',steps});
      const id=created?.id||created?.campaign?.id;
      if(id)await put(`/api/campaigns/${id}/rules`,{max_per_day:Number(q('#crDay').value||0),max_per_hour:0,interval_seconds:Math.max(15,Number(q('#crIntSec').value||15)),window_start:q('#crStart').value||'08:00',window_end:q('#crEnd').value||'20:00',batch_limit:0,shuffle:true,avoid_repeat:q('#crAvoid').checked,stop_on_order:q('#crStop').checked,intelligent_distribution:true});
      document.querySelector('.modal')?.remove();toast(id?'Campanha salva com distribuição inteligente.':'Campanha salva.');campaigns();
    }catch(e){toast(e.message)}
  };

  window.campaignRules=async function(id){
    try{
      const c=state.campaigns.find(x=>x.id===id)||await api(`/api/campaigns/${id}`);
      const r=await api(`/api/campaigns/${id}/rules`).catch(()=>({}));
      const v=Object.assign({max_per_day:0,interval_seconds:15,window_start:'08:00',window_end:'20:00',avoid_repeat:true,stop_on_order:true,intelligent_distribution:true},r||{});
      modal(`<span class="eyebrow">Proteção de disparo</span><h2>Regras — ${E(c.name)}</h2><p class="mut">Somente controles que alteram o comportamento real dos envios.</p><label>Máximo de mensagens por dia (0 = sem limite)</label><input id="crDay" type="number" min="0" value="${Number(v.max_per_day||0)}"><label>Intervalo global entre envios (segundos)</label><input id="crIntSec" type="number" min="15" value="${Math.max(15,Number(v.interval_seconds||15))}"><label>Início permitido</label><input id="crStart" type="time" value="${E(v.window_start||'08:00')}"><label>Fim permitido</label><input id="crEnd" type="time" value="${E(v.window_end||'20:00')}"><label><input id="crAvoid" type="checkbox" style="width:auto" ${v.avoid_repeat!==false?'checked':''}> Não repetir a mesma mensagem para o mesmo cliente</label><label><input id="crStop" type="checkbox" style="width:auto" ${v.stop_on_order!==false?'checked':''}> Retirar automaticamente quem entrar em pedido</label><p class="mini">Distribuição inteligente: <b>ATIVA POR PADRÃO</b>. Não há grupo de embaralhamento manual.</p><div class="row">${b('Salvar regras',`saveCampaignRules('${id}')`,'btn primary')}</div>`);
    }catch(e){toast(e.message)}
  };
  window.saveCampaignRules=async function(id){
    try{
      const body={max_per_day:Number(q('#crDay').value||0),max_per_hour:0,interval_seconds:Math.max(15,Number(q('#crIntSec').value||15)),interval_minutes:0,window_start:q('#crStart').value||'08:00',window_end:q('#crEnd').value||'20:00',batch_limit:0,shuffle:true,avoid_repeat:q('#crAvoid').checked,stop_on_order:q('#crStop').checked,intelligent_distribution:true};
      await put(`/api/campaigns/${id}/rules`,body);document.querySelector('.modal')?.remove();toast('Regras de campanha salvas.');campaigns();
    }catch(e){toast(e.message)}
  };

  const css=document.createElement('style');css.textContent=`.rds-smart-note{margin:12px 14px;padding:11px 12px;border:1px solid #cfe0f4;border-radius:12px;background:#fff;font-size:11px;line-height:1.45;color:#284b72}.rds-campaign-rules{margin:14px 0;padding:0;border:1px solid #dce6f2;border-radius:14px;background:#f8fbff}.rds-campaign-rules summary{padding:13px 14px;cursor:pointer;display:flex;justify-content:space-between;color:#17365d}.rds-campaign-rules summary span{font-size:10px;color:#16734a;font-weight:900}.rds-rule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 14px 10px}.rds-rule-grid label{font-size:10px;font-weight:800;color:#53677f}.rds-rule-grid input{margin-top:5px}.rds-check{display:block;padding:6px 14px;font-size:10px!important;font-weight:700!important;color:#435a74}.rds-check input{width:auto!important;margin-right:6px}@media(max-width:760px){.rds-rule-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(css);
})();
