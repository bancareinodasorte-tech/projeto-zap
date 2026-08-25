(()=>{
  const oldSettings=window.settings;
  window.rds1019Save=async function(){
    try{
      const body={enabled:document.querySelector('#rds1019Enabled').checked,ignored_hours:Number(document.querySelector('#rds1019Ignored').value||12),cooldown_hours:Number(document.querySelector('#rds1019Cooldown').value||24),max_per_run:Number(document.querySelector('#rds1019Max').value||5),message:document.querySelector('#rds1019Message').value};
      await post('/api/v1019/reengagement-config',body);toast('Reenvio automático salvo.');await settings();
    }catch(e){toast(e.message)}
  };
  window.rds1019Run=async function(){try{const r=await post('/api/v1019/reengagement/run');toast(`Processado: ${r.sent||0} reenvio(s).`);await settings()}catch(e){toast(e.message)}};
  window.settings=async function(){
    await oldSettings();
    try{
      const d=await api('/api/v1019/reengagement-config');
      if(document.querySelector('#rds1019Box'))return;
      const box=document.createElement('div');box.id='rds1019Box';box.className='card';
      box.innerHTML=`<span class="eyebrow">REENGAJAMENTO</span><h2>Reenvio automático para ignorados</h2><p class="mut">Clientes que não responderam podem receber uma nova mensagem automaticamente. Quem respondeu, iniciou pedido ou comprou fica fora do reenvio.</p><label><input id="rds1019Enabled" type="checkbox" style="width:auto" ${d.enabled?'checked':''}> Ativar reenvio automático</label><div class="grid"><div><label>Considerar ignorado após — horas</label><input id="rds1019Ignored" type="number" min="1" max="168" value="${Number(d.ignored_hours||12)}"></div><div><label>Intervalo mínimo entre reenvios — horas</label><input id="rds1019Cooldown" type="number" min="1" max="168" value="${Number(d.cooldown_hours||24)}"></div><div><label>Máximo por processamento</label><input id="rds1019Max" type="number" min="1" max="20" value="${Number(d.max_per_run||5)}"></div><div class="card"><span class="eyebrow">PRONTOS PARA REENVIO</span><div class="metric">${Number(d.eligible||0)}</div></div></div><label>Mensagem de reenvio</label><textarea id="rds1019Message">${esc(d.message||'')}</textarea><p class="mini">Use {NOME} para inserir o nome do cliente automaticamente.</p><div class="row"><button class="btn primary" onclick="rds1019Save()">Salvar reenvio</button><button class="btn" onclick="rds1019Run()">Processar agora</button></div>`;
      app.appendChild(box);
    }catch(e){console.error('V10.19 UI',e)}
  };
})();
