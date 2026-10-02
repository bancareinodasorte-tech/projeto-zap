(()=>{
  const json=async(u,o={})=>{const r=await fetch(u,{cache:'no-store',...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||d.message||'Falha na operação.');return d;};
  const token=()=>localStorage.getItem('rds_operator_token')||'';
  function card(){
    if(document.getElementById('rdsMpOAuthCard'))return;
    const panel=document.getElementById('panel');
    if(!panel)return;
    const wrap=document.createElement('div');
    wrap.id='rdsMpOAuthCard';
    wrap.className='card';
    wrap.innerHTML='<h3>Mercado Pago — conexão oficial</h3><p class="muted">Conecte a conta Mercado Pago deste vendedor pelo OAuth. O Access Token e o Refresh Token não são exibidos nem armazenados no navegador.</p><div id="mpOAuthStatus" class="status warn">Verificando conexão...</div><div class="row" style="margin-top:12px"><button id="connectMercadoPago" class="btn primary" type="button">Conectar Mercado Pago</button><button id="disconnectMercadoPago" class="btn" type="button">Desconectar</button></div><p id="mpOAuthMsg" class="muted"></p>';
    panel.insertBefore(wrap,panel.children[1]||null);
    document.getElementById('connectMercadoPago').onclick=async()=>{
      const b=document.getElementById('connectMercadoPago');const m=document.getElementById('mpOAuthMsg');
      b.disabled=true;m.textContent='Abrindo autorização do Mercado Pago...';
      try{const d=await json('/api/mercadopago/oauth/start',{headers:{Authorization:'Bearer '+token()}});window.location.href=d.url;}
      catch(e){m.textContent=e.message;b.disabled=false;}
    };
    document.getElementById('disconnectMercadoPago').onclick=async()=>{
      if(!window.confirm('Desconectar a conta Mercado Pago deste vendedor?'))return;
      const m=document.getElementById('mpOAuthMsg');
      try{await json('/api/operator/mercadopago/oauth/disconnect',{method:'POST',headers:{Authorization:'Bearer '+token()}});m.textContent='Mercado Pago desconectado.';await status();}
      catch(e){m.textContent=e.message;}
    };
    status();
  }
  async function status(){
    const el=document.getElementById('mpOAuthStatus');if(!el)return;
    try{
      const d=await json('/api/operator/mercadopago/status',{headers:{Authorization:'Bearer '+token()}});
      if(d.configured){el.textContent='🟢 Mercado Pago conectado';el.className='status ok';}
      else if(d.oauthConfigured){el.textContent='🟡 Mercado Pago ainda não conectado';el.className='status warn';}
      else{el.textContent='⚠️ OAuth do Mercado Pago ainda não configurado no servidor';el.className='status bad';}
    }catch(e){el.textContent='Não foi possível verificar a conexão.';el.className='status bad';}
  }
  const boot=()=>{
    card();
    const params=new URLSearchParams(location.search);
    if(params.get('mp')==='connected'){const m=document.getElementById('mpOAuthMsg');if(m)m.textContent='Mercado Pago conectado com sucesso.';history.replaceState({},'',location.pathname);}
    if(params.get('mp')==='error'){const m=document.getElementById('mpOAuthMsg');if(m)m.textContent='A conexão do Mercado Pago não foi concluída.';history.replaceState({},'',location.pathname);}
  };
  const timer=setInterval(()=>{if(document.getElementById('panel')&&!document.getElementById('rdsMpOAuthCard'))boot();if(document.getElementById('rdsMpOAuthCard'))clearInterval(timer);},300);
  boot();
})();