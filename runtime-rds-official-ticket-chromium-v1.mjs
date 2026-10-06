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
  const fs=require('node:fs');
  const RDS_Readable=require('node:stream').Readable;
  const QR=(()=>{try{return require('qrcode');}catch{return null;}})();

  // A tela oficial do APK usa /assets/logo.png. No servidor, usamos a cópia oficial enviada pela banca.
  // Logo oficial enviada pela banca, incorporada diretamente no renderizador para não depender de caminho externo.
  const logoB64="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";

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

  async function makeHtml(order,booksOverride=null){
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const books=Array.isArray(booksOverride)&&booksOverride.length?booksOverride:(Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{bookletNumber:order?.official_sale_id||'-',lotNumber:1,tickets:[]}]);
    const name=String(p.customerName||order?.customer_name||'-');
    const phone=String(p.customerPhone||order?.phone||order?.contact_phone||'-');
    const seller=String(p.sellerName||'—')+(p.sellerPhone?' – '+String(p.sellerPhone):'');
    const drawTitle=String(p.drawTitle||'REINO DA SORTE');
    const prize=p.drawDescription?drawTitle+' - '+String(p.drawDescription):drawTitle;
    const dd=dateBR(p.drawDate),sd=dateTimeBR(p.createdAt||order?.created_at);
    const publicUrl=String(p.publicUrl||'https://admin.reinodasorte.com.br/');
    const logo=logoB64?'data:image/webp;base64,'+logoB64:'';
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
    const singleCard=cards.length===1;
    const cols=singleCard?1:2;
    const sheetWidth=singleCard?800:1660;
    const rows=Math.max(1,Math.ceil(cards.length/cols));
    const sheetHeight=singleCard?560:20+(rows*580);
    const pad=singleCard?0:20;
    const gap=singleCard?0:20;
    return '<!doctype html><html><head><meta charset="utf-8"><style>'+
      '@page{margin:0;size:'+sheetWidth+'px '+sheetHeight+'px}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#1f2937}'+
      '.sheet{width:'+sheetWidth+'px;height:'+sheetHeight+'px;padding:'+pad+'px;display:grid;grid-template-columns:repeat('+cols+',800px);grid-auto-rows:560px;gap:'+gap+'px;background:#fff;align-items:start}'+
      '.ticket-horizontal{width:800px;height:560px;background:#fff;border:2px dashed #9ca3af;border-radius:12px;display:flex;flex-direction:column;position:relative;overflow:hidden;font-family:Montserrat,"Segoe UI",sans-serif;color:#1f2937;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}'+
      '.ticket-blue{height:58%;width:100%;padding:24px;display:flex;flex-direction:column;justify-content:space-between;background:#c7def0;z-index:10;position:relative}'+
      '.topline{display:flex;justify-content:space-between;align-items:flex-start;width:100%;color:#172554;font-weight:700;font-size:18px;text-shadow:0 1px 2px rgba(255,255,255,.3)}'+
      '.main-blue{display:flex;justify-content:space-between;align-items:center;flex:1;margin-top:8px;position:relative;z-index:1}'+
      '.logo-col{width:28%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-right:16px;text-align:center}.official-logo{display:block;width:100%;max-width:190px;max-height:170px;height:auto;object-fit:contain;object-position:center;image-rendering:auto}.logo-col>span{font-size:10px;font-weight:800;color:#1e3a8a;letter-spacing:.1em;margin-top:4px}.logo-fallback{font-size:28px;line-height:.85;color:#17458a;font-weight:800;text-align:center;text-shadow:0 2px 2px rgba(255,255,255,.5)}.logo-fallback strong{font-size:32px}'+
      '.numbers-col{width:72%;display:flex;flex-direction:column}.numbers-title{display:flex;align-items:center;justify-content:center;margin-bottom:12px}.numbers-title i{flex-grow:1;height:2px;background:rgba(30,58,138,.2);border-radius:999px}.numbers-title span{margin:0 12px;font-size:14px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.1em;text-shadow:0 1px 2px rgba(255,255,255,.3)}'+
      '.numbers-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.num{background:rgba(255,255,255,.95);border-radius:6px;box-shadow:0 2px 6px rgba(30,58,138,.18);border:1px solid #93c5fd;text-align:center;padding:6px 0;font-weight:700;font-size:14px;letter-spacing:-.02em;color:#1f2937}'+
      '.deadline{width:100%;text-align:right;margin-top:12px;position:relative;z-index:1;font-size:11px;font-weight:700;line-height:1.3;text-transform:uppercase;color:#1e3a5f;text-shadow:0 1px 1px rgba(255,255,255,.9)}'+
      '.split-line{width:100%;height:0;border-top:2px dashed #9ca3af;position:absolute;top:58%;left:0;z-index:20}'+
      '.ticket-gray{background:#f0f2f5;height:42%;width:100%;padding:32px 24px 24px;display:flex;justify-content:space-between;z-index:10}.info-col{width:72%;display:flex;flex-direction:column;justify-content:space-between;padding-right:16px}.seller{font-size:14px;margin-bottom:12px;color:#374151}.line-field{display:flex;align-items:flex-end;width:100%;margin-top:16px}.line-field b{font-weight:700;font-size:16px;margin-right:12px;color:#1f2937;padding-bottom:4px}.line-field span{flex-grow:1;border-bottom:1px dashed #6b7280;font-size:15px;font-weight:700;color:#111827;padding:0 0 4px 8px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.contacts{display:flex;align-items:center;gap:8px;margin-top:auto;font-size:14px;font-weight:600;color:#374151}.contacts .ig{color:#db2777;font-size:22px}.contacts .wa{color:#22c55e;font-size:18px;margin-left:16px}'+
      '.qrbox{width:26%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dotted #9ca3af;border-radius:8px;padding:8px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}.qrbox>span{font-size:12px;font-weight:700;letter-spacing:-.02em;color:#1f2937;margin-bottom:8px}.qrbox img{display:block;width:100px;height:100px}.qrbox strong{font-weight:700;font-size:18px;letter-spacing:.05em;color:#1e3a8a;margin-top:4px}.qr-placeholder{width:100px;height:100px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af}'+
      '</style></head><body><div class="sheet">'+cards.join('')+'</div></body></html>';
  }

  async function getSheetSize(order,booksOverride=null){
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const books=Array.isArray(booksOverride)&&booksOverride.length?booksOverride:(Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{tickets:[]}]);
    const singleCard=books.length===1;
    const cols=singleCard?1:2;
    const rows=Math.max(1,Math.ceil(books.length/cols));
    return {width:singleCard?800:1660,height:singleCard?560:20+(rows*580)};
  }

  async function renderPng(order,booksOverride=null){
    let lastErr=null;
    for(let attempt=1;attempt<=2;attempt++){
      let browser=null,page=null;
      try{
        browser=await getBrowser();
        if(!browser?.isConnected())throw new Error('Chromium desconectado.');
        const sheet=await getSheetSize(order,booksOverride);
        page=await browser.newPage({viewport:{width:sheet.width,height:sheet.height},deviceScaleFactor:1});
        await page.setContent(await makeHtml(order,booksOverride),{waitUntil:'load'});
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
    const p=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const allBooks=Array.isArray(p.booklets)&&p.booklets.length?p.booklets:[{bookletNumber:order?.official_sale_id||'-',lotNumber:1,tickets:[]}];
    const MAX_BOOKLETS_PER_PAGE=50;
    const pages=[];
    for(let i=0;i<allBooks.length;i+=MAX_BOOKLETS_PER_PAGE){
      const pageBooks=allBooks.slice(i,i+MAX_BOOKLETS_PER_PAGE);
      const png=await renderPng(order,pageBooks);
      const sheet=await getSheetSize(order,pageBooks);
      pages.push({png,sheet});
    }
    const first=pages[0];
    const chunks=[];
    const doc=new PDFDocument({size:[first.sheet.width,first.sheet.height],margin:0,compress:true});
    doc.on('data',c=>chunks.push(c));
    const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    for(let i=0;i<pages.length;i++){
      const pg=pages[i];
      if(i>0)doc.addPage({size:[pg.sheet.width,pg.sheet.height],margin:0});
      doc.image(pg.png,0,0,{width:pg.sheet.width,height:pg.sheet.height});
    }
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
