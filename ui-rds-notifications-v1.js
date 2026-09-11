(()=>{
  if(window.__RDS_NOTIFICATIONS_V1__) return;
  window.__RDS_NOTIFICATIONS_V1__=true;

  const KEY='rds.notifications.v1';
  const MUTE='rds.notifications.mute.v1';
  const MAX=60;
  const POLL=15000;
  let state={items:[],baseline:null};
  let firstRun=true;

  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const phone=v=>String(v??'').replace(/\D/g,'');
  const actionable=rows=>{
    const seen=new Set();
    return (Array.isArray(rows)?rows:[]).filter(r=>{
      const id=String(r?.id||'');
      const p=phone(r?.phone);
      const key=id||p;
      if(!key||seen.has(key)) return false;
      seen.add(key); return true;
    });
  };
  const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');if(x&&Array.isArray(x.items))state=x}catch{}};
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({items:state.items.slice(0,MAX)}))}catch{}};
  const muted=()=>{try{return localStorage.getItem(MUTE)==='1'}catch{return false}};
  const setMuted=v=>{try{localStorage.setItem(MUTE,v?'1':'0')}catch{}};
  const sigReturn=r=>`return:${String(r?.id||'')}:${String(r?.created_at||'')}:${phone(r?.phone)}:${String(r?.body||'').slice(0,80)}`;
  const sigOrder=r=>`order:${String(r?.id||'')}:${String(r?.updated_at||r?.created_at||'')}:${String(r?.status||r?.payment_status||'')}`;

  function add(item,important=false){
    const id=item.id;
    if(state.items.some(x=>x.id===id)) return false;
    state.items.unshift({id,title:item.title,text:item.text,time:new Date().toISOString(),important:!!important,read:false});
    state.items=state.items.slice(0,MAX); save(); paint();
    if(important&&!muted()) importantSignal();
    return true;
  }

  function importantSignal(){
    try{
      if('Notification' in window&&Notification.permission==='granted') new Notification('REINO DA SORTE',{body:'Nova notificação importante no Canal de Vendas.'});
    }catch{}
    try{
      if(!window.__RDS_AUDIO_CTX__) return;
      const ctx=window.__RDS_AUDIO_CTX__,o=ctx.createOscillator(),g=ctx.createGain();
      o.frequency.value=880;g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.035,ctx.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.22);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.24);
    }catch{}
  }

  function ensure(){
    if(document.getElementById('rdsNotifRoot')) return;
    const root=document.createElement('div');root.id='rdsNotifRoot';
    root.innerHTML=`<style>
      #rdsNotifRoot{position:relative;display:inline-flex;align-items:center;z-index:50}
      #rdsNotifBell{position:relative;width:38px;height:38px;border:1px solid rgba(20,73,145,.16);border-radius:12px;background:#fff;color:#174f9b;cursor:pointer;font-size:19px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(15,55,105,.08)}
      #rdsNotifBadge{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#d92d20;color:#fff;font:700 10px/17px Arial;text-align:center;display:none}
      #rdsNotifPanel{position:absolute;right:0;top:46px;width:min(360px,calc(100vw - 28px));background:#fff;border:1px solid #dce5f2;border-radius:16px;box-shadow:0 18px 50px rgba(13,43,84,.2);display:none;overflow:hidden}
      #rdsNotifPanel.open{display:block}
      .rds-n-head{padding:14px 16px;border-bottom:1px solid #edf1f7;display:flex;justify-content:space-between;align-items:center;gap:8px}.rds-n-head strong{font-size:14px;color:#123b70}.rds-n-head button{border:0;background:transparent;color:#52709a;cursor:pointer;font-size:12px}
      #rdsNotifList{max-height:360px;overflow:auto}.rds-n-item{padding:12px 16px;border-bottom:1px solid #f0f3f8;cursor:pointer}.rds-n-item:last-child{border-bottom:0}.rds-n-item.unread{background:#f5f9ff}.rds-n-item b{display:block;font-size:13px;color:#173f75;margin-bottom:3px}.rds-n-item span{display:block;font-size:12px;color:#5f718b;line-height:1.35}.rds-n-item time{display:block;margin-top:5px;font-size:10px;color:#94a3b8}.rds-n-empty{padding:28px 16px;text-align:center;color:#8090a6;font-size:12px}
      .rds-n-foot{padding:10px 16px;border-top:1px solid #edf1f7;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#71829b}.rds-n-foot button{border:0;background:transparent;color:#174f9b;cursor:pointer;font-weight:700}
    </style><button id="rdsNotifBell" type="button" aria-label="Notificações" title="Notificações">♧<span id="rdsNotifBadge">0</span></button><div id="rdsNotifPanel"><div class="rds-n-head"><strong>Notificações</strong><button id="rdsNotifRead" type="button">Marcar como lidas</button></div><div id="rdsNotifList"></div><div class="rds-n-foot"><span id="rdsNotifMuteText">Som ativo</span><button id="rdsNotifMute" type="button">Silenciar</button></div></div>`;
    document.querySelector('.top-actions')?.prepend(root);
    if(!document.getElementById('rdsNotifBell')) return;
    document.getElementById('rdsNotifBell').onclick=e=>{e.preventDefault();e.stopPropagation();document.getElementById('rdsNotifPanel')?.classList.toggle('open');paint()};
    document.getElementById('rdsNotifRead').onclick=e=>{e.preventDefault();e.stopPropagation();state.items.forEach(x=>x.read=true);save();paint()};
    document.getElementById('rdsNotifMute').onclick=e=>{e.preventDefault();e.stopPropagation();setMuted(!muted());paint()};
    document.addEventListener('click',e=>{if(!root.contains(e.target))document.getElementById('rdsNotifPanel')?.classList.remove('open')},{passive:true});
    document.getElementById('rdsNotifBell').addEventListener('click',()=>{try{if(!window.__RDS_AUDIO_CTX__)window.__RDS_AUDIO_CTX__=new (window.AudioContext||window.webkitAudioContext)();window.__RDS_AUDIO_CTX__.resume?.()}catch{}});
    paint();
  }

  function paint(){
    const list=document.getElementById('rdsNotifList'),badge=document.getElementById('rdsNotifBadge');if(!list||!badge)return;
    const unread=state.items.filter(x=>!x.read).length;badge.textContent=unread>99?'99+':String(unread);badge.style.display=unread?'block':'none';
    list.innerHTML=state.items.length?state.items.map(x=>`<div class="rds-n-item ${x.read?'':'unread'}" data-id="${esc(x.id)}"><b>${esc(x.title)}</b><span>${esc(x.text)}</span><time>${new Date(x.time).toLocaleString('pt-BR')}</time></div>`).join(''):'<div class="rds-n-empty">Nenhuma notificação nova.</div>';
    list.querySelectorAll('.rds-n-item').forEach(el=>el.onclick=()=>{const x=state.items.find(a=>a.id===el.dataset.id);if(x)x.read=true;save();paint()});
    const mt=document.getElementById('rdsNotifMuteText'),mb=document.getElementById('rdsNotifMute');if(mt)mt.textContent=muted()?'Som silenciado':'Som ativo';if(mb)mb.textContent=muted()?'Ativar som':'Silenciar';
  }

  async function poll(){
    try{
      const [rr,oo]=await Promise.all([
        fetch('/api/returns',{cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[]),
        fetch('/api/orders',{cache:'no-store'}).then(r=>r.ok?r.json():[]).catch(()=>[])
      ]);
      const returns=actionable(rr),orders=Array.isArray(oo)?oo:[];
      const current={returns:returns.map(sigReturn),orders:orders.map(sigOrder)};
      if(!state.baseline){state.baseline=current;save();return}
      const oldR=new Set(state.baseline.returns||[]),oldO=new Set(state.baseline.orders||[]);
      let changed=false;
      returns.filter(r=>!oldR.has(sigReturn(r))).slice(0,10).forEach(r=>{add({id:sigReturn(r),title:'Novo retorno',text:`Novo contato recebido${r?.phone?' — '+r.phone:''}.`},true);changed=true});
      orders.filter(r=>!oldO.has(sigOrder(r))).slice(0,10).forEach(r=>{const status=String(r?.status||r?.payment_status||'').toUpperCase();add({id:sigOrder(r),title:'Atualização de compra',text:`Pedido ${r?.order_code||r?.code||r?.id||''}${status?' — '+status:''}.`},status.includes('PAID')||status.includes('PAGO')||status.includes('COMPLET'))});
      state.baseline=current;if(changed)save();
    }catch{}
  }

  load();
  const observer=new MutationObserver(()=>ensure());observer.observe(document.body,{childList:true,subtree:true});
  ensure();
  poll();
  setInterval(poll,POLL);
  setInterval(ensure,3000);

  window.rdsNotifications={get items(){return state.items.slice()},clear(){state.items=[];save();paint()},mute(v){setMuted(!!v);paint()}};
})();
