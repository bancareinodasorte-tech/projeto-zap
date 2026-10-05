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
    const booklets=firstValue(sale,['booklets','tickets','data.booklets','data.tickets']);
    const numbers=firstValue(sale,['ticketNumbers','bookletNumbers','numbers','data.ticketNumbers','data.bookletNumbers']);
    return {saleId:saleId?String(saleId):null,pdfUrl:pdfUrl?String(pdfUrl):null,booklets,numbers};
  }

  function ticketText(order,info){
    const lines=[
      '🎟️ *BILHETES GERADOS*','',
      'Pedido: *'+order.code+'*',
      'Cliente: *'+cleanText(order.customer_name||'Cliente')+'*'
    ];
    if(info.saleId)lines.push('Venda oficial: *'+info.saleId+'*');
    const list=Array.isArray(info.numbers)?info.numbers:Array.isArray(info.booklets)?info.booklets:null;
    if(list?.length){
      lines.push('', '🎫 *Bilhetes:*');
      for(const item of list){
        if(item&&typeof item==='object'){
          const n=firstValue(item,['number','ticketNumber','bookletNumber','code','id']);
          lines.push('• '+cleanText(n||JSON.stringify(item)));
        }else lines.push('• '+cleanText(item));
      }
    }
    lines.push('','✅ Pagamento confirmado e bilhetes emitidos pelo sistema oficial REINO DA SORTE.','Boa sorte! 🍀');
    return lines.join(NL);
  }

  async function sendOfficialProof(order,info){
    const phone=normalizeBR(order.phone||order.contact_phone||'');
    if(!phone)throw new Error('Telefone do cliente não informado.');
    const target=await ensureTargetJid(phone);
    if(info.pdfUrl){
      const r=await sendToJid(target.jid,{
        document:{url:info.pdfUrl},
        mimetype:'application/pdf',
        fileName:'bilhetes-'+order.code+'.pdf',
        caption:ticketText(order,info)
      });
      await logMessage({phone,direction:'OUT',type:'document',body:'Bilhetes gerados — '+order.code,status:'ENVIADA',waId:r?.key?.id,raw:{jid:target.jid,automatic:true,order:order.code,saleId:info.saleId,pdfUrl:info.pdfUrl}});
      return r;
    }
    const text=ticketText(order,info);
    const r=await sendToJid(target.jid,{text});
    await logMessage({phone,direction:'OUT',type:'text',body:text,status:'ENVIADA',waId:r?.key?.id,raw:{jid:target.jid,automatic:true,order:order.code,saleId:info.saleId}});
    return r;
  }

  async function issueOne(order){
    if(!order?.id)return;
    if(['EMITIDO','EMITIDO_AGUARDANDO_ENVIO','CONCLUIDO','AGUARDANDO_AUTORIZACAO'].includes(String(order.official_issue_status||'')))return;
    if(String(order.status||'')!=='PAGO_AGUARDANDO_BILHETES')return;
    console.log('[RDS AUTO] processando pedido pago '+String(order.code||order.id)+' status='+String(order.official_issue_status||'—'));

    const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;
    if(sellerId&&String(order.seller_id||'')!==String(sellerId))return;
    if(String(order.official_issue_status||'')==='EMITINDO')return;
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
          paymentMethod:String(order.payment_method||'pix').toLowerCase()
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
        await patch('rds10_orders','id=eq.'+order.id,{status:'CONCLUIDO',tickets_sent_at:nowISO(),completed_at:nowISO(),official_issue_status:'CONCLUIDO',updated_at:nowISO()});
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
          await sendOfficialProof(o,info);
          await patch('rds10_orders','id=eq.'+o.id,{status:'CONCLUIDO',tickets_sent_at:nowISO(),completed_at:nowISO(),official_issue_status:'CONCLUIDO',official_issue_error:null,updated_at:nowISO()});
        }catch(e){
          await patch('rds10_orders','id=eq.'+o.id,{official_issue_error:String(e?.message||e),updated_at:nowISO()}).catch(()=>{});
        }
      }
    }catch(e){console.error('[RDS] emissão automática:',e?.message||e);}
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
