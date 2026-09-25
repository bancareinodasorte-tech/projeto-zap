(()=>{
  const TOKEN_KEY='rds_operator_token';
  const deviceKey='rds_operator_device_id';
  const platform=()=>/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'')?'web_mobile':'web_pc';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const deviceId=()=>{let v='';try{v=localStorage.getItem(deviceKey)||'';}catch{}if(!v){let uid='';try{if(globalThis.crypto?.randomUUID)uid=globalThis.crypto.randomUUID();else if(globalThis.crypto?.getRandomValues){const a=new Uint32Array(4);globalThis.crypto.getRandomValues(a);uid=Array.from(a).map(x=>x.toString(16)).join('');}}catch{}if(!uid)uid=Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);v=platform()+'_'+uid;try{localStorage.setItem(deviceKey,v);}catch{}}return v;};
  const phone=v=>{let n=String(v||'').replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);if(!n.startsWith('55'))n='55'+n;return n;};
  const token=()=>localStorage.getItem(TOKEN_KEY)||'';
  async function api(url,opt={}){
    const headers={'Content-Type':'application/json',...(opt.headers||{})};
    const t=token();if(t)headers.Authorization='Bearer '+t;
    const r=await fetch(url,{cache:'no-store',...opt,headers});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||d.message||'Falha na operação.');
    return d;
  }
  function addStyle(){
    if($('#rdsAuthStyle'))return;
    const s=document.createElement('style');s.id='rdsAuthStyle';s.textContent=`
      #rdsAuthGate{position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#eef5ff,#f8fbff);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
      #rdsAuthGate .auth-box{width:min(440px,100%);background:#fff;border:1px solid #dbe6f7;border-radius:22px;box-shadow:0 18px 60px rgba(23,50,92,.16);padding:24px;box-sizing:border-box}
      #rdsAuthGate .auth-brand{font-weight:900;font-size:25px;color:#0b3f86;margin-bottom:4px}
      #rdsAuthGate .auth-sub{color:#66758d;font-size:14px;margin-bottom:22px}
      #rdsAuthGate label{display:block;font-size:13px;font-weight:800;margin:13px 0 6px;color:#17325c}
      #rdsAuthGate input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #b9c9e2;border-radius:12px;font-size:16px;outline:none}
      #rdsAuthGate input:focus{border-color:#0b3f86;box-shadow:0 0 0 3px rgba(11,63,134,.08)}
      #rdsAuthGate button{width:100%;border:0;border-radius:12px;padding:13px 16px;font-weight:900;cursor:pointer;margin-top:16px;background:#0b3f86;color:#fff;font-size:15px}
      #rdsAuthGate .secondary{background:#e9eef7;color:#17325c}
      #rdsAuthGate .auth-msg{min-height:20px;margin:12px 0 0;font-size:13px;color:#66758d}
      #rdsAuthGate .auth-msg.bad{color:#a61b1b}.auth-msg.ok{color:#146b35}.auth-msg.warn{color:#855d00}
      #rdsAuthGate .auth-foot{margin-top:18px;padding-top:15px;border-top:1px solid #e5ecf6;font-size:12px;color:#75839a;text-align:center}
      #rdsAccount{display:flex;align-items:center;gap:9px;margin-left:8px}
      #rdsAccount .account-name{font-size:12px;font-weight:800;color:#17325c;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #rdsAccount button{border:1px solid #d2deef;background:#fff;color:#17325c;border-radius:9px;padding:6px 9px;font-weight:800;cursor:pointer}
      @media(max-width:700px){#rdsAccount .account-name{display:none}}
    `;document.head.appendChild(s);
  }
  function gate(){
    if($('#rdsAuthGate'))return;
    const d=document.createElement('div');d.id='rdsAuthGate';d.innerHTML=`<div class="auth-box">
      <div class="auth-brand">CANAL DE VENDAS RDS</div>
      <div class="auth-sub">Acesso seguro do operador</div>
      <form id="rdsAuthForm">
        <label for="rdsAuthPhone">Telefone</label><input id="rdsAuthPhone" inputmode="tel" autocomplete="username" placeholder="(00) 00000-0000" required>
        <label for="rdsAuthPassword">Senha</label><input id="rdsAuthPassword" type="password" autocomplete="current-password" required>
        <button type="submit">Entrar no painel</button>
        <button type="button" class="secondary" id="rdsAuthRegister">Criar cadastro de vendedor</button>
        <div id="rdsAuthMsg" class="auth-msg"></div>
      </form>
      <div class="auth-foot">Sua sessão é individual e pode ser encerrada pelo administrador.</div>
    </div>`;document.body.appendChild(d);
    $('#rdsAuthForm').onsubmit=async e=>{
      e.preventDefault();const msg=$('#rdsAuthMsg');msg.className='auth-msg';msg.textContent='Autenticando...';
      try{const d=await api('/api/operator/login',{method:'POST',body:JSON.stringify({phone:phone($('#rdsAuthPhone').value),password:$('#rdsAuthPassword').value,platform:platform(),deviceId:deviceId()})});if(d.token)localStorage.setItem(TOKEN_KEY,d.token);msg.className='auth-msg ok';msg.textContent='Acesso autorizado. Carregando painel...';setTimeout(()=>{document.getElementById('rdsAuthGate')?.remove();location.reload();},250);}catch(err){msg.className='auth-msg bad';msg.textContent=err.message;}
    };
    $('#rdsAuthRegister').onclick=()=>{location.href='/operador';};
  }
  function account(seller){
    const host=$('.top-actions');if(!host||$('#rdsAccount'))return;
    const d=document.createElement('div');d.id='rdsAccount';d.innerHTML=`<span class="account-name" title="${esc(seller.name)}">${esc(seller.name)}</span><button type="button" id="rdsLogout">Sair</button>`;host.appendChild(d);
    $('#rdsLogout').onclick=async()=>{try{await api('/api/operator/logout',{method:'POST'});}catch{}localStorage.removeItem(TOKEN_KEY);location.reload();};
  }
  async function boot(){
    addStyle();
    try{const d=await api('/api/operator/me');if(d?.seller?.status==='ATIVO'){account(d.seller);return;}throw new Error('Sessão não autorizada.');}
    catch{gate();}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
