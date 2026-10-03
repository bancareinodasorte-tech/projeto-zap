(()=>{
  const base=window.settings;
  if(typeof base!=='function'||window.__rdsOrderExpirationUI)return;
  window.__rdsOrderExpirationUI=true;
  window.settings=async function(){
    await base();
    try{
      const c=await fetch('/api/order-expiration',{cache:'no-store'}).then(r=>r.json());
      const box=document.createElement('div');
      box.className='card';
      box.innerHTML='<span class="eyebrow">Ciclo do pedido</span><h2>Expiração automática</h2><p class="mut">Pedidos sem pagamento expiram automaticamente após este prazo. O padrão é 3 horas.</p><label>Prazo para expirar (horas)</label><input id="rdsOrderExpirationHours" type="number" min="0.25" max="168" step="0.25" value="'+Number(c.hours||3)+'"><p class="mini">Após expirar, o pedido é desvinculado, a fila de campanhas é retomada quando houver mensagens restantes e o próximo contato começa novamente pelo menu.</p><div class="row"><button class="btn primary" onclick="rdsSaveOrderExpiration()">Salvar prazo</button></div>';
      app.appendChild(box);
      const r=await fetch('/api/payment-reminders',{cache:'no-store'}).then(x=>x.json());
      const rbox=document.createElement('div');
      rbox.className='card';
      const rchecked=r.enabled!==false?'checked':'';
      const rinterval=Number(r.interval_hours||1);
      const rmax=Number(r.max_reminders||3);
      rbox.innerHTML='<span class=eyebrow>Cobrança automática</span><h2>Lembretes de pagamento PIX</h2><p class=mut>Enquanto o pedido estiver em AGUARDANDO PIX, o sistema pode enviar lembretes automáticos. A expiração encerra o pedido no prazo final configurado acima.</p><label><input type=checkbox id=rdsPixReminderEnabled style=width:auto '+rchecked+'> Enviar lembretes automáticos</label><div class=grid><div><label>Lembrar a cada (horas)</label><input id=rdsPixReminderInterval type=number min=0.25 max=24 step=0.25 value='+rinterval+'><p class=mini>Ex.: 1 = lembrete a cada hora.</p></div><div><label>Máximo de lembretes por pedido</label><input id=rdsPixReminderMax type=number min=1 max=10 step=1 value='+rmax+'><p class=mini>Com prazo de 4h e intervalo de 1h, o padrão envia lembretes em 1h, 2h e 3h.</p></div></div><div class=row><button class=btn onclick=rdsSavePaymentReminders()>Salvar cobrança automática</button></div>';
      app.appendChild(rbox);
    }catch(e){console.error('[RDS] UI expiração',e);}
  };
  window.rdsSaveOrderExpiration=async function(){
    try{
      const hours=Number(document.querySelector('#rdsOrderExpirationHours')?.value||3);
      if(!Number.isFinite(hours)||hours<0.25||hours>168)throw new Error('Informe um prazo entre 0,25 e 168 horas.');
      await fetch('/api/order-expiration',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({hours})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao salvar prazo.');return d;});
      toast('Prazo de expiração salvo.');
    }catch(e){toast(e.message);}
  };
})();
window.rdsSavePaymentReminders=async function(){
  try{
    const enabled=document.querySelector('#rdsPixReminderEnabled')?.checked!==false;
    const interval_hours=Number(document.querySelector('#rdsPixReminderInterval')?.value||1);
    const max_reminders=Number(document.querySelector('#rdsPixReminderMax')?.value||3);
    if(!Number.isFinite(interval_hours)||interval_hours<0.25||interval_hours>24)throw new Error('O intervalo deve ficar entre 0,25 e 24 horas.');
    if(!Number.isInteger(max_reminders)||max_reminders<1||max_reminders>10)throw new Error('O máximo deve ficar entre 1 e 10 lembretes.');
    await fetch('/api/payment-reminders',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,interval_hours,max_reminders})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao salvar cobrança automática.');return d;});
    toast('Cobrança automática salva.');
  }catch(e){toast(e.message);}
};
