(()=>{
  const SYS_KEY='rds:reinoSystemUrl', ANDROID_KEY='rds:reinoAndroidUrl', WEB_KEY='rds:reinoWebUrl';
  const cleanUrl=v=>{try{const u=new URL(String(v||'').trim());return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
  const current=(key,fallback='')=>cleanUrl(localStorage.getItem(key))||cleanUrl(fallback)||'';
  const toggle=(body,button,open=false)=>{body.style.display=open?'':'none';button.textContent=open?'Ocultar detalhes':'Ver detalhes'};

  function compactSections(){
    document.querySelectorAll('#app .rds-section.card').forEach(card=>{
      if(card.dataset.v37)return; card.dataset.v37='1';
      const title=card.querySelector('.rds-section-title'); const body=title?.nextElementSibling;
      if(!title||!body)return;
      const b=document.createElement('button'); b.className='btn rds-v37-toggle'; b.textContent='Ver detalhes';
      b.onclick=()=>toggle(body,b,body.style.display==='none'); title.appendChild(b); toggle(body,b,false);
    });
    document.querySelectorAll('#app > .card.table').forEach(card=>{
      if(card.dataset.v37)return; card.dataset.v37='1';
      const table=card.querySelector('table'); if(!table)return;
      const head=document.createElement('div'); head.className='rds-v37-table-head'; head.innerHTML='<strong>Lista de clientes</strong>';
      const b=document.createElement('button'); b.className='btn rds-v37-toggle'; b.textContent='Ver lista';
      b.onclick=()=>toggle(table,b,table.style.display==='none'); head.appendChild(b); card.insertBefore(head,table); toggle(table,b,false);
    });
  }

  function compactReturns(){
    document.querySelectorAll('#returnsList > .card').forEach(card=>{
      if(card.dataset.v37)return; card.dataset.v37='1';
      const header=card.querySelector(':scope > .row'); if(!header)return;
      const body=[...card.children].filter(x=>x!==header); if(!body.length)return;
      const bodyWrap=document.createElement('div'); bodyWrap.className='rds-v37-return-body'; body.forEach(x=>bodyWrap.appendChild(x));
      const b=document.createElement('button'); b.className='btn rds-v37-toggle'; b.textContent='Ver detalhes';
      b.onclick=()=>toggle(bodyWrap,b,bodyWrap.style.display==='none');
      header.appendChild(b); card.appendChild(bodyWrap); toggle(bodyWrap,b,false);
    });
  }

  function compactSettings(){
    document.querySelectorAll('#app > .card').forEach(card=>{
      if(card.dataset.v37)return; card.dataset.v37='1';
      const h=card.querySelector('h2,h3'); if(!h)return;
      const body=[...card.children].filter(x=>x!==h&&!x.classList.contains('eyebrow'));
      if(!body.length)return;
      const wrap=document.createElement('div'); wrap.className='rds-v37-settings-body'; body.forEach(x=>wrap.appendChild(x));
      const b=document.createElement('button'); b.className='btn rds-v37-toggle'; b.textContent='Ver detalhes'; b.onclick=()=>toggle(wrap,b,wrap.style.display==='none');
      const line=document.createElement('div'); line.className='rds-v37-card-head'; line.append(h,b);
      card.innerHTML=''; card.append(line,wrap); toggle(wrap,b,false);
    });
  }

  const oldOrders=window.orders, oldPayments=window.paymentsPage, oldReturns=window.returnsPage, oldContacts=window.contacts, oldSettings=window.settings;
  window.orders=async()=>{
    await oldOrders(); compactSections();
    const sys=current(WEB_KEY,localStorage.getItem(SYS_KEY)||''), appUrl=current(ANDROID_KEY,'');
    document.querySelectorAll('#app .rds-order').forEach(card=>{
      if(card.dataset.v37Access)return; card.dataset.v37Access='1';
      const buttons=card.querySelector('.rds-buttons'); if(!buttons)return;
      const box=document.createElement('div'); box.className='rds-v37-issue-access'; box.innerHTML='<span>Emissão</span>';
      if(appUrl)box.insertAdjacentHTML('beforeend',`<a target="_blank" href="${esc(appUrl)}">${btn('Abrir app Android','')}</a>`);
      if(sys)box.insertAdjacentHTML('beforeend',`<a target="_blank" href="${esc(sys)}">${btn('Abrir sistema (PC/iPhone)','')}</a>`);
      buttons.before(box);
    });
  };
  window.paymentsPage=async()=>{await oldPayments();compactSections()};
  window.contacts=async()=>{await oldContacts();compactSections()};
  window.returnsPage=async()=>{await oldReturns();compactReturns()};
  window.settings=async()=>{
    await oldSettings(); compactSettings();
    if(document.querySelector('#rdsV37ReinoAccess'))return;
    const d=await api('/api/v1036/flow-status').catch(()=>({system_url:''}));
    const web=current(WEB_KEY,d.system_url||''), android=current(ANDROID_KEY,'');
    const box=document.createElement('section'); box.id='rdsV37ReinoAccess'; box.className='card';
    box.innerHTML=`<span class=eyebrow>EMISSÃO DE BILHETES</span><h2>Acesso ao Reino da Sorte</h2><p class=mut>Atalhos para o operador concluir a emissão após o pagamento. Nenhuma função de compra ou pagamento é removida.</p><div class=rds-v37-access-grid><div><strong>Android • aplicativo</strong><small>Use o aplicativo Reino da Sorte neste aparelho Android.</small><label>Link do APK/app</label><input id=rdsAndroidUrl type=url placeholder="https://..." value="${esc(android)}"><div class=row>${btn('Salvar','rdsV37SaveAccess()','btn primary')}${android?`<a target=_blank href="${esc(android)}">${btn('Abrir app/instalação','')}</a>`:''}</div></div><div><strong>PC / iPhone • link</strong><small>Abra o sistema Reino da Sorte pelo navegador.</small><label>Endereço web</label><input id=rdsWebUrl type=url placeholder="https://..." value="${esc(web)}"><div class=row>${btn('Salvar','rdsV37SaveAccess()','btn primary')}${web?`<a target=_blank href="${esc(web)}">${btn('Abrir sistema','btn primary')}</a>`:''}</div></div></div>`;
    app.appendChild(box);
  };
  window.rdsV37SaveAccess=()=>{const a=cleanUrl($('#rdsAndroidUrl')?.value),w=cleanUrl($('#rdsWebUrl')?.value);if($('#rdsAndroidUrl')?.value&&!a)return toast('Link Android inválido.');if($('#rdsWebUrl')?.value&&!w)return toast('Link web inválido.');a?localStorage.setItem(ANDROID_KEY,a):localStorage.removeItem(ANDROID_KEY);w?localStorage.setItem(WEB_KEY,w):localStorage.removeItem(WEB_KEY);toast('Acessos do Reino da Sorte salvos.');settings()};

  const oldRender=render;
  render=async function(){await oldRender(); if(page==='settings')compactSettings(); else if(page==='returns')compactReturns(); else compactSections()};

  const css=document.createElement('style'); css.textContent=`
    .rds-v37-toggle{font-size:12px;padding:7px 11px;white-space:nowrap}.rds-v37-table-head,.rds-v37-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.rds-v37-table-head strong{font-size:16px}.rds-v37-settings-body{margin-top:8px}.rds-v37-access-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.rds-v37-access-grid>div{border:1px solid #dbe5f0;border-radius:16px;padding:14px;background:#fff}.rds-v37-access-grid strong{display:block;font-size:16px;color:#183b69}.rds-v37-access-grid small{display:block;color:#6c7d94;line-height:1.4;margin:5px 0 10px}.rds-v37-access-grid label{display:block;font-size:12px;font-weight:800;color:#52657b;margin:8px 0 5px}.rds-v37-access-grid input{width:100%;box-sizing:border-box;border:1px solid #ccd8e7;border-radius:11px;padding:10px}.rds-v37-access-grid .row{margin-top:10px}.rds-v37-issue-access{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid #e4ebf3}.rds-v37-issue-access>span{font-size:11px;font-weight:900;color:#61728a;text-transform:uppercase}.rds-v37-issue-access a{text-decoration:none}
    @media(max-width:700px){.rds-v37-access-grid{grid-template-columns:1fr}.rds-v37-card-head{align-items:flex-start}.rds-v37-card-head h2,.rds-v37-card-head h3{margin:0}}
  `; document.head.appendChild(css);
})();
