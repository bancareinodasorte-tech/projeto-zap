import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const marker='// RDS OFFICIAL TICKET CHROMIUM V1';
let server=fs.readFileSync('server.js','utf8');
if(server.includes(marker))process.exit(0);

const oldMarker='// RDS OFFICIAL TICKET AUTO DELIVERY V6';
const oldStart=server.indexOf(oldMarker);
if(oldStart<0)throw new Error('Runtime V6 dos bilhetes não localizado.');
const oldEnd=server.indexOf('\n})();\n',oldStart);
if(oldEnd<0)throw new Error('Fim do runtime V6 dos bilhetes não localizado.');
server=server.slice(0,oldStart)+server.slice(oldEnd+1);

const block=String.raw`
// RDS OFFICIAL TICKET CHROMIUM V1
(()=>{
  const {chromium}=require('playwright-core');
  const chromiumBinary=require('@sparticuz/chromium');
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
    if(!browserPromise){
      browserPromise=(async()=>{
        const executablePath=await chromiumBinary.executablePath();
        return chromium.launch({executablePath,args:[...chromiumBinary.args,'--no-sandbox','--disable-setuid-sandbox'],headless:true});
      })().catch(e=>{browserPromise=null;throw e;});
    }
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
      const rows=Math.max(1,Math.ceil(nums.length/5));
      let cells='';
      for(const v of nums)cells+='<div class="num">'+esc(ticketNumber(v))+'</div>';
      let qr='';
      try{if(QR)qr=await QR.toDataURL(publicUrl,{errorCorrectionLevel:'M',margin:0,width:140});}catch{}
      const label=esc(String(b?.bookletLabel||((b?.bookletNumber||'-')+'-'+(b?.lotNumber||1))));
      cards.push('<div class="ticket-horizontal">'+
        '<div class="ticket-blue">'+
          '<div class="dates"><span>Data do Sorteio: '+esc(dd)+'</span><span>Data da Venda: '+esc(sd)+'</span></div>'+
          '<div class="main-row"><div class="brand">'+(logo?'<img src="'+logo+'">':'')+'</div>'+
          '<div class="numbers-area"><div class="section-title">NÚMEROS DA SORTE</div>'+
          '<div class="numbers-grid" style="grid-template-rows:repeat('+rows+',38px)">'+cells+'</div></div></div>'+
          '<div class="deadline">PRAZO PARA O GANHADOR SE APRESENTAR<br><b>ATÉ AS 09H DO DIA SEGUINTE</b></div>'+
        '</div>'+
        '<div class="ticket-gray">'+
          '<div class="field"><b>Vendedor:</b> '+esc(seller)+'</div>'+
          '<div class="field"><b>Nome:</b> <span>'+esc(name)+'</span></div><div class="rule"></div>'+
          '<div class="field"><b>Telefone:</b> <span>'+esc(phone)+'</span></div><div class="rule"></div>'+
          '<div class="field"><b>Prêmio:</b> <span>'+esc(prize)+'</span></div><div class="rule"></div>'+
          '<div class="footer"><span>@reinodasorteoficial</span><span>(88) 9 9494-3632</span></div>'+
          '<div class="qrbox"><div>Acompanhar sorteio</div>'+(qr?'<img src="'+qr+'">':'')+'<strong>'+label+'</strong></div>'+
        '</div></div>');
    }
    return '<!doctype html><html><head><meta charset="utf-8"><style>'+
      '@page{margin:0;size:1660px 600px}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#1f2937}'+
      '.sheet{width:1660px;height:600px;padding:20px;display:grid;grid-template-columns:800px 800px;gap:20px;background:#fff}'+
      '.ticket-horizontal{width:800px;height:560px;border:2px dashed #9ca3af;border-radius:12px;overflow:hidden;background:#fff;display:flex;flex-direction:column}'+
      '.ticket-blue{height:325px;background:#c7def0;padding:18px 24px 0;position:relative;flex:none}.ticket-gray{height:235px;background:#f0f2f7;padding:8px 24px;position:relative;flex:none;border-top:1px solid #9ca3af}'+
      '.dates{display:flex;justify-content:space-between;font-size:14px;color:#172b55}.main-row{display:flex;margin-top:10px}.brand{width:201px;height:225px;display:flex;align-items:center}.brand img{width:190px;height:145px;object-fit:contain}.numbers-area{width:550px}.section-title{height:35px;border-top:1px solid #8c9caf;border-bottom:1px solid #8c9caf;text-align:center;padding-top:8px;font-size:13px;color:#172b55}.numbers-grid{margin-top:20px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.num{height:30px;background:#fbfdff;border:1px solid #94c4ef;display:flex;align-items:center;justify-content:center;font-size:13px;color:#1f2937}.deadline{position:absolute;right:24px;bottom:5px;text-align:center;font-size:10px;line-height:14px;color:#172b55}.field{height:27px;font-size:15px;line-height:27px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:230px}.field b{font-weight:600}.rule{border-bottom:1px dashed #6b7380;width:445px;margin-left:76px;height:1px}.footer{position:absolute;left:24px;bottom:12px;display:flex;gap:30px;font-size:11px}.qrbox{position:absolute;right:24px;top:34px;width:155px;height:172px;border:1px dashed #9cabbd;text-align:center;padding-top:8px;font-size:12px}.qrbox img{display:block;width:100px;height:100px;margin:18px auto 4px}.qrbox strong{display:block;font-size:16px;color:#172b55}'+
      '</style></head><body><div class="sheet">'+cards.join('')+'</div></body></html>';
  }

  async function renderPng(order){
    const browser=await getBrowser();
    const page=await browser.newPage({viewport:{width:1660,height:600},deviceScaleFactor:1});
    try{
      await page.setContent(await makeHtml(order),{waitUntil:'load'});
      await page.evaluate(()=>document.fonts?.ready);
      await page.waitForTimeout(150);
      return await page.locator('.sheet').screenshot({type:'png'});
    }finally{await page.close();}
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
      const o=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(req.params.id);
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
