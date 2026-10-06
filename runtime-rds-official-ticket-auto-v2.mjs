import fs from 'node:fs';

const marker='// RDS OFFICIAL TICKET AUTO DELIVERY V6';
let server=fs.readFileSync('server.js','utf8');
if(server.includes(marker)){process.exit(0);}
const listen="app.listen(PORT,async()=>{";
const oldMarker='// RDS OFFICIAL TICKET AUTO DELIVERY V5';
const oldStart=server.indexOf(oldMarker);
if(oldStart>=0){
  const oldEnd=server.indexOf('\n})();\n'+listen,oldStart);
  if(oldEnd>=0)server=server.slice(0,oldStart)+server.slice(oldEnd+1);
}

const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado.');


const block=`
// RDS OFFICIAL TICKET AUTO DELIVERY V6
(()=>{
  const QR=(()=>{try{return require('qrcode');}catch{return null;}})();
  const PDFDocument=require('pdfkit');
  const RDS_Readable=require('node:stream').Readable;
  const logoB64=(()=>{try{const s=fs.readFileSync('runtime-rds-official-ticket-auto-v1.mjs','utf8');const m=s.match(/const RDS_TICKET_LOGO_JPG_B64='([^']+)'/);return m?.[1]||'';}catch{return '';}})();
  const logoBuf=Buffer.from(logoB64,'base64');
  const NL=String.fromCharCode(10);
  const esc=v=>{const bs=String.fromCharCode(92);return Array.from(String(v??'').normalize('NFD')).filter(c=>{const n=c.charCodeAt(0);return n<768||n>879;}).map(c=>{const n=c.charCodeAt(0);return n>=32&&n<=126?c:'?';}).join('').split(bs).join(bs+bs).split('(').join(bs+'(').split(')').join(bs+')');};
  async function pdf(order){
    const p=order?.official_ticket_payload||{};
    const books=Array.isArray(p.booklets)?p.booklets:[];
    const items=books.length?books:[{bookletNumber:order?.official_sale_id||'-',lotNumber:1,tickets:[]}];
    const name=String(p.customerName||order?.customer_name||'-');
    const phone=String(p.customerPhone||order?.phone||order?.contact_phone||'-');
    const seller=String(p.sellerName||'—')+(p.sellerPhone?(' – '+String(p.sellerPhone)):'');
    const drawTitle=String(p.drawTitle||'REINO DA SORTE');
    const drawDescription=String(p.drawDescription||'');
    const prize=drawDescription?drawTitle+' - '+drawDescription:drawTitle;
    const fmtDate=v=>v?new Date(v).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}):'';
    const fmtDateTime=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    const dd=fmtDate(p.drawDate),sd=fmtDateTime(p.createdAt||order?.created_at);
    const W=1660,H=600,PAD=20,GAP=20,TW=800,TH=560;
    const chunks=[];
    const doc=new PDFDocument({size:[W,H],margin:0,autoFirstPage:true,compress:true});
    doc.on('data',c=>chunks.push(c));
    const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    const rgb=c=>{const a=String(c).trim().split(/\s+/).map(Number);const h=n=>Math.max(0,Math.min(255,Math.round(n*255))).toString(16).padStart(2,'0');return '#'+h(a[0]??0)+h(a[1]??0)+h(a[2]??0);};
    const text=(v,x,y,size,color='0.12 0.17 0.24',opts={})=>{
      doc.font('Helvetica').fontSize(size).fillColor(rgb(color)).text(String(v??''),x,y,{lineBreak:false,width:opts.width||500,ellipsis:false});
    };
    const rect=(x,y,w,h,color)=>{
      doc.fillColor(rgb(color)).rect(x,y,w,h).fill();
    };
    const line=(x1,y1,x2,y2,color='0.42 0.48 0.56',width=.7)=>{
      doc.strokeColor(rgb(color)).lineWidth(width).moveTo(x1,y1).lineTo(x2,y2).stroke();
    };
    const dashed=(x1,y1,x2,y2)=>{
      doc.save().dash(3,{space:3}).strokeColor('#6B7380').lineWidth(1).moveTo(x1,y1).lineTo(x2,y2).stroke().undash().restore();
    };
    const border=(x,y,w,h)=>{
      doc.save().dash(6,{space:4}).strokeColor('#9CABBD').lineWidth(1.4).rect(x,y,w,h).stroke().undash().restore();
    };
    const qr=(value,x,y,size)=>{
      if(!QR)return;
      try{
        const q=QR.create(String(value),{errorCorrectionLevel:'M'}),n=q.modules.size,z=size/n;
        rect(x-5,y-5,size+10,size+10,'1 1 1');
        for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(q.modules.get(row,col))rect(x+col*z,y+row*z,z+.05,z+.05,'0 0 0');
      }catch(e){console.error('[RDS TICKET] QR:',e?.message||e);}
    };
    const draw=(x,y,b)=>{
      const top=325,bottom=235,blue='0.78 0.87 0.94',gray='0.94 0.95 0.97',navy='0.09 0.14 0.32',ink='0.12 0.17 0.24';
      rect(x,y+bottom,TW,top,blue); rect(x,y,TW,bottom,gray); border(x,y,TW,TH);
      line(x,y+bottom,x+TW,y+bottom,'0.61 0.67 0.74',1.2);
      text('Data do Sorteio: '+dd,x+24,y+18,14,navy,{width:300});
      text('Data da Venda: '+sd,x+515,y+18,13,navy,{width:260});
      if(logoBuf.length)try{doc.image(logoBuf,x+25,y+23,{width:190,height:145,fit:[190,145]});}catch(e){console.error('[RDS TICKET] logo:',e?.message||e);}
      const rx=x+225,rw=550;
      line(rx,y+68,rx+rw,y+68,'0.55 0.62 0.72',1);
      text('NÚMEROS DA SORTE',rx+175,y+73,13,navy,{width:250});
      line(rx,y+76,rx+rw,y+76,'0.55 0.62 0.72',1);
      const tk=Array.isArray(b?.tickets)?b.tickets:[];
      const cols=5,rows=Math.max(1,Math.ceil(tk.length/cols));
      const gridTop=y+96,gridBottom=y+307,availableH=gridBottom-gridTop;
      const rowGap=Math.min(38,Math.max(18,availableH/rows));
      const bh=Math.min(30,Math.max(16,rowGap-7));
      const bw=(rw-32)/cols;
      tk.forEach((v,k)=>{
        const rr=Math.floor(k/cols),cc=k%cols,bx=rx+cc*(bw+8),by=gridTop+rr*rowGap;
        rect(bx,by,bw,bh,'0.98 0.99 1');
        line(bx,by,bx+bw,by,'0.58 0.77 0.96',1); line(bx,by+bh,bx+bw,by+bh,'0.58 0.77 0.96',1);
        line(bx,by,bx,by+bh,'0.58 0.77 0.96',1); line(bx+bw,by,bx+bw,by+bh,'0.58 0.77 0.96',1);
        const val=String(v??'').includes('-')?String(v).split('-')[0]:String(v??'');
        const fs=bh<22?10:(bh<26?11:13);
        text(val,bx+Math.max(2,(bw-doc.widthOfString(val,{font:'Helvetica',size:fs}))/2),by+Math.max(2,(bh-fs)/2),fs,ink,{width:bw-4});
      });
      text('PRAZO PARA O GANHADOR SE APRESENTAR',x+468,y+312,10,navy,{width:300});
      text('ATÉ AS 09H DO DIA SEGUINTE',x+520,y+324,10,navy,{width:250});
      text('Vendedor: '+seller,x+24,y+333,14,ink,{width:520});
      text('Nome:',x+24,y+365,16,ink,{width:80}); text(name,x+100,y+365,15,ink,{width:445}); dashed(x+100,y+384,x+545,y+384);
      text('Telefone:',x+24,y+396,16,ink,{width:80}); text(phone,x+100,y+396,15,ink,{width:445}); dashed(x+100,y+415,x+545,y+415);
      text('Prêmio:',x+24,y+427,16,ink,{width:80}); text(prize,x+100,y+427,15,ink,{width:445}); dashed(x+100,y+446,x+545,y+446);
      text('@reinodasorteoficial',x+24,y+490,11,ink,{width:180}); text('(88) 9 9494-3632',x+215,y+490,11,ink,{width:180});
      const qx=x+620,qy=y+368,qw=155,qh=172;
      doc.save().dash(2,{space:3}).strokeColor({r:156,g:171,b:189}).lineWidth(1.2).rect(qx,qy,qw,qh).stroke().undash().restore();
      text('Acompanhar sorteio',qx+24,qy+8,12,ink,{width:130});
      qr(String(p.publicUrl||'https://admin.reinodasorte.com.br/'),qx+27,qy+42,100);
      const label=String(b?.bookletLabel||((b?.bookletNumber||'-')+'-'+(b?.lotNumber||1)));
      text(label,qx+45,qy+147,16,navy,{width:80});
    };
    for(let i=0;i<items.length;i+=2){
      if(i>0)doc.addPage({size:[W,H],margin:0});
      rect(0,0,W,H,'1 1 1');
      draw(PAD,PAD,items[i]);
      if(items[i+1])draw(PAD+TW+GAP,PAD,items[i+1]);
    }
    doc.end();
    return done;
  }

  async function archive(order,pdf,sentAt=null){
    const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,row={order_id:order.id,seller_id:sid||order.seller_id||null,order_code:String(order.code||''),customer_name:order.customer_name||null,customer_phone:normalizeBR(order.phone||order.contact_phone||'')||null,official_sale_id:String(order.official_sale_id||'')||null,file_name:'bilhetes-'+order.code+'.pdf',mime_type:'application/pdf',pdf_base64:pdf.toString('base64'),sent_at:sentAt,updated_at:nowISO()};
    const ex=await one('rds10_ticket_documents','select=id&order_id=eq.'+encodeURIComponent(order.id));if(ex?.id)await patch('rds10_ticket_documents','id=eq.'+encodeURIComponent(ex.id),row);else await insert('rds10_ticket_documents',row);
  }
  const rawSend=sendToJid;
  sendToJid=async(jid,content)=>{
    try{const m=String(content?.fileName||'').match(/bilhetes-(RDS-[A-Z0-9]{6,12})\.pdf/i);if(m&&content?.document){const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,f=sid?'select=*&code=eq.'+encodeURIComponent(m[1])+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&code=eq.'+encodeURIComponent(m[1]),o=await one('rds10_orders',f);if(o){const b=await pdf(o);await archive(o,b);console.log('[RDS TICKET] modelo oficial aplicado '+o.code);return rawSend(jid,{...content,document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf'});}}}catch(e){console.error('[RDS TICKET] modelo oficial:',e?.message||e);}return rawSend(jid,content);
  };
  app.get('/api/rds/ticket-pdf/:id',async(req,res)=>{
    try{const f='select=*&id=eq.'+encodeURIComponent(req.params.id),o=await one('rds10_orders',f);if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});const b=await pdf(o);await archive(o,b);const d=await one('rds10_ticket_documents','select=*&order_id=eq.'+encodeURIComponent(o.id));if(!d?.pdf_base64)return res.status(404).json({ok:false,error:'PDF não arquivado.'});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="bilhetes-'+o.code+'.pdf"');res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.end(Buffer.from(d.pdf_base64,'base64'));}catch(e){res.status(500).json({ok:false,error:e.message});}
  });
  app.post('/api/rds/ticket-pdf/:id/resend',async(req,res)=>{
    try{const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,f=sid?'select=*&id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&id=eq.'+encodeURIComponent(req.params.id),o=await one('rds10_orders',f);if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});const phone=normalizeBR(o.phone||o.contact_phone||o.official_ticket_payload?.customerPhone||'');if(!phone)throw new Error('Telefone do cliente não informado.');const target=await ensureTargetJid(phone);if(!target?.jid)throw new Error('WhatsApp não localizado.');const b=pdf(o);await archive(o,b,nowISO());const s=await rawSend(target.jid,{document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf',fileName:'bilhetes-'+o.code+'.pdf'});if(!s?.key?.id)throw new Error('WhatsApp não confirmou o envio.');await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+o.code+' — Reenvio manual',status:'ENVIADA',waId:s.key.id,raw:{manualResend:true,order:o.code,saleId:o.official_sale_id||null}});await patch('rds10_ticket_documents','order_id=eq.'+encodeURIComponent(o.id),{sent_at:nowISO(),updated_at:nowISO()}).catch(()=>{});res.json({ok:true,waMessageId:s.key.id});}catch(e){res.status(500).json({ok:false,error:e.message});}
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
    }catch(e){res.status(500).json({ok:false,error:e.message});}
  });
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync('server.js',server,'utf8');
