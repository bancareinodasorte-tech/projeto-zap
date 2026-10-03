(()=>{
  const issuerKey='rds_ticket_issuer_web_url';
  const clean=v=>String(v||'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dt=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const getIssuer=()=>clean(localStorage.getItem(issuerKey)||'');
  const setIssuer=v=>localStorage.setItem(issuerKey,clean(v));
  const btn=(t,fn,cls='btn')=>`<button class="${cls}" onclick="${fn}">${t}</button>`;
  const modal=html=>{const m=document.createElement('div');m.className='modal';m.innerHTML=`<div><div class="row" style="justify-content:flex-end">${btn('✕',"this.closest('.modal').remove()")}</div>${html}</div>`;document.body.appendChild(m);return m};
  function compactWhatsApp(){const apply=()=>{['waStatus','waStatusMobile'].forEach(id=>{const el=document.getElementById(id);if(!el)return;const txt=(el.textContent||'').toLowerCase();const on=txt.includes('conectado')&&!txt.includes('desconectado')&&!txt.includes('offline');el.classList.toggle('rds-wa-online',on);el.classList.toggle('rds-wa-offline',!on);el.setAttribute('title',on?'WhatsApp conectado':'WhatsApp desconectado')})};apply();setInterval(apply,1500)}
  function header(){document.title='CANAL DE VENDAS';document.querySelectorAll('.top b').forEach(x=>{if(x.textContent!=='CANAL DE VENDAS')x.textContent='CANAL DE VENDAS'});document.querySelectorAll('.brand-lockup strong').forEach(x=>{if(x.textContent!=='CANAL DE VENDAS')x.textContent='CANAL DE VENDAS'});document.querySelectorAll('.brand-lockup small').forEach(x=>{if(x.textContent!=='Operação comercial')x.textContent='Operação comercial'});document.querySelectorAll('.top small').forEach(x=>{if(x.textContent!=='Operação comercial')x.textContent='Operação comercial'})}
  function addAboutNav(){['#nav','#mobileNav'].forEach(sel=>{const nav=document.querySelector(sel);if(!nav||nav.querySelector('[data-page="about"]'))return;const b=document.createElement('button');b.dataset.page='about';b.innerHTML=sel==='#nav'?'<span>ⓘ</span><b>Sobre</b>':'ⓘ<small>Sobre</small>';b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();setActive('about');rdsAbout()});nav.appendChild(b)})}
  function setActive(p){document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p))}
  function about(){const app=document.querySelector('#app');app.innerHTML=`<div class="page-title"><div><span class="eyebrow">Informações do sistema</span><h1>Sobre</h1><p class="mut">Identidade, finalidade e recursos do CANAL DE VENDAS.</p></div></div><div class="grid rds-about-grid"><div class="card"><span class="eyebrow">Sistema</span><h2>CANAL DE VENDAS</h2><p>Plataforma operacional para organizar clientes, campanhas, pedidos, pagamentos, atendimento e pós-venda da operação comercial.</p></div><div class="card"><span class="eyebrow">Desenvolvimento</span><h2>Tecnologia REINO DA SORTE</h2><p>Arquitetura preparada para evolução modular. A identidade visual do canal fica independente da marca, permitindo futura reutilização com outra logo e paleta.</p></div><div class="card"><span class="eyebrow">Operação</span><h2>Fluxo integrado</h2><p>WhatsApp orienta o cliente; o painel concentra a operação; o pagamento é acompanhado automaticamente; após a confirmação, o operador encaminha a emissão e a entrega dos bilhetes.</p></div><div class="card"><span class="eyebrow">Recursos</span><h2>Principais funcionalidades</h2><ul class="rds-about-list"><li>CRM e histórico comercial</li><li>Campanhas e distribuição inteligente</li><li>Pedidos e acompanhamento de pagamento</li><li>Alertas operacionais</li><li>Emissão/entrega de bilhetes por integração externa</li><li>Uso em PC, celular e Android</li></ul></div><div class="card"><span class="eyebrow">Versão</span><h2>V11.2 — estabilidade e integração oficial</h2><p>Interface responsiva, PWA e aplicativo Android preparados para a mesma operação.</p></div><div class="card"><span class="eyebrow">Princípio</span><h2>Uma função, uma rota</h2><p>Cada etapa possui uma área principal. Atalhos encaminham o operador para o ponto correto sem duplicar funções.</p></div></div>`}
  window.rdsAbout=about;
  async function payments(){
    if(typeof window.paymentsPage==='function')return window.paymentsPage();
    const app=document.querySelector('#app');if(app)app.innerHTML='<div class="card"><span class="mut">Carregando pagamentos...</span></div>';
  }
  window.rdsPayments=payments;
  window.rdsConfirmPayment=async id=>{try{const r=await fetch(`/api/orders/${id}/payment-confirmed`,{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha');toast(d.message||'Pagamento confirmado.');payments()}catch(e){toast(e.message)}};
  window.rdsCompleteTickets=async id=>{try{const r=await fetch(`/api/orders/${id}/tickets-sent`,{method:'POST'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao concluir');toast('Bilhetes enviados e pedido concluído.');payments()}catch(e){toast(e.message)}};
  function annotateOrderModal(){
    try{
      const mod=[...document.querySelectorAll('.modal')].find(x=>/RDS-[A-Z0-9]{6,12}/i.test(x.textContent||''));
      if(!mod||mod.querySelector('.rds-order-nature'))return;
      const m=(mod.textContent||'').match(/RDS-[A-Z0-9]{6,12}/i);if(!m)return;
      const o=(window.state?.orders||[]).find(x=>String(x.code||'').toUpperCase()===m[0].toUpperCase());if(!o)return;
      const reason=String(o.cancel_reason||'').toUpperCase();
      const nature=reason==='EXPIRADO_PAGAMENTO'?'⏱ Expirado por falta de pagamento':reason==='CANCELAMENTO_MANUAL'?'✋ Cancelamento manual':reason==='CANCELAMENTO_CLIENTE'?'👤 Cancelado pelo cliente':reason?reason.replaceAll('_',' '):'Não registrado';
      const box=document.createElement('div');box.className='card rds-order-nature';box.style.marginTop='12px';
      box.innerHTML='<span class="eyebrow">Encerramento e pagamento</span><p><b>Natureza do cancelamento:</b> '+E(nature)+'</p>'+(o.payment_method?'<p><b>Forma de pagamento:</b> '+E(String(o.payment_method).replaceAll('_',' '))+'</p>':'');
      mod.querySelector('div')?.appendChild(box);
    }catch{}
  }
  const rdsModalObserver=new MutationObserver(annotateOrderModal);
  rdsModalObserver.observe(document.body,{childList:true,subtree:true});
  function settingsHook(){const app=document.querySelector('#app');if(!app||!app.innerHTML.includes('<h1>Ajustes</h1>')||document.getElementById('rdsIssuerCard'))return;const holder=document.createElement('div');holder.id='rdsIssuerCard';holder.className='card rds-issuer-card';holder.innerHTML=`<span class="eyebrow">Integração operacional</span><h2>Emissor de bilhetes</h2><p class="mut">A integração oficial é a rota principal. Este campo fica apenas como contingência manual.</p><label>URL do emissor manual</label><input id="rdsIssuerUrl" inputmode="url" placeholder="https://seu-emissor.exemplo/emitir" value="${esc(getIssuer())}"><p class="mini">No Android, a URL poderá abrir um aplicativo associado. No iPhone/PC, abrirá no navegador.</p><div class="row">${btn('Salvar emissor',"rdsSaveIssuer()",'btn primary')}${getIssuer()?btn('Testar abertura',"rdsTestIssuer()",'btn'):''}</div>`;app.appendChild(holder)}
  window.rdsSaveIssuer=()=>{setIssuer(document.getElementById('rdsIssuerUrl')?.value||'');toast('Emissor salvo neste dispositivo')};window.rdsTestIssuer=()=>{const u=getIssuer();if(u)window.open(u,'_blank','noopener,noreferrer')};
  function nav(){document.querySelectorAll('[data-page="payments"]').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();payments()}});document.querySelectorAll('[data-page="about"]').forEach(b=>{b.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();setActive('about');about()}})}
  function boot(){header();addAboutNav();nav();compactWhatsApp();const obs=new MutationObserver(()=>{header();addAboutNav();nav();settingsHook()});obs.observe(document.getElementById('app')||document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
