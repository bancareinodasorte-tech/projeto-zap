import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS COMMISSION CENTER V1';
if(server.includes(marker)){console.log('[RDS] central de comissões V1 já aplicada');}
else{
 const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
 const pos=server.indexOf(catchAll);
 if(pos<0)throw new Error('catch-all não localizado para central de comissões.');
 const block=String.raw`// RDS COMMISSION CENTER V1
app.get('/api/rds/commission-center',async(req,res)=>{
 try{
  if(typeof rdsUnifiedContext!=='function')return res.status(503).json({success:false,error:'Acesso unificado indisponível.'});
  const ctx=await rdsUnifiedContext(req);
  if(!ctx?.authenticated)return res.status(401).json({success:false,error:'Entre na sua conta para consultar as comissões.'});
  if(!['VENDEDOR','ADMINISTRADOR'].includes(ctx.role))return res.status(403).json({success:false,error:'Perfil sem permissão para consultar comissões.'});
  const from=String(req.query.from||'').trim(),to=String(req.query.to||'').trim();
  const validDate=s=>!s||/^\\d{4}-\\d{2}-\\d{2}$/.test(s);
  if(!validDate(from)||!validDate(to))return res.status(400).json({success:false,error:'Período inválido.'});
  if(from&&to&&from>to)return res.status(400).json({success:false,error:'A data inicial deve ser anterior à data final.'});
  let query='select=id,code,seller_id,company_id,official_draw_id,official_draw_title,quantity,total_amount,status,completed_at,created_at,commission_rate_pct,commission_seller_amount,commission_company_amount&status=eq.CONCLUIDO&order=completed_at.desc&limit=5000';
  if(from)query+='&completed_at=gte.'+encodeURIComponent(from+'T00:00:00-03:00');
  if(to)query+='&completed_at=lte.'+encodeURIComponent(to+'T23:59:59.999-03:00');
  if(ctx.role==='VENDEDOR'){
   const sid=ctx.seller?.id;
   if(!sid)return res.status(403).json({success:false,error:'A conta de vendedor não foi identificada.'});
   query+='&seller_id=eq.'+encodeURIComponent(sid);
  }
  const [orders,sellers]=await Promise.all([list('rds10_orders',query),ctx.role==='ADMINISTRADOR'?list('rds10_sellers','select=id,name'):Promise.resolve([])]);
  const sellerMap=new Map(sellers.map(s=>[s.id,s.name]));
  const round=n=>Number((Number(n)||0).toFixed(2));
  const rows=orders.map(o=>{
   const total=Number(o.total_amount||0),rate=Number(o.commission_rate_pct==null?30:o.commission_rate_pct);
   const sellerAmount=o.commission_seller_amount==null?round(total*rate/100):Number(o.commission_seller_amount);
   const companyAmount=o.commission_company_amount==null?round(total-sellerAmount):Number(o.commission_company_amount);
   return {id:o.id,code:o.code||'—',seller_id:o.seller_id||null,seller_name:ctx.role==='VENDEDOR'?(ctx.seller?.name||'Minha conta'):(sellerMap.get(o.seller_id)||'—'),draw_id:o.official_draw_id||null,draw_title:o.official_draw_title||'Sem sorteio vinculado',quantity:Number(o.quantity||0),total:round(total),commission_rate_pct:rate,seller_commission:round(sellerAmount),company_revenue:round(companyAmount),completed_at:o.completed_at||o.created_at||null};
  });
  const sum=key=>round(rows.reduce((a,o)=>a+Number(o[key]||0),0));
  const bySellerMap=new Map(),byDrawMap=new Map();
  for(const o of rows){
   const sk=o.seller_id||'SEM_VENDEDOR';
   const s=bySellerMap.get(sk)||{seller_id:o.seller_id,seller_name:o.seller_name,sales:0,revenue:0,seller_commission:0,company_revenue:0,tickets:0};
   s.sales++;s.revenue+=o.total;s.seller_commission+=o.seller_commission;s.company_revenue+=o.company_revenue;s.tickets+=o.quantity;bySellerMap.set(sk,s);
   const dk=o.draw_id||o.draw_title;
   const d=byDrawMap.get(dk)||{draw_id:o.draw_id,draw_title:o.draw_title,sales:0,revenue:0,seller_commission:0,company_revenue:0,tickets:0};
   d.sales++;d.revenue+=o.total;d.seller_commission+=o.seller_commission;d.company_revenue+=o.company_revenue;d.tickets+=o.quantity;byDrawMap.set(dk,d);
  }
  const finish=map=>[...map.values()].map(o=>({...o,revenue:round(o.revenue),seller_commission:round(o.seller_commission),company_revenue:round(o.company_revenue)}));
  return res.json({success:true,role:ctx.role,period:{from:from||null,to:to||null},totals:{sales:rows.length,revenue:sum('total'),seller_commission:sum('seller_commission'),company_revenue:sum('company_revenue'),tickets:rows.reduce((a,o)=>a+o.quantity,0)},bySeller:finish(bySellerMap),byDraw:finish(byDrawMap),rows});
 }catch(e){console.error('[RDS COMMISSION CENTER]',e?.message||e);return res.status(500).json({success:false,error:'Não foi possível carregar o resumo de comissões.'});}
});
`;
 server=server.slice(0,pos)+block+'\n'+server.slice(pos);
 fs.writeFileSync(path,server,'utf8');
 console.log('[RDS] central de comissões V1 instalada');
}
