(()=> {
 const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const pad=n=>String(n).padStart(2,'0');
 const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const monthStart=()=>ymd(new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const token=()=>localStorage.getItem('rds_admin_token')||localStorage.getItem('rds_operator_token')||'';
 const headers=()=>token()?{Authorization:'Bearer '+token()}:{};
 const api=async(url,opt={})=>{const r=await fetch(url,{cache:'no-store',...opt,headers:{...headers(),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.error||'Não foi possível concluir a operação.');return d;};
 const date=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
 window.rdsCommissionPayouts=async function(){
  const root=document.getElementById('app');if(!root)return;
  root.innerHTML='<div class="card"><h1>Comissões e repasses</h1><p>Carregando livro financeiro…</p></div>';
  try{
   const data=await api('/api/rds/commission-payouts');
   const payouts=data.payouts||[],sellers=data.sellers||[];
   const total=payouts.reduce((a,p)=>a+Number(p.amount||0),0);
   root.innerHTML='<div class="page-title"><div><span class="eyebrow">FINANCEIRO</span><h1>Comissões e repasses</h1><p class="mut">Registro de repasses efetivamente realizados, com histórico e comprovante.</p></div><button class="btn" id="rdsPayoutReload">↻ Atualizar</button></div>'+
   '<div class="grid"><div class="card metric-card"><span class="eyebrow">Repasses no histórico carregado</span><div class="metric">'+payouts.length+'</div></div><div class="card metric-card"><span class="eyebrow">Total repassado</span><div class="metric">'+brl(total)+'</div></div></div>'+
   '<div class="card"><h2>Registrar repasse</h2><p class="mini">O registro só é aceito quando houver comissão concluída disponível para o vendedor naquele mês. O banco impede duplicidade e excesso de repasse.</p>'+
   '<form id="rdsPayoutForm"><div class="grid"><div><label>Vendedor</label><select name="seller_id" required><option value="">Selecione…</option>'+sellers.map(s=>'<option value="'+esc(s.id)+'" data-company="'+esc(s.company_id||'')+'">'+esc(s.name)+' — '+esc(s.status||'')+'</option>').join('')+'</select><input type="hidden" name="company_id"></div><div><label>Mês de apuração</label><input name="period_month" type="date" value="'+esc(monthStart())+'" required></div><div><label>Valor repassado (R$)</label><input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00"></div><div><label>Forma de pagamento</label><select name="payment_method" required><option value="PIX">PIX</option><option value="TRANSFERENCIA">Transferência</option><option value="DINHEIRO">Dinheiro</option><option value="OUTRO">Outro</option></select></div><div><label>Referência / ID da transação</label><input name="reference" maxlength="180" placeholder="Opcional"></div><div><label>Link do comprovante (HTTPS)</label><input name="receipt_url" type="url" placeholder="https://…"></div></div><div><label>Observações</label><textarea name="notes" rows="2" maxlength="2000" placeholder="Opcional"></textarea></div><button class="btn primary" type="submit">Registrar repasse</button><p class="mini">Este registro não envia dinheiro nem altera pedidos; serve para documentar um repasse realizado fora do painel.</p></form></div>'+
   '<div class="card"><h2>Histórico de repasses</h2><div class="table" style="overflow-x:auto"><table><thead><tr><th>Vendedor</th><th>Mês</th><th>Data do registro</th><th>Valor</th><th>Forma</th><th>Referência / comprovante</th></tr></thead><tbody>'+(payouts.length?payouts.map(p=>'<tr><td>'+esc(p.seller_name)+'</td><td>'+date(p.period_month)+'</td><td>'+date(p.paid_at)+'</td><td>'+brl(p.amount)+'</td><td>'+esc(p.payment_method)+'</td><td>'+esc(p.reference||'—')+(p.receipt_url?' · <a target="_blank" rel="noopener noreferrer" href="'+esc(p.receipt_url)+'">Abrir comprovante</a>':'')+'</td></tr>').join(''):'<tr><td colspan="6">Nenhum repasse registrado.</td></tr>')+'</tbody></table></div></div>';
   root.querySelector('#rdsPayoutReload').onclick=()=>window.rdsCommissionPayouts();
   const form=root.querySelector('#rdsPayoutForm'),sel=form.elements.seller_id,month=form.elements.period_month;
   const syncCompany=()=>{const o=sel.options[sel.selectedIndex];form.elements.company_id.value=o?.dataset?.company||'';};
   sel.onchange=syncCompany;syncCompany();
   month.onchange=()=>{if(month.value){const d=new Date(month.value+'T12:00:00');month.value=ymd(new Date(d.getFullYear(),d.getMonth(),1));}};
   form.onsubmit=async ev=>{ev.preventDefault();syncCompany();const o=sel.options[sel.selectedIndex];const payload=Object.fromEntries(new FormData(form).entries());if(!o||!o.value){alert('Selecione um vendedor.');return;}if(!confirm('Confirmar o registro deste repasse? O sistema não enviará dinheiro.'))return;const b=form.querySelector('button[type=submit]');b.disabled=true;b.textContent='Registrando…';try{await api('/api/rds/commission-payouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});alert('Repasse registrado no histórico.');await window.rdsCommissionPayouts();}catch(e){alert(e.message);}finally{if(document.body.contains(b)){b.disabled=false;b.textContent='Registrar repasse';}}};
  }catch(e){root.innerHTML='<div class="card"><h1>Comissões e repasses</h1><p>'+esc(e.message)+'</p><p class="mini">A estrutura financeira precisa estar instalada no banco antes de liberar esta tela. Nenhum repasse foi registrado.</p><button class="btn" onclick="window.rdsCommissionPage()">Voltar às comissões calculadas</button></div>';}
 };
})();
