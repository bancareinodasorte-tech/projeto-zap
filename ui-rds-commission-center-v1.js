(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const date=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
 const token=()=>localStorage.getItem('rds_operator_token')||localStorage.getItem('rds_admin_token')||'';
 const today=new Date(),pad=n=>String(n).padStart(2,'0');
 const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 let from=ymd(new Date(today.getFullYear(),today.getMonth(),1)),to=ymd(today);
 async function load(){
  const q=new URLSearchParams({from,to}),h=token()?{Authorization:'Bearer '+token()}:{};
  const r=await fetch('/api/rds/commission-center?'+q.toString(),{cache:'no-store',headers:h});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.success)throw new Error(d.error||'Não foi possível consultar as comissões.');
  return d;
 }
 const metric=(label,value)=>'<div class="card metric-card"><span class="eyebrow">'+esc(label)+'</span><div class="metric">'+esc(value)+'</div></div>';
 const table=(headers,rows,empty)=>'<div class="table" style="overflow-x:auto"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+headers.length+'" class="empty-state">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';
 function render(d){
  const root=document.getElementById('app');if(!root)return;
  const admin=d.role==='ADMINISTRADOR',bySeller=admin?(d.bySeller||[]):[],byDraw=d.byDraw||[],rows=d.rows||[];
  root.innerHTML='<div class="page-title"><div><span class="eyebrow">FINANCEIRO</span><h1>Comissões e resultados</h1><p class="mut">Vendas concluídas, comissão calculada do vendedor e receita da banca.</p></div><button class="btn" id="rdsCommissionReload">↻ Atualizar</button></div>'+
   '<div class="card"><h2>Período de apuração</h2><div class="grid"><div><label for="rdsCommissionFrom">Data inicial</label><input id="rdsCommissionFrom" type="date" value="'+esc(from)+'"></div><div><label for="rdsCommissionTo">Data final</label><input id="rdsCommissionTo" type="date" value="'+esc(to)+'"></div></div><div class="row" style="margin-top:12px"><button class="btn primary" id="rdsCommissionApply">Aplicar período</button><button class="btn" data-range="today">Hoje</button><button class="btn" data-range="month">Este mês</button><button class="btn" data-range="all">Todo o histórico</button></div><p class="mini">Somente pedidos concluídos entram no cálculo. Comissão calculada não significa comissão já paga.</p></div>'+
   '<div class="grid">'+metric('Vendas concluídas',d.totals.sales)+metric('Faturamento',brl(d.totals.revenue))+metric(admin?'Comissão dos vendedores':'Minha comissão calculada',brl(d.totals.seller_commission))+(admin?metric('Receita da banca',brl(d.totals.company_revenue)):metric('Bilhetes vendidos',d.totals.tickets))+'</div>'+
   (admin?'<div class="card"><h2>Resumo por vendedor</h2>'+table(['Vendedor','Vendas','Faturamento','Comissão','Receita banca'],bySeller.map(s=>'<tr><td>'+esc(s.seller_name)+'</td><td>'+s.sales+'</td><td>'+brl(s.revenue)+'</td><td>'+brl(s.seller_commission)+'</td><td>'+brl(s.company_revenue)+'</td></tr>'),'Nenhuma venda concluída no período.')+'</div>':'')+
   '<div class="card"><h2>Resumo por sorteio</h2>'+table(['Sorteio','Vendas','Bilhetes','Faturamento','Comissão'],byDraw.map(s=>'<tr><td>'+esc(s.draw_title)+'</td><td>'+s.sales+'</td><td>'+s.tickets+'</td><td>'+brl(s.revenue)+'</td><td>'+brl(s.seller_commission)+'</td></tr>'),'Nenhuma venda concluída no período.')+'</div>'+
   '<div class="card"><h2>Detalhamento das compras concluídas</h2>'+table(['Pedido','Data','Sorteio','Valor','Comissão'],rows.map(o=>'<tr><td>'+esc(o.code)+'</td><td>'+date(o.completed_at)+'</td><td>'+esc(o.draw_title)+'</td><td>'+brl(o.total)+'</td><td>'+brl(o.seller_commission)+'</td></tr>'),'Nenhum pedido concluído neste período.')+'</div>'+
   '<div class="card"><h2>Fechamento financeiro</h2><p class="mut">Esta tela consolida comissões calculadas. Registro de comissão paga, estornos, comprovantes de repasse e fechamento de caixa exigem um controle financeiro próprio; nenhum pagamento é presumido automaticamente.</p></div>';
  root.querySelector('#rdsCommissionReload').onclick=()=>window.rdsCommissionPage();
  root.querySelector('#rdsCommissionApply').onclick=async()=>{const a=root.querySelector('#rdsCommissionFrom').value,b=root.querySelector('#rdsCommissionTo').value;if(!a||!b||a>b){if(typeof window.toast==='function')window.toast('Informe um período válido.');return;}from=a;to=b;await window.rdsCommissionPage();};
  root.querySelectorAll('[data-range]').forEach(b=>b.onclick=async()=>{const now=new Date();if(b.dataset.range==='today'){from=to=ymd(now);}else if(b.dataset.range==='month'){from=ymd(new Date(now.getFullYear(),now.getMonth(),1));to=ymd(now);}else{from='';to='';}await window.rdsCommissionPage();});
 }
 window.rdsCommissionPage=async function(){const root=document.getElementById('app');if(!root)return;root.innerHTML='<div class="card"><span class="eyebrow">FINANCEIRO</span><h1>Comissões e resultados</h1><p class="mut">Carregando dados financeiros autorizados…</p></div>';try{render(await load());}catch(e){root.innerHTML='<div class="page-title"><div><span class="eyebrow">FINANCEIRO</span><h1>Comissões e resultados</h1><p class="mut">'+esc(e.message)+'</p></div></div><div class="card"><p>Entre na sua conta para consultar as comissões. Se já estiver conectado, atualize a página e tente novamente.</p><button class="btn primary" onclick="go(\'account\')">Abrir Conta / Login</button></div>';}}
})();
