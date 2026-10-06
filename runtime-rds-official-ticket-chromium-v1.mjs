import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const marker='// RDS OFFICIAL TICKET CHROMIUM V1';
let server=fs.readFileSync('server.js','utf8');
if(server.includes(marker))process.exit(0);

const oldMarker='// RDS OFFICIAL TICKET AUTO DELIVERY V6';
const oldStart=server.indexOf(oldMarker);
if(oldStart<0)throw new Error('Runtime V6 dos bilhetes não localizado.');
const catchAllMarker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const oldEnd=server.indexOf(catchAllMarker,oldStart);
if(oldEnd<0)throw new Error('Catch-all não localizado para substituir o runtime V6.');
server=server.slice(0,oldStart)+server.slice(oldEnd);

const block=String.raw`
// RDS OFFICIAL TICKET CHROMIUM V1
(()=>{
  const {chromium}=require('playwright-core');
  const chromiumBinary=require('@sparticuz/chromium');
  const PDFDocument=require('pdfkit');
  const RDS_Readable=require('node:stream').Readable;
  const QR=(()=>{try{return require('qrcode');}catch{return null;}})();

  const logoB64=(()=>{
    try{
      const s=fs.readFileSync('runtime-rds-official-ticket-auto-v1.mjs','utf8');
      const m=s.match(/const RDS_TICKET_LOGO_JPG_B64='([^']+)'/);
      return m?.[1]||'';
    }catch{return '';}
  })();

  let browserPromise=null;
  async function getBrowser(){
    if(browserPromise){
      try{
        const b=await browserPromise;
        if(b?.isConnected())return b;
      }catch{}
      browserPromise=null;
    }
    browserPromise=(async()=>{
      const executablePath=await chromiumBinary.executablePath();
      const baseArgs=Array.isArray(chromiumBinary.args)?chromiumBinary.args:[];
      const args=baseArgs.filter(a=>String(a)!=='--single-process');
      for(const a of ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']){
        if(!args.includes(a))args.push(a);
      }
      const b=await chromium.launch({executablePath,args,headless:true});
      b.on('disconnected',()=>{browserPromise=null;});
      return b;
    })().catch(e=>{browserPromise=null;throw e;});
    return browserPromise;
  }

  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const ticketNumber=v=>{const s=String(v??'');return s.includes('-')?s.split('-')[0]:s;};
  const dateBR=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'});};
  const dateTimeBR=v=>{if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};

  async function makeHtml(order){
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const books=Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{bookletNumber:order?.official_sale_id||'-',lotNumber:1,tickets:[]}];
    const name=String(p.customerName||order?.customer_name||'-');
    const phone=String(p.customerPhone||order?.phone||order?.contact_phone||'-');
    const seller=String(p.sellerName||'—')+(p.sellerPhone?' – '+String(p.sellerPhone):'');
    const drawTitle=String(p.drawTitle||'REINO DA SORTE');
    const prize=p.drawDescription?drawTitle+' - '+String(p.drawDescription):drawTitle;
    const dd=dateBR(p.drawDate),sd=dateTimeBR(p.createdAt||order?.created_at);
    const publicUrl=String(p.publicUrl||'https://admin.reinodasorte.com.br/');
    const logo=logoB64?'data:image/jpeg;base64,'+logoB64:'';
    const cards=[];
    for(const b of books){
      const nums=Array.isArray(b?.tickets)?b.tickets:[];
      let cells='';
      for(const v of nums)cells+='<div class="num">'+esc(ticketNumber(v))+'</div>';
      let qr='';
      try{if(QR)qr=await QR.toDataURL(publicUrl,{errorCorrectionLevel:'M',margin:0,width:100});}catch{}
      const label=esc(String(b?.bookletLabel||((b?.bookletNumber||'-')+'-'+(b?.lotNumber||1))));
      const logoHtml=logo?'<img class="official-logo" src="'+logo+'" alt="Reino da Sorte">':'<div class="logo-fallback">REINO<br><strong>DA SORTE</strong></div>';
      cards.push('<div class="ticket-horizontal">'+
        '<div class="ticket-blue">'+
          '<div class="topline"><div>Data do Sorteio: '+esc(dd)+'</div><div>Data da Venda: '+esc(sd)+'</div></div>'+
          '<div class="main-blue">'+
            '<div class="logo-col">'+logoHtml+'<span>JARDIM - CEARÁ</span></div>'+
            '<div class="numbers-col">'+
              '<div class="numbers-title"><i></i><span>Números da Sorte</span><i></i></div>'+
              '<div class="numbers-grid">'+cells+'</div>'+
            '</div>'+
          '</div>'+
          '<div class="deadline">PRAZO PARA O GANHADOR SE APRESENTAR<br><b>ATÉ AS 09H DO DIA SEGUINTE</b></div>'+
        '</div>'+
        '<div class="split-line"></div>'+
        '<div class="ticket-gray">'+
          '<div class="info-col">'+
            '<div class="seller"><b>Vendedor:</b> '+esc(seller)+'</div>'+
            '<div class="line-field"><b>Nome:</b><span>'+esc(name)+'</span></div>'+
            '<div class="line-field"><b>Telefone:</b><span>'+esc(phone)+'</span></div>'+
            '<div class="line-field"><b>Prêmio:</b><span>'+esc(prize)+'</span></div>'+
            '<div class="contacts"><span class="ig">◎</span><span>@reinodasorteoficial</span><span class="wa">◉</span><span>(88) 9 9494-3632</span></div>'+
          '</div>'+
          '<div class="qrbox"><span>Acompanhar sorteio</span>'+(qr?'<img src="'+qr+'">':'<div class="qr-placeholder">QR Code</div>')+'<strong>'+label+'</strong></div>'+
        '</div>'+
      '</div>');
    }
    return '<!doctype html><html><head><meta charset="utf-8"><style>'+
      '@page{margin:0;size:1660px 600px}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#1f2937}'+
      '.sheet{width:1660px;padding:20px;display:grid;grid-template-columns:repeat(2,800px);gap:20px;background:#fff;align-items:start}'+
      '.ticket-horizontal{width:800px;height:560px;background:#fff;border:2px dashed #9ca3af;border-radius:12px;display:flex;flex-direction:column;position:relative;overflow:hidden;font-family:Montserrat,"Segoe UI",sans-serif;color:#1f2937;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}'+
      '.ticket-blue{height:58%;width:100%;padding:24px;display:flex;flex-direction:column;justify-content:space-between;background:#c7def0;z-index:10;position:relative}'+
      '.topline{display:flex;justify-content:space-between;align-items:flex-start;width:100%;color:#172554;font-weight:700;font-size:18px;text-shadow:0 1px 2px rgba(255,255,255,.3)}'+
      '.main-blue{display:flex;justify-content:space-between;align-items:center;flex:1;margin-top:8px;position:relative;z-index:1}'+
      '.logo-col{width:28%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-right:16px;text-align:center}.official-logo{width:100%;max-width:200px;height:auto;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,.1))}.logo-col>span{font-size:10px;font-weight:800;color:#1e3a8a;letter-spacing:.1em;margin-top:4px}.logo-fallback{font-size:28px;line-height:.85;color:#17458a;font-weight:800;text-align:center;text-shadow:0 2px 2px rgba(255,255,255,.5)}.logo-fallback strong{font-size:32px}'+
      '.numbers-col{width:72%;display:flex;flex-direction:column}.numbers-title{display:flex;align-items:center;justify-content:center;margin-bottom:12px}.numbers-title i{flex-grow:1;height:2px;background:rgba(30,58,138,.2);border-radius:999px}.numbers-title span{margin:0 12px;font-size:14px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.1em;text-shadow:0 1px 2px rgba(255,255,255,.3)}'+
      '.numbers-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.num{background:rgba(255,255,255,.95);border-radius:6px;box-shadow:0 2px 6px rgba(30,58,138,.18);border:1px solid #93c5fd;text-align:center;padding:6px 0;font-weight:700;font-size:14px;letter-spacing:-.02em;color:#1f2937}'+
      '.deadline{width:100%;text-align:right;margin-top:12px;position:relative;z-index:1;font-size:11px;font-weight:700;line-height:1.3;text-transform:uppercase;color:#1e3a5f;text-shadow:0 1px 1px rgba(255,255,255,.9)}'+
      '.split-line{width:100%;height:0;border-top:2px dashed #9ca3af;position:absolute;top:58%;left:0;z-index:20}'+
      '.ticket-gray{background:#f0f2f5;height:42%;width:100%;padding:32px 24px 24px;display:flex;justify-content:space-between;z-index:10}.info-col{width:72%;display:flex;flex-direction:column;justify-content:space-between;padding-right:16px}.seller{font-size:14px;margin-bottom:12px;color:#374151}.line-field{display:flex;align-items:flex-end;width:100%;margin-top:16px}.line-field b{font-weight:700;font-size:16px;margin-right:12px;color:#1f2937;padding-bottom:4px}.line-field span{flex-grow:1;border-bottom:1px dashed #6b7280;font-size:15px;font-weight:700;color:#111827;padding:0 0 4px 8px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.contacts{display:flex;align-items:center;gap:8px;margin-top:auto;font-size:14px;font-weight:600;color:#374151}.contacts .ig{color:#db2777;font-size:22px}.contacts .wa{color:#22c55e;font-size:18px;margin-left:16px}'+
      '.qrbox{width:26%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dotted #9ca3af;border-radius:8px;padding:8px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}.qrbox>span{font-size:12px;font-weight:700;letter-spacing:-.02em;color:#1f2937;margin-bottom:8px}.qrbox img{display:block;width:100px;height:100px}.qrbox strong{font-weight:700;font-size:18px;letter-spacing:.05em;color:#1e3a8a;margin-top:4px}.qr-placeholder{width:100px;height:100px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af}'+
      '</style></head><body><div class="sheet">'+cards.join('')+'</div></body></html>';
  }

  async function renderPng(order){
    let lastErr=null;
    for(let attempt=1;attempt<=2;attempt++){
      let browser=null,page=null;
      try{
        browser=await getBrowser();
        if(!browser?.isConnected())throw new Error('Chromium desconectado.');
        page=await browser.newPage({viewport:{width:1660,height:600},deviceScaleFactor:1});
        await page.setContent(await makeHtml(order),{waitUntil:'load'});
        await page.evaluate(()=>document.fonts?.ready);
        await page.waitForTimeout(150);
        return await page.locator('.sheet').screenshot({type:'png'});
      }catch(e){
        lastErr=e;
        browserPromise=null;
        try{if(page)await page.close().catch(()=>{});}catch{}
        try{if(browser&&browser.isConnected())await browser.close().catch(()=>{});}catch{}
        if(attempt<2)continue;
      }
    }
    throw lastErr||new Error('Falha ao renderizar bilhete.');
  }

  async function renderPdf(order){
    const png=await renderPng(order);
    const chunks=[];
    const doc=new PDFDocument({size:[1660,600],margin:0,compress:true});
    doc.on('data',c=>chunks.push(c));
    const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    doc.image(png,0,0,{width:1660,height:600});
    doc.end();
    return done;
  }

  async function archive(order,pdf,sentAt=null){
    const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
    const row={order_id:order.id,seller_id:sid||order.seller_id||null,order_code:String(order.code||''),customer_name:order.customer_name||null,customer_phone:normalizeBR(order.phone||order.contact_phone||'')||null,official_sale_id:String(order.official_sale_id||'')||null,file_name:'bilhetes-'+order.code+'.pdf',mime_type:'application/pdf',pdf_base64:pdf.toString('base64'),sent_at:sentAt,updated_at:nowISO()};
    const ex=await one('rds10_ticket_documents','select=id&order_id=eq.'+encodeURIComponent(order.id));
    if(ex?.id)await patch('rds10_ticket_documents','id=eq.'+encodeURIComponent(ex.id),row);else await insert('rds10_ticket_documents',row);
  }

  const rawSend=sendToJid;
  sendToJid=async(jid,content)=>{
    try{
      const m=String(content?.fileName||'').match(/bilhetes-(RDS-[A-Z0-9]{6,12})\\.pdf/i);
      if(m&&content?.document){
        const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
        const f=sid?'select=*&code=eq.'+encodeURIComponent(m[1])+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&code=eq.'+encodeURIComponent(m[1]);
        const o=await one('rds10_orders',f);
        if(o){
          const b=await renderPdf(o);await archive(o,b);
          console.log('[RDS TICKET CHROMIUM] modelo visual renderizado '+o.code);
          return rawSend(jid,{...content,document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf'});
        }
      }
    }catch(e){console.error('[RDS TICKET CHROMIUM] envio:',e?.message||e);}
    return rawSend(jid,content);
  };

  app.get('/api/rds/ticket-png/:id',async(req,res)=>{
    try{
      const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id));
      if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});
      const b=await renderPng(o);
      res.setHeader('Content-Type','image/png');res.setHeader('Content-Disposition','inline; filename="bilhetes-'+o.code+'.png"');
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.end(b);
    }catch(e){console.error('[RDS TICKET CHROMIUM] PNG:',e?.stack||e);res.status(500).json({ok:false,error:String(e?.message||e)});}
  });

  app.get('/api/rds/ticket-pdf/:id',async(req,res)=>{
    try{
      const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id));
      if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});
      const b=await renderPdf(o);await archive(o,b);
      res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="bilhetes-'+o.code+'.pdf"');
      res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.end(b);
    }catch(e){console.error('[RDS TICKET CHROMIUM] PDF:',e?.stack||e);res.status(500).json({ok:false,error:String(e?.message||e)});}
  });

  app.post('/api/rds/ticket-pdf/:id/resend',async(req,res)=>{
    try{
      const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
      const f=sid?'select=*&id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&id=eq.'+encodeURIComponent(req.params.id);
      const o=await one('rds10_orders',f);
      if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});
      const phone=normalizeBR(o.phone||o.contact_phone||o.official_ticket_payload?.customerPhone||'');
      if(!phone)throw new Error('Telefone do cliente não informado.');
      const target=await ensureTargetJid(phone);if(!target?.jid)throw new Error('WhatsApp não localizado.');
      const b=await renderPdf(o);await archive(o,b,nowISO());
      const s=await rawSend(target.jid,{document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf',fileName:'bilhetes-'+o.code+'.pdf'});
      if(!s?.key?.id)throw new Error('WhatsApp não confirmou o envio.');
      await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+o.code+' — Reenvio manual',status:'ENVIADA',waId:s.key.id,raw:{manualResend:true,order:o.code,saleId:o.official_sale_id||null}});
      await patch('rds10_ticket_documents','order_id=eq.'+encodeURIComponent(o.id),{sent_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
      res.json({ok:true,waMessageId:s.key.id});
    }catch(e){res.status(500).json({ok:false,error:String(e?.message||e)});}
  });

  app.get('/api/rds/ticket-archive',async(req,res)=>{
    try{
      const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,q=String(req.query.search||'').trim();
      let af=sid?'select=*&seller_id=eq.'+encodeURIComponent(sid):'select=*';
      if(q)af+='&or=(order_code.ilike.*'+encodeURIComponent(q)+'*,customer_name.ilike.*'+encodeURIComponent(q)+'*,customer_phone.ilike.*'+encodeURIComponent(q)+'*,official_sale_id.ilike.*'+encodeURIComponent(q)+'*)';
      af+='&order=created_at.desc&limit=200';
      const docs=await list('rds10_ticket_documents',af);
      const seen=new Set((docs||[]).map(x=>String(x.order_id||'')));
      let of=sid?'select=*&seller_id=eq.'+encodeURIComponent(sid)+'&status=eq.CONCLUIDO&official_sale_id=not.is.null':'select=*&status=eq.CONCLUIDO&official_sale_id=not.is.null';
      if(q)of+='&or=(code.ilike.*'+encodeURIComponent(q)+'*,customer_name.ilike.*'+encodeURIComponent(q)+'*,phone.ilike.*'+encodeURIComponent(q)+'*,contact_phone.ilike.*'+encodeURIComponent(q)+'*,official_sale_id.ilike.*'+encodeURIComponent(q)+'*)';
      of+='&order=created_at.desc&limit=200';
      const orders=await list('rds10_orders',of);
      const rows=[...(docs||[])];
      for(const o of (orders||[]))if(!seen.has(String(o.id)))rows.push({id:o.id,order_id:o.id,order_code:o.code||'',customer_name:o.customer_name||null,customer_phone:o.phone||o.contact_phone||null,official_sale_id:o.official_sale_id||null,created_at:o.created_at||o.completed_at||null,sent_at:null,updated_at:o.updated_at||null,pdf_base64:null});
      rows.sort((a,b)=>new Date(b.created_at||b.updated_at||0)-new Date(a.created_at||a.updated_at||0));
      res.json({ok:true,rows:rows.slice(0,200)});
    }catch(e){res.status(500).json({ok:false,error:String(e?.message||e)});}
  });
})();
`;
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync('server.js',server,'utf8');
