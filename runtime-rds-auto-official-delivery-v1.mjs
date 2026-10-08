import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS AUTOMATIC OFFICIAL DELIVERY V1';
if(server.includes(marker)){ console.log('[RDS] entrega oficial automática já aplicada'); process.exit(0); }

const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para entrega oficial automática.');

if(!server.includes('globalThis.rdsOfficialRequestV3')){
  const anchor="app.get('/api/v1011/official-sales/draw-info',async(req,res)=>{";
  const p=server.indexOf(anchor);
  if(p<0)throw new Error('API oficial V3 não localizada.');
  server=server.slice(0,p)+"globalThis.rdsOfficialRequestV3=rdsOfficialRequestV3;\n"+server.slice(p);
}

const block=[
  '// RDS AUTOMATIC OFFICIAL DELIVERY V1',
  '(()=>{',
  '  const autoLocks=new Set();',
  "  const autoUrl='http://127.0.0.1:'+PORT;",
  '  const wait=ms=>new Promise(r=>setTimeout(r,ms));',
  '  async function issue(order){',
  "    const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));",
  "    if(!fresh)throw new Error('Pedido não encontrado.');",
  "    if(String(fresh.status||'').toUpperCase()==='CONCLUIDO')return {alreadyCompleted:true};",
  "    if(String(fresh.official_issue_status||'').toUpperCase()==='CONCLUIDO'&&fresh.official_sale_id)return {alreadyIssued:true};",
  "    if(String(fresh.status||'').toUpperCase()!=='PAGO_AGUARDANDO_BILHETES')throw new Error('Pedido ainda não está pronto para emissão automática.');",
  "    if(typeof globalThis.rdsOfficialRequestV3!=='function')throw new Error('Integração oficial V3 indisponível.');",
  "    let requested=String(fresh.official_draw_id||'').trim();",
  "    if(!requested&&fresh.campaign_id){const camp=await one('rds10_campaigns','select=official_draw_id,official_draw_title&id=eq.'+encodeURIComponent(fresh.campaign_id)).catch(()=>null);requested=String(camp?.official_draw_id||'').trim();}",
  "    const all=await globalThis.rdsOfficialRequestV3('/draws/seller/all');",
  "    const arr=Array.isArray(all)?all:(all?.draws||all?.items||all?.data||[]);",
  "    let draw=requested?arr.find(x=>String(x?.drawId||x?.id||'')===requested)||null:null;",
  "    if(!draw){const active=arr.filter(x=>x?.isDrawClosed!==true&&x?.closed!==true&&x?.active!==false&&x?.isActive!==false);if(active.length===1)draw=active[0];else if(active.length>1)throw new Error('Pedido pago sem sorteio oficial definido; emissão automática interrompida por segurança.');else draw=await globalThis.rdsOfficialRequestV3('/seller/draw-info');}",
  "    if(!draw||draw.isDrawClosed===true||draw.closed===true)throw new Error('Sorteio oficial encerrado ou indisponível.');",
  "    const rawAvail=draw?.availableBooklets??draw?.bookletsAvailable??draw?.availableTickets??draw?.remainingBooklets??draw?.remainingTickets??draw?.totalBooklets;",
  "    const available=rawAvail===null||rawAvail===undefined||rawAvail===''?null:Number(rawAvail);",
  "    const qty=Math.max(1,Math.floor(Number(fresh.quantity||0)));",
  "    if(Number.isFinite(available)&&available<qty)throw new Error('Disponibilidade oficial insuficiente para o pedido.');",
  "    const drawId=String(draw.drawId||draw.id||requested||'').trim();if(!drawId)throw new Error('ID do sorteio oficial não identificado.');",
  "    const customerName=String(fresh.customer_name||'').trim();const customerPhone=String(fresh.phone||fresh.contact_phone||'').trim();",
  "    if(customerName.length<2)throw new Error('Nome do cliente inválido.');if(!customerPhone)throw new Error('Telefone do cliente não informado.');",
  "    await patch('rds10_orders','id=eq.'+encodeURIComponent(fresh.id),{official_draw_id:drawId,official_draw_title:String(draw.drawTitle||draw.title||draw.name||'').trim()||null,official_draw_at:draw.drawDate||draw.drawAt||draw.date||null,official_inventory_available:Number.isFinite(available)?available:null,official_inventory_checked_at:nowISO(),updated_at:nowISO()});",
  "    const sale=await globalThis.rdsOfficialRequestV3('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify({drawId,customerName,customerPhone,quantityBooklets:qty,lotNumber:1,paymentMethod:String(fresh.payment_method||'pix').trim().toLowerCase()})});",
  "    const saleData=sale?.data||sale||{};const saleId=String(saleData?.saleId||saleData?.id||saleData?.sale?.saleId||saleData?.sale?.id||'').trim()||null;",
  "    await patch('rds10_orders','id=eq.'+encodeURIComponent(fresh.id),{official_sale_id:saleId,official_issue_status:'CONCLUIDO',official_issue_at:nowISO(),official_issue_error:null,official_ticket_payload:saleData,official_ticket_url:saleData?.publicUrl||saleData?.ticketUrl||saleData?.url||null,status:'PAGO_AGUARDANDO_BILHETES',updated_at:nowISO()});",
  "    await logEvent('EMISSAO_OFICIAL_AUTOMATICA',{order:fresh.code,order_id:fresh.id,official_sale_id:saleId,draw_id:drawId});",
  "    return {issued:true,officialSaleId:saleId};",
  '  }',
  '  globalThis.rdsAutoOfficialIssueAndDeliver=async function(orderId){',
  "    const key=String(orderId||'').trim();if(!key)return {skipped:true};if(autoLocks.has(key))return {alreadyRunning:true};autoLocks.add(key);",
  '    try{',
  "      const order=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(key));if(!order)throw new Error('Pedido não encontrado.');",
  "      if(String(order.status||'').toUpperCase()==='CONCLUIDO')return {alreadyCompleted:true};",
  "      await issue(order);await wait(250);",
  "      const pdfResp=await fetch(autoUrl+'/api/rds/ticket-pdf/'+encodeURIComponent(key)+'/resend',{method:'POST'});const pdfRaw=await pdfResp.text();let pdf={};try{pdf=pdfRaw?JSON.parse(pdfRaw):{};}catch{}if(!pdfResp.ok||pdf?.ok!==true)throw new Error(pdf?.error||'Falha no envio automático do PDF oficial.');",
  "      const doneResp=await fetch(autoUrl+'/api/orders/'+encodeURIComponent(key)+'/tickets-sent',{method:'POST'});const doneRaw=await doneResp.text();let done={};try{done=doneRaw?JSON.parse(doneRaw):{};}catch{}if(!doneResp.ok||done?.ok!==true)throw new Error(done?.error||'Falha ao concluir automaticamente a compra.');",
  "      await logEvent('COMPRA_CONCLUIDA_AUTOMATICAMENTE',{order:order.code,order_id:key});return {ok:true,completed:true};",
  "    }catch(e){const msg=String(e?.message||e);await patch('rds10_orders','id=eq.'+encodeURIComponent(key),{official_issue_error:msg.slice(0,1800),payment_last_error:msg.slice(0,1800),updated_at:nowISO()}).catch(()=>{});await addAlert('FALHA_EMISSAO_AUTOMATICA','Falha no pós-pagamento automático do pedido '+key,{order_id:key,error:msg}).catch(()=>{});console.error('[RDS AUTO] '+key+':',msg);return {ok:false,error:msg};}",
  '    finally{autoLocks.delete(key);}',
  '  };',
  '})();'
].join('\n');

server=server.slice(0,pos)+block+'\n'+server.slice(pos);

const reconcileNeedle="await rdsMercadoPagoApplyResult(order,data,'auto_reconcile');";
if(server.includes(reconcileNeedle)){
  server=server.replace(reconcileNeedle,"const paid=await rdsMercadoPagoApplyResult(order,data,'auto_reconcile'); if(paid&&typeof globalThis.rdsAutoOfficialIssueAndDeliver==='function') globalThis.rdsAutoOfficialIssueAndDeliver(order.id).catch(()=>{});");
}
const webhookNeedle="const paid=await rdsMercadoPagoApplyResult(order,data,'webhook');";
if(server.includes(webhookNeedle)){
  server=server.replace(webhookNeedle,webhookNeedle+" if(paid&&typeof globalThis.rdsAutoOfficialIssueAndDeliver==='function') globalThis.rdsAutoOfficialIssueAndDeliver(order.id).catch(()=>{});");
}
const manualNeedle="const paid=await rdsMercadoPagoApplyResult(order,data,'manual_status');";
if(server.includes(manualNeedle)){
  server=server.replace(manualNeedle,manualNeedle+" if(paid&&typeof globalThis.rdsAutoOfficialIssueAndDeliver==='function') globalThis.rdsAutoOfficialIssueAndDeliver(order.id).catch(()=>{});");
}

fs.writeFileSync(path,server,'utf8');
console.log('[RDS] pós-pagamento automático oficial instalado');
