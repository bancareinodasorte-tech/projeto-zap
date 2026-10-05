import fs from 'node:fs';

const marker='// RDS OFFICIAL TICKET AUTO DELIVERY V2';
let server=fs.readFileSync('server.js','utf8');
if(server.includes(marker)){process.exit(0);}
const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado.');

const block=`
// RDS OFFICIAL TICKET AUTO DELIVERY V2
(()=>{
  const QR=(()=>{try{return require('qrcode');}catch{return null;}})();
  const RDS_Readable=require('node:stream').Readable;
  const logoB64=(()=>{try{const s=fs.readFileSync('runtime-rds-official-ticket-auto-v1.mjs','utf8');const m=s.match(/const RDS_TICKET_LOGO_JPG_B64='([^']+)'/);return m?.[1]||'';}catch{return '';}})();
  const logoBuf=Buffer.from(logoB64,'base64');
  const NL=String.fromCharCode(10);
  const esc=v=>{const bs=String.fromCharCode(92);return Array.from(String(v??'').normalize('NFD')).filter(c=>{const n=c.charCodeAt(0);return n<768||n>879;}).map(c=>{const n=c.charCodeAt(0);return n>=32&&n<=126?c:'?';}).join('').split(bs).join(bs+bs).split('(').join(bs+'(').split(')').join(bs+')');};
  function pdf(order){
    const p=order?.official_ticket_payload||{},books=Array.isArray(p.booklets)?p.booklets:[],items=books.length?books:[{bookletNumber:order.official_sale_id||'-',lotNumber:1,tickets:[]}];
    const sale=String(p.saleId||order.official_sale_id||'-'),name=String(p.customerName||order.customer_name||'-'),phone=String(p.customerPhone||order.phone||order.contact_phone||'-'),seller=String(p.sellerName||'REINO DA SORTE - ESCRITORIO');
    const dd=p.drawDate?new Date(p.drawDate).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'-',sd=p.createdAt?new Date(p.createdAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
    const W=1660,TW=800,TH=560,PAD=20,GAP=20,opsPages=[];
    const t=(o,x,y,s,v,c='0.12 0.17 0.24')=>o.push('BT /F1 '+s+' Tf '+c+' rg 1 0 0 1 '+x.toFixed(1)+' '+y.toFixed(1)+' Tm ('+esc(v)+') Tj ET');
    const r=(o,x,y,w,h,c)=>o.push(c+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const line=(o,x1,y1,x2,y2,c='0.42 0.48 0.56',w=.7)=>o.push(c+' RG '+w+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const border=(o,x,y,w,h)=>o.push('0.61 0.67 0.74 RG 1.2 w [6 4] 0 d '+x+' '+y+' '+w+' '+h+' re S [] 0 d');
    const qr=(o,v,x,y,s)=>{if(!QR)return;try{const q=QR.create(String(v),{errorCorrectionLevel:'M'}),n=q.modules.size,z=s/n;r(o,x-4,y-4,s+8,s+8,'1 1 1');for(let a=0;a<n;a++)for(let b=0;b<n;b++)if(q.modules.get(a,b))r(o,x+b*z,y+(n-1-a)*z,z+.05,z+.05,'0 0 0');}catch{}};
    const draw=(o,x,y,b)=>{
      const top=325,bottom=235,blue='0.78 0.87 0.94',gray='0.94 0.95 0.97',navy='0.09 0.14 0.32',ink='0.12 0.17 0.24',gold='0.78 0.59 0.12';
      r(o,x,y+bottom,TW,top,blue);r(o,x,y,TW,bottom,gray);border(o,x,y,TW,TH);line(o,x,y+bottom,x+TW,y+bottom,gold,1.2);
      t(o,x+24,y+530,18,'Data do Sorteio: '+dd,navy);t(o,x+640,y+530,14,'Data da Venda: '+sd,navy);
      if(logoBuf.length)o.push('q 185 0 0 170 '+(x+24)+' '+(y+285)+' cm /Im1 Do Q');
      t(o,x+24,y+273,10,'JARDIM - CEARÁ',navy);
      const rx=x+225,rw=550;line(o,rx,y+492,rx+rw,y+492,'0.55 0.62 0.72',1);t(o,rx+190,y+503,14,'NÚMEROS DA SORTE',navy);line(o,rx,y+488,rx+rw,y+488,'0.55 0.62 0.72',1);
      const tk=Array.isArray(b?.tickets)?b.tickets:[],bw=(rw-32)/5,bh=28;
      tk.forEach((v,k)=>{const rr=Math.floor(k/5),cc=k%5,bx=rx+cc*(bw+8),by=y+450-rr*36;r(o,bx,by,bw,bh,'1 1 1');const val=String(v).includes('-')?String(v).split('-')[0]:String(v);t(o,bx+Math.max(2,bw/2-val.length*3.1),by+9,12,val,ink);});
      t(o,x+24,y+201,13,'Vendedor: '+seller,ink);t(o,x+24,y+171,14,'Nome: '+name,ink);line(o,x+24,y+162,x+550,y+162);t(o,x+24,y+138,14,'Telefone: '+phone,ink);line(o,x+24,y+129,x+550,y+129);t(o,x+24,y+105,13,'Prêmio: '+String(p.drawTitle||'REINO DA SORTE'),ink);t(o,x+24,y+79,11,'Venda oficial: '+sale+'  |  Bilhete: '+String(b?.bookletNumber||'-')+'-'+String(b?.lotNumber||1),navy);
      t(o,x+24,y+24,11,'@reinodasorteoficial',ink);t(o,x+210,y+24,11,'(88) 9 9494-3632',ink);qr(o,String(p.publicUrl||'https://admin.reinodasorte.com.br/'),x+665,y+52,100);t(o,x+665,y+38,10,'Acompanhar sorteio',navy);t(o,x+665,y+22,16,String(b?.bookletNumber||'-')+'-'+String(b?.lotNumber||1),navy);
    };
    for(let i=0;i<items.length;i+=2){const ops=[],slice=items.slice(i,i+2);r(ops,0,0,W,TH+PAD*2,'1 1 1');slice.forEach((b,j)=>draw(ops,PAD+j*(TW+GAP),PAD,b));opsPages.push(ops);}
    const objs=[{id:1,b:'<< /Type /Catalog /Pages 2 0 R >>'},{id:2,b:null},{id:3,b:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'},{id:4,b:'<< /Type /XObject /Subtype /Image /Width 100 /Height 92 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+logoBuf.length+' >>',raw:logoBuf,tail:NL+'endstream'}];
    let next=5,pids=[],cids=[];opsPages.forEach(()=>{pids.push(next++);cids.push(next++);});objs[1]={id:1,b:'<< /Type /Catalog /Pages 2 0 R >>'};objs[2]={id:2,b:'<< /Type /Pages /Kids ['+pids.map(x=>x+' 0 R').join(' ')+'] /Count '+opsPages.length+' >>'};
    opsPages.forEach((ops,i)=>{objs.push({id:pids[i],b:'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+(TH+PAD*2)+'] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> /Contents '+cids[i]+' 0 R >>'});const body=ops.join(NL)+NL;objs.push({id:cids[i],b:'<< /Length '+Buffer.byteLength(body,'latin1')+' >>'+NL+'stream'+NL+body+'endstream'});});
    objs.sort((a,b)=>a.id-b.id);const chunks=[Buffer.from('%PDF-1.4'+NL,'latin1')],off=[];let total=chunks[0].length;for(const z of objs){off[z.id]=total;const h=Buffer.from(z.id+' 0 obj'+NL+z.b+NL,'latin1');chunks.push(h);total+=h.length;if(z.raw){chunks.push(z.raw);total+=z.raw.length;const tail=Buffer.from(z.tail+'endobj'+NL,'latin1');chunks.push(tail);total+=tail.length;}else{const e=Buffer.from('endobj'+NL,'latin1');chunks.push(e);total+=e.length;}}const xo=total;let x='xref'+NL+'0 '+next+NL+'0000000000 65535 f '+NL;for(let i=1;i<next;i++)x+=String(off[i]||0).padStart(10,'0')+' 00000 n '+NL;x+='trailer'+NL+'<< /Size '+next+' /Root 1 0 R >>'+NL+'startxref'+NL+xo+NL+'%%EOF'+NL;chunks.push(Buffer.from(x,'latin1'));return Buffer.concat(chunks);
  }
  async function archive(order,pdf,sentAt=null){
    const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,row={order_id:order.id,seller_id:sid||order.seller_id||null,order_code:String(order.code||''),customer_name:order.customer_name||null,customer_phone:normalizeBR(order.phone||order.contact_phone||'')||null,official_sale_id:String(order.official_sale_id||'')||null,file_name:'bilhetes-'+order.code+'.pdf',mime_type:'application/pdf',pdf_base64:pdf.toString('base64'),sent_at:sentAt,updated_at:nowISO()};
    const ex=await one('rds10_ticket_documents','select=id&order_id=eq.'+encodeURIComponent(order.id));if(ex?.id)await patch('rds10_ticket_documents','id=eq.'+encodeURIComponent(ex.id),row);else await insert('rds10_ticket_documents',row);
  }
  const rawSend=sendToJid;
  sendToJid=async(jid,content)=>{
    try{const m=String(content?.fileName||'').match(/bilhetes-(RDS-[A-Z0-9]{6,12})\.pdf/i);if(m&&content?.document){const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,f=sid?'select=*&code=eq.'+encodeURIComponent(m[1])+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&code=eq.'+encodeURIComponent(m[1]),o=await one('rds10_orders',f);if(o){const b=pdf(o);await archive(o,b);console.log('[RDS TICKET] modelo oficial aplicado '+o.code);return rawSend(jid,{...content,document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf'});}}}catch(e){console.error('[RDS TICKET] modelo oficial:',e?.message||e);}return rawSend(jid,content);
  };
  app.get('/api/rds/ticket-pdf/:id',async(req,res)=>{
    try{const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,f=sid?'select=*&id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&id=eq.'+encodeURIComponent(req.params.id),o=await one('rds10_orders',f);if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});let d=await one('rds10_ticket_documents','select=*&order_id=eq.'+encodeURIComponent(o.id));if(!d){const b=pdf(o);await archive(o,b);d=await one('rds10_ticket_documents','select=*&order_id=eq.'+encodeURIComponent(o.id));}if(!d?.pdf_base64)return res.status(404).json({ok:false,error:'PDF não arquivado.'});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="bilhetes-'+o.code+'.pdf"');res.end(Buffer.from(d.pdf_base64,'base64'));}catch(e){res.status(500).json({ok:false,error:e.message});}
  });
  app.post('/api/rds/ticket-pdf/:id/resend',async(req,res)=>{
    try{const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,f=sid?'select=*&id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(sid):'select=*&id=eq.'+encodeURIComponent(req.params.id),o=await one('rds10_orders',f);if(!o)return res.status(404).json({ok:false,error:'Pedido não encontrado.'});const phone=normalizeBR(o.phone||o.contact_phone||o.official_ticket_payload?.customerPhone||'');if(!phone)throw new Error('Telefone do cliente não informado.');const target=await ensureTargetJid(phone);if(!target?.jid)throw new Error('WhatsApp não localizado.');const b=pdf(o);await archive(o,b,nowISO());const s=await rawSend(target.jid,{document:{stream:RDS_Readable.from(b)},mimetype:'application/pdf',fileName:'bilhetes-'+o.code+'.pdf'});if(!s?.key?.id)throw new Error('WhatsApp não confirmou o envio.');await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+o.code+' — Reenvio manual',status:'ENVIADA',waId:s.key.id,raw:{manualResend:true,order:o.code,saleId:o.official_sale_id||null}});await patch('rds10_ticket_documents','order_id=eq.'+encodeURIComponent(o.id),{sent_at:nowISO(),updated_at:nowISO()}).catch(()=>{});res.json({ok:true,waMessageId:s.key.id});}catch(e){res.status(500).json({ok:false,error:e.message});}
  });
  app.get('/api/rds/ticket-archive',async(req,res)=>{
    try{const sid=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null,q=String(req.query.search||'').trim();let f=sid?'select=*&seller_id=eq.'+encodeURIComponent(sid):'select=*';if(q)f+='&or=(order_code.ilike.*'+encodeURIComponent(q)+'*,customer_name.ilike.*'+encodeURIComponent(q)+'*,customer_phone.ilike.*'+encodeURIComponent(q)+'*)';f+='&order=created_at.desc&limit=100';res.json({ok:true,rows:await list('rds10_ticket_documents',f)});}catch(e){res.status(500).json({ok:false,error:e.message});}
  });
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync('server.js',server,'utf8');
