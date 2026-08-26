(()=>{
  const oldSettings=window.settings;
  function fmtDate(v){try{return v?new Date(v).toLocaleString('pt-BR'):'Ainda não realizado'}catch{return v||'—'}}
  async function getStatus(){return api('/api/v1025/backup/status')}
  window.rds1025BackupStatus=async function(){
    try{
      const d=await getStatus(), c=d.config||{}, list=d.backups||[];
      modal(`<span class="eyebrow">BACKUP E RESTAURAÇÃO</span><h2>Central de backup</h2><p class="mut">Os dados operacionais continuam na nuvem do sistema. O backup cria cópias extras para recuperação.</p>
      <div class="grid"><div class="card"><span class="eyebrow">AUTOMÁTICO</span><div class="metric">${c.enabled?'ATIVO':'DESATIVADO'}</div></div><div class="card"><span class="eyebrow">HORÁRIO</span><div class="metric">${esc(c.time||'03:00')}</div></div></div>
      <p class="mut">Último backup: <b>${fmtDate(c.last_backup_at)}</b></p>
      <div class="priority-list">${list.length?list.map(b=>`<div class="priority"><div><strong>${fmtDate(b.created_at)}</strong><small>${esc(b.type||'backup')}</small></div><button class="btn" onclick="rds1025RestoreCloud('${esc(b.slot)}')">Restaurar</button></div>`).join(''):'<div class="empty-state">Nenhum backup em nuvem criado ainda.</div>'}</div>`)
    }catch(e){toast(e.message)}
  };
  window.rds1025SaveBackupConfig=async function(){
    try{
      const enabled=document.querySelector('#rds1025Enabled')?.checked!==false;
      const time=document.querySelector('#rds1025Time')?.value||'03:00';
      await api('/api/v1025/backup/config',{method:'POST',body:JSON.stringify({enabled,time,timezone_offset_minutes:-new Date().getTimezoneOffset(),keep:7})});
      toast('Configuração de backup salva.');
    }catch(e){toast(e.message)}
  };
  window.rds1025CloudNow=async function(){try{toast('Criando backup...');await api('/api/v1025/backup/cloud',{method:'POST'});toast('Backup em nuvem concluído.');await settings()}catch(e){toast(e.message)}};
  window.rds1025Download=async function(mode='essential'){
    try{
      const r=await fetch('/api/v1025/backup/export?mode='+encodeURIComponent(mode)); if(!r.ok) throw new Error('Falha ao gerar backup.');
      const blob=await r.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); const cd=r.headers.get('content-disposition')||''; const m=cd.match(/filename="([^"]+)"/); a.download=m?.[1]||'RDS-backup.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    }catch(e){toast(e.message)}
  };
  window.rds1025PickRestore=function(){document.querySelector('#rds1025RestoreFile')?.click()};
  window.rds1025RestoreFile=async function(input){
    try{
      const f=input.files?.[0]; if(!f)return; const txt=await f.text(); const backup=JSON.parse(txt);
      if(!confirm('Restaurar este backup? Os dados serão mesclados com os dados atuais e uma cópia de segurança será criada antes da restauração.'))return;
      toast('Restaurando backup...'); await api('/api/v1025/backup/restore-file',{method:'POST',body:JSON.stringify({confirmation:'RESTAURAR',backup})}); toast('Backup restaurado.');
    }catch(e){toast(e.message)} finally{input.value=''}
  };
  window.rds1025RestoreCloud=async function(slot){
    try{
      if(!confirm('Restaurar este backup em nuvem? Uma cópia de segurança será criada antes da restauração.'))return;
      toast('Restaurando...');await api('/api/v1025/backup/restore-cloud',{method:'POST',body:JSON.stringify({confirmation:'RESTAURAR',slot})});toast('Backup restaurado.');document.querySelector('.modal')?.remove();
    }catch(e){toast(e.message)}
  };
  window.settings=async function(){
    await oldSettings();
    try{
      if(document.querySelector('#rds1025Backup'))return;
      const d=await getStatus(), c=d.config||{};
      const box=document.createElement('section'); box.id='rds1025Backup'; box.className='card';
      box.innerHTML=`<span class="eyebrow">SEGURANÇA DOS DADOS</span><h2>Backup e restauração</h2><p class="mut">Backup automático em nuvem ativado por padrão. Também é possível salvar uma cópia nos Arquivos e restaurar quando necessário.</p>
      <div class="grid"><div><label><input id="rds1025Enabled" type="checkbox" style="width:auto" ${c.enabled!==false?'checked':''}> Backup automático</label><small class="mut">Ativado por padrão.</small></div><div><label>Horário do backup automático</label><input id="rds1025Time" type="time" value="${esc(c.time||'03:00')}"></div></div>
      <div class="row" style="margin-top:14px"><button class="btn primary" onclick="rds1025SaveBackupConfig()">Salvar backup</button><button class="btn" onclick="rds1025CloudNow()">Backup agora na nuvem</button><button class="btn" onclick="rds1025Download('essential')">Salvar nos Arquivos</button><button class="btn" onclick="rds1025BackupStatus()">Ver backups</button><button class="btn warn" onclick="rds1025PickRestore()">Restaurar arquivo</button><input id="rds1025RestoreFile" type="file" accept="application/json,.json" style="display:none" onchange="rds1025RestoreFile(this)"></div>
      <p class="mini">Último backup: ${fmtDate(c.last_backup_at)} • Mantidas até 7 cópias automáticas na nuvem.</p>`;
      app.appendChild(box);
    }catch(e){console.error('V10.25 backup UI',e)}
  };
})();
