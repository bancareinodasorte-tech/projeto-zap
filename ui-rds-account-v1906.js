(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const token=()=>localStorage.getItem('rds_operator_token')||'';
const adminToken=()=>localStorage.getItem('rds_admin_token')||'';
const json=async(u,o={})=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(u,{cache:'no-store',...o,signal:controller.signal});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||d.message||'Falha na operação.');return d;}catch(e){if(e?.name==='AbortError')throw new Error('O servidor demorou para responder.');throw e;}finally{clearTimeout(timer);}};
const headers=()=>{const t=token();return t?{Authorization:'Bearer '+t}:{}};
const adminHeaders=()=>{const t=adminToken();return t?{Authorization:'Bearer '+t}:{}};
const deviceKey='rds_operator_device_id';
function deviceId(){let v=localStorage.getItem(deviceKey);if(!v){v='web_'+crypto.randomUUID();localStorage.setItem(deviceKey,v);}return v;}
function toast(t){if(typeof window.toast==='function')window.toast(t);else alert(t);}
function openLogin(message=''){
 const app=document.getElementById('app');if(!app)return;
 app.innerHTML='<div class="page-title"><div><span class="eyebrow">Acesso</span><h1>Entrar no CANAL DE VENDAS RDS</h1><p class="mut">Use telefone e senha de vendedor. Administradores usam o e-mail administrativo.</p></div></div><div class="card" style="max-width:520px;margin:auto">'+(message?'<div class="badge bad" style="margin-bottom:14px">'+esc(message)+'</div>':'')+'<label>Telefone ou e-mail</label><input id="rdsUnifiedIdentifier" autocomplete="username" placeholder="DDD + número ou e-mail"><label>Senha</label><input id="rdsUnifiedPassword" type="password" autocomplete="current-password" placeholder="Sua senha"><div class="row" style="margin-top:16px"><button class="btn primary" id="rdsUnifiedLogin">Entrar</button></div><p class="mut">A partir de agora, este é o acesso único do RDS.</p></div>';
 document.getElementById('rdsUnifiedLogin').onclick=async()=>{
  const b=document.getElementById('rdsUnifiedLogin');b.disabled=true;b.textContent='Entrando…';
  try{
   const d=await json('/api/rds/unified/login',{method:'POST',headers:{'Content-Type':'application/json','x-rds-device-id':deviceId()},body:JSON.stringify({identifier:document.getElementById('rdsUnifiedIdentifier').value,password:document.getElementById('rdsUnifiedPassword').value,platform:'app',deviceId:deviceId()})});
   if(d.role==='VENDEDOR'){localStorage.setItem('rds_operator_token',d.token);localStorage.removeItem('rds_admin_token');}
   else{localStorage.setItem('rds_admin_token',d.token);localStorage.removeItem('rds_operator_token');}
   window.rdsUnifiedRole=d.role;
   if(typeof window.go==='function')window.go('account');else location.href='/?rds=account';
  }catch(e){b.disabled=false;b.textContent='Entrar';openLogin(e.message);}
 };
}
async function context(){try{return await json('/api/rds/unified/context',{headers:{...headers(),...adminHeaders()}});}catch{return {authenticated:false};}}
async function sellerData(){
 const [me,settings,mp]=await Promise.all([json('/api/operator/me',{headers:headers()}),json('/api/operator/settings',{headers:headers()}),json('/api/operator/mercadopago/status',{headers:headers()})]);
 return {me:me.seller,devices:me.devices||[],settings:settings.settings||{},mp};
}
async function account(){
 const c=await context();
 if(!c.authenticated){openLogin('Entre para acessar sua conta.');return;}
 if(c.role==='ADMINISTRADOR'){
  app.innerHTML='<div class="page-title"><div><span class="eyebrow">Conta</span><h1>Conta administrativa</h1><p class="mut">Acesso administrativo do CANAL DE VENDAS RDS.</p></div></div><div class="card"><h2>Administrador</h2><p>'+esc(c.admin?.email||'')+'</p><div class="row"><button class="btn danger" id="rdsUnifiedLogout">Sair</button></div></div>';
  document.getElementById('rdsUnifiedLogout').onclick=logout;return;
 }
 let d;try{d=await sellerData();}catch(e){openLogin(e.message);return;}
 const s=d.settings||{},m=d.mp||{},connected=Boolean(m.configured);
 app.innerHTML='<div class="page-title"><div><span class="eyebrow">Minha conta</span><h1>'+esc(d.me?.name||'Vendedor')+'</h1><p class="mut">'+esc(d.me?.phone||'')+' • '+esc(d.me?.email||'')+'</p></div><button class="btn" id="rdsUnifiedLogout">Sair</button></div><div class="card"><h2>👤 Minha conta</h2><div class="status ok">🟢 Conta ativa e autenticada</div><p class="mut">Esta é a sua área individual. Os dados financeiros pertencem somente a esta conta.</p></div><div class="card"><h2>💳 Mercado Pago</h2><div id="rdsMpAccountStatus" class="status '+(connected?'ok':'warn')+'">'+(connected?'🟢 Mercado Pago conectado':'🟡 Mercado Pago não conectado')+'</div><p class="mut">A conexão é feita pelo OAuth oficial. O Access Token e o Refresh Token permanecem protegidos no servidor.</p><div class="row"><button id="rdsMpConnect" class="btn primary">'+(connected?'Reconectar Mercado Pago':'Conectar Mercado Pago')+'</button>'+(connected?'<button id="rdsMpDisconnect" class="btn danger">Desconectar</button>':'')+'</div><p id="rdsMpMsg" class="mut"></p></div><div class="card"><h2>💰 Dados operacionais</h2><label>Chave PIX</label><input id="rdsAccountPix" value="'+esc(s.pix_key||'')+'"><label>Nome do favorecido</label><input id="rdsAccountPixName" value="'+esc(s.pix_name||'')+'"><label>E-mail operacional</label><input id="rdsAccountEmail" type="email" value="'+esc(s.official_email||'')+'"><div class="row" style="margin-top:14px"><button id="rdsAccountSave" class="btn primary">Salvar dados</button></div><p id="rdsAccountMsg" class="mut"></p></div><div class="card"><h2>📱 Acessos</h2><p class="mut">Dispositivos registrados nesta conta.</p><div>'+d.devices.map(x=>'<div class="status '+(x.status==='ATIVO'?'ok':'bad')+'" style="margin:7px 0"><b>'+esc(x.platform||'web')+'</b> • '+esc(x.status)+'<br><span class="mini">'+esc(x.device_id||'')+'</span></div>').join('')+'</div></div>';
 document.getElementById('rdsUnifiedLogout').onclick=logout;
 document.getElementById('rdsMpConnect').onclick=async()=>{const b=document.getElementById('rdsMpConnect'),msg=document.getElementById('rdsMpMsg');b.disabled=true;msg.textContent='Abrindo Mercado Pago…';try{const r=await json('/api/mercadopago/oauth/start',{headers:headers()});location.href=r.url;}catch(e){msg.textContent=e.message;b.disabled=false;}};
 document.getElementById('rdsMpDisconnect')?.addEventListener('click',async()=>{if(!confirm('Desconectar a conta Mercado Pago deste vendedor?'))return;try{await json('/api/operator/mercadopago/oauth/disconnect',{method:'POST',headers:headers()});account();}catch(e){toast(e.message);}});
 document.getElementById('rdsAccountSave').onclick=async()=>{const msg=document.getElementById('rdsAccountMsg');msg.textContent='Salvando…';try{await json('/api/operator/settings',{method:'POST',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify({mpEnvironment:s.mp_environment||'production',mpPublicKey:s.mp_public_key||'',pixKey:document.getElementById('rdsAccountPix').value,pixName:document.getElementById('rdsAccountPixName').value,officialEmail:document.getElementById('rdsAccountEmail').value})});msg.textContent='Dados salvos com segurança.';}catch(e){msg.textContent=e.message;}};
 const q=new URLSearchParams(location.search);if(q.get('mp')==='connected'){document.getElementById('rdsMpMsg').textContent='Mercado Pago conectado com sucesso.';history.replaceState({},'',location.pathname+'?rds=account');}if(q.get('mp')==='error'){document.getElementById('rdsMpMsg').textContent='A conexão do Mercado Pago não foi concluída.';history.replaceState({},'',location.pathname+'?rds=account');}
}
async function logout(){try{await json('/api/rds/unified/logout',{method:'POST',headers:{...headers(),...adminHeaders()}});}catch{}localStorage.removeItem('rds_operator_token');localStorage.removeItem('rds_admin_token');window.rdsUnifiedRole=null;openLogin('Sessão encerrada.');}
window.rdsUnifiedAccountPage=account;
window.rdsUnifiedSetRole=role=>{window.rdsUnifiedRole=role||null};
window.rdsUnifiedOpenLogin=openLogin;
window.addEventListener('load',()=>{const q=new URLSearchParams(location.search);if(q.get('rds')==='login'||q.get('rds')==='account')setTimeout(()=>{if(typeof window.go==='function')window.go('account');},0);});
})();
/* RDS ROLE GATE V1 */
(()=>{
const allowedSeller=new Set(['home','orders','account']);
const nav=()=>[...document.querySelectorAll('#nav button,#mobileNav button')];
const applySellerNav=()=>nav().forEach(b=>{const ok=allowedSeller.has(b.dataset.page);b.style.display=ok?'':'none';});
const hideShell=()=>{document.querySelector('.sidebar')?.setAttribute('data-rds-role','VENDEDOR');document.querySelector('.workspace .top-actions')?.setAttribute('data-rds-role','VENDEDOR');};
async function gate(){
 try{
  const c=await fetch('/api/rds/unified/context',{cache:'no-store'}).then(r=>r.json());
  if(!c.authenticated){if(typeof window.rdsUnifiedOpenLogin==='function')window.rdsUnifiedOpenLogin();return;}
  window.rdsUnifiedRole=c.role;
  if(c.role==='VENDEDOR'){
   applySellerNav();hideShell();
   const p=localStorage.getItem('rds_current_page')||'home';
   if(!allowedSeller.has(p))localStorage.setItem('rds_current_page','home');
   const current=localStorage.getItem('rds_current_page')||'home';
   if(current==='account')await window.rdsUnifiedAccountPage();
   else if(current==='orders')await window.rdsSellerOrdersPage();
   else await window.rdsSellerCentralPage();
  }
 }catch(e){if(typeof window.rdsUnifiedOpenLogin==='function')window.rdsUnifiedOpenLogin('Não foi possível validar a sessão.');}
}
window.addEventListener('load',()=>setTimeout(gate,20));
})();

(()=>{const originalGo=window.go;window.go=async p=>{if(window.rdsUnifiedRole==='VENDEDOR'){if(!['home','orders','account'].includes(p))p='home';localStorage.setItem('rds_current_page',p);if(typeof setNav==='function')setNav();try{if(p==='account')await window.rdsUnifiedAccountPage();else if(p==='orders')await window.rdsSellerOrdersPage();else await window.rdsSellerCentralPage();}catch(e){document.getElementById('app').innerHTML='<div class="card"><h2>Não foi possível carregar</h2><p>'+String(e.message||e)+'</p></div>'}scrollTo(0,0);return}return originalGo(p)}})();
