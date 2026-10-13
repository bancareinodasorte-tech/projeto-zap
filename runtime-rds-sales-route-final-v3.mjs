import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS SALES ROUTE FINAL V3';
if(server.includes(marker)){
  console.log('[RDS] rota comercial final V3 já aplicada');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para rota comercial final V3.');

const block=`
// RDS SALES ROUTE FINAL V3
(()=>{
  const NL=String.fromCharCode(10);
  const cleanName=v=>cleanText(v).split(' ').filter(Boolean).join(' ').trim();
  const cleanCpf=v=>digits(v);
  const qtyFrom=v=>{
    const t=cleanText(v).toLowerCase();
    if(!/^[0-9]+(?: *(?:bilhete|bilhetes))?$/.test(t))return 0;
    const n=Number((t.match(/^[0-9]+/)||[])[0]||0);
    return Number.isInteger(n)&&n>0?n:0;
  };
  const confirmText=o=>[
    '✅ *CONFIRA OS DADOS DO PEDIDO*','',
    '👤 Nome: '+cleanText(o.customer_name||''),
    '🎟️ Quantidade: '+Number(o.quantity||0)+' bilhete(s)',
    '💰 Total: *R$ '+money(Number(o.total_amount||0))+'*','',
    'Os dados estão corretos?','',
    '1️⃣ *SIM, CONFIRMAR*',
    '2️⃣ *EDITAR*'
  ].join(NL);
  const editText=[
    '✏️ *EDITAR DADOS DO PEDIDO*','',
    '1️⃣ Quantidade',
    '2️⃣ Nome',
    '3️⃣ Todos',
    '4️⃣ Voltar','',
    'Digite o número do dado que deseja alterar.'
  ].join(NL);

  async function saveOrderContact(identity,order){
    if(!identity?.phone)return;
    try{
      const data={
        name:cleanText(order.customer_name),
        phone:identity.phone,
        group_name:'CLIENTES',
        origin:'PEDIDO',
        status:'ATIVO',
        validated:true,
        whatsapp_validated:true,
        last_seen_at:nowISO(),
        updated_at:nowISO()
      };
      await saveOrMergeContact(data,{preferExisting:true});
    }catch(e){console.warn('[RDS] CRM do pedido:',e?.message||e);}
  }

  async function rdsAvailableOfficialDraws(){
    const raw=await rdsFinalRequest('/draws/seller/available');
    const items=Array.isArray(raw)?raw:Array.isArray(raw?.draws)?raw.draws:Array.isArray(raw?.items)?raw.items:Array.isArray(raw?.data)?raw.data:Array.isArray(raw?.data?.draws)?raw.data.draws:Array.isArray(raw?.result?.draws)?raw.result.draws:[];
    const byId=new Map();
    for(const d of items){
      const id=String(d?.drawId??d?.external_draw_id??d?.draw_id??d?.id??d?.sorteioId??'').trim();
      if(!id)continue;
      const status=String(d?.status||'').toUpperCase();
      const drawStatus=String(d?.drawStatus||d?.draw_status||'').toUpperCase();if(d?.isDrawClosed===true||d?.isSalesClosed===true||d?.salesOpen===false||d?.active===false||d?.isActive===false||/CLOSED|ENCERRADO|FECHADO|INATIVO/.test(status)||/CLOSED|ENCERRADO|FECHADO|INATIVO/.test(drawStatus))continue;
      const prior=byId.get(id)||{};
      byId.set(id,{...prior,...d,drawId:id,drawTitle:String(d?.drawTitle||d?.title||d?.name||d?.description||('Sorteio '+id))});
    }
    return [...byId.values()];
  }
  function rdsDrawSelectionMessage(draws){
    const lines=['🎟️ *ESCOLHA O SORTEIO*',''];
    for(const d of draws){
      const id=String(d.drawId);
      const date=d.drawDate||d.drawAt||d.date;
      const when=date?new Date(date).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
      lines.push('🎟️ *'+cleanText(d.drawTitle||('Sorteio '+id))+'*');
      lines.push('Código do sorteio: *'+id+'*');
      lines.push('Data do sorteio: *'+(when||'Não informada')+'*');
      lines.push('');
    }
    lines.push('','Digite o *código do sorteio* desejado para continuar.');
    return lines.join(NL);
  }
  async function rdsApplyDrawSelection(identity,order,draws){
    if(!draws.length){
      await replyInbound(identity,'⚠️ *NENHUM SORTEIO DISPONÍVEL*'+NL+NL+'Não registrei uma nova compra porque não encontrei sorteio oficial aberto para venda. Tente novamente quando o sorteio estiver liberado.');
      return true;
    }
    if(draws.length===1){
      const d=draws[0];
      const saved=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.COLETANDO_DADOS',{
        official_draw_id:String(d.drawId),
        official_draw_title:cleanText(d.drawTitle||('Sorteio '+d.drawId)),
        guided_step:'QUANTIDADE',
        status:'COLETANDO_DADOS',
        updated_at:nowISO()
      });
      if(!saved?.length){
        await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.COLETANDO_DADOS',{status:'CANCELADO',cancel_reason:'SORTEIO_NAO_VINCULADO',cancelled_at:nowISO(),guided_step:null,updated_at:nowISO()}).catch(()=>{});
        await replyInbound(identity,'⚠️ Não consegui vincular o pedido ao sorteio oficial. Nenhum pagamento foi solicitado. Tente novamente mais tarde.');
        return true;
      }
      await replyInbound(identity,'🍀 Olá! Vamos iniciar seu pedido.');
      await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*'+NL+NL+'⚠️ *ATENÇÃO* ⚠️'+NL+NL+'✅ *Nome* deve ter mínimo 4 caracteres.');
      await replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
      return true;
    }
    const saved=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.COLETANDO_DADOS',{guided_step:'SORTEIO',updated_at:nowISO()});
    if(!saved?.length){await replyInbound(identity,'⚠️ Não consegui preparar a seleção do sorteio. Nenhum pagamento será solicitado. Tente novamente.');return true;}
    await replyInbound(identity,rdsDrawSelectionMessage(draws));
    return true;
  }
  async function startFinalPurchase(identity){
    const phone=normalizeBR(identity?.phone||'');
    if(!phone)return false;
    let order=await activeOrder(phone);
    if(order){
      if(order.status==='COLETANDO_DADOS'&&!order.official_draw_id&&!order.campaign_id){
        let draws=[];
        try{draws=await rdsAvailableOfficialDraws();}catch(e){await replyInbound(identity,'⚠️ Não consegui consultar os sorteios oficiais agora. Nenhum pagamento será solicitado. Tente novamente em instantes.');return true;}
        return rdsApplyDrawSelection(identity,order,draws);
      }
      return rdsFinalHandleInbound(identity,order,'');
    }
    let draws=[];
    try{draws=await rdsAvailableOfficialDraws();}catch(e){
      await replyInbound(identity,'⚠️ Não consegui consultar os sorteios oficiais agora. Nenhum pedido novo foi registrado e nenhum pagamento será solicitado. Tente novamente em instantes.');
      return true;
    }
    if(!draws.length){
      await replyInbound(identity,'⚠️ *NENHUM SORTEIO DISPONÍVEL*'+NL+NL+'No momento não encontrei sorteio oficial aberto para venda. Não registrei pedido nem gerei cobrança.');
      return true;
    }
    order=await createOrder(phone,null);
    if(!order)throw new Error('Não foi possível criar o pedido.');
    await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id),{status:'COLETANDO_DADOS',updated_at:nowISO()});
    await logMessage({phone,direction:'IN',type:'text',body:'COMPRAR',status:'RECEBIDA',created_at:nowISO()});
    await logEvent('PEDIDO_INICIADO',{phone,order:order.code,stage:'COMPRA_GUIADA_V3'});
    await rdsApplyDrawSelection(identity,order,draws);
    return true;
  }

  async function confirmFinalPurchase(identity,order){
    const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
    if(!fresh)throw new Error('Pedido não encontrado.');
    const quantity=Number(fresh.quantity||0);
    const name=cleanName(fresh.customer_name);
    const cpf=cleanCpf(fresh.customer_tax_id);
    if(!quantity||quantity<1||name.length<4){
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});
      return replyInbound(identity,'⚠️ Os dados do pedido estão incompletos. Escolha *2 — EDITAR* para corrigir.');
    }
    if(!String(fresh.official_draw_id||'').trim()){
      const draws=await rdsAvailableOfficialDraws().catch(()=>[]);
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'SORTEIO',updated_at:nowISO()});
      return rdsApplyDrawSelection(identity,fresh,draws);
    }
    let availableDraws=[];
    try{availableDraws=await rdsAvailableOfficialDraws();}catch(e){
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});
      await replyInbound(identity,'⚠️ Não consegui validar o sorteio e o estoque oficiais agora. Nenhuma cobrança foi gerada. Tente confirmar novamente em instantes.');
      return true;
    }
    const selectedDraw=availableDraws.find(d=>String(d.drawId)===String(fresh.official_draw_id));
    if(!selectedDraw){
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'SORTEIO',updated_at:nowISO()});
      await replyInbound(identity,'⚠️ O sorteio escolhido não está mais disponível para venda. Escolha um sorteio aberto para continuar.');
      return rdsApplyDrawSelection(identity,fresh,availableDraws);
    }
    const rawStock=selectedDraw.availableBooklets??selectedDraw.bookletsAvailable??selectedDraw.availableTickets??selectedDraw.remainingBooklets??selectedDraw.remainingTickets??selectedDraw.available??selectedDraw.count;
    const available=rawStock===null||rawStock===undefined||rawStock===''?null:Number(rawStock);
    if(Number.isFinite(available)&&available<quantity){
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'QUANTIDADE',updated_at:nowISO()});
      await replyInbound(identity,'⚠️ O estoque oficial disponível é de *'+available+'* bloco(s), mas você selecionou *'+quantity+'*. Nenhuma cobrança foi gerada.'+NL+NL+'🎟️ Digite uma quantidade menor ou igual a *'+available+'*.');
      return true;
    }
    const total=Number((quantity*Number(fresh.unit_price||3)).toFixed(2));
    const claimed=await patch('rds10_orders','id=eq.'+encodeURIComponent(fresh.id)+'&status=eq.COLETANDO_DADOS&guided_step=eq.PROCESSANDO',{
      customer_name:name,
      customer_tax_id:cpf||null,
      contact_phone:identity.phone||fresh.phone||null,
      quantity,
      total_amount:total,
      status:'AGUARDANDO_PAGAMENTO',
      payment_method:'PIX_MERCADO_PAGO',
      guided_step:null,
      updated_at:nowISO()
    });
    if(!Array.isArray(claimed)||claimed.length===0){
      await replyInbound(identity,'ℹ️ Este pedido já está sendo processado. Não gerei uma nova cobrança. Aguarde a atualização do pedido no painel.');
      return true;
    }
    const ready=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(fresh.id));
    await saveOrderContact(identity,ready||fresh);
    let pix=null;
    try{
      pix=await rdsMercadoPagoCreatePix(ready||fresh);
    }catch(e){
      await addAlert('MERCADO_PAGO_PIX_FALHA','Falha ao criar PIX — '+fresh.code,{order:fresh.code,error:e?.message||String(e)});
      await logEvent('MERCADO_PAGO_PIX_FALHA',{phone:identity.phone,order:fresh.code,error:e?.message||String(e)});
      await replyInbound(identity,'⚠️ *PEDIDO REGISTRADO*'+NL+NL+'Pedido *'+fresh.code+'* foi registrado, mas o PIX não pôde ser criado agora.'+NL+NL+'Não faça nenhum pagamento por outra chave. O sistema tentará novamente pelo painel.');
      return true;
    }
    const paidOrder=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(fresh.id));
    if(typeof sendPixToIdentity==='function'){
      await sendPixToIdentity(identity,{...(paidOrder||ready||fresh),pix_copy_paste:pix?.qr?.text||paidOrder?.pix_copy_paste||null},pix);
    }else{
      await replyInbound(identity,'🧾 *N° do Pedido:* '+fresh.code+NL+NL+'💳 *PAGAMENTO PIX*'+NL+NL+'💰 *VALOR:* R$ '+money(total)+NL+NL+'📋 *PIX COPIA E COLA:*'+NL+cleanText(pix?.qr?.text||''));
    }
    await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:fresh.code,quantity,total,provider:'MERCADO_PAGO'});
    return true;
  }

  async function rdsFinalHandleInbound(identity,order,text){
    const t=cleanText(text);
    let step=cleanText(order.guided_step||'');
    if(!step)step=order.customer_name?'CONFIRMAR':order.quantity?'NOME':'QUANTIDADE';

    if(/^(?:cancelar|cancelar pedido|desistir|não quero|nao quero|sair|4)$/i.test(t)){
      await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:'CANCELAMENTO_CLIENTE',cancelled_at:nowISO(),guided_step:null,updated_at:nowISO()});
      await cancelFutureDeliveries(order.phone,'CANCELAMENTO_CLIENTE');
      await logEvent('PEDIDO_CANCELADO',{phone:order.phone,order:order.code,reason:'CANCELAMENTO_CLIENTE'});
      await replyInbound(identity,'✅ *SEU PEDIDO FOI CANCELADO*');
      return true;
    }

    if(step==='SORTEIO'){
      let draws=[];
      try{draws=await rdsAvailableOfficialDraws();}catch(e){await replyInbound(identity,'⚠️ Não consegui atualizar os sorteios oficiais. Nenhum pagamento será solicitado. Tente novamente em instantes.');return true;}
      const chosen=draws.find(d=>String(d.drawId)===t);
      if(!chosen){
        if(!draws.length){await replyInbound(identity,'⚠️ Não há sorteio oficial aberto para venda no momento. Nenhum pagamento será solicitado.');return true;}
        await replyInbound(identity,'❌ Código de sorteio inválido ou indisponível.'+NL+NL+rdsDrawSelectionMessage(draws));
        return true;
      }
      const saved=await patch('rds10_orders','id=eq.'+encodeURIComponent(order.id)+'&status=eq.COLETANDO_DADOS',{
        official_draw_id:String(chosen.drawId),
        official_draw_title:cleanText(chosen.drawTitle||('Sorteio '+chosen.drawId)),
        guided_step:'QUANTIDADE',
        updated_at:nowISO()
      });
      if(!saved?.length){await replyInbound(identity,'⚠️ Não consegui vincular o sorteio ao pedido. Nenhum pagamento foi solicitado.');return true;}
      await replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
      return true;
    }

    if(step==='QUANTIDADE'){
      const q=qtyFrom(t);
      if(!q){await replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*'+NL+NL+'Digite apenas a quantidade de bilhetes que você deseja.');return true;}
      const total=Number((q*Number(order.unit_price||3)).toFixed(2));
      await patch('rds10_orders','id=eq.'+order.id,{quantity:q,total_amount:total,guided_step:'NOME',updated_at:nowISO()});
      await replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
      return true;
    }

    if(step==='NOME'){
      const name=cleanName(t);
      if(name.length<4){await replyInbound(identity,'❌ *NOME INVÁLIDO*'+NL+NL+'Digite seu nome completo para continuar.');return true;}
      await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
      await replyInbound(identity,confirmText(fresh||{...order,customer_name:name,guided_step:'CONFIRMAR'}));
      return true;
    }

    if(step==='CPF'){
      const cpf=cleanCpf(t);
      if(cpf&&(!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))){await replyInbound(identity,'❌ CPF inválido. Para continuar sem CPF, digite *PULAR*.');return true;}
      const patchData={guided_step:'CONFIRMAR',updated_at:nowISO()};
      if(cpf)patchData.customer_tax_id=cpf;
      await patch('rds10_orders','id=eq.'+order.id,patchData);
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
      await replyInbound(identity,confirmText(fresh||{...order,customer_tax_id:cpf||order.customer_tax_id,guided_step:'CONFIRMAR'}));
      return true;
    }

    if(step==='CONFIRMAR'){
      if(/^(?:1|sim|confirmar|confirmo)$/i.test(t)){
        await patch('rds10_orders','id=eq.'+order.id,{guided_step:'PROCESSANDO',updated_at:nowISO()});
        try{return await confirmFinalPurchase(identity,order);}
        catch(e){
          await patch('rds10_orders','id=eq.'+order.id,{guided_step:'CONFIRMAR',updated_at:nowISO()}).catch(()=>{});
          await replyInbound(identity,'⚠️ Não foi possível concluir a confirmação agora. O pedido continua salvo. Tente *1 — SIM, CONFIRMAR* novamente.');
          return true;
        }
      }
      if(/^(?:2|editar|alterar)$/i.test(t)){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDITAR',updated_at:nowISO()});await replyInbound(identity,editText);return true;}
      return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*'+NL+NL+'Escolha *1 — SIM, CONFIRMAR* ou *2 — EDITAR*.');
    }

    if(step==='EDITAR'){
      if(t==='1'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_QUANTIDADE'});return replyInbound(identity,'🎟️ *DIGITE A NOVA QUANTIDADE DE BILHETES:* 👇');}
      if(t==='2'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'EDIT_NOME'});return replyInbound(identity,'👤 *DIGITE O NOVO NOME:* 👇');}
      if(t==='3'){await patch('rds10_orders','id=eq.'+order.id,{quantity:null,total_amount:null,customer_name:null,guided_step:'TODOS_QUANTIDADE',updated_at:nowISO()});return replyInbound(identity,'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');}
      if(t==='4'){await patch('rds10_orders','id=eq.'+order.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));}
      return replyInbound(identity,'❌ *OPÇÃO INVÁLIDA*'+NL+NL+'Escolha uma opção de *1 a 4*.');
    }

    if(step==='EDIT_QUANTIDADE'){
      const q=qtyFrom(t);if(!q)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*'+NL+NL+'Digite apenas a quantidade de bilhetes que você deseja.');
      const total=Number((q*Number(order.unit_price||3)).toFixed(2));
      await patch('rds10_orders','id=eq.'+order.id,{quantity:q,total_amount:total,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    if(step==='EDIT_NOME'){
      const name=cleanName(t);if(name.length<4)return replyInbound(identity,'❌ *NOME INVÁLIDO*'+NL+NL+'Digite seu nome completo para continuar.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    if(step==='EDIT_CPF'){
      const cpf=cleanCpf(t);if(!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf)))return replyInbound(identity,'❌ *CPF INVÁLIDO*'+NL+NL+'Digite novamente seu CPF com 11 dígitos.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_tax_id:cpf,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    if(step==='TODOS_QUANTIDADE'){
      const q=qtyFrom(t);if(!q)return replyInbound(identity,'❌ *QUANTIDADE INVÁLIDA*'+NL+NL+'Digite apenas a quantidade de bilhetes que você deseja.');
      const total=Number((q*Number(order.unit_price||3)).toFixed(2));
      await patch('rds10_orders','id=eq.'+order.id,{quantity:q,total_amount:total,guided_step:'TODOS_NOME',updated_at:nowISO()});
      return replyInbound(identity,'👤 *DIGITE SEU NOME:* 👇');
    }
    if(step==='TODOS_NOME'){
      const name=cleanName(t);if(name.length<4)return replyInbound(identity,'❌ *NOME INVÁLIDO*'+NL+NL+'Digite seu nome completo para continuar.');
      await patch('rds10_orders','id=eq.'+order.id,{customer_name:name,guided_step:'CONFIRMAR',updated_at:nowISO()});
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||{...order,customer_name:name}));
    }
    if(step==='TODOS_CPF'){
      const cpf=cleanCpf(t);
      if(cpf&&(!/^[0-9]{11}$/.test(cpf)||(typeof validCPF==='function'&&!validCPF(cpf))))return replyInbound(identity,'❌ CPF inválido. Para continuar sem CPF, digite *PULAR*.');
      const patchData={guided_step:'CONFIRMAR',updated_at:nowISO()};if(cpf)patchData.customer_tax_id=cpf;
      await patch('rds10_orders','id=eq.'+order.id,patchData);
      const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));return replyInbound(identity,confirmText(fresh||order));
    }
    return false;
  }

  const previousHandleInbound=handleInbound;
  handleInbound=async function(m){
    if(String(process.env.RDS_SALES_PAUSED||'').trim().toLowerCase()==='true'){
      const pausedIdentity=resolveInboundIdentity(m);
      if(pausedIdentity.phone) return replyInbound(pausedIdentity,'CANAL DE VENDAS TEMPORARIAMENTE PAUSADO. Nao inicie nem pague novos pedidos agora. Pedidos ja pagos serao tratados separadamente.');
      return;
    }
    const identity=resolveInboundIdentity(m);
    const inbound=extractInbound(m);
    const text=cleanText(inbound?.text);
    const phone=normalizeBR(identity?.phone||'');
    if(!phone)return previousHandleInbound(m);

    const active=await activeOrder(phone);
    const buy=/^(?:comprar|compra|quero comprar|quero comprar|compre agora)$/i.test(text);

    if(active&&active.status==='COLETANDO_DADOS'){
      await logMessage({phone,direction:'IN',type:inbound.type||'text',body:text,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid}});
      await upsertInboundContact(identity,cleanText(m?.pushName||''));
      return rdsFinalHandleInbound(identity,active,text);
    }

    if(!active&&buy){
      await logMessage({phone,direction:'IN',type:'text',body:text,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid}});
      await upsertInboundContact(identity,cleanText(m?.pushName||''));
      return startFinalPurchase(identity);
    }

    return previousHandleInbound(m);
  };
})();
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] rota comercial final V3 aplicada');
