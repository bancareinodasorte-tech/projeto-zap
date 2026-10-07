import fs from 'node:fs';

const path='app.js';
let app=fs.readFileSync(path,'utf8');
const marker='RDS SECURITY DEVICES UI V1';
if(!app.includes(marker)){
  const ui=\`
/* RDS SECURITY DEVICES UI V1 */
(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const token=()=>localStorage.getItem('rds_operator_token')||'';
  const json=async(u,o={})=>{
    const r=await fetch(u,{cache:'no-store',...o,headers:{...(o.headers||{}),...(token()?{Authorization:'Bearer '+token()}: {})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||d.message||'Falha.');
    return d;
  };
  async function enhance(){
    if(typeof window.rdsUnifiedAccountPage!=='function')return false;
    if(window.__rdsSecurityAccountWrapped)return true;
    const original=window.rdsUnifiedAccountPage;
    window.rdsUnifiedAccountPage=async function(){
      await original();
      setTimeout(async()=>{
        const box=document.getElementById('rdsAccountDevices');
        if(!box||box.dataset.securityEnhanced)return;
        box.dataset.securityEnhanced='1';
        try{
          const d=await json('/api/operator/me');
          const devices=d.devices||[];
          const active=devices.filter(x=>x.status==='ATIVO').length;
          box.innerHTML='<div class="status '+(active>=2?'ok':'warn')+'"><b>Dispositivos ativos: '+active+'/2</b><br><span class="mini">O administrador controla autorização, bloqueio e revogação.</span></div>'+
            (devices.length?devices.map(x=>{
              const st=String(x.status||'');
              const action=st==='ATIVO'?'<button class="btn dangerOutline rds-self-revoke" data-id="'+esc(x.id)+'">Revogar este dispositivo</button>':'';
              return '<div class="status '+(st==='ATIVO'?'ok':st==='PENDENTE'?'warn':'bad')+'" style="margin:7px 0"><b>'+esc(x.platform||'web')+'</b> • '+esc(st)+'<br><span class="mini">'+esc(x.device_id||'')+'</span>'+(x.last_seen_at?'<br><span class="mini">Último acesso: '+esc(x.last_seen_at)+'</span>':'')+'<div style="margin-top:8px">'+action+'</div></div>';
            }).join(''):'<span class="mut">Nenhum dispositivo registrado.</span>');
          box.querySelectorAll('.rds-self-revoke').forEach(b=>b.onclick=async()=>{
            if(!confirm('Revogar este dispositivo? A sessão dele será encerrada.'))return;
            try{await json('/api/operator/devices/'+encodeURIComponent(b.dataset.id)+'/revoke',{method:'POST'});toast('Dispositivo revogado.');window.rdsUnifiedAccountPage();}catch(e){toast(e.message);}
          });
        }catch(e){box.innerHTML='<span class="mut">Não foi possível carregar o controle de dispositivos.</span>';}
      },40);
    };
    window.__rdsSecurityAccountWrapped=true;
    return true;
  }
  const boot=()=>{if(enhance())return;let n=0;const t=setInterval(()=>{if(enhance()||++n>30)clearInterval(t);},250);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
\`;
  app+='\n'+ui;
  fs.writeFileSync(path,app,'utf8');
}
console.log('[RDS] segurança de dispositivos V1 pronta');
