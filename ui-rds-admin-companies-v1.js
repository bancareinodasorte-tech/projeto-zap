(()=>{
 const root=()=>document.getElementById('companyAdminRoot');
 const token=()=>localStorage.getItem('rds_admin_token')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
 const api=async(url,opts={})=>{const h={'Content-Type':'application/json',...(opts.headers||{})};if(token())h.Authorization='Bearer '+token();const r=await fetch(url,{cache:'no-store',...opts,headers:h});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.error||d.message||'Falha na operação.');return d;};
 let data={companies:[],sellers:[],memberships:[]},editingId='';
 const say=(s)=>{const e=document.getElementById('companyAdminMsg');if(e)e.textContent=s||'';};
 const sellerOptions=()=>'<option value="">Selecione um vendedor</option>'+data.sellers.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' — '+esc(s.phone||s.email||s.status||'')+'</option>').join('');
 function form(c={}){
  return '<div class="card"><h2>'+(c.id?'Editar empresa':'Cadastrar banca / empresa')+'</h2><div class="filters"><div class="field"><label>Código único</label><input id="coCode" maxlength="24" value="'+esc(c.code||'')+'" placeholder="BANCA01"></div><div class="field"><label>Nome da empresa</label><input id="coName" value="'+esc(c.name||'')+'" placeholder="Nome da banca"></div><div class="field"><label>Identificador (slug)</label><input id="coSlug" value="'+esc(c.slug||'')+'" placeholder="nome-da-banca"></div></div><div class="filters"><div class="field"><label>Razão social</label><input id="coLegal" value="'+esc(c.legal_name||'')+'"></div><div class="field"><label>Fuso horário</label><input id="coTimezone" value="'+esc(c.timezone||'America/Fortaleza')+'"></div><div class="field"><label>Preço padrão (R$)</label><input id="coPrice" type="number" min="0.01" step="0.01" value="'+Number(c.default_unit_price||3)+'"></div></div><div class="filters"><div class="field"><label>Comissão do vendedor (%)</label><input id="coSellerPct" type="number" min="0" max="100" step="0.01" value="'+Number(c.seller_commission_pct??30)+'"></div><div class="field"><label>Receita da banca (%)</label><input id="coCompanyPct" type="number" min="0" max="100" step="0.01" value="'+Number(c.company_revenue_pct??70)+'"></div><div class="field"><label><input id="coActive" type="checkbox" '+(c.code==='RDS'?'checked':'')+(c.code==='RDS'?'':' disabled')+'> Empresa ativa</label><p class="muted">Por segurança, somente a empresa RDS fica ativa até concluir e validar o isolamento operacional multiempresa.</p></div></div><div class="row"><button class="btn primary" id="coSave">Salvar empresa</button><button class="btn" id="coClear">Nova empresa / limpar</button></div><p id="companyAdminMsg" class="muted"></p></div>';
 }
 function card(c){
  const members=data.memberships.filter(m=>m.company_id===c.id);
  const list=members.map(m=>{const s=data.sellers.find(x=>x.id===m.seller_id)||{};return '<div class="row" style="justify-content:space-between;border-top:1px solid #edf1f7;padding:8px 0"><span><b>'+esc(s.name||'Vendedor removido')+'</b><br><small class="muted">'+esc(m.role)+' • '+(m.active?'Vínculo ativo':'Vínculo inativo')+'</small></span><button class="btn '+(m.active?'dangerOutline':'')+'" data-unlink="'+esc(m.seller_id)+'" data-company="'+esc(c.id)+'" data-active="'+(!m.active)+'">'+(m.active?'Desvincular':'Reativar vínculo')+'</button></div>';}).join('');
  return '<div class="card"><div class="row" style="justify-content:space-between"><div><span class="eyebrow">'+esc(c.code)+'</span><h2 style="margin:4px 0">'+esc(c.name)+'</h2><p class="muted">'+esc(c.slug)+' • '+(c.active?'ATIVA':'INATIVA')+'</p></div><button class="btn" data-edit-company="'+esc(c.id)+'">Editar</button></div><p>Preço padrão: <b>'+Number(c.default_unit_price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'</b> • Comissão vendedor: <b>'+Number(c.seller_commission_pct??30)+'%</b> • Banca: <b>'+Number(c.company_revenue_pct??70)+'%</b></p><h3>Vendedores vinculados</h3>'+(list||'<p class="muted">Nenhum vendedor vinculado.</p>')+'<div class="card" style="background:#f8fbff"><h3>Vincular vendedor</h3><label>Vendedor</label><select data-seller-for="'+esc(c.id)+'">'+sellerOptions()+'</select><label>Perfil nesta empresa</label><select data-role-for="'+esc(c.id)+'"><option value="VENDEDOR">Vendedor</option><option value="GERENTE">Gerente</option><option value="ADMINISTRADOR">Administrador</option></select><div class="row" style="margin-top:10px"><button class="btn primary" data-link-company="'+esc(c.id)+'">Salvar vínculo</button></div></div></div>';
 }
 async function load(){
  const el=root();if(!el)return;
  if(!token()){el.innerHTML='<div class="card"><h2>Bancas / empresas</h2><p class="muted">Entre como administrador para gerenciar empresas.</p></div>';return;}
  try{
   data=await api('/api/operator/admin/companies');
   el.innerHTML='<div class="page-title"><div><span class="eyebrow">ADMINISTRAÇÃO</span><h1>Bancas e empresas</h1><p class="muted">Cadastre empresas, configure divisão de comissão e vincule vendedores.</p></div><button class="btn" id="coRefresh">↻ Atualizar</button></div><div class="card"><b>Proteção de produção</b><p class="muted">Novas bancas podem ser preparadas e vinculadas, mas ficam inativas até validar a separação de pedidos, Mercado Pago, sorteios oficiais, clientes e WhatsApp por empresa. Isso evita vendas caírem na banca errada.</p></div>'+form()+'<div id="companyCards">'+data.companies.map(card).join('')+'</div>';
   el.querySelector('#coRefresh').onclick=load;
   el.querySelector('#coClear').onclick=()=>{editingId='';el.querySelector('#companyAdminForm')?.remove();load();};
   el.querySelector('#coSave').onclick=async()=>{
    try{
     const body={id:editingId||undefined,code:el.querySelector('#coCode').value.trim(),name:el.querySelector('#coName').value.trim(),slug:el.querySelector('#coSlug').value.trim(),legalName:el.querySelector('#coLegal').value.trim(),timezone:el.querySelector('#coTimezone').value.trim(),defaultUnitPrice:Number(el.querySelector('#coPrice').value),sellerCommissionPct:Number(el.querySelector('#coSellerPct').value),companyRevenuePct:Number(el.querySelector('#coCompanyPct').value),active:el.querySelector('#coActive').checked};
     const d=await api('/api/operator/admin/company/save',{method:'POST',body:JSON.stringify(body)});editingId='';await load();say('Empresa salva. As conexões de pagamento e sistema oficial de uma nova empresa ficam pendentes até configuração própria.');
    }catch(e){say(e.message);}
   };
   el.querySelectorAll('[data-edit-company]').forEach(b=>b.onclick=()=>{const c=data.companies.find(x=>x.id===b.dataset.editCompany);if(!c)return;editingId=c.id;const formBox=el.querySelector('.card');formBox.outerHTML=form(c);const replacement=el.querySelector('.card');wireForm(el);replacement.scrollIntoView({behavior:'smooth',block:'start'});});
   el.querySelectorAll('[data-link-company]').forEach(b=>b.onclick=async()=>{const id=b.dataset.linkCompany,sid=el.querySelector('[data-seller-for="'+id+'"]').value,role=el.querySelector('[data-role-for="'+id+'"]').value;if(!sid){alert('Selecione um vendedor.');return;}try{await api('/api/operator/admin/company/assign',{method:'POST',body:JSON.stringify({sellerId:sid,companyId:id,role,active:true})});await load();say('Vínculo salvo.');}catch(e){alert(e.message);}});
   el.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=async()=>{if(!confirm(b.dataset.active==='true'?'Reativar o vínculo deste vendedor?':'Desvincular este vendedor desta empresa?'))return;try{await api('/api/operator/admin/company/assign',{method:'POST',body:JSON.stringify({sellerId:b.dataset.unlink,companyId:b.dataset.company,role:(data.memberships.find(m=>m.seller_id===b.dataset.unlink&&m.company_id===b.dataset.company)||{}).role||'VENDEDOR',active:b.dataset.active==='true'})});await load();}catch(e){alert(e.message);}});
   wireForm(el);
  }catch(e){el.innerHTML='<div class="card"><h2>Bancas / empresas</h2><p class="badtxt">'+esc(e.message)+'</p><button class="btn" id="coRetry">Tentar novamente</button></div>';el.querySelector('#coRetry').onclick=load;}
 }
 function wireForm(el){
  const save=el.querySelector('#coSave');if(!save)return;
  save.onclick=async()=>{
   try{
    const body={id:editingId||undefined,code:el.querySelector('#coCode').value.trim(),name:el.querySelector('#coName').value.trim(),slug:el.querySelector('#coSlug').value.trim(),legalName:el.querySelector('#coLegal').value.trim(),timezone:el.querySelector('#coTimezone').value.trim(),defaultUnitPrice:Number(el.querySelector('#coPrice').value),sellerCommissionPct:Number(el.querySelector('#coSellerPct').value),companyRevenuePct:Number(el.querySelector('#coCompanyPct').value),active:el.querySelector('#coActive').checked};
    await api('/api/operator/admin/company/save',{method:'POST',body:JSON.stringify(body)});editingId='';await load();say('Empresa salva com sucesso.');
   }catch(e){say(e.message);}
  };
  const clear=el.querySelector('#coClear');if(clear)clear.onclick=()=>{editingId='';load();};
 }
 window.rdsAdminCompaniesLoad=load;
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>load(),{once:true});else setTimeout(load,0);
})();
