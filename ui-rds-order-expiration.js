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