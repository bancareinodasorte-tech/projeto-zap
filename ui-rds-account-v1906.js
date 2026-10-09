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
 const fast=(u,o={})=>Promise.race([
  json(u,o),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),4500))
 ]);
 const [me,settings,mp]=await Promise.allSettled([
  fast('/api/operator/me',{headers:headers()}),
  fast('/api/operator/settings',{headers:headers()}),
  fast('/api/operator/mercadopago/status',{headers:headers()})
 ]);
 return {
  me:me.status==='fulfilled'?(me.value.seller||{}):{},
  devices:me.status==='fulfilled'?(me.value.devices||[]):[],
  settings:settings.status==='fulfilled'?(settings.value.settings||{}):{},
  mp:mp.status==='fulfilled'?(mp.value||{}):{}
 };
}
async function account(){
 const root=document.getElementById('app');
 if(!root)return;

 // A Conta não pode depender de uma chamada ao servidor para começar a renderizar.
 // O token local já identifica o tipo de sessão; os dados complementares entram depois.
 const hasSeller=!!token(), hasAdmin=!!adminToken();
 // A sessão unificada também pode estar no cookie HttpOnly. Não bloqueie a Conta
 // apenas porque o bearer do localStorage não está presente.
 const initialContext=await Promise.race([
  context(),
  new Promise(resolve=>setTimeout(()=>resolve({authenticated:false,timeout:true}),4000))
 ]).catch(()=>({authenticated:false}));
 const initialRole=initialContext?.authenticated?initialContext.role:null;
 if(!initialRole && !hasSeller && !hasAdmin){openLogin(initialContext?.timeout?'A validação da sessão demorou mais que o esperado.':'Entre para acessar sua conta.');return;}

 if(initialRole==='ADMINISTRADOR' || (hasAdmin&&!hasSeller)){
  root.innerHTML='<div class="page-title"><div><span class="eyebrow">Conta</span><h1>Conta administrativa</h1><p class="mut">Acesso administrativo do CANAL DE VENDAS RDS.</p></div></div><div class="card"><h2>Administrador</h2><p id="rdsAdminEmail" class="mut">Validando sessão…</p><div class="row"><button class="btn primary" id="rdsOpenAdminPanel">Abrir painel administrativo</button><button class="btn danger" id="rdsUnifiedLogout">Sair</button></div></div>';
  document.getElementById('rdsOpenAdminPanel').onclick=()=>{window.location.href='/admin-vendedores.html';};
  document.getElementById('rdsUnifiedLogout').onclick=()=>{if(confirm('Deseja realmente sair da conta?'))logout();};
 }else{
  root.innerHTML='<div class="page-title"><div><span class="eyebrow">Minha conta</span><h1 id="rdsAccountName">Minha conta</h1><p id="rdsAccountIdentity" class="mut">Dados reais da conta e das configurações operacionais</p></div><button class="btn" id="rdsUnifiedLogout">Sair</button></div><div class="card"><h2>👤 Dados da conta</h2><div class="status ok">🟢 Conta ativa e autenticada</div><div id="rdsAccountSummary" class="rds-account-summary"><div><small>Vendedor / conta</small><b id="rdsAccountSummaryName">—</b></div><div><small>Favorecido do PIX</small><b id="rdsAccountSummaryPixName">—</b></div><div><small>Chave PIX cadastrada</small><b id="rdsAccountSummaryPix">—</b></div><div><small>E-mail da conta</small><b id="rdsAccountSummaryEmail">—</b></div><div><small>Telefone da conta</small><b id="rdsAccountSummaryPhone">—</b></div></div></div><div class="card"><h2>💳 Mercado Pago</h2><div id="rdsMpAccountStatus" class="status warn">🟡 Verificando conexão…</div><div class="row"><button id="rdsMpConnect" class="btn primary">Conectar Mercado Pago</button><button id="rdsMpDisconnect" class="btn danger" style="display:none">Desconectar</button></div><p id="rdsMpMsg" class="mut"></p></div><div class="card"><h2>💰 Dados operacionais</h2><label>Chave PIX</label><input id="rdsAccountPix" value=""><label>Nome do favorecido</label><input id="rdsAccountPixName" value=""><label>E-mail operacional</label><input id="rdsAccountEmail" type="email" value=""><div class="row" style="margin-top:14px"><button id="rdsAccountSave" class="btn primary">Salvar dados</button></div><p id="rdsAccountMsg" class="mut"></p></div><div class="card"><h2>📱 Acessos</h2><p class="mut">Dispositivos registrados nesta conta.</p><div id="rdsAccountDevices"><span class="mut">Carregando…</span></div></div>';
  document.getElementById('rdsUnifiedLogout').onclick=logout;
 }

 // Validate in the background, without blocking the page.
 try{
  const c=await Promise.race([
   context(),
   new Promise(resolve=>setTimeout(()=>resolve({authenticated:false,timeout:true}),4000))
  ]);
  if(!c?.authenticated){
   openLogin(c?.timeout?'A validação da sessão demorou mais que o esperado. Entre novamente.':'Sua sessão não está mais válida.');
   return;
  }
  window.rdsUnifiedRole=c.role;
  if(c.role==='ADMINISTRADOR'){
   const el=document.getElementById('rdsAdminEmail');if(el)el.textContent=c.admin?.email||'Administrador';
   return;
  }

  const seller=c.seller||{};
  const name=document.getElementById('rdsAccountName');
  const identity=document.getElementById('rdsAccountIdentity');
  if(name)name.textContent=seller.name||'Minha conta';
  if(identity)identity.textContent='Dados reais da conta e das configurações operacionais';
  await loadSellerAccountDetails();
 }catch(e){
  // The account remains visible even when the validation/data APIs are temporarily slow.
  const msg=document.getElementById('rdsMpMsg');
  if(msg)msg.textContent='Alguns dados adicionais estão temporariamente indisponíveis.';
 }
}

function sellerName(st){return window.__rdsAccountSellerName||'';}
async function loadSellerAccountDetails(){
 const mpConnect=document.getElementById('rdsMpConnect');
 const mpDisconnect=document.getElementById('rdsMpDisconnect');
 const mpStatus=document.getElementById('rdsMpAccountStatus');
 const mpMsg=document.getElementById('rdsMpMsg');
 if(!mpConnect||!mpStatus)return;

 mpConnect.onclick=async()=>{
  mpConnect.disabled=true;mpMsg.textContent='Abrindo Mercado Pago…';
  try{const r=await json('/api/mercadopago/oauth/start',{headers:headers()});if(!r?.url)throw new Error('Mercado Pago não retornou o endereço de autorização.');window.location.assign(r.url);}
  catch(e){mpMsg.textContent=e.message;mpConnect.disabled=false;}
 };
 mpDisconnect.onclick=async()=>{
  if(!confirm('Deseja realmente desconectar a conta?'))return;
  try{await json('/api/operator/mercadopago/oauth/disconnect',{method:'POST',headers:headers()});account();}
  catch(e){toast(e.message);}
 };
 document.getElementById('rdsAccountSave').onclick=async()=>{
  const msg=document.getElementById('rdsAccountMsg');msg.textContent='Salvando…';
  try{
   const st=window.__rdsAccountSettings||{};
   await json('/api/operator/settings',{method:'POST',headers:{'Content-Type':'application/json',...headers()},body:JSON.stringify({
    mpEnvironment:st.mp_environment||'production',mpPublicKey:st.mp_public_key||'',
    pixKey:document.getElementById('rdsAccountPix').value,
    pixName:document.getElementById('rdsAccountPixName').value,
    officialEmail:document.getElementById('rdsAccountEmail').value
   })});
   msg.textContent='Dados salvos com segurança.';
  }catch(e){msg.textContent=e.message;}
 };

 try{
  const d=await sellerData();
  const st=d.settings||{},m=d.mp||{},connected=Boolean(m.configured);
  window.__rdsAccountSellerName=(d.me||{}).name||'';
  window.__rdsAccountSellerEmail=(d.me||{}).email||'';
  window.__rdsAccountSellerPhone=(d.me||{}).phone||'';
  window.__rdsAccountSettings=st;
  document.getElementById('rdsAccountPix').value=st.pix_key||'';
  document.getElementById('rdsAccountPixName').value=st.pix_name||'';
  document.getElementById('rdsAccountEmail').value=st.official_email||'';
  const summaryName=document.getElementById('rdsAccountSummaryName');
  const summaryPixName=document.getElementById('rdsAccountSummaryPixName');
  const summaryPix=document.getElementById('rdsAccountSummaryPix');
  const summaryEmail=document.getElementById('rdsAccountSummaryEmail');
  const summaryPhone=document.getElementById('rdsAccountSummaryPhone');
  if(summaryName)summaryName.textContent=sellerName(st)||'—';
  if(summaryPixName)summaryPixName.textContent=st.pix_name||'Não cadastrada';
  if(summaryPix)summaryPix.textContent=st.pix_key||'Não cadastrada';
  if(summaryEmail)summaryEmail.textContent=window.__rdsAccountSellerEmail||'Não informado';
  if(summaryPhone)summaryPhone.textContent=window.__rdsAccountSellerPhone||'Não informado';
  mpStatus.className='status '+(connected?'ok':'warn');
  mpStatus.textContent=connected?'🟢 Mercado Pago conectado'+(m.environment?' • '+String(m.environment).toUpperCase():''):'🟡 Mercado Pago não conectado';
  mpConnect.textContent=connected?'Reconectar Mercado Pago':'Conectar Mercado Pago';
  mpDisconnect.style.display=connected?'':'none';
  const devices=d.devices||[];
  document.getElementById('rdsAccountDevices').innerHTML=devices.length?devices.map(x=>'<div class="status '+(x.status==='ATIVO'?'ok':'bad')+'" style="margin:7px 0"><b>'+esc(x.platform||'web')+'</b> • '+esc(x.status||'')+'<br><span class="mini">'+esc(x.device_id||'')+'</span></div>').join(''):'<span class="mut">Nenhum dispositivo registrado.</span>';
 }catch(e){
  mpStatus.className='status warn';
  mpStatus.textContent='🟡 Conta carregada; alguns dados adicionais não responderam.';
  document.getElementById('rdsAccountDevices').innerHTML='<span class="mut">Dados adicionais indisponíveis no momento.</span>';
 }
}
async function logout(){try{await json('/api/rds/unified/logout',{method:'POST',headers:{...headers(),...adminHeaders()}});}catch{}localStorage.removeItem('rds_operator_token');localStorage.removeItem('rds_admin_token');window.rdsUnifiedRole=null;location.reload();}
(()=>{if(!document.getElementById('rdsAccountRefinedStyles')){const s=document.createElement('style');s.id='rdsAccountRefinedStyles';s.textContent='.rds-account-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.rds-account-summary>div{border:1px solid rgba(30,70,120,.12);border-radius:13px;background:#f8fbff;padding:11px 12px;min-width:0}.rds-account-summary small{display:block;color:#71809a;font-weight:800;font-size:11px;margin-bottom:5px}.rds-account-summary b{display:block;color:#17355d;font-size:14px;line-height:1.25;overflow-wrap:anywhere}@media(max-width:560px){.rds-account-summary{grid-template-columns:1fr}}';document.head.appendChild(s);}})();window.rdsUnifiedAccountPage=account;
window.rdsUnifiedSetRole=role=>{window.rdsUnifiedRole=role||null};
window.rdsUnifiedOpenLogin=openLogin;
window.addEventListener('load',()=>{const q=new URLSearchParams(location.search);if(q.get('rds')==='login'){setTimeout(()=>openLogin(),0);}});
})();
/* RDS ROLE GATE V2 — painel operacional unificado */
(()=>{
const sellerPages=new Set(['home','contacts','whatsapp','campaigns','execution','returns','payments','orders','account']);
const nav=()=>[...document.querySelectorAll('#nav button,#mobileNav button')];
const applySellerNav=()=>nav().forEach(b=>{const ok=sellerPages.has(b.dataset.page);b.style.display=ok?'':'none';});
async function gate(){
 if(localStorage.getItem('rds_current_page')==='account'||new URLSearchParams(location.search).get('rds')==='account')return;
 try{
  const c=await fetch('/api/rds/unified/context',{cache:'no-store'}).then(r=>r.json());
  if(!c.authenticated){if(typeof window.rdsUnifiedOpenLogin==='function')window.rdsUnifiedOpenLogin();return;}
  window.rdsUnifiedRole=c.role;
  if(c.role==='VENDEDOR'){
   applySellerNav();
   const p=localStorage.getItem('rds_current_page')||'home';
   const current=sellerPages.has(p)?p:'home';
   if(current!==p)localStorage.setItem('rds_current_page',current);
   if(typeof setNav==='function')setNav();
  }
 }catch(e){if(localStorage.getItem('rds_current_page')!=='account'&&typeof window.rdsUnifiedOpenLogin==='function')window.rdsUnifiedOpenLogin('Não foi possível validar a sessão.');}
}
window.addEventListener('load',()=>setTimeout(gate,20));
})();

(()=>{
const originalGo=window.go;
window.go=async p=>{
 if(window.rdsUnifiedRole==='VENDEDOR'){
  if(!['home','contacts','whatsapp','campaigns','execution','returns','payments','orders','account'].includes(p))p='home';
  localStorage.setItem('rds_current_page',p);
  if(typeof setNav==='function')setNav();
  return originalGo(p);
 }
 return originalGo(p);
};
})();

