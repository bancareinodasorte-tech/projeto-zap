(()=>{
  let qrTimer=null;
  const getStatus=()=>api('/api/status').catch(()=>({}));
  function stopPoll(){if(qrTimer){clearInterval(qrTimer);qrTimer=null}}
  function mount(){
    if(document.querySelector('#rdsV42WhatsApp'))return;
    const host=document.querySelector('#app'); if(!host)return;
    const box=document.createElement('section'); box.id='rdsV42WhatsApp'; box.className='card';
    box.innerHTML=`<div class="rds-v42-wa-head"><div><span class="eyebrow">CONEXÃO WHATSAPP</span><h2>Conectar WhatsApp</h2><p class="mut">Gere o QR Code e escaneie pelo WhatsApp no celular.</p></div><span id="rdsV42WaState" class="badge warn">DESCONECTADO</span></div><div id="rdsV42QrArea" class="rds-v42-qr-area"><button id="rdsV42QrBtn" class="btn primary">Gerar QR Code</button><p id="rdsV42QrMsg" class="mut">O QR Code aparecerá aqui.</p></div>`;
    host.prepend(box);
    document.querySelector('#rdsV42QrBtn').onclick=async()=>{try{const b=document.querySelector('#rdsV42QrBtn');b.disabled=true;b.textContent='Conectando...';document.querySelector('#rdsV42QrMsg').textContent='Conexão iniciada. Aguardando QR Code...';await post('/api/whatsapp/connect',{force:true});startPoll()}catch(e){toast(e.message);document.querySelector('#rdsV42QrMsg').textContent=e.message}finally{const b=document.querySelector('#rdsV42QrBtn');if(b){b.disabled=false;b.textContent='Gerar QR Code'}}};
    startPoll();
  }
  async function poll(){
    try{
      const s=await getStatus();
      const state=document.querySelector('#rdsV42WaState'),area=document.querySelector('#rdsV42QrArea');
      if(!state||!area)return stopPoll();
      if(s.connected){state.textContent='CONECTADO';state.className='badge ok';area.innerHTML='<p>✅ WhatsApp conectado. O QR Code não é mais necessário.</p>';stopPoll();return}
      state.textContent=s.starting?'CONECTANDO...':'DESCONECTADO';state.className='badge '+(s.starting?'warn':'bad');
      if(s.qrAvailable&&s.qrDataUrl){area.innerHTML=`<div class="rds-v42-qr-wrap"><img src="${s.qrDataUrl}" alt="QR Code para conectar WhatsApp"><p>Abra WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho e escaneie este QR Code.</p></div><button class="btn" onclick="rdsV42Reconnect()">Gerar novo QR Code</button>`;}
      else if(s.lastError){const msg=document.querySelector('#rdsV42QrMsg');if(msg)msg.textContent=s.lastError;}
    }catch{}
  }
  function startPoll(){stopPoll();poll();qrTimer=setInterval(poll,1000)}
  window.rdsV42Reconnect=async()=>{try{await post('/api/whatsapp/connect',{force:true});startPoll()}catch(e){toast(e.message)}};
  const oldSettings=window.settings;
  window.settings=async()=>{await oldSettings();mount()};
  const oldRender=render;
  render=async function(){await oldRender();if(page==='settings')mount()};
  const css=document.createElement('style');css.textContent=`#rdsV42WhatsApp{margin-bottom:16px}.rds-v42-wa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.rds-v42-qr-area{text-align:center;margin-top:14px;padding:18px;border:1px dashed #cbd8e8;border-radius:16px}.rds-v42-qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px}.rds-v42-qr-wrap img{width:min(360px,78vw);height:min(360px,78vw);object-fit:contain;background:#fff;padding:10px;border-radius:12px}.rds-v42-qr-area button{margin-top:10px}@media(max-width:600px){.rds-v42-wa-head{flex-direction:column}}`;document.head.appendChild(css);
})();
