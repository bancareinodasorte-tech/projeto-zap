(()=>{
 const OP='rds_operator_token',AD='rds_admin_token',DEVICE='rds_operator_device_id';
 try{if(new URLSearchParams(location.search).has('app_version'))localStorage.setItem('rds_client_platform','app');}catch{}
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const token=()=>localStorage.getItem(OP)||localStorage.getItem(AD)||'';
 function deviceId(){let v='';try{v=localStorage.getItem(DEVICE)||'';}catch{}if(!v){let id='';try{if(crypto?.randomUUID)id=crypto.randomUUID();}catch{}if(!id)id=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);v='web_'+id;try{localStorage.setItem(DEVICE,v);}catch{}}return v;}
 async function api(url,opts={}){
  const headers={'Content-Type':'application/json',...(opts.headers||{})},t=token();if(t)headers.Authorization='Bearer '+t;
  const r=await fetch(url,{cache:'no-store',...opts,headers});const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||d.message||'Falha na operação.'),{status:r.status,code:d.code});
  return d;
 }
 function style(){
  if($('#rdsAuthStyle'))return;
  const s=document.createElement('style');s.id='rdsAuthStyle';s.textContent=`
   #rdsAuthGate{position:fixed;inset:0;z-index:999999;background:linear-gradient(135deg,#eef5ff,#f8fbff);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
   #rdsAuthGate .auth-box{width:min(440px,100%);background:#fff;border:1px solid #dbe6f7;border-radius:22px;box-shadow:0 18px 60px rgba(23,50,92,.16);padding:24px;box-sizing:border-box}
   #rdsAuthGate .auth-brand{font-weight:900;font-size:25px;color:#0b3f86;margin-bottom:4px}
   #rdsAuthGate .auth-sub{color:#66758d;font-size:14px;margin-bottom:22px}
   #rdsAuthGate label{display:block;font-size:13px;font-weight:800;margin:13px 0 6px;color:#17325c}
   #rdsAuthGate input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #b9c9e2;border-radius:12px;font-size:16px;outline:none}
   #rdsAuthGate input:focus{border-color:#0b3f86;box-shadow:0 0 0 3px rgba(11,63,134,.08)}
   #rdsAuthGate button{width:100%;border:0;border-radius:12px;padding:13px 16px;font-weight:900;cursor:pointer;margin-top:12px;background:#0b3f86;color:#fff;font-size:15px}
   #rdsAuthGate .secondary{background:#e9eef7;color:#17325c}
   #rdsAuthGate .auth-msg{min-height:20px;margin:12px 0 0;font-size:13px;color:#66758d}
   #rdsAuthGate .auth-msg.bad{color:#a61b1b}.auth-msg.ok{color:#146b35}.auth-msg.warn{color:#855d00}
   #rdsAuthGate .auth-foot{margin-top:18px;padding-top:15px;border-top:1px solid #e5ecf6;font-size:12px;color:#75839a;text-align:center}
   #rdsAccount{display:flex;align-items:center;gap:8px;margin-left:8px}
   #rdsAccount .account-name{font-size:12px;font-weight:800;color:#17325c;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
   #rdsAccount button{border:1px solid #d2deef;background:#fff;color:#17325c;border-radius:9px;padding:6px 9px;font-weight:800;cursor:pointer;font-size:12px}
   @media(max-width:700px){#rdsAccount{display:none}#rdsAccount .account-name{display:none}#rdsAccount button{padding:6px}}
  `;document.head.appendChild(s);
 }
 function showGate(message='',loading=false){
  style();let d=$('#rdsAuthGate');if(!d){d=document.createElement('div');d.id='rdsAuthGate';document.body.appendChild(d);}
  if(loading){d.innerHTML='<div class="auth-box"><div class="auth-brand">CANAL DE VENDAS RDS</div><div class="auth-sub">Verificando acesso seguro…</div><p class="auth-msg">Aguarde a validação da sua sessão.</p></div>';return;}
  d.innerHTML='<div class="auth-box"><div class="auth-brand">CANAL DE VENDAS RDS</div><div class="auth-sub">Entre para acessar o painel de vendas</div><form id="rdsAuthForm"><label for="rdsAuthIdentifier">Telefone do vendedor ou e-mail administrativo</label><input id="rdsAuthIdentifier" autocomplete="username" placeholder="DDD + telefone ou e-mail" required><label for="rdsAuthPassword">Senha</label><input id="rdsAuthPassword" type="password" autocomplete="current-password" required><button type="submit" id="rdsAuthSubmit">Entrar no painel</button><button type="button" class="secondary" id="rdsAuthRegister">Cadastrar vendedor</button><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button" class="secondary" id="rdsAuthForgotSeller">Recuperar senha do vendedor</button><button type="button" class="secondary" id="rdsAuthForgotAdmin">Recuperar senha do administrador</button></div><div id="rdsAuthMsg" class="auth-msg '+(message?'bad':'')+'">'+esc(message)+'</div><div style="margin-top:12px;text-align:center;font-size:13px"><a href="/admin-vendedores.html" style="color:#0b3f86;font-weight:800;text-decoration:none">Acesso administrativo · gerenciar contas e dispositivos</a></div></form><div class="auth-foot">Acesso individual • dispositivos controlados pelo administrador</div></div>';
  $('#rdsAuthForm').onsubmit=async e=>{
   e.preventDefault();const b=$('#rdsAuthSubmit'),msg=$('#rdsAuthMsg');b.disabled=true;b.textContent='Validando…';msg.className='auth-msg';msg.textContent='Verificando credenciais e autorização do dispositivo…';
   const id=deviceId(),identifier=$('#rdsAuthIdentifier').value.trim(),password=$('#rdsAuthPassword').value;
   try{
    const d=await fetch('/api/rds/unified/login',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-rds-device-id':id},body:JSON.stringify({identifier,password,platform:((localStorage.getItem('rds_client_platform')==='app'||new URLSearchParams(location.search).has('app_version'))?'app':'web'),deviceId:id})});
    const out=await d.json().catch(()=>({}));
    if(!d.ok||!out.success)throw Object.assign(new Error(out.error||'Não foi possível entrar.'),{code:out.code,status:d.status});
    if(out.role==='ADMINISTRADOR'){localStorage.setItem(AD,out.token);localStorage.removeItem(OP);}else{localStorage.setItem(OP,out.token);localStorage.removeItem(AD);}
    msg.className='auth-msg ok';msg.textContent='Acesso autorizado. Abrindo painel…';location.reload();
   }catch(err){b.disabled=false;b.textContent='Entrar no painel';msg.className='auth-msg '+(err.code==='DEVICE_PENDING'?'warn':'bad');msg.textContent=err.message+(err.code==='DEVICE_PENDING'?' Após a liberação do administrador, tente entrar novamente.':'');}
  };
  $('#rdsAuthRegister').onclick=()=>showRegister();

  const recover=async(kind)=>{
   const email=prompt('Informe o e-mail cadastrado para recuperar a senha:');if(!email)return;
   if(!email.includes('@')){const msg=$('#rdsAuthMsg');msg.className='auth-msg bad';msg.textContent='A recuperação exige o e-mail cadastrado.';return;}
   const msg=$('#rdsAuthMsg');msg.className='auth-msg';msg.textContent='Solicitando recuperação…';
   try{const path=kind==='admin'?'/api/operator/admin/forgot-password':'/api/operator/forgot-password';const d=await api(path,{method:'POST',body:JSON.stringify({email:email.trim().toLowerCase()})});msg.className='auth-msg ok';msg.textContent=d.message||'Se o e-mail estiver cadastrado, enviaremos as instruções.';}
   catch(e){msg.className='auth-msg bad';msg.textContent=e.message||'Não foi possível solicitar a recuperação.';}
  };
  $('#rdsAuthForgotSeller').onclick=()=>recover('seller');
  $('#rdsAuthForgotAdmin').onclick=()=>recover('admin');
 }
 function showRegister(message=''){
  style();let d=$('#rdsAuthGate');if(!d){d=document.createElement('div');d.id='rdsAuthGate';document.body.appendChild(d);}
  d.innerHTML='<div class="auth-box"><div class="auth-brand">CANAL DE VENDAS RDS</div><div class="auth-sub">Cadastro de vendedor — acesso sujeito à aprovação administrativa</div><form id="rdsRegisterForm"><label for="rdsRegName">Nome completo</label><input id="rdsRegName" autocomplete="name" minlength="3" required><label for="rdsRegPhone">Telefone com DDD</label><input id="rdsRegPhone" autocomplete="tel" inputmode="tel" placeholder="(88) 99999-9999" required><label for="rdsRegEmail">E-mail para recuperação de senha</label><input id="rdsRegEmail" type="email" autocomplete="email" placeholder="seu@email.com"><label for="rdsRegPassword">Criar senha (mínimo 8 caracteres)</label><input id="rdsRegPassword" type="password" minlength="8" autocomplete="new-password" required><button type="submit" id="rdsRegSubmit">Enviar cadastro</button><button type="button" class="secondary" id="rdsAuthBack">Já tenho conta</button><div id="rdsRegMsg" class="auth-msg">'+esc(message)+'</div></form><div class="auth-foot">Após o envio, aguarde o administrador ativar a conta e autorizar o dispositivo.</div></div>';
  $('#rdsRegisterForm').onsubmit=async e=>{
   e.preventDefault();const b=$('#rdsRegSubmit'),msg=$('#rdsRegMsg');b.disabled=true;b.textContent='Enviando…';msg.className='auth-msg';msg.textContent='Registrando dados…';
   try{const body={name:$('#rdsRegName').value.trim(),phone:$('#rdsRegPhone').value.trim(),email:$('#rdsRegEmail').value.trim().toLowerCase(),password:$('#rdsRegPassword').value};const d=await api('/api/operator/register',{method:'POST',body:JSON.stringify(body)});msg.className='auth-msg ok';msg.textContent=d.message||'Cadastro recebido. Aguarde a aprovação do administrador.';b.disabled=true;b.textContent='Cadastro enviado';$('#rdsAuthBack').textContent='Voltar ao login';}
   catch(err){b.disabled=false;b.textContent='Enviar cadastro';msg.className='auth-msg bad';msg.textContent=err.message||'Não foi possível enviar o cadastro.';}
  };
  $('#rdsAuthBack').onclick=()=>showGate();
 }
 function showResetForm(kind,resetToken){
  style();let d=$('#rdsAuthGate');if(!d){d=document.createElement('div');d.id='rdsAuthGate';document.body.appendChild(d);}
  const admin=kind==='admin-reset';
  d.innerHTML='<div class="auth-box"><div class="auth-brand">CANAL DE VENDAS RDS</div><div class="auth-sub">'+(admin?'Redefinir senha administrativa':'Redefinir senha do vendedor')+'</div><form id="rdsResetForm"><label for="rdsResetPassword">Nova senha (mínimo 8 caracteres)</label><input id="rdsResetPassword" type="password" minlength="8" autocomplete="new-password" required><label for="rdsResetConfirm">Confirmar nova senha</label><input id="rdsResetConfirm" type="password" minlength="8" autocomplete="new-password" required><button type="submit" id="rdsResetSubmit">Salvar nova senha</button><div id="rdsResetMsg" class="auth-msg"></div></form><div class="auth-foot">O link de recuperação é temporário e pode ser usado uma única vez.</div></div>';
  $('#rdsResetForm').onsubmit=async e=>{
   e.preventDefault();const p=$('#rdsResetPassword').value,q=$('#rdsResetConfirm').value,b=$('#rdsResetSubmit'),msg=$('#rdsResetMsg');
   if(p.length<8){msg.className='auth-msg bad';msg.textContent='A senha deve ter pelo menos 8 caracteres.';return;}
   if(p!==q){msg.className='auth-msg bad';msg.textContent='As senhas não conferem.';return;}
   b.disabled=true;b.textContent='Salvando…';msg.className='auth-msg';msg.textContent='Atualizando senha…';
   try{const endpoint=admin?'/api/operator/admin/reset-password':'/api/operator/reset-password';const result=await api(endpoint,{method:'POST',body:JSON.stringify({token:resetToken,password:p})});localStorage.removeItem(OP);localStorage.removeItem(AD);msg.className='auth-msg ok';msg.textContent=result.message||'Senha alterada. Entre novamente.';b.textContent='Senha alterada';b.disabled=true;const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Voltar ao login';back.onclick=()=>{location.href='/';};$('#rdsResetForm').appendChild(back);}
   catch(err){b.disabled=false;b.textContent='Salvar nova senha';msg.className='auth-msg bad';msg.textContent=err.message||'Não foi possível alterar a senha.';}
  };
 }
 function accountBar(ctx){
  const host=$('.top-actions');if(!host||$('#rdsAccount'))return;
  const admin=ctx.role==='ADMINISTRADOR',name=admin?(ctx.admin?.email||'Administrador'):(ctx.seller?.name||'Vendedor');
  const d=document.createElement('div');d.id='rdsAccount';d.innerHTML='<span class="account-name" title="'+esc(name)+'">'+esc(name)+'</span>'+(admin?'<button type="button" id="rdsAdminOpen">Administração</button>':'')+'<button type="button" id="rdsAccountOpen">Conta</button><button type="button" id="rdsLogout">Sair</button>';
  host.appendChild(d);
  $('#rdsAccountOpen').onclick=()=>window.go?.('account');
  if($('#rdsAdminOpen'))$('#rdsAdminOpen').onclick=()=>{location.href='/admin-vendedores.html';};
  $('#rdsLogout').onclick=async()=>{if(!confirm('Deseja sair do CANAL DE VENDAS RDS?'))return;try{await api('/api/rds/unified/logout',{method:'POST'});}catch{}localStorage.removeItem(OP);localStorage.removeItem(AD);location.reload();};
 }
 async function boot(){
  const params=new URLSearchParams(location.search),resetKind=params.get('rds'),resetToken=params.get('token');
  if((resetKind==='reset-password'||resetKind==='admin-reset')&&resetToken){showResetForm(resetKind,resetToken);return;}
  style();showGate('',true);
  try{
   const ctx=await api('/api/rds/unified/context');
   if(ctx?.authenticated&&(ctx.role==='VENDEDOR'||ctx.role==='ADMINISTRADOR')){
    $('#rdsAuthGate')?.remove();accountBar(ctx);window.rdsAuthenticatedContext=ctx;return;
   }
   localStorage.removeItem(OP);localStorage.removeItem(AD);showGate();
  }catch(e){showGate('Não foi possível validar a sessão. Confira a conexão e tente entrar novamente.');}
 }
 window.rdsPanelAuthBoot=boot;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
