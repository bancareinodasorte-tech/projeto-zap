import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS ADMIN COMPANY MANAGEMENT V1';
if(server.includes(marker)){console.log('[RDS] gestão de empresas já aplicada');}
else{
 const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
 const pos=server.indexOf(catchAll);
 if(pos<0)throw new Error('catch-all não localizado para gestão de empresas.');
 const block=String.raw`// RDS ADMIN COMPANY MANAGEMENT V1
app.get('/api/operator/admin/companies',async(req,res)=>{
 try{
  const admin=await rdsAdminRequire(req,res);if(!admin)return;
  const [companies,sellers,memberships]=await Promise.all([
   list('rds10_companies','select=id,code,name,legal_name,slug,active,timezone,default_unit_price,seller_commission_pct,company_revenue_pct,created_at,updated_at&order=created_at.asc'),
   list('rds10_sellers','select=id,name,email,phone,status,role&order=name.asc'),
   list('rds10_seller_companies','select=seller_id,company_id,role,active,created_at,updated_at')
  ]);
  return res.json({success:true,companies,sellers,memberships});
 }catch(e){return res.status(500).json({success:false,error:'Não foi possível carregar as empresas.'});}
});
app.post('/api/operator/admin/company/save',async(req,res)=>{
 try{
  const admin=await rdsAdminRequire(req,res);if(!admin)return;
  const b=req.body||{},id=cleanText(b.id),code=cleanText(b.code).toUpperCase(),name=cleanText(b.name),slug=cleanText(b.slug).toLowerCase();
  const price=Number(b.defaultUnitPrice),sellerPct=Number(b.sellerCommissionPct),companyPct=Number(b.companyRevenuePct);
  if(!/^[A-Z0-9_-]{2,24}$/.test(code))throw new Error('Código inválido. Use 2 a 24 caracteres: letras, números, hífen ou sublinhado.');
  if(name.length<3)throw new Error('Informe o nome da empresa.');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Identificador inválido. Use letras minúsculas e hífens.');
  if(!Number.isFinite(price)||price<=0||price>9999)throw new Error('Preço padrão inválido.');
  if(!Number.isFinite(sellerPct)||!Number.isFinite(companyPct)||sellerPct<0||companyPct<0||Math.abs(sellerPct+companyPct-100)>0.001)throw new Error('As comissões precisam somar exatamente 100%.');
  const row={code,name,legal_name:cleanText(b.legalName)||null,slug,active:b.active!==false,timezone:cleanText(b.timezone)||'America/Fortaleza',default_unit_price:Number(price.toFixed(2)),seller_commission_pct:Number(sellerPct.toFixed(2)),company_revenue_pct:Number(companyPct.toFixed(2)),updated_at:nowISO()};
  let saved;
  if(id){
   const current=await one('rds10_companies','select=id&id=eq.'+encodeURIComponent(id)).catch(()=>null);
   if(!current)throw new Error('Empresa não encontrada.');
   saved=(await patch('rds10_companies','id=eq.'+encodeURIComponent(id),row))[0];
  }else{
   saved=(await insert('rds10_companies',{...row,created_at:nowISO()}))[0];
   if(saved?.id){
    await insert('rds10_company_connections',{company_id:saved.id,connection_type:'PAGAMENTO',provider:'MERCADO_PAGO',status:'PENDENTE',metadata:{environment:'production'},created_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
    await insert('rds10_company_connections',{company_id:saved.id,connection_type:'SISTEMA_OFICIAL',provider:'REINO_DA_SORTE',status:'PENDENTE',metadata:{role:'emissor_oficial'},created_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
   }
  }
  if(!saved)throw new Error('Não foi possível salvar a empresa.');
  return res.json({success:true,company:saved});
 }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/admin/company/assign',async(req,res)=>{
 try{
  const admin=await rdsAdminRequire(req,res);if(!admin)return;
  const sellerId=cleanText(req.body?.sellerId),companyId=cleanText(req.body?.companyId),role=String(req.body?.role||'VENDEDOR').toUpperCase(),active=req.body?.active!==false;
  if(!sellerId||!companyId)throw new Error('Selecione vendedor e empresa.');
  if(!['VENDEDOR','GERENTE','ADMINISTRADOR'].includes(role))throw new Error('Perfil de empresa inválido.');
  const [seller,company]=await Promise.all([
   one('rds10_sellers','select=id,name,status&id=eq.'+encodeURIComponent(sellerId)),
   one('rds10_companies','select=id,name,active&id=eq.'+encodeURIComponent(companyId))
  ]);
  if(!seller||!company)throw new Error('Vendedor ou empresa não encontrado.');
  const existing=await one('rds10_seller_companies','select=seller_id,company_id&seller_id=eq.'+encodeURIComponent(sellerId)+'&company_id=eq.'+encodeURIComponent(companyId));
  let saved;
  if(existing){
   const rows=await patch('rds10_seller_companies','seller_id=eq.'+encodeURIComponent(sellerId)+'&company_id=eq.'+encodeURIComponent(companyId),{role,active,updated_at:nowISO()});
   saved=rows?.[0]||null;
  }else{
   const rows=await insert('rds10_seller_companies',{seller_id:sellerId,company_id:companyId,role,active,created_at:nowISO(),updated_at:nowISO()});
   saved=rows?.[0]||null;
  }
  return res.json({success:true,membership:saved});
 }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
`;
 server=server.slice(0,pos)+block+'\n'+server.slice(pos);
 fs.writeFileSync(path,server,'utf8');
 console.log('[RDS] gestão de empresas instalada');
}
