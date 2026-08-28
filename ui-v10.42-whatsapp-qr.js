(()=>{
  let timer=null;
  const status=()=>api('/api/status').catch(()=>({}));
  const stop=()=>{if(timer){clearInterval(timer);timer=null}};
  function removeDuplicates(){
    document.querySelectorAll('.card,section,article').forEach(el=>{
      if(el.id==='rdsV42WhatsApp')return;
      const t=(el.innerText||'').toLowerCase();
      if(t.includes('whatsapp')&&(t.includes('gerar qr')||t.includes('conectar whatsapp')))el.remove();
    });
  }
  function mount(){
    removeDuplicates();
    if(document.querySelector('#rdsV42WhatsApp'))return;
    const host=document.querySelector('#app');if(!host)return;
    const box=document.createElement('section');box.id='rdsV42WhatsApp';box.className='card';
    box.innerHTML='<div class="rds-v42-wa-head"><div><span class="eyebrow">CONEXÃO WHATSAPP</span><h2>WhatsApp</h2><p class="mut">Conecte o WhatsApp do canal usando o QR Code.</p></div><span id="rdsV42WaState" class="badge warn">DESCONECTADO</span></div><div id="rdsV42QrArea" class="rds-v42-qr-area"><button id="rdsV42QrBtn" class="btn primary">Conectar WhatsApp</button><p id="rdsV42QrMsg" class="mut">Clique para iniciar uma nova sessão.</p></div>';
    host.prepend(box);
    document.querySelector('#rdsV42QrBtn').onclick=async()=>{const b=document.querySelector('#rdsV42QrBtn');try{b.disabled=true;b.textContent='Iniciando...';document.querySelector('#rdsV42QrMsg').textContent='Limpando sessão anterior e gerando QR Code...';await post('/api/whatsapp/connect',{force:true});poll()}catch(e){document.querySelector('#rdsV42QrMsg').textContent=e.message;toast(e.message)}finally{b.disabled=false;b.textContent='Conectar WhatsApp'}};
    poll();
  }
  async function poll(){
    try{const s=await status();const state=document.querySelector('#rdsV42WaState'),area=document.querySelector('#rdsV42QrArea');if(!state||!area)return stop();
      if(s.connected){state.textContent='CONECTADO';state.className='badge ok';area.innerHTML='<p>✅ WhatsApp conectado e pronto para operar.</p>';stop();return}
      state.textContent=s.starting?'CONECTANDO...':'DESCONECTADO';state.className='badge '+(s.starting?'warn':'bad');
      if(s.qrAvailable&&s.qrDataUrl){area.innerHTML='<div class="rds-v42-qr-wrap"><img src="'+s.qrDataUrl+'" alt="QR Code para conectar WhatsApp"><p>Abra WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie este QR Code.</p></div><button class="btn" id="rdsV42NewQr">Gerar novo QR Code</button>';document.querySelector('#rdsV42NewQr').onclick=()=>window.rdsV42Reconnect()}
      else if(s.lastError)area.innerHTML='<p class="mut">'+String(s.lastError)+'</p><button class="btn primary" id="rdsV42Retry">Tentar novamente</button>';
      const retry=document.querySelector('#rdsV42Retry');if(retry)retry.onclick=()=>window.rdsV42Reconnect();
    }catch{}
  }
  function start(){stop();poll();timer=setInterval(poll,1000)}
  window.rdsV42Reconnect=async()=>{try{await post('/api/whatsapp/connect',{force:true});start()}catch(e){toast(e.message)}};
  const css=document.createElement('style');css.textContent='#rdsV42WhatsApp{margin-bottom:16px}.rds-v42-wa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.rds-v42-qr-area{text-align:center;margin-top:14px;padding:18px;border:1px dashed #cbd8e8;border-radius:16px}.rds-v42-qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px}.rds-v42-qr-wrap img{width:min(360px,78vw);height:min(360px,78vw);object-fit:contain;background:#fff;padding:10px;border-radius:12px}.rds-v42-qr-area button{margin-top:10px}@media(max-width:600px){.rds-v42-wa-head{flex-direction:column}}';document.head.appendChild(css);
  const oldRender=window.render;if(typeof oldRender==='function')window.render=async function(){await oldRender();if(window.page==='settings')mount()};
  setTimeout(()=>{if(window.page==='settings')mount()},800);
})();