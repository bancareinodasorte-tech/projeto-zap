import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS AUTOMATIC OFFICIAL DELIVERY V2';
if(server.includes(marker)){ console.log('[RDS] entrega oficial automática V2 já aplicada'); process.exit(0); }

const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado.');

if(!server.includes('globalThis.rdsOfficialRequestV3')){
  const anchor="app.get('/api/v1011/official-sales/draw-info',async(req,res)=>{";
  const p=server.indexOf(anchor);
  if(p<0)throw new Error('API oficial V3 não localizada.');
  server=server.slice(0,p)+"globalThis.rdsOfficialRequestV3=rdsOfficialRequestV3;\n"+server.slice(p);
}

const block=[
'// RDS AUTOMATIC OFFICIAL DELIVERY V2',
'(()=>{',
'  const locks=new Set();',
"  const base='http://127.0.0.1:'+PORT;",
'  async function run(orderId){',
"    const id=String(orderId||'').trim();",
"    if(!id||locks.has(id))return;",
'    locks.add(id);',
'    try{',
"      let order=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(id));",
"      if(!order||String(order.status||'').toUpperCase()!=='PAGO_AGUARDANDO_BILHETES'){locks.delete(id);return;}",
"      if(String(order.official_issue_status||'').toUpperCase()!=='CONCLUIDO'||!order.official_sale_id){",
"        if(typeof globalThis.rdsOfficialRequestV3!=='function')throw new Error('Integração oficial V3 indisponível.');",
"        let drawId=String(order.official_draw_id||'').trim();",
"        if(!drawId&&order.campaign_id){const camp=await one('rds10_campaigns','select=official_draw_id&id=eq.'+encodeURIComponent(order.campaign_id)).catch(()=>null);drawId=String(camp?.official_draw_id||'').trim();}",
"        const all=await globalThis.rdsOfficialRequestV3('/draws/seller/all');",
"        const arr=Array.isArray(all)?all:(all?.draws||all?.items||all?.data||[]);",
"        let draw=drawId?arr.find(x=>String(x?.drawId||x?.id||'')===drawId)||null:null;",
"        if(!draw){const active=arr.filter(x=>x?.isDrawClosed!==true&&x?.closed!==true&&x?.active!==false&&x?.isActive!==false);if(active.length!==1)throw new Error('Pedido pago sem sorteio oficial único definido.');draw=active[0];}",
"        drawId=String(draw?.drawId||draw?.id||drawId||'').trim();",
"        if(!drawId)throw new Error('ID do sorteio oficial não identificado.');",
"        const qty=Math.max(1,Math.floor(Number(order.quantity||0)));",
"        const availableRaw=draw?.availableBooklets??draw?.bookletsAvailable??draw?.availableTickets??draw?.remainingBooklets??draw?.remainingTickets??draw?.totalBooklets;",
"        const available=availableRaw===null||availableRaw===undefined||availableRaw===''?null:Number(availableRaw);",
"        if(Number.isFinite(available)&&available<qty)throw new Error('Disponibilidade oficial insuficiente.');",
"        const customerName=String(order.customer_name||'').trim();",
"        const customerPhone=String(order.phone||order.contact_phone||'').trim();",
"        const sale=await globalThis.rdsOfficialRequestV3('/seller/booklet-sales-v2',{method:'POST',body:JSON.stringify({drawId,customerName,customerPhone,quantityBooklets:qty,lotNumber:1,paymentMethod:String(order.payment_method||'pix').trim().toLowerCase()})});",
"        const data=sale?.data||sale||{};",
"        const saleId=String(data?.saleId||data?.id||data?.sale?.saleId||data?.sale?.id||'').trim()||null;",
"        await patch('rds10_orders','id=eq.'+encodeURIComponent(id),{official_draw_id:drawId,official_draw_title:String(draw.drawTitle||draw.title||draw.name||'').trim()||null,official_draw_at:draw.drawDate||draw.drawAt||draw.date||null,official_sale_id:saleId,official_issue_status:'CONCLUIDO',official_issue_at:nowISO(),official_issue_error:null,official_ticket_payload:data,official_ticket_url:data?.publicUrl||data?.ticketUrl||data?.url||null,status:'PAGO_AGUARDANDO_BILHETES',updated_at:nowISO()});",
"        await logEvent('EMISSAO_OFICIAL_AUTOMATICA',{order:order.code,order_id:id,official_sale_id:saleId,draw_id:drawId});",
'      }',
"      const pdf=await fetch(base+'/api/rds/ticket-pdf/'+encodeURIComponent(id)+'/resend',{method:'POST'});",
"      if(!pdf.ok)throw new Error('Falha no envio automático do PDF oficial.');",
"      const done=await fetch(base+'/api/orders/'+encodeURIComponent(id)+'/tickets-sent',{method:'POST'});",
"      if(!done.ok)throw new Error('Falha na conclusão automática da compra.');",
"      await logEvent('COMPRA_CONCLUIDA_AUTOMATICAMENTE',{order:order.code,order_id:id});",
'    }catch(e){',
"      const msg=String(e?.message||e);",
"      await patch('rds10_orders','id=eq.'+encodeURIComponent(id),{official_issue_error:msg.slice(0,1800),payment_last_error:msg.slice(0,1800),updated_at:nowISO()}).catch(()=>{});",
"      console.error('[RDS AUTO] '+id+':',msg);",
'    }',
'    locks.delete(id);',
'  }',
'  globalThis.rdsAutoOfficialIssueAndDeliver=run;',
"  setInterval(async()=>{try{const rows=await list('rds10_orders','select=id&status=eq.PAGO_AGUARDANDO_BILHETES&order=updated_at.asc&limit=20');for(const row of rows)run(row.id).catch(()=>{});}catch(e){console.error('[RDS AUTO SCAN]',e?.message||e);}},15000);",
"  console.log('[RDS] emissão oficial + PDF + conclusão automáticos ativos');",
'})();'
].join('\n');

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] pós-pagamento automático V2 instalado');
