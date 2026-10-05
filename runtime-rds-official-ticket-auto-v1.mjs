import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OFFICIAL TICKET AUTO DELIVERY V1';
if(server.includes(marker)){
  console.log('[RDS] emissão automática oficial já aplicada');
  process.exit(0);
}
const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para emissão automática oficial.');

const block=`
// RDS OFFICIAL TICKET AUTO DELIVERY V1
(()=>{
  const NL=String.fromCharCode(10);
  let running=false;

  function firstValue(root,keys){
    for(const key of keys){
      const parts=key.split('.');
      let v=root;
      for(const p of parts)v=v?.[p];
      if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;
    }
    return null;
  }

  function extractSaleInfo(sale){
    const saleId=firstValue(sale,['saleId','id','sale.id','data.saleId','data.id']);
    const pdfUrl=firstValue(sale,['pdfUrl','ticketUrl','downloadUrl','fileUrl','pdf.url','ticket.url','data.pdfUrl','data.ticketUrl']);
    const booklets=firstValue(sale,['booklets','data.booklets']);
    const rawTickets=firstValue(sale,['tickets','data.tickets','ticketNumbers','data.ticketNumbers','numbers','data.numbers']);
    const numbers=Array.isArray(rawTickets)?rawTickets:(Array.isArray(booklets)?booklets.flatMap(b=>Array.isArray(b?.tickets)?b.tickets:[]):null);
    return {saleId:saleId?String(saleId):null,pdfUrl:pdfUrl?String(pdfUrl):null,booklets,numbers};
  }

  function pdfAscii(v){
    return Array.from(String(v??'').normalize('NFD')).filter(ch=>{
      const n=ch.charCodeAt(0);
      return !(n>=768&&n<=879);
    }).map(ch=>{
      const n=ch.charCodeAt(0);
      return n>=32&&n<=126?ch:'?';
    }).join('');
  }
  function pdfEsc(v){
    const bs=String.fromCharCode(92);
    return pdfAscii(v).split(bs).join(bs+bs).split('(').join(bs+'(').split(')').join(bs+')');
  }
  function buildTicketPdf(order,info){
    const NL=String.fromCharCode(10);
    const payload=order?.official_ticket_payload&&typeof order.official_ticket_payload==='object'?order.official_ticket_payload:{};
    const booklets=Array.isArray(info?.booklets)?info.booklets:[];
    const numbers=Array.isArray(info?.numbers)?info.numbers:[];
    const tickets=numbers.map(v=>String(v??'').trim()).filter(Boolean);
    const drawDate=payload.drawDate?new Date(payload.drawDate):null;
    const drawDateText=drawDate&&!Number.isNaN(drawDate.getTime())?drawDate.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'-';
    const lines=[
      'REINO DA SORTE',
      'BILHETES DA VENDA OFICIAL',
      '',
      'Pedido: '+String(order?.code||'-'),
      'Venda oficial: '+String(info?.saleId||payload.saleId||order?.official_sale_id||'-'),
      'Cliente: '+String(order?.customer_name||payload.customerName||'-'),
      'Sorteio: '+String(payload.drawTitle||'-'),
      'Data do sorteio: '+drawDateText,
      'Bloco(s): '+(booklets.length?booklets.map(b=>String(b?.bookletNumber||'-')).join(', '):'-'),
      'Quantidade de bilhetes: '+String(tickets.length||payload.totalTickets||'-'),
      '',
      'NUMEROS DOS BILHETES'
    ];
    const perCol=Math.max(1,Math.ceil(tickets.length/2));
    const left=tickets.slice(0,perCol),right=tickets.slice(perCol);
    for(let i=0;i<perCol;i++)lines.push(String(i+1).padStart(2,'0')+'. '+(left[i]||'').padEnd(18,' ')+'    '+(right[i]?String(i+1+perCol).padStart(2,'0')+'. '+right[i]:''));
    lines.push('');
    lines.push('Valor pago: R$ '+String(payload.totalAmount||order?.total_amount||'-'));
    lines.push('Valor por bilhete: R$ '+String(payload.pricePerTicket||order?.unit_price||'-'));
    lines.push('');
    lines.push('PDF gerado automaticamente a partir dos numeros retornados');
    lines.push('pela emissao oficial da REINO DA SORTE. Nao altera a venda oficial.');
    if(payload.publicUrl){
      lines.push('');
      lines.push('Consulta oficial:');
      lines.push(String(payload.publicUrl));
    }

    const pageW=595,pageH=842,margin=42;
    const ops=[];
    const text=(x,y,size,value)=>ops.push('BT /F1 '+size+' Tf 0 0 0 rg 1 0 0 1 '+x+' '+y+' Tm ('+pdfEsc(value)+') Tj ET');
    const line=(x1,y1,x2,y2)=>ops.push(x1+' '+y1+' m '+x2+' '+y2+' l S');
    text(margin,800,18,lines[0]);
    text(margin,776,13,lines[1]);
    let y=748;
    for(let i=2;i<lines.length;i++){
      text(margin,y,i===12?12:10,lines[i]);
      y-=i===12?24:17;
      if(y<55)break;
    }
    line(margin,760,pageW-margin,760);
    line(margin,55,pageW-margin,55);

    const content=ops.join(NL)+NL;
    const objects=[
      null,
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW+' '+pageH+'] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length '+Buffer.byteLength(content,'latin1')+' >>'+NL+'stream'+NL+content+'endstream'
    ];
    const chunks=[Buffer.from('%PDF-1.4'+NL,'latin1')];
    const offsets=[0];
    let total=chunks[0].length;
    for(let i=1;i<objects.length;i++){
      offsets[i]=total;
      const b=Buffer.from(i+' 0 obj'+NL+objects[i]+NL+'endobj'+NL,'latin1');
      chunks.push(b);total+=b.length;
    }
    const xrefOffset=total;
    let xref='xref'+NL+'0 '+objects.length+NL+'0000000000 65535 f '+NL;
    for(let i=1;i<objects.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n '+NL;
    xref+='trailer'+NL+'<< /Size '+objects.length+' /Root 1 0 R >>'+NL+'startxref'+NL+xrefOffset+NL+'%%EOF'+NL;
    chunks.push(Buffer.from(xref,'latin1'));
    return Buffer.concat(chunks);
  }

  function ticketText(order,info){
    const lines=[
      '🎟️ *BILHETES GERADOS*','',
      'Pedido: *'+order.code+'*',
      'Cliente: *'+cleanText(order.customer_name||'Cliente')+'*'
    ];
    if(info.saleId)lines.push('Venda oficial: *'+info.saleId+'*');
    const list=Array.isArray(info.numbers)?info.numbers:[];
    if(list.length){
      lines.push('', '🎫 *Bilhetes:*');
      for(const item of list)lines.push('• '+cleanText(item));
    }else if(Array.isArray(info.booklets)&&info.booklets.length){
      lines.push('', '🎫 *Blocos:*');
      for(const item of info.booklets)lines.push('• Bloco '+cleanText(firstValue(item,['bookletNumber','number','code','id'])||'—'));
    }
    lines.push('','✅ Pagamento confirmado e bilhetes emitidos pelo sistema oficial REINO DA SORTE.','Boa sorte! 🍀');
    return lines.join(NL);
  }

  async function sendOfficialProof(order,info){
    const phone=normalizeBR(order.phone||order.contact_phone||'');
    if(!phone)throw new Error('Telefone do cliente não informado.');
    const target=await ensureTargetJid(phone);
    const caption=ticketText(order,info);
    if(info.pdfUrl){
      const r=await sendToJid(target.jid,{
        document:{url:info.pdfUrl},
        mimetype:'application/pdf',
        fileName:'bilhetes-'+order.code+'.pdf',
        caption
      });
      await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+order.code+' — Venda oficial: '+String(info.saleId||''),status:'ENVIADA',waId:r?.key?.id,raw:{jid:target.jid,automatic:true,order:order.code,saleId:info.saleId,pdfUrl:info.pdfUrl}});
      return r;
    }
    const pdf=buildTicketPdf(order,info);
    if(!pdf?.length)throw new Error('Não foi possível gerar o PDF dos bilhetes oficiais.');
    const r=await sendToJid(target.jid,{
      document:pdf,
      mimetype:'application/pdf',
      fileName:'bilhetes-'+order.code+'.pdf',
      caption
    });
    await logMessage({phone,direction:'OUT',type:'document',body:'PDF DOS BILHETES — Pedido: '+order.code+' — Venda oficial: '+String(info.saleId||''),status:'ENVIADA',waId:r?.key?.id,raw:{jid:target.jid,automatic:true,order:order.code,saleId:info.saleId,pdfFallback:true,publicUrl:order?.official_ticket_payload?.publicUrl||null}});
    return r;
  }

  async function issueOne(order){
    if(!order?.id)return;
    if(['EMITIDO','EMITIDO_AGUARDANDO_ENVIO','CONCLUIDO','AGUARDANDO_AUTORIZACAO'].includes(String(order.official_issue_status||'')))return;
    if(String(order.status||'')!=='PAGO_AGUARDANDO_BILHETES')return;
    console.log('[RDS AUTO] processando pedido pago '+String(order.code||order.id)+' status='+String(order.official_issue_status||'—'));

    const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
    if(sellerId&&String(order.seller_id||'')!==String(sellerId))return;
    if(String(order.official_issue_status||'')==='EMITINDO'){
      const age=Date.now()-new Date(order.updated_at||0).getTime();
      if(order.official_sale_id || !Number.isFinite(age) || age<5*60*1000)return;
      console.warn('[RDS AUTO] recuperando emissão EMITINDO sem venda oficial '+String(order.code||order.id));
      await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{official_issue_status:null,official_issue_error:null,updated_at:nowISO()});
      order.official_issue_status=null;
    }
    const previousIssueStatus=String(order.official_issue_status||'');

    await patch('rds10_orders','id=eq.'+order.id,{official_issue_status:'EMITINDO',official_issue_error:null,updated_at:nowISO()});

    try{
      if(typeof rdsFinalRequest!=='function')throw new Error('Integração oficial REINO DA SORTE indisponível no runtime.');
      const draw=await rdsFinalRequest('/seller/draw-info');
      if(!draw||draw.isDrawClosed||draw.isSalesClosed||draw.salesOpen===false){
        const msg='Sorteio/vendas oficiais encerrados ou indisponíveis para novas emissões.';
        if(previousIssueStatus!=='AGUARDANDO_CAMPANHA')await addAlert('PEDIDO_PAGO_AGUARDANDO_CAMPANHA','Pedido pago aguardando validação da campanha oficial — '+order.code,{order:order.code});
        await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{official_issue_status:'AGUARDANDO_CAMPANHA',official_issue_error:msg,updated_at:nowISO()});
        return;
      }
      const quantity=Math.max(1,Math.floor(Number(order.quantity||0)));
      const rawAvailable=draw?.availableBooklets ?? draw?.totalBooklets ?? draw?.bookletsAvailable ?? draw?.availableTickets;
      const available=rawAvailable===null||rawAvailable===undefined||rawAvailable===''?null:Number(rawAvailable);
      await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{
        official_inventory_available:Number.isFinite(available)?available:null,
        official_inventory_checked_at:nowISO(),
        official_inventory_error:null,
        updated_at:nowISO()
      }).catch(()=>{});
      if(Number.isFinite(available) && available<quantity){
        await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{
          official_issue_status:'AGUARDANDO_ESTOQUE',
          official_issue_error:'Disponibilidade oficial insuficiente: '+available+' disponível(eis) para '+quantity+' solicitado(s).',
          updated_at:nowISO()
        });
        if(previousIssueStatus!=='AGUARDANDO_ESTOQUE')await addAlert('PEDIDO_PAGO_AGUARDANDO_ESTOQUE','Pedido pago aguardando disponibilidade oficial — '+order.code,{order:order.code,requested:quantity,available});
        if(previousIssueStatus!=='AGUARDANDO_ESTOQUE')await logEvent('PEDIDO_PAGO_AGUARDANDO_ESTOQUE',{order:order.code,order_id:order.id,requested:quantity,available});
        return;
      }
      const sale=await rdsFinalRequest('/seller/booklet-sales-v2',{
        method:'POST',
        body:JSON.stringify({
          drawId:draw.drawId,
          customerName:cleanText(order.customer_name),
          customerPhone:normalizeBR(order.phone||order.contact_phone),
          quantityBooklets:quantity,
          lotNumber:1,
          paymentMethod:(/^(pix|pix_mercado_pago|pix_mercadopago)$/i.test(String(order.payment_method||''))?'pix':String(order.payment_method||'pix').toLowerCase())
        })
      });
      const info=extractSaleInfo(sale);
      if(!info.saleId)throw new Error('Sistema oficial não retornou o identificador da venda.');

      await patch('rds10_orders','id=eq.'+order.id,{
        official_sale_id:info.saleId,
        official_issue_status:'EMITIDO',
        official_issue_at:nowISO(),
        official_ticket_url:info.pdfUrl||null,
        official_ticket_payload:sale||null,
        official_issue_error:null,
        updated_at:nowISO()
      });
      await logEvent('BILHETES_EMITIDOS_AUTOMATICAMENTE',{order:order.code,order_id:order.id,sale_id:info.saleId,provider:'REINO_DA_SORTE'});

      try{
        await sendOfficialProof(order,info);
        await patch('rds10_orders','id=eq.'+order.id,{status:'CONCLUIDO',completed_at:nowISO(),official_issue_status:'CONCLUIDO',updated_at:nowISO()});
        await logEvent('BILHETES_ENVIADOS_AUTOMATICAMENTE',{order:order.code,order_id:order.id,sale_id:info.saleId,phone:order.phone});
      }catch(e){
        await patch('rds10_orders','id=eq.'+order.id,{official_issue_status:'EMITIDO_AGUARDANDO_ENVIO',official_issue_error:String(e?.message||e),updated_at:nowISO()});
        await addAlert('BILHETES_EMITIDOS_ENVIO_PENDENTE','Bilhetes emitidos mas não enviados — '+order.code,{order:order.code,saleId:info.saleId,error:String(e?.message||e)});
      }
    }catch(e){
      const err=String(e?.message||e);
      console.error('[RDS AUTO] falha na emissão '+String(order.code||order.id)+': '+err);
      const unauthorized=/dispositivo não está autorizado|dispositivo nao esta autorizado|device.*not.*authoriz|not authorized/i.test(err);
      if(unauthorized){
        await patch('rds10_orders','id=eq.'+order.id,{
          official_issue_status:'AGUARDANDO_AUTORIZACAO',
          official_issue_error:'O dispositivo do servidor oficial precisa ser autorizado novamente.',
          updated_at:nowISO()
        });
        if(previousIssueStatus!=='AGUARDANDO_AUTORIZACAO'){
          await addAlert('EMISSAO_OFICIAL_AGUARDANDO_AUTORIZACAO','Autorização do dispositivo oficial necessária — '+order.code,{order:order.code,error:err});
          await logEvent('EMISSAO_OFICIAL_AGUARDANDO_AUTORIZACAO',{order:order.code,order_id:order.id,error:err});
        }
      }else{
        await patch('rds10_orders','id=eq.'+order.id,{official_issue_status:'ERRO',official_issue_error:err,updated_at:nowISO()});
        await addAlert('EMISSAO_OFICIAL_FALHA','Falha na emissão oficial — '+order.code,{order:order.code,error:err});
        await logEvent('ERRO_EMISSAO_OFICIAL',{order:order.code,order_id:order.id,error:err});
      }
    }
  }

  async function officialProofAlreadySent(order,info){
    const phone=normalizeBR(order.phone||order.contact_phone||'');
    const saleId=String(info?.saleId||order.official_sale_id||'').trim();
    if(!phone||!saleId)return false;
    try{
      const rows=await list('rds10_messages','select=body,created_at&phone=eq.'+encodeURIComponent(phone)+'&direction=eq.OUT&status=eq.ENVIADA&order=created_at.desc&limit=50');
      const code=String(order.code||'');
      return rows.some(m=>{
        const body=String(m?.body||'');
        const type=String(m?.type||'');
        return type==='document'&&body.includes('PDF DOS BILHETES')&&body.includes(code)&&body.includes(saleId);
      });
    }catch{return false;}
  }

  async function repairMissingOfficialPdfs(){
    try{
      const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
      const filter=sellerId
        ? 'select=*&status=eq.CONCLUIDO&official_sale_id=not.is.null&official_ticket_url=is.null&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=completed_at.desc&limit=20'
        : 'select=*&status=eq.CONCLUIDO&official_sale_id=not.is.null&official_ticket_url=is.null&order=completed_at.desc&limit=20';
      const rows=await list('rds10_orders',filter).catch(()=>[]);
      for(const o of rows){
        const info=extractSaleInfo(o.official_ticket_payload||{saleId:o.official_sale_id,pdfUrl:o.official_ticket_url});
        if(!info.saleId||!Array.isArray(info.numbers)||!info.numbers.length)continue;
        if(await officialProofAlreadySent(o,info))continue;
        try{
          await sendOfficialProof(o,info);
          await logEvent('BILHETES_PDF_ENVIADOS_AUTOMATICAMENTE',{order:o.code,order_id:o.id,sale_id:info.saleId,source:info.pdfUrl?'OFICIAL_URL':'PDF_GERADO_A_PARTIR_DOS_DADOS_OFICIAIS'});
          console.log('[RDS AUTO] PDF de bilhetes enviado para '+String(o.code||o.id));
        }catch(e){
          console.error('[RDS AUTO] falha no PDF de '+String(o.code||o.id)+': '+String(e?.message||e));
        }
      }
    }catch(e){console.error('[RDS AUTO] reparo de PDFs:',e?.message||e);}
  }

  async function retryOfficialDelivery(){
    if(running)return;
    running=true;
    console.log('[RDS AUTO] ciclo de emissão automática iniciado; WhatsApp='+String(connected));
    try{
      const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
      const issueFilter='&or=(official_issue_status.is.null,official_issue_status.not.in.(AGUARDANDO_AUTORIZACAO))';
      const filter=sellerId
        ? 'select=*&status=eq.PAGO_AGUARDANDO_BILHETES&seller_id=eq.'+encodeURIComponent(sellerId)+issueFilter+'&order=updated_at.asc&limit=50'
        : 'select=*&status=eq.PAGO_AGUARDANDO_BILHETES'+issueFilter+'&order=updated_at.asc&limit=50';
      const rows=await list('rds10_orders',filter);
      for(const o of rows)await issueOne(o);

      // Pedidos pagos que aguardam autorização só voltam à fila quando a sessão oficial estiver válida.
      const authPendingFilter=sellerId
        ? 'select=*&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.AGUARDANDO_AUTORIZACAO&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=updated_at.asc&limit=20'
        : 'select=*&status=eq.PAGO_AGUARDANDO_BILHETES&official_issue_status=eq.AGUARDANDO_AUTORIZACAO&order=updated_at.asc&limit=20';
      const authPending=await list('rds10_orders',authPendingFilter).catch(()=>[]);
      if(authPending.length){
        try{
          if(typeof rdsFinalRequest==='function') await rdsFinalRequest('/auth/me');
          for(const o of authPending){
            await patch('rds10_orders','id=eq.'+encodeURIComponent(o.id),{official_issue_status:null,official_issue_error:null,updated_at:nowISO()}).catch(()=>{});
            await issueOne({...o,official_issue_status:null});
          }
        }catch{}
      }

      const pendingFilter=sellerId
        ? 'select=*&official_issue_status=eq.EMITIDO_AGUARDANDO_ENVIO&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=updated_at.asc&limit=20'
        : 'select=*&official_issue_status=eq.EMITIDO_AGUARDANDO_ENVIO&order=updated_at.asc&limit=20';
      const pending=await list('rds10_orders',pendingFilter).catch(()=>[]);
      for(const o of pending){
        try{
          const info=extractSaleInfo(o.official_ticket_payload||{saleId:o.official_sale_id,pdfUrl:o.official_ticket_url});
          if(await officialProofAlreadySent(o,info)){
            await patch('rds10_orders','id=eq.'+o.id,{status:'CONCLUIDO',completed_at:nowISO(),official_issue_status:'CONCLUIDO',official_issue_error:null,updated_at:nowISO()});
            console.log('[RDS AUTO] envio oficial já registrado; concluindo '+String(o.code||o.id));
            continue;
          }
          await sendOfficialProof(o,info);
          await patch('rds10_orders','id=eq.'+o.id,{status:'CONCLUIDO',completed_at:nowISO(),official_issue_status:'CONCLUIDO',official_issue_error:null,updated_at:nowISO()});
        }catch(e){
          await patch('rds10_orders','id=eq.'+o.id,{official_issue_error:String(e?.message||e),updated_at:nowISO()}).catch(()=>{});
        }
      }
    }catch(e){console.error('[RDS] emissão automática:',e?.message||e);}
    try{ await repairMissingOfficialPdfs(); }catch(e){ console.error('[RDS AUTO] PDF de bilhetes:',e?.message||e); }
    finally{console.log('[RDS AUTO] ciclo de emissão automática finalizado');running=false;}
  }

  setTimeout(()=>retryOfficialDelivery().catch(()=>{}),12000);
  setInterval(()=>retryOfficialDelivery().catch(()=>{}),30000);
  app.get('/api/v1012/official-sales/auto-status',async(req,res)=>{
    try{
      const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
      const filter=sellerId
        ? 'select=id,code,status,official_sale_id,official_issue_status,official_issue_error,official_ticket_url,official_issue_at,official_inventory_available,official_inventory_checked_at&status=eq.PAGO_AGUARDANDO_BILHETES&seller_id=eq.'+encodeURIComponent(sellerId)+'&order=updated_at.asc&limit=100'
        : 'select=id,code,status,official_sale_id,official_issue_status,official_issue_error,official_ticket_url,official_issue_at,official_inventory_available,official_inventory_checked_at&status=eq.PAGO_AGUARDANDO_BILHETES&order=updated_at.asc&limit=100';
      const rows=await list('rds10_orders',filter);
      res.json({ok:true,sellerId,pending:rows});
    }catch(e){res.status(500).json({ok:false,error:e.message});}
  });
})();
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] emissão automática oficial instalada');
