(()=>{ 
const $=s=>document.querySelector(s);
const q=async(u,o={})=>{const r=await fetch(u,{cache:'no-store',...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||d.message||'Falha na operação.');return d;};
function add(){
  if($('#rdsSellerRecovery'))return;
  const login=$('#loginForm');if(!login)return;
  const b=document.createElement('button');b.type='button';b.id='rdsSellerRecovery';b.className='btn';b.style.marginTop='10px';b.textContent='Esqueci minha senha';login.appendChild(b);
  b.onclick=async()=>{const email=prompt('Digite o e-mail cadastrado do vendedor:');if(!email)return;try{const d=await q('/api/operator/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});alert(d.message||'Se o e-mail estiver cadastrado, enviaremos as instruções.');}catch(e){alert(e.message);}};
  const panel=$('#panel');if(panel){
    const c=document.createElement('div');c.className='card';c.id='rdsSellerPasswordCard';
    c.innerHTML='<h3>Minha segurança</h3><p class="muted">Altere sua senha sem precisar do Render.</p><div class="field"><label>Senha atual</label><input id="rdsSellerCurrent" type="password" autocomplete="current-password"></div><div class="field"><label>Nova senha</label><input id="rdsSellerNew" type="password" autocomplete="new-password"></div><button id="rdsSellerChange" class="btn primary">Alterar minha senha</button><p id="rdsSellerPwdMsg" class="muted"></p>';
    panel.appendChild(c);
    $('#rdsSellerChange').onclick=async()=>{const msg=$('#rdsSellerPwdMsg');msg.textContent='Alterando...';try{await q('/api/operator/change-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem('rds_operator_token')||'')},body:JSON.stringify({currentPassword:$('#rdsSellerCurrent').value,newPassword:$('#rdsSellerNew').value})});msg.textContent='Senha alterada com sucesso.';$('#rdsSellerCurrent').value='';$('#rdsSellerNew').value='';}catch(e){msg.textContent=e.message;}};
  }
}
function reset(){
  const token=new URLSearchParams(location.search).get('token');if(!token)return;
  const card=document.createElement('section');card.className='card';card.style.margin='20px auto';card.style.maxWidth='760px';
  card.innerHTML='<h2>Redefinir senha do vendedor</h2><p class="muted">Crie uma nova senha. O link é válido por 30 minutos e pode ser usado uma única vez.</p><div class="field"><label>Nova senha</label><input id="rdsResetPwd" type="password" minlength="8" autocomplete="new-password"></div><button id="rdsResetBtn" class="btn primary">Salvar nova senha</button><p id="rdsResetMsg" class="muted"></p>';
  document.body.innerHTML='';document.body.appendChild(card);
  $('#rdsResetBtn').onclick=async()=>{const msg=$('#rdsResetMsg');try{const d=await q('/api/operator/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:$('#rdsResetPwd').value})});msg.textContent=d.message||'Senha alterada.';setTimeout(()=>location.href='/operador',1200);}catch(e){msg.textContent=e.message;}};
}
function boot(){reset();add();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();