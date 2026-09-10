(()=>{
  if(window.__RDS_V11_CONSISTENCY_FIX__)return;
  window.__RDS_V11_CONSISTENCY_FIX__=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dt=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  let lastReturnSignature='';
  let returnBusy=false;

  async function fresh(url,opt={}){
    const r=await fetch(url,{cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||d.message||'Falha na consulta');
    return d;
  }

  function pendingReturnsFromRows(rows){
    const latest=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
      const phone=String(r?.phone||'').replace(/\D/g,'');
      if(!phone)continue;
      if(!latest.has(phone))latest.set(phone,r);
    }
    return [...latest.values()];
  }

  function isReturnsPage(){return !!document.querySelector('#app h1') && /Retornos/i.test(document.querySelector('#app h1')?.textContent||'');}

  function removeReturnAlert(){
    document.querySelector('#rds-context-alert')?.remove();
    document.querySelectorAll('#app *').forEach(el=>{
      if(el.children.length)return;
      const t=(el.textContent||'').trim();
      if(/\d+ retorno\(s\) pendente\(s\)\.?/i.test(t))el.textContent='0 retorno(s) pendente(s).';
    });
    document.querySelectorAll('#app *').forEach(el=>{
      if(/atenção operacional/i.test(el.textContent||'') && /retorno\(s\) pendente\(s\)/i.test(el.textContent||''))el.style.display='none';
    });
    document.querySelectorAll('#nav button[data-page="returns"],#mobileNav button[data-page="returns"]').forEach(btn=>btn.querySelectorAll('.rds-nav-alert,.badge,.count,.notification-badge,[data-count]').forEach(x=>x.remove()));
  }

  function paintCentralReturnCount(count){
    document.querySelectorAll('#app .metric-card').forEach(card=>{
      const label=card.querySelector('.eyebrow')?.textContent?.trim();
      if(label==='Retornos'){
        const metric=card.querySelector('.metric');
        if(metric)metric.textContent=String(count);
      }
    });
  }

  async function syncPendingReturnIndicator(){
    try{
      const rows=await fresh('/api/returns');
      const list=pendingReturnsFromRows(rows);
      paintCentralReturnCount(list.length);
      if(list.length===0)removeReturnAlert();
      return list;
    }catch(e){return null}
  }

  async function syncReturns(){
    if(!isReturnsPage()||returnBusy)return;
    returnBusy=true;
    try{
      const [rs,os]=await Promise.all([fresh('/api/returns'),fresh('/api/orders')]);
      const list=pendingReturnsFromRows(rs);
      if(!list.length){
        const signature='0';
        if(lastReturnSignature!==signature){
          const app=document.querySelector('#app');
          if(app)app.innerHTML='<div class="page-title"><div><span class="eyebrow">ATENDIMENTO E RETORNOS</span><h1>Retornos</h1><p class="mut">Somente retornos que realmente precisam de intervenção.</p></div></div><div class="card"><div class="rds-section-head"><div><span class="eyebrow">RETORNOS PENDENTES</span></div><strong>0</strong></div><div class="empty-state">Nenhum retorno pendente.</div></div>';
          removeReturnAlert();
          lastReturnSignature=signature;
        }
        return;
      }
      const signature=JSON.stringify(list.map(r=>[r.id,r.phone,r.created_at,r.body,r.message_type]));
      if(signature===lastReturnSignature)return;
      const app=document.querySelector('#app');
      if(!app)return;
      app.innerHTML=`<div class="page-title"><div><span class="eyebrow">ATENDIMENTO E RETORNOS</span><h1>Retornos</h1><p class="mut">Somente retornos que realmente precisam de intervenção.</p></div></div><div class="card"><div class="rds-section-head"><div><span class="eyebrow">RETORNOS PENDENTES</span></div><strong>${list.length}</strong></div>${list.map(r=>{const o=(Array.isArray(os)?os:[]).find(x=>x.phone===r.phone&&!['CONCLUIDO','CANCELADO'].includes(x.status));return `<div class="priority"><div><strong>${esc(r.phone||'Identidade pendente')}</strong><small>${dt(r.created_at)}</small><small>${esc(r.body||`[${r.message_type||'mídia'} recebida]`)}</small></div><div class="row"><a target="_blank" href="https://wa.me/${esc(r.phone||'')}">${'<button class="btn">Abrir WhatsApp</button>'}</a>${o?'<button class="btn primary" onclick="go(\'orders\')">Abrir pedido</button>':''}</div></div>`}).join('')}</div>`;
      lastReturnSignature=signature;
    }catch(e){console.warn('[RDS] consistency returns',e)}finally{returnBusy=false;}
  }

  function bindNavigationCapture(){
    document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(b=>{
      if(b.dataset.rdsConsistencyNav==='1')return;
      b.dataset.rdsConsistencyNav='1';
      b.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        const p=b.dataset.page;
        if(p==='about'&&typeof window.rdsAbout==='function'){window.go?.('about');return;}
        if(typeof window.go==='function')window.go(p);
      },true);
    });
  }

  bindNavigationCapture();
  new MutationObserver(()=>{bindNavigationCapture();if(isReturnsPage())syncReturns();else syncPendingReturnIndicator();}).observe(document.body,{childList:true,subtree:true});
  setInterval(()=>{bindNavigationCapture();syncPendingReturnIndicator();syncReturns();},2000);
  setTimeout(()=>{syncPendingReturnIndicator();syncReturns()},250);
})();
