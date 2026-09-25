import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS TENANT SALES V1';
if(server.includes(marker)){
  console.log('[RDS] ponte de vendas multi-vendedor já aplicada');
  process.exit(0);
}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para ponte multi-vendedor.');

const block=String.raw`
${marker}
(()=>{
  const RDS_TENANT_KEY=String(process.env.RDS_OPERATOR_CREDENTIALS_KEY||'').trim();
  function tenantKey(){
    if(!RDS_TENANT_KEY)throw new Error('Chave de proteção dos dados dos vendedores não configurada.');
    const b=Buffer.from(RDS_TENANT_KEY,'base64');
    if(b.length!==32)throw new Error('Chave de proteção dos dados dos vendedores inválida.');
    return b;
  }
  function tenantDec(v){
    const p=String(v||'').split('.');
    if(p.length!==3)throw new Error('Credencial protegida inválida.');
    const c=crypto.createDecipheriv('aes-256-gcm',tenantKey(),Buffer.from(p[0],'base64'));
    c.setAuthTag(Buffer.from(p[1],'base64'));
    return Buffer.concat([c.update(Buffer.from(p[2],'base64')),c.final()]).toString('utf8');
  }
  function tenantToken(req){
    const h=String(req.headers.authorization||'');
    if(/^Bearer\\s+/i.test(h))return h.replace(/^Bearer\\s+/i,'').trim();
    const m=String(req.headers.cookie||'').match(/(?:^|;\\s*)rds_operator_session=([^;]+)/);
    return m?decodeURIComponent(m[1]):'';
  }
  async function tenantSession(req){
    const token=tenantToken(req);if(!token)return null;
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    const session=await one('rds10_seller_sessions','select=id,seller_id,expires_at&token_hash=eq.'+encodeURIComponent(hash)+'&revoked_at=is.null');
    if(!session||!session.expires_at||new Date(session.expires_at).getTime()<=Date.now())return null;
    const seller=await one('rds10_sellers','select=id,name,phone,email,status& id=eq.'+encodeURIComponent(session.seller_id));
    if(!seller||seller.status!=='ATIVO')return null;
    await patch('rds10_seller_sessions','id=eq.'+encodeURIComponent(session.id),{last_seen_at:nowISO()}).catch(()=>{});
    return {session,seller};
  }
  async function requireTenant(req,res){
    const s=await tenantSession(req);
    if(!s){res.status(401).json({success:false,error:'Sessão do vendedor inválida, expirada ou bloqueada.'});return null;}
    return s;
  }
  function publicFinancial(settings){
    return {
      configured:Boolean(settings?.mp_access_token_enc),
      environment:settings?.mp_environment||'production',
      pixConfigured:Boolean(settings?.pix_key),
      pixName:settings?.pix_name||null,
      operationalEmailConfigured:Boolean(settings?.official_email)
    };
  }
  async function tenantSettings(sellerId){
    return one('rds10_seller_settings','select=seller_id,mp_public_key,mp_access_token_enc,mp_refresh_token_enc,mp_environment,pix_key,pix_name,official_email,official_authorized,official_device_id&seller_id=eq.'+encodeURIComponent(sellerId));
  }
  function tenantOrderSelect(){return 'id,code,seller_id,contact_id,phone,customer_name,contact_phone,quantity,unit_price,total_amount,status,proof_type,proof_received_at,payment_confirmed_at,completed_at,last_inbound_text,created_at,updated_at,campaign_code,pagbank_order_id,pagbank_charge_id,pagbank_status,pix_copy_paste,pix_qr_code_url,pix_expires_at,payment_method,payment_created_at,payment_updated_at,payment_last_error';}

  app.get('/api/operator/context',async(req,res)=>{
    try{
      const s=await requireTenant(req,res);if(!s)return;
      const settings=await tenantSettings(s.seller.id);
      return res.json({success:true,seller:{id:s.seller.id,name:s.seller.name,phone:s.seller.phone,email:s.seller.email||null},financial:publicFinancial(settings),official:{authorized:Boolean(settings?.official_authorized),deviceId:settings?.official_device_id||null}});
    }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
  });

  app.get('/api/operator/orders',async(req,res)=>{
    try{
      const s=await requireTenant(req,res);if(!s)return;
      const rows=await list('rds10_orders','select='+tenantOrderSelect()+'&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&order=updated_at.desc&limit=200');
      return res.json({success:true,orders:rows});
    }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
  });

  app.post('/api/operator/orders',async(req,res)=>{
    try{
      const s=await requireTenant(req,res);if(!s)return;
      const name=cleanText(req.body?.customerName||req.body?.name);
      const phone=normalizeBR(req.body?.customerPhone||req.body?.phone);
      const quantity=Math.max(1,Math.min(9999,Math.floor(Number(req.body?.quantity||0))));
      const paymentMethod=cleanText(req.body?.paymentMethod||'PIX').toUpperCase();
      if(name.length<3)throw new Error('Nome do cliente inválido.');
      if(!validBRPhone(phone))throw new Error('Telefone do cliente inválido.');
      if(!quantity)throw new Error('Quantidade inválida.');
      const settings=await tenantSettings(s.seller.id);
      const unit=Number(req.body?.unitPrice||settings?.unit_price||3);
      if(!Number.isFinite(unit)||unit<=0)throw new Error('Preço do bilhete inválido.');
      const total=Number((quantity*unit).toFixed(2));
      const code='RDS-'+crypto.randomBytes(4).toString('hex').toUpperCase();
      const contact=await one('rds10_contacts','select=id&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&phone=eq.'+encodeURIComponent(phone));
      let contactId=contact?.id||null;
      if(!contactId){
        const cr=await insert('rds10_contacts',{seller_id:s.seller.id,name,phone,group_name:'CLIENTES',status:'ATIVO',origin:'VENDA_WEB',validated:true,created_at:nowISO(),updated_at:nowISO()});
        contactId=cr?.[0]?.id||null;
      }else await patch('rds10_contacts','id=eq.'+encodeURIComponent(contactId),{name,validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
      const rows=await insert('rds10_orders',{code,seller_id:s.seller.id,contact_id:contactId,phone,customer_name:name,contact_phone:phone,quantity,unit_price:unit,total_amount:total,status:paymentMethod==='DINHEIRO'?'AGUARDANDO_CONFERENCIA':'AGUARDANDO_PAGAMENTO',payment_method:paymentMethod,created_at:nowISO(),updated_at:nowISO()});
      return res.status(201).json({success:true,order:rows?.[0]||null});
    }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
  });

  app.post('/api/operator/orders/:id/payment-confirmed',async(req,res)=>{try{const s=await requireTenant(req,res);if(!s)return;const id=cleanText(req.params.id);const row=await one('rds10_orders','select=id,status,seller_id& id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id));if(!row)throw new Error('Pedido não encontrado para este vendedor.');if(row.status==='CONCLUIDO'||row.status==='CANCELADO')throw new Error('Pedido encerrado.');const rows=await patch('rds10_orders','id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),{status:'PAGO_AGUARDANDO_BILHETES',payment_confirmed_at:nowISO(),payment_updated_at:nowISO(),updated_at:nowISO()});return res.json({success:true,order:rows?.[0]||null});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
  app.post('/api/operator/orders/:id/proof-rejected',async(req,res)=>{try{const s=await requireTenant(req,res);if(!s)return;const id=cleanText(req.params.id);const row=await one('rds10_orders','select=id,status,seller_id& id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id));if(!row)throw new Error('Pedido não encontrado para este vendedor.');const rows=await patch('rds10_orders','id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),{status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});return res.json({success:true,order:rows?.[0]||null});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
  app.post('/api/operator/orders/:id/tickets-sent',async(req,res)=>{try{const s=await requireTenant(req,res);if(!s)return;const id=cleanText(req.params.id);const row=await one('rds10_orders','select=id,status,seller_id& id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id));if(!row)throw new Error('Pedido não encontrado para este vendedor.');const rows=await patch('rds10_orders','id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),{status:'CONCLUIDO',completed_at:nowISO(),updated_at:nowISO()});return res.json({success:true,order:rows?.[0]||null});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
  app.post('/api/operator/orders/:id/cancel',async(req,res)=>{try{const s=await requireTenant(req,res);if(!s)return;const id=cleanText(req.params.id);const row=await one('rds10_orders','select=id,status,seller_id& id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id));if(!row)throw new Error('Pedido não encontrado para este vendedor.');const rows=await patch('rds10_orders','id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),{status:'CANCELADO',updated_at:nowISO()});return res.json({success:true,order:rows?.[0]||null});}catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}});
  app.get('/api/operator/orders/:id',async(req,res)=>{
    try{
      const s=await requireTenant(req,res);if(!s)return;
      const id=cleanText(req.params.id);
      const row=await one('rds10_orders','select='+tenantOrderSelect()+'&id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id));
      if(!row)return res.status(404).json({success:false,error:'Pedido não encontrado para este vendedor.'});
      return res.json({success:true,order:row});
    }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
  });

  app.get('/api/operator/financial-status',async(req,res)=>{
    try{
      const s=await requireTenant(req,res);if(!s)return;
      const settings=await tenantSettings(s.seller.id);
      let mpUser=null;
      if(settings?.mp_access_token_enc){
        try{
          const token=tenantDec(settings.mp_access_token_enc);
          const r=await fetch('https://api.mercadopago.com/users/me',{headers:{Accept:'application/json',Authorization:'Bearer '+token}});
          if(r.ok){const d=await r.json();mpUser={id:d?.id||null,nickname:d?.nickname||null};}
        }catch{}
      }
      return res.json({success:true,financial:publicFinancial(settings),mercadoPago:mpUser?{connected:true,userId:mpUser.id,nickname:mpUser.nickname}:{connected:false,userId:null,nickname:null}});
    }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
  });

  console.log('[RDS] ponte de vendas multi-vendedor V1 instalada');
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] ponte de vendas multi-vendedor V1 instalada');
