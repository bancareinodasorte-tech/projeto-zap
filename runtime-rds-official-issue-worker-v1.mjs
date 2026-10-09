import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OFFICIAL ISSUE WORKER V1';
if(server.includes(marker)){console.log('[RDS] worker de emissão oficial já aplicado');}
else{
 const listen="app.listen(PORT,async()=>{";
 const pos=server.indexOf(listen);
 if(pos<0)throw new Error('app.listen não localizado para worker de emissão oficial.');
 const block=String.raw`// RDS OFFICIAL ISSUE WORKER V1
(()=>{
 let running=false;
 const arr=raw=>Array.isArray(raw)?raw:(Array.isArray(raw?.draws)?raw.draws:Array.isArray(raw?.items)?raw.items:Array.isArray(raw?.data)?raw.data:Array.isArray(raw?.data?.draws)?raw.data.draws:Array.isArray(raw?.result?.draws)?raw.result.draws:[]);
 const drawIdOf=d=>String(d?.drawId??d?.external_draw_id??d?.draw_id??d?.id??d?.sorteioId??'').trim();
 const round=n=>Number((Number(n)||0).toFixed(2));
 function firstValue(root,keys){
  for(const key of keys){let value=root;for(const part of key.split('.'))value=value?.[part];if(value!==undefined&&value!==null&&String(value).trim()!=='')return value;}
  return null;
 }
 function saleInfo(sale){
  const saleId=firstValue(sale,['saleId','id','sale.id','data.saleId','data.id']);
  const pdfUrl=firstValue(sale,['pdfUrl','ticketUrl','downloadUrl','fileUrl','publicUrl','url','pdf.url','ticket.url','data.pdfUrl','data.ticketUrl','data.publicUrl','data.url','data.downloadUrl']);
  return {saleId:saleId?String(saleId):null,pdfUrl:pdfUrl?String(pdfUrl):null,payload:sale||{}};
 }
 async function selectedOfficialDraw(id){
  const [availableResult,allResult]=await Promise.allSettled([
   rdsFinalRequest('/draws/seller/available'),
   rdsFinalRequest('/draws/seller/all')
  ]);
  const byId=new Map();
  for(const d of [...(availableResult.status==='fulfilled'?arr(availableResult.value):[]),...(allResult.status==='fulfilled'?arr(allResult.value):[])]){
   const did=drawIdOf(d);if(!did)continue;
   byId.set(did,{...(byId.get(did)||{}),...d});
  }
  try{
   const inventory=arr(await rdsFinalRequest('/seller/booklet-sales/available'));
   for(const item of inventory){
    const did=drawIdOf(item)||drawIdOf(item?.draw)||String(item?.draw?.drawId||'').trim();
    if(!did)continue;
    const prior=byId.get(did)||{drawId:did};
    const stock=item?.availableBooklets??item?.bookletsAvailable??item?.availableTickets??item?.remainingBooklets??item?.remainingTickets??item?.available??item?.count;
    byId.set(did,{...prior,...item,drawId:did,...(stock!==undefined&&stock!==null?{availableBooklets:stock}:{})});
   }
  }catch{}
  let found=byId.get(String(id));
  if(found)return found;
  try{
   const company=await one('rds10_companies','select=id&code=eq.RDS');
   if(company?.id){
    const rows=await list('rds10_official_draws','select=external_draw_id,title,status,active,draw_at,price_per_ticket,available_booklets,raw_data&company_id=eq.'+encodeURIComponent(company.id)+'&external_draw_id=eq.'+encodeURIComponent(String(id)));
    const d=rows?.[0];if(d){const raw=d.raw_data&&typeof d.raw_data==='object'?d.raw_data:{};found={...raw,...d,drawId:String(d.external_draw_id),availableBooklets:d.available_booklets??raw.availableBooklets??raw.bookletsAvailable};}
   }
  }catch{}
  return found||null;
 }
 async function alreadySent(order,info){
  try{
   const docs=await list('rds10_ticket_documents','select=id,sent_at&order_id=eq.'+encodeURIComponent(order.id));
   return docs.some(d=>Boolean(d.sent_at));
  }catch{return false;}
 }
 async function sendProof(order,info){
  const phone=normalizeBR(order.phone||order.contact_phone||'');if(!phone)throw new Error('Telefone do cliente não informado.');
  const target=await ensureTargetJid(phone);if(!target?.jid)throw new Error('WhatsApp do cliente não retornou um JID válido.');
  // O wrapper Chromium substitui este documento pela arte oficial renderizada a partir do pedido.
  const result=await sendToJid(target.jid,{document:{url:info.pdfUrl||'https://invalid.local/rds-ticket.pdf'},mimetype:'application/pdf',fileName:'bilhetes-'+order.code+'.pdf'});
  if(!result?.key?.id)throw new Error('WhatsApp não confirmou o envio do PDF.');
  const archived=await patch('rds10_ticket_documents','order_id=eq.'+encodeURIComponent(order.id),{sent_at:nowISO(),updated_at:nowISO()});
  if(!archived?.length){const error=new Error('O WhatsApp aceitou o PDF, mas o arquivo não pôde ser confirmado no histórico. Não reenviar automaticamente.');error.code='ARCHIVE_FAILED_AFTER_SEND';throw error;}
  await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+order.code+' — Venda oficial: '+String(info.saleId||order.official_sale_id||''),status:'ENVIADA',waId:result.key.id,raw:{automatic:true,order:order.code,saleId:info.saleId||order.official_sale_id||null}});
  return result;
 }
 async function deliverExisting(order){
  const info=saleInfo(order.official_ticket_payload||{saleId:order.official_sale_id,pdfUrl:order.official_ticket_url});
  info.saleId=info.saleId||String(order.official_sale_id||'');
  if(!info.saleId)throw new Error('O pedido está marcado como emitido, mas não possui ID oficial.');
  if(await alreadySent(order,info)){
   await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_sale_id=eq.'+encodeURIComponent(info.saleId),{status:'CONCLUIDO',completed_at:order.completed_at||nowISO(),official_issue_status:'CONCLUIDO',official_issue_error:null,updated_at:nowISO()});
   return;
  }
  const issue=String(order.official_issue_status||''),age=(Date.now()-new Date(order.updated_at||0).getTime())/1000;
  if(issue==='ERRO_RECONCILIAR')return;
  if((issue==='EMITINDO'&&Number.isFinite(age)&&age<60)||(issue==='EMITIDO_AGUARDANDO_ENVIO'&&Number.isFinite(age)&&age<15)||(issue==='ERRO'&&Number.isFinite(age)&&age<15))return;
  const filter='id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_sale_id=eq.'+encodeURIComponent(info.saleId)+(issue?'&official_issue_status=eq.'+encodeURIComponent(issue):'&official_issue_status=is.null');
  const claimed=await patch('rds10_orders',filter,{official_issue_status:'EMITINDO',official_issue_error:null,updated_at:nowISO()});
  if(!claimed?.length)return;
  try{
   await sendProof(order,info);
   const saved=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_sale_id=eq.'+encodeURIComponent(info.saleId),{status:'CONCLUIDO',completed_at:nowISO(),official_issue_status:'CONCLUIDO',official_issue_error:null,updated_at:nowISO()});
   if(saved?.length){
    await logEvent('BILHETES_ENVIADOS_AUTOMATICAMENTE',{order:order.code,order_id:order.id,sale_id:info.saleId,phone:order.phone});
    console.log('[RDS AUTO] PDF oficial enviado e pedido concluído '+String(order.code||order.id));
   }
  }catch(e){
   const err=String(e?.message||e),ambiguous=e?.code==='ARCHIVE_FAILED_AFTER_SEND';
   await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_sale_id=eq.'+encodeURIComponent(info.saleId),{status:'PAGO_AGUARDANDO_BILHETES',official_issue_status:ambiguous?'ERRO_RECONCILIAR':'EMITIDO_AGUARDANDO_ENVIO',official_issue_error:err,updated_at:nowISO()});
   if(ambiguous)await addAlert('PDF_ARQUIVO_FALHA_APOS_ENVIO','PDF enviado mas arquivo não confirmado — '+order.code,{order:order.code,saleId:info.saleId,error:err,warning:'Não reenviar automaticamente; conferir histórico.'});
   else if(issue!=='EMITIDO_AGUARDANDO_ENVIO')await addAlert('BILHETES_EMITIDOS_ENVIO_PENDENTE','Bilhetes emitidos mas não enviados — '+order.code,{order:order.code,saleId:info.saleId,error:err});
   console.error('[RDS AUTO] envio pendente '+String(order.code||order.id)+': '+err);
  }
 }
 async function issueOne(order){
  if(!order?.id||String(order.status||'')!=='PAGO_AGUARDANDO_BILHETES')return;
  let issue=String(order.official_issue_status||'');
  if((issue==='ERRO_RECONCILIAR'||issue==='CONCLUIDO')&&!order.official_sale_id)return;
  let age=(Date.now()-new Date(order.updated_at||0).getTime())/1000;
  if(issue==='EMITINDO'){
   if(Number.isFinite(age)&&age<60)return;
   const reset=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:null,official_issue_error:null,updated_at:nowISO()});
   if(!reset?.length)return;
   issue='';order.official_issue_status=null;order.updated_at=nowISO();age=0;
  }
  if(order.official_sale_id)return deliverExisting({...order,official_issue_status:issue||null});
  if(issue==='AGUARDANDO_AUTORIZACAO'&&Number.isFinite(age)&&age<15)return;
  if(issue==='AGUARDANDO_AUTORIZACAO'){
   try{
    await rdsFinalRequest('/auth/me');
    const reset=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.AGUARDANDO_AUTORIZACAO',{official_issue_status:null,official_issue_error:null,updated_at:nowISO()});
    if(!reset?.length)return;
    issue='';order.official_issue_status=null;order.updated_at=nowISO();
   }catch{return;}
  }
  if(issue==='ERRO_RECONCILIAR')return;
  if(issue==='ERRO'&&Number.isFinite(age)&&age<30)return;
  if((issue==='AGUARDANDO_ESTOQUE'||issue==='AGUARDANDO_CAMPANHA')&&Number.isFinite(age)&&age<15)return;
  const claimFilter='id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES'+(issue?'&official_issue_status=eq.'+encodeURIComponent(issue):'&official_issue_status=is.null');
  const claim=await patch('rds10_orders',claimFilter,{official_issue_status:'EMITINDO',official_issue_error:null,updated_at:nowISO()});
  if(!claim?.length)return;
  const requestedDrawId=String(order.official_draw_id||'').trim();
  if(!requestedDrawId){
   await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:'AGUARDANDO_CAMPANHA',official_issue_error:'O pedido não possui sorteio oficial vinculado; emissão automática bloqueada para evitar venda no sorteio errado.',updated_at:nowISO()});
   return;
  }
  let sellerId=null;try{if(typeof rdsWhatsappSellerId==='function')sellerId=await rdsWhatsappSellerId();}catch{}
  if(sellerId&&String(order.seller_id||'')!==String(sellerId)){
   await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:issue||null,updated_at:nowISO()});
   return;
  }
  let saleRequestStarted=false;
  try{
   await rdsFinalRequest('/auth/me');
   const draw=await selectedOfficialDraw(requestedDrawId);
   if(!draw){
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:'AGUARDANDO_CAMPANHA',official_issue_error:'O sorteio oficial vinculado ao pedido não foi encontrado.',updated_at:nowISO()});
    return;
   }
   const status=String(draw.status||'').toUpperCase(),closed=draw.isDrawClosed===true||draw.isSalesClosed===true||draw.salesOpen===false||draw.active===false||/CLOSED|ENCERRADO|FECHADO|INATIVO/.test(status);
   if(closed){
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:'AGUARDANDO_CAMPANHA',official_issue_error:'O sorteio oficial vinculado está encerrado ou inativo.',updated_at:nowISO()});
    return;
   }
   const quantity=Math.max(1,Math.floor(Number(order.quantity||0)));
   const rawStock=draw.availableBooklets??draw.bookletsAvailable??draw.availableTickets??draw.remainingBooklets??draw.remainingTickets;
   const available=rawStock===null||rawStock===undefined||rawStock===''?null:Number(rawStock);
   await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_inventory_available:Number.isFinite(available)?available:null,official_inventory_checked_at:nowISO(),official_inventory_error:null,updated_at:nowISO()}).catch(()=>{});
   if(Number.isFinite(available)&&available<quantity){
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:'AGUARDANDO_ESTOQUE',official_issue_error:'Disponibilidade oficial insuficiente: '+available+' para '+quantity+' bloco(s).',updated_at:nowISO()});
    if(issue!=='AGUARDANDO_ESTOQUE')await addAlert('PEDIDO_PAGO_AGUARDANDO_ESTOQUE','Pedido pago aguardando disponibilidade oficial — '+order.code,{order:order.code,requested:quantity,available});
    return;
   }
   const customerName=String(order.customer_name||'').trim(),customerPhone=normalizeBR(order.phone||order.contact_phone||'');
   if(customerName.length<2||!customerPhone)throw new Error('Nome ou telefone do cliente inválido.');
   const paymentMethod=/^(pix|pix_mercado_pago|pix_mercadopago)$/i.test(String(order.payment_method||''))?'pix':String(order.payment_method||'pix').toLowerCase();
   saleRequestStarted=true;
   const sale=await rdsFinalRequest('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify({drawId:requestedDrawId,customerName,customerPhone,quantityBooklets:quantity,lotNumber:1,paymentMethod})});
   const info=saleInfo(sale);
   if(!info.saleId)throw new Error('Sistema oficial não retornou o identificador da venda.');
   const updated={...order,official_sale_id:info.saleId,official_issue_status:'CONCLUIDO',official_issue_at:nowISO(),official_ticket_url:info.pdfUrl||null,official_ticket_payload:info.payload,updated_at:nowISO()};
   const saved=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_sale_id:info.saleId,official_issue_status:'CONCLUIDO',official_issue_at:nowISO(),official_ticket_url:info.pdfUrl||null,official_ticket_payload:info.payload,official_issue_error:null,updated_at:nowISO(),official_draw_id:requestedDrawId,official_draw_title:String(draw.drawTitle||draw.title||draw.name||order.official_draw_title||'').trim()||null,official_draw_at:draw.drawDate||draw.drawAt||draw.date||order.official_draw_at||null});
   if(!saved?.length)return;
   await logEvent('BILHETES_EMITIDOS_AUTOMATICAMENTE',{order:order.code,order_id:order.id,sale_id:info.saleId,provider:'REINO_DA_SORTE',draw_id:requestedDrawId});
   await deliverExisting(updated);
  }catch(e){
   const err=String(e?.message||e),unauthorized=/dispositivo não está autorizado|dispositivo nao esta autorizado|device.*not.*authoriz|not authorized/i.test(err);
   const nextStatus=unauthorized?'AGUARDANDO_AUTORIZACAO':saleRequestStarted?'ERRO_RECONCILIAR':'ERRO';
   await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.EMITINDO',{official_issue_status:nextStatus,official_issue_error:err,updated_at:nowISO()}).catch(()=>{});
   if(unauthorized)await addAlert('EMISSAO_OFICIAL_AGUARDANDO_AUTORIZACAO','Autorização do dispositivo oficial necessária — '+order.code,{order:order.code,error:err});
   else if(saleRequestStarted)await addAlert('EMISSAO_OFICIAL_RESULTADO_AMBIGUO','Confirme a venda no sistema oficial antes de tentar novamente — '+order.code,{order:order.code,error:err,drawId:requestedDrawId,warning:'Reemissão automática bloqueada para evitar duplicidade.'});
   else if(issue!=='ERRO')await addAlert('EMISSAO_OFICIAL_FALHA','Falha na emissão oficial — '+order.code,{order:order.code,error:err});
   console.error('[RDS AUTO] falha na emissão '+String(order.code||order.id)+': '+err);
  }
 }
 async function cycle(){
  if(running)return;running=true;
  try{
   const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
   const filter=sellerId?'select=*&status=eq.PAGO_AGUARDANDO_BILHETES&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=updated_at.asc&limit=50':'select=*&status=eq.PAGO_AGUARDANDO_BILHETES&order=updated_at.asc&limit=50';
   const rows=await list('rds10_orders',filter);
   for(const o of rows){try{await issueOne(o);}catch(e){console.error('[RDS AUTO] pedido '+String(o.code||o.id)+': '+String(e?.message||e));}}
  }catch(e){console.error('[RDS AUTO] ciclo:',e?.message||e);}
  finally{running=false;}
 }
 globalThis.rdsTriggerOfficialAutoIssue=()=>cycle();
 setTimeout(()=>cycle().catch(()=>{}),1500);
 setInterval(()=>cycle().catch(()=>{}),5000);
 console.log('[RDS] worker automático de emissão oficial ativo; intervalo 5s');
})();
`;
 server=server.slice(0,pos)+block+'\n'+server.slice(pos);
 fs.writeFileSync(path,server,'utf8');
 console.log('[RDS] worker automático de emissão oficial instalado');
}
