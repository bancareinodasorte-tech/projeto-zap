import fs from 'node:fs';

const serverPath='server.js';
let server=fs.readFileSync(serverPath,'utf8');
const marker='// RDS COMPANY SETTINGS V1';
if(!server.includes(marker)){
  const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=server.indexOf(catchAll);
  if(pos<0)throw new Error('catch-all não localizado para contexto da empresa.');

  const block=String.raw`// RDS COMPANY SETTINGS V1
async function rdsCompanyForSeller(sellerId){
  if(!sellerId)return null;
  return one('rds10_seller_companies','select=company_id,role,active&seller_id=eq.'+encodeURIComponent(sellerId)+'&active=eq.true');
}
async function rdsCompanyPublic(companyId){
  if(!companyId)return null;
  return one('rds10_companies','select=id,code,name,legal_name,slug,active,timezone,default_unit_price,created_at,updated_at&id=eq.'+encodeURIComponent(companyId));
}
async function rdsCompanyConnections(companyId){
  if(!companyId)return [];
  return list('rds10_company_connections','select=id,connection_type,provider,status,external_ref,metadata,created_at,updated_at&company_id=eq.'+encodeURIComponent(companyId)+'&order=connection_type.asc,provider.asc');
}
app.get('/api/rds/company/context',async(req,res)=>{
  try{
    const sellerToken=typeof rdsOpBearer==='function'?rdsOpBearer(req):'';
    const sellerCookie=typeof rdsOpCookie==='function'?rdsOpCookie(req):'';
    let seller=null;
    if((sellerToken||sellerCookie)&&typeof rdsOpSession==='function')seller=await rdsOpSession(req).catch(()=>null);
    if(seller){
      const link=await rdsCompanyForSeller(seller.seller.id);
      const company=await rdsCompanyPublic(link?.company_id);
      const connections=await rdsCompanyConnections(link?.company_id);
      const official=link?.company_id?await one('rds10_official_sales_auth','select=id,email,device_id,last_auth_at,last_error,updated_at&company_id=eq.'+encodeURIComponent(link.company_id)+'&order=updated_at.desc&limit=1'):null;
      return res.json({success:true,role:'VENDEDOR',company,companyRole:link?.role||'VENDEDOR',connections,official:official?{configured:true,authorized:Boolean(official.last_auth_at&&!official.last_error),email:official.email||null,deviceId:official.device_id||null,lastAuthAt:official.last_auth_at||null,lastError:official.last_error||null}:{configured:false,authorized:false}});
    }
    const adminToken=typeof rdsAdminBearer==='function'?rdsAdminBearer(req):'';
    const adminCookie=typeof rdsAdminCookie==='function'?rdsAdminCookie(req):'';
    let admin=null;
    if((adminToken||adminCookie)&&typeof rdsAdminSession==='function')admin=await rdsAdminSession(req).catch(()=>null);
    if(admin){
      const company=await one('rds10_companies','select=id,code,name,legal_name,slug,active,timezone,default_unit_price,created_at,updated_at&code=eq.RDS');
      const connections=await rdsCompanyConnections(company?.id);
      const official=company?.id?await one('rds10_official_sales_auth','select=id,email,device_id,last_auth_at,last_error,updated_at&company_id=eq.'+encodeURIComponent(company.id)+'&order=updated_at.desc&limit=1'):null;
      return res.json({success:true,role:'ADMINISTRADOR',company,companyRole:'ADMINISTRADOR',connections,official:official?{configured:true,authorized:Boolean(official.last_auth_at&&!official.last_error),email:official.email||null,deviceId:official.device_id||null,lastAuthAt:official.last_auth_at||null,lastError:official.last_error||null}:{configured:false,authorized:false}});
    }
    return res.status(401).json({success:false,error:'Sessão não autorizada.'});
  }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/rds/company/settings',async(req,res)=>{
  try{
    const adminToken=typeof rdsAdminBearer==='function'?rdsAdminBearer(req):'';
    const adminCookie=typeof rdsAdminCookie==='function'?rdsAdminCookie(req):'';
    const admin=(adminToken||adminCookie)&&typeof rdsAdminSession==='function'?await rdsAdminSession(req).catch(()=>null):null;
    if(!admin)return res.status(401).json({success:false,error:'Sessão administrativa necessária.'});
    const current=await one('rds10_companies','select=id,code,name,legal_name,slug,active,timezone,default_unit_price&code=eq.RDS');
    if(!current)throw new Error('Empresa padrão RDS não encontrada.');
    const b=req.body||{};
    const name=cleanText(b.name)||current.name;
    const legalName=cleanText(b.legalName)||null;
    const slug=cleanText(b.slug)||current.slug;
    const timezone=cleanText(b.timezone)||current.timezone||'America/Fortaleza';
    const price=Number(b.defaultUnitPrice);
    if(!Number.isFinite(price)||price<=0||price>9999)throw new Error('Preço padrão inválido.');
    const active=b.active!==false;
    const rows=await patch('rds10_companies','id=eq.'+encodeURIComponent(current.id),{name,legal_name:legalName,slug,timezone,default_unit_price:Number(price.toFixed(2)),active,updated_at:nowISO()});
    if(!rows?.[0])throw new Error('Não foi possível salvar a empresa.');
    return res.json({success:true,company:rows[0]});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
console.log('[RDS] contexto de empresa e conexões V1 instalado');
`;
  server=server.slice(0,pos)+block+'\n'+server.slice(pos);
  fs.writeFileSync(serverPath,server,'utf8');
}

const appPath='app.js';
let app=fs.readFileSync(appPath,'utf8');
if(!app.includes('RDS_COMPANY_SETTINGS_UI_V1')){
  const ui=String.raw`
/* RDS_COMPANY_SETTINGS_UI_V1 */
(()=>{
  const rdsCompanySettingsOriginal=settings;
  settings=async function(){
    await rdsCompanySettingsOriginal();
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),7000);
      const r=await fetch('/api/rds/company/context',{cache:'no-store',signal:controller.signal});
      clearTimeout(timer);
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Não foi possível carregar a empresa.');
      const c=d.company||{};
      const conns=Array.isArray(d.connections)?d.connections:[];
      const mp=conns.find(x=>x.connection_type==='PAGAMENTO'&&x.provider==='MERCADO_PAGO');
      const official=conns.find(x=>x.connection_type==='SISTEMA_OFICIAL'&&x.provider==='REINO_DA_SORTE');
      const wrap=document.createElement('div');
      wrap.className='card';
      const editable=d.role==='ADMINISTRADOR';
      wrap.innerHTML='<span class="eyebrow">Empresa / banca</span><h2>'+esc(c.name||'REINO DA SORTE')+'</h2>'+
        '<p class="mut">Identidade da empresa fica separada do usuário, do dispositivo e das conexões externas.</p>'+
        '<div class="rds-company-grid">'+
        '<div><small>Código</small><b>'+esc(c.code||'—')+'</b></div>'+
        '<div><small>Status</small><b>'+(c.active?'ATIVA':'INATIVA')+'</b></div>'+
        '<div><small>Mercado Pago</small><b>'+esc(mp?.status||'PENDENTE')+'</b></div>'+
        '<div><small>Sistema oficial</small><b>'+esc(official?.status||'PENDENTE')+'</b></div>'+
        '<div><small>Autorização oficial</small><b>'+((d.official?.authorized)?'AUTORIZADA':'NÃO AUTORIZADA')+'</b></div>'+
        '<div><small>Fuso horário</small><b>'+esc(c.timezone||'America/Fortaleza')+'</b></div>'+
        '</div>'+
        (editable?'<div class="rds-company-edit"><label>Nome da empresa</label><input id="rdsCompanyName" value="'+esc(c.name||'')+'">'+
        '<label>Razão social</label><input id="rdsCompanyLegal" value="'+esc(c.legal_name||'')+'">'+
        '<label>Slug</label><input id="rdsCompanySlug" value="'+esc(c.slug||'')+'">'+
        '<label>Fuso horário</label><input id="rdsCompanyTimezone" value="'+esc(c.timezone||'America/Fortaleza')+'">'+
        '<label>Preço padrão do bilhete</label><input id="rdsCompanyPrice" type="number" min="0.01" step="0.01" value="'+Number(c.default_unit_price||3)+'">'+
        '<label><input id="rdsCompanyActive" type="checkbox" style="width:auto" '+(c.active!==false?'checked':'')+'> Empresa ativa</label>'+
        '<div class="row"><button class="btn primary" id="rdsCompanySave">Salvar dados da empresa</button></div><p id="rdsCompanyMsg" class="mut"></p></div>':'<p class="mut">Somente o administrador pode alterar os dados da empresa.</p>');
      document.querySelector('#app')?.appendChild(wrap);
      const save=document.getElementById('rdsCompanySave');
      if(save)save.onclick=async()=>{
        const msg=document.getElementById('rdsCompanyMsg');save.disabled=true;msg.textContent='Salvando…';
        try{
          const rr=await fetch('/api/rds/company/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            name:document.getElementById('rdsCompanyName').value,
            legalName:document.getElementById('rdsCompanyLegal').value,
            slug:document.getElementById('rdsCompanySlug').value,
            timezone:document.getElementById('rdsCompanyTimezone').value,
            defaultUnitPrice:Number(document.getElementById('rdsCompanyPrice').value||3),
            active:document.getElementById('rdsCompanyActive').checked
          })});
          const out=await rr.json().catch(()=>({}));
          if(!rr.ok||!out.success)throw new Error(out.error||'Falha ao salvar empresa.');
          msg.textContent='Dados da empresa salvos.';
        }catch(e){msg.textContent=e.message;}finally{save.disabled=false;}
      };
      document.querySelectorAll('#app .btn.danger').forEach(b=>{
        if(String(b.textContent||'').includes('Desconectar'))b.remove();
      });
    }catch(e){
      const root=document.querySelector('#app');
      if(root&&!root.querySelector('.rds-company-fallback')){const p=document.createElement('p');p.className='mut rds-company-fallback';p.textContent='Dados da empresa temporariamente indisponíveis.';root.appendChild(p);}
    }
  };
  if(!document.getElementById('rdsCompanySettingsStyles')){
    const s=document.createElement('style');s.id='rdsCompanySettingsStyles';s.textContent='.rds-company-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.rds-company-grid>div{background:#f8fbff;border:1px solid rgba(30,70,120,.12);border-radius:12px;padding:11px}.rds-company-grid small{display:block;color:#71809a;font-weight:800;font-size:11px;margin-bottom:4px}.rds-company-grid b{display:block;color:#17355d;font-size:14px}.rds-company-edit{margin-top:14px}@media(max-width:560px){.rds-company-grid{grid-template-columns:1fr}}';document.head.appendChild(s);
  }
})();
`;
  app += '\n'+ui;
  fs.writeFileSync(appPath,app,'utf8');
}
console.log('[RDS] Ajustes multiempresa V1 pronto');
