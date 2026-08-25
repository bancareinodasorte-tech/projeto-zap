(()=>{
  const oldSettings=window.settings;
  const oldHome=window.home;

  async function snapshot(){
    const [status,dash,follow,postpay]=await Promise.all([
      api('/api/status').catch(()=>({connected:false})),
      api('/api/dashboard').catch(()=>({})),
      api('/api/v1011/followup/summary').catch(()=>({})),
      api('/api/v1012/postpay/summary').catch(()=>({}))
    ]);
    const checks=[
      ['WhatsApp',!!status.connected],
      ['Fila sem falhas',Number(dash.failed||0)===0],
      ['Sem alertas críticos',Number(dash.alerts||0)===0],
      ['Pagamentos em dia',Number(postpay.reviewDelayed||0)===0],
      ['Bilhetes em dia',Number(postpay.ticketsDelayed||0)===0]
    ];
    const ok=checks.filter(x=>x[1]).length;
    return {status,dash,follow,postpay,checks,ok,percent:Math.round(ok/checks.length*100)};
  }

  window.rds1014Production=async function(){
    try{
      const d=await snapshot();
      modal(`<span class="eyebrow">Preparação para aplicativo</span><h2>Checklist operacional</h2><div class="metric">${d.percent}%</div><p class="mut">Verificação rápida antes de operar em produção.</p><div class="priority-list">${d.checks.map(x=>`<div class="priority"><div><strong>${x[0]}</strong><small>${x[1]?'Pronto':'Requer atenção'}</small></div><span class="badge ${x[1]?'ok':'warn'}">${x[1]?'OK':'REVISAR'}</span></div>`).join('')}</div><p class="mut">Este checklist não altera dados nem executa envios.</p>`);
    }catch(e){toast(e.message)}
  };

  window.settings=async function(){
    await oldSettings();
    try{
      if(document.querySelector('#rds1014Production'))return;
      const d=await snapshot();
      const box=document.createElement('div');box.id='rds1014Production';box.className='card';
      box.innerHTML=`<span class="eyebrow">Preparação final</span><h2>Aplicativo e produção</h2><p class="mut">Prontidão atual: <b>${d.percent}%</b>. Use a conferência antes da etapa de empacotamento.</p><button class="btn primary" onclick="rds1014Production()">Ver checklist</button>`;
      app.appendChild(box);
    }catch(e){console.error('V10.14 production UI',e)}
  };

  window.home=async function(){
    await oldHome();
    try{
      if(document.querySelector('#rds1014ProductionHome'))return;
      const d=await snapshot();
      const box=document.createElement('div');box.id='rds1014ProductionHome';box.className='card';
      box.innerHTML=`<div class="row" style="justify-content:space-between;align-items:center"><div><span class="eyebrow">Prontidão para produção</span><h2 style="margin:.35rem 0">${d.percent}% verificado</h2><p class="mut" style="margin:0">Checklist compacto para a futura versão instalada.</p></div><button class="btn" onclick="rds1014Production()">Conferir</button></div>`;
      const op=document.querySelector('#rds1013OperatorCard');if(op)op.insertAdjacentElement('afterend',box);else app.appendChild(box);
    }catch(e){console.error('V10.14 home UI',e)}
  };
})();
