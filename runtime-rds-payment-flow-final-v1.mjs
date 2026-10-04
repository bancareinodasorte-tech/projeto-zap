import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS PAYMENT FLOW FINAL V1';
if(s.includes(marker)){
  console.log('[RDS] fluxo de pagamento final V1 já aplicado');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=s.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para fluxo final.');

const block=String.raw`
${marker}
function rdsOfficialScheduleFields(draw){const pick=(keys)=>{for(const k of keys){const v=draw?.[k];if(v!==undefined&&v!==null&&String(v).trim()!==''){const d=new Date(v);if(Number.isFinite(d.getTime()))return d.toISOString();}}return null;};return {sales_deadline_at:pick(['salesDeadlineAt','sales_deadline_at','salesDeadline','sales_deadline','salesEndAt','sales_end_at']),campaign_end_at:pick(['campaignEndAt','campaign_end_at','campaignEnd','campaign_end','endAt','end_at','drawEndAt','draw_end_at'])};}
async function rdsFinalHandleOrderForm(identity,order,text){
  const t=cleanText(text);
  if(!order||order.status!=='COLETANDO_DADOS')return;

  if(!Number(order.quantity||0)){
    const m=t.match(/^(?:QUERO\s*)?(\d{1,4})(?:\s*BILHETES?)?$/i);
    const quantity=m?Number(m[1]):0;
    if(!quantity||quantity<1)return replyInbound(identity,'❌ Informe somente a quantidade de bilhetes usando números.\\nExemplo: *1*');
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{quantity,updated_at:nowISO()});
    order.quantity=quantity;
    await replyInbound(identity,'Quantidade: *'+quantity+'* bilhete(s).\\n\\nAgora informe seu *nome completo*.');
    return;
  }

  if(!cleanText(order.customer_name)){
    const name=t.replace(/\s+/g,' ').trim();
    if(name.length<3||/^(CANCELAR|SAIR|REINICIAR)$/i.test(name))return replyInbound(identity,'❌ Informe seu *nome completo* para continuar.');
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{customer_name:name,contact_phone:identity.phone||null,updated_at:nowISO()});
    order.customer_name=name;
    await replyInbound(identity,'Nome recebido: *'+name+'*.\\n\\nAgora informe seu *CPF* com 11 dígitos.');
    return;
  }

  if(!cleanText(order.customer_tax_id)){
    const cpf=digits(t);
    if(!/^\d{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ Informe um CPF válido com 11 dígitos.');
    const quantity=Number(order.quantity||0);
    let officialDraw=null;
    if(typeof rdsFinalRequest==='function'){
      try{
        officialDraw=await rdsFinalRequest('/seller/draw-info');
        const closed=officialDraw?.isDrawClosed===true || officialDraw?.isSalesClosed===true || officialDraw?.salesOpen===false;
        const rawAvailable=officialDraw?.availableBooklets ?? officialDraw?.totalBooklets ?? officialDraw?.bookletsAvailable ?? officialDraw?.availableTickets;
        const available=rawAvailable===null||rawAvailable===undefined||rawAvailable===''?null:Number(rawAvailable);
        const schedule=rdsOfficialScheduleFields(officialDraw);
        await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{
          official_inventory_available:Number.isFinite(available)?available:null,
          official_inventory_checked_at:nowISO(),
          official_inventory_error:null,
          sales_deadline_at:schedule.sales_deadline_at||null,
          campaign_end_at:schedule.campaign_end_at||null,
          updated_at:nowISO()
        }).catch(()=>{});
        if(closed)return replyInbound(identity,'⚠️ *VENDAS ENCERRADAS*\\n\\nO sorteio oficial não está recebendo novas vendas neste momento. Não foi gerada nenhuma cobrança.');
        if(Number.isFinite(available) && available<quantity){
          await addAlert('ESTOQUE_OFICIAL_BAIXO','Venda bloqueada por disponibilidade oficial insuficiente',{order:order.code,requested:quantity,available});
          return replyInbound(identity,'⚠️ *DISPONIBILIDADE INSUFICIENTE*\\n\\nNo momento existem apenas *'+available+'* bilhetes disponíveis para emissão oficial, mas este pedido solicita *'+quantity+'*.\\n\\nNenhum PIX foi gerado. Tente novamente quando houver disponibilidade.');
        }
      }catch(e){
        await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{official_inventory_error:String(e?.message||e).slice(0,1200),official_inventory_checked_at:nowISO(),updated_at:nowISO()}).catch(()=>{});
        await addAlert('ESTOQUE_OFICIAL_NAO_CONSULTADO','Venda bloqueada porque a disponibilidade oficial não pôde ser confirmada',{order:order.code,error:String(e?.message||e)});
        return replyInbound(identity,'⚠️ *NÃO FOI POSSÍVEL CONFIRMAR A DISPONIBILIDADE*\\n\\nO sistema não gerou o PIX para evitar vender bilhetes sem emissão garantida. Tente novamente em alguns instantes.');
      }
    }
    const total=Number((quantity*Number(order.unit_price||3)).toFixed(2));
    if(identity.phone){
      try{
        const existing=await findContact(identity.phone);
        const data={name:order.customer_name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',status:'ATIVO',validated:true,whatsapp_validated:true,last_seen_at:nowISO(),updated_at:nowISO()};
        if(existing)await patch('rds10_contacts','id=eq.'+existing.id,data);else await saveOrMergeContact(data);
      }catch(e){console.error('[RDS] CRM pedido:',e.message);}
    }
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{customer_name:order.customer_name,customer_tax_id:cpf,contact_phone:identity.phone||null,quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',payment_method:'PIX_MERCADO_PAGO',updated_at:nowISO()});
    const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
    if(!fresh)throw new Error('Pedido não encontrado após atualização.');
    let pix;
    try{pix=await rdsMercadoPagoCreatePix(fresh);}
    catch(e){
      await addAlert('MERCADO_PAGO_PIX_FALHA','Falha ao criar PIX — '+fresh.code,{order:fresh.code,error:e.message});
      return replyInbound(identity,'⚠️ *PEDIDO RECEBIDO*\\n\\nSeu pedido '+fresh.code+' foi registrado, mas não foi possível gerar o PIX agora. Não faça nenhum pagamento manual. O sistema tentará novamente quando estiver disponível.');
    }
    if(typeof sendPixToIdentity==='function')await sendPixToIdentity(identity,{...fresh,pix_expires_at:pix?.expires_at||fresh.pix_expires_at},pix);
    else await replyInbound(identity,'💳 *PAGAMENTO PIX — MERCADO PAGO*\\n\\nPedido: *'+fresh.code+'*\\nValor: *R$ '+money(total)+'*\\n\\n*PIX COPIA E COLA:*\\n'+cleanText(pix?.qr?.text||'')+'\\n\\nApós pagar, aguarde a confirmação automática.');
    await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:fresh.code,quantity,total,provider:'MERCADO_PAGO'});
    return;
  }

  return replyInbound(identity,'Seu pedido já está aguardando pagamento. Use o PIX enviado ou consulte o pedido no atendimento.');
}
handleOrderForm=rdsFinalHandleOrderForm;
`;

s=s.slice(0,pos)+block+'\n'+s.slice(pos);
fs.writeFileSync(path,s,'utf8');
console.log('[RDS] fluxo de pagamento final V1 aplicado');
