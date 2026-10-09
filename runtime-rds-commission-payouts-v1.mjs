import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS COMMISSION PAYOUT LEDGER V1';
if(server.includes(marker)){console.log('[RDS] livro de repasses V1 já aplicado');}
else{
 const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
 const pos=server.indexOf(catchAll);
 if(pos<0)throw new Error('catch-all não localizado para livro de repasses.');
 const block=String.raw`// RDS COMMISSION PAYOUT LEDGER V1
app.get('/api/rds/commission-payouts',async(req,res)=>{
 try{
  if(typeof rdsUnifiedContext!=='function')return res.status(503).json({success:false,error:'Acesso administrativo indisponível.'});
  const auth=await rdsUnifiedContext(req);
  if(!auth?.authenticated)return res.status(401).json({success:false,error:'Entre na conta administrativa para continuar.'});
  if(auth.role!=='ADMINISTRADOR')return res.status(403).json({success:false,error:'Somente administradores podem consultar ou registrar repasses.'}););
  const from=String(req.query.from||'').trim(),to=String(req.query.to||'').trim(),sellerId=String(req.query.sellerId||'').trim();
  if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to)))return res.status(400).json({success:false,error:'Período inválido.'});
  let q='select=id,company_id,seller_id,period_month,amount,paid_at,payment_method,reference,receipt_url,notes,created_by,created_at&order=period_month.desc,paid_at.desc&limit=500';
  if(from)q+='&period_month=gte.'+encodeURIComponent(from);
  if(to)q+='&period_month=lte.'+encodeURIComponent(to);
  if(sellerId)q+='&seller_id=eq.'+encodeURIComponent(sellerId);
  const [payouts,sellers]=await Promise.all([list('rds10_commission_payouts',q),list('rds10_sellers','select=id,name,company_id&order=name.asc')]);
  const sm=new Map(sellers.map(s=>[s.id,s]));
  return res.json({success:true,payouts:payouts.map(p=>({...p,seller_name:sm.get(p.seller_id)?.name||'Vendedor',company_id:p.company_id})) ,sellers});
 }catch(e){console.error('[RDS COMMISSION PAYOUTS]',e?.message||e);return res.status(503).json({success:false,error:String(e?.message||'Livro de repasses indisponível. Aplicar a migração SQL do livro financeiro.')});}
});
app.post('/api/rds/commission-payouts',async(req,res)=>{
 try{
  if(typeof rdsUnifiedContext!=='function')return res.status(503).json({success:false,error:'Acesso administrativo indisponível.'});
  const auth=await rdsUnifiedContext(req);
  if(!auth?.authenticated)return res.status(401).json({success:false,error:'Entre na conta administrativa para continuar.'});
  if(auth.role!=='ADMINISTRADOR')return res.status(403).json({success:false,error:'Somente administradores podem consultar ou registrar repasses.'});
  const b=req.body||{},sellerId=String(b.seller_id||''),companyId=String(b.company_id||''),month=String(b.period_month||'');
  const amount=Number(b.amount),method=String(b.payment_method||''),reference=String(b.reference||'').trim().slice(0,180),receipt=String(b.receipt_url||'').trim().slice(0,1000),notes=String(b.notes||'').trim().slice(0,2000);
  if(!/^[0-9a-f-]{36}$/i.test(sellerId)||!/^[0-9a-f-]{36}$/i.test(companyId))return res.status(400).json({success:false,error:'Selecione um vendedor e uma empresa válidos.'});
  if(!/^\d{4}-\d{2}-01$/.test(month))return res.status(400).json({success:false,error:'Selecione o primeiro dia do mês de apuração.'});
  if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)!==amount*100)return res.status(400).json({success:false,error:'Informe um valor positivo com até duas casas decimais.'});
  if(!['PIX','DINHEIRO','TRANSFERENCIA','OUTRO'].includes(method))return res.status(400).json({success:false,error:'Forma de pagamento inválida.'});
  if(receipt&&!/^https:\/\//i.test(receipt))return res.status(400).json({success:false,error:'O comprovante deve ser um link HTTPS válido.'});
  const seller=await one('rds10_sellers','select=id,company_id,name,status&id=eq.'+encodeURIComponent(sellerId));
  if(!seller||seller.company_id!==companyId||seller.status!=='ATIVO')return res.status(400).json({success:false,error:'O vendedor não está ativo ou não pertence à empresa selecionada.'});
  const idempotencyKey=crypto.randomUUID();
  const result=await sb('/rest/v1/rpc/rds10_register_commission_payout',{method:'POST',body:JSON.stringify({p_company_id:companyId,p_seller_id:sellerId,p_period_month:month,p_amount:amount,p_payment_method:method,p_reference:reference||null,p_receipt_url:receipt||null,p_notes:notes||null,p_idempotency_key:idempotencyKey,p_created_by:auth.admin.id})});
  return res.status(201).json({success:true,result});
 }catch(e){console.error('[RDS COMMISSION PAYOUT CREATE]',e?.message||e);return res.status(400).json({success:false,error:String(e?.message||'Não foi possível registrar o repasse.')});}
});
`;
 server=server.slice(0,pos)+block+'\n'+server.slice(pos);
 fs.writeFileSync(path,server,'utf8');
 console.log('[RDS] livro de repasses V1 instalado');
}
