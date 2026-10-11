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

  async function selectableOfficialDraws(){
    const results=await Promise.allSettled([
      rdsFinalRequest('/draws/seller/available'),
      rdsFinalRequest('/draws/seller/all')
    ]);
    const rows=[];
    for(const r of results){
      if(r.status!=='fulfilled')continue;
      const v=r.value;
      if(Array.isArray(v))rows.push(...v);
      else if(Array.isArray(v?.draws))rows.push(...v.draws);
      else if(Array.isArray(v?.items))rows.push(...v.items);
      else if(Array.isArray(v?.data))rows.push(...v.data);
      else if(Array.isArray(v?.data?.draws))rows.push(...v.data.draws);
      else if(Array.isArray(v?.result?.draws))rows.push(...v.result.draws);
      else if(v&&typeof v==='object'&&(v.drawId||v.id))rows.push(v);
    }
    const unique=new Map();
    for(const d of rows){
      const id=String(d?.drawId??d?.draw_id??d?.id??d?.draw?.drawId??'').trim();
      if(!id)continue;
      const prior=unique.get(id)||{};
      unique.set(id,{...prior,...d,drawId:id});
    }
    const now=Date.now();
    return [...unique.values()].filter(d=>{
      const status=String(d.status??d.drawStatus??'').toUpperCase();
      if(d.active===false||d.isDrawClosed===true||d.isSalesClosed===true||d.salesOpen===false)return false;
      if(/CLOSED|ENCERRADO|FECHADO|INATIVO|CANCELADO/.test(status))return false;
      const rawDate=d.drawDate??d.drawAt??d.draw_at??d.date??d.scheduledAt??null;
      if(rawDate){const ms=new Date(rawDate).getTime();if(Number.isFinite(ms)&&ms<now)return false;}
      return true;
    }).map(d=>{
      const id=String(d.drawId);
      const title=cleanText(d.drawTitle??d.title??d.name??d.description??('Sorteio '+id));
      const rawPrice=d.pricePerTicket??d.price_per_ticket??d.ticketPrice??d.price??null;
      const price=Number(rawPrice);
      const rawDate=d.drawDate??d.drawAt??d.draw_at??d.date??d.scheduledAt??null;
      return {id,title,price:Number.isFinite(price)&&price>0?price:null,drawAt:rawDate?String(rawDate):null};
    }).sort((a,b)=>{
      if(a.drawAt&&b.drawAt)return new Date(a.drawAt).getTime()-new Date(b.drawAt).getTime();
      if(a.drawAt)return -1;if(b.drawAt)return 1;
      return a.title.localeCompare(b.title,'pt-BR');
    });
  }
  const drawMenu=options=>[
    '🎯 *ESCOLHA O SORTEIO*','',
    ...options.map((d,i)=>String(i+1)+'️⃣ *'+d.title+'*'+(d.drawAt?' — '+new Date(d.drawAt).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'')+(d.price?' — R$ '+money(d.price):'')),
    '',
    'Digite o número do sorteio desejado.'
  ].join(NL);
  async function startFinalPurchase(identity){
    const phone=normalizeBR(identity?.phone||'');
    if(!phone)return false;
    const draws=await selectableOfficialDraws();
    if(!draws.length){
      await replyInbound(identity,'⚠️ *SORTEIOS INDISPONÍVEIS NO MOMENTO*'+NL+NL+'Não foi criado pedido e nenhum pagamento deve ser feito. Tente novamente quando houver sorteio oficial aberto.');
      await logEvent('COMPRA_BLOQUEADA_SEM_SORTEIO_OFICIAL',{phone});
      return true;
    }
    let order=await activeOrder(phone);
    if(!order)order=await createOrder(phone,null);
    if(!order)throw new Error('Não foi possível criar o pedido.');
    if(draws.length===1){
      const d=draws[0];
      const patchData={guided_step:'QUANTIDADE',status:'COLETANDO_DADOS',official_draw_id:d.id,official_draw_title:d.title,official_ticket_payload:null,updated_at:nowISO()};
      if(d.price)patchData.unit_price=d.price;
      await patch('rds10_orders','id=eq.'+order.id,patchData);
      order={...order,...patchData};
    }else{
      const options=draws.slice(0,9);
      const payload={purchaseDrawOptions:options};
      await patch('rds10_orders','id=eq.'+order.id,{guided_step:'SORTEIO',status:'COLETANDO_DADOS',official_ticket_payload:payload,updated_at:nowISO()});
      order={...order,guided_step:'SORTEIO',official_ticket_payload:payload};
    }
    await logMessage({phone,direction:'IN',type:'text',body:'COMPRAR',status:'RECEBIDA',created_at:nowISO()});
    await logEvent('PEDIDO_INICIADO',{phone,order:order.code,stage:'COMPRA_GUIADA_V4',drawOptions:draws.length});
    await replyInbound(identity,'🍀 Olá! Vamos iniciar seu pedido.');
    if(draws.length>1)return replyInbound(identity,drawMenu(draws.slice(0,9)));
    await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*'+NL+NL+'Sorteio: *'+draws[0].title+'*'+NL+NL+'Informe apenas a quantidade de bilhetes.'+NL+'Exemplo: *5*'+NL+NL+'Digite *CANCELAR* para sair.');
    return true;
  }

  async function confirmFinalPurchase(identity,order){
    const fresh=await one('rds10_orders','select=*&id=eq.'+encodeURIComponent(order.id));
    if(!fresh)throw new Error('Pedido não encontrado.');
    if(!String(fresh.official_draw_id||'').trim()){
      const options=(await selectableOfficialDraws()).slice(0,9);
      if(!options.length){
        await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'SORTEIO',status:'COLETANDO_DADOS',updated_at:nowISO()});
        return replyInbound(identity,'⚠️ Não há sorteio oficial aberto. Não faça pagamento; tente novamente quando houver sorteio disponível.');
      }
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'SORTEIO',status:'COLETANDO_DADOS',official_ticket_payload:{purchaseDrawOptions:options},updated_at:nowISO()});
      return replyInbound(identity,'⚠️ Antes de gerar o PIX, selecione o sorteio oficial:'+NL+NL+drawMenu(options));
    }
    const quantity=Number(fresh.quantity||0);
    const name=cleanName(fresh.customer_name);
    const cpf=cleanCpf(fresh.customer_tax_id);
    if(!quantity||quantity<1||name.length<4){
      await patch('rds10_orders','id=eq.'+fresh.id,{guided_step:'CONFIRMAR',updated_at:nowISO()});
      return replyInbound(identity,'⚠️ Os dados do pedido estão incompletos. Escolha *2 — EDITAR* para corrigir.');
    }
    const total=Number((quantity*Number(fresh.unit_price||3)).toFixed(2));
    await patch('rds10_orders','id=eq.'+fresh.id,{
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
      let options=Array.isArray(order.official_ticket_payload?.purchaseDrawOptions)?order.official_ticket_payload.purchaseDrawOptions:[];
      const choice=Number(t);
      if(!Number.isInteger(choice)||choice<1||choice>options.length){
        if(options.length)return replyInbound(identity,drawMenu(options));
        const refreshed=await selectableOfficialDraws();
        if(!refreshed.length)return replyInbound(identity,'⚠️ Não há sorteio oficial aberto neste momento. Nenhum pagamento deve ser feito.');
        options=refreshed.slice(0,9);
        await patch('rds10_orders','id=eq.'+order.id,{official_ticket_payload:{purchaseDrawOptions:options},updated_at:nowISO()});
        return replyInbound(identity,drawMenu(options));
      }
      const chosen=options[choice-1];
      const available=await selectableOfficialDraws();
      const current=available.find(d=>String(d.id)===String(chosen.id));
      if(!current){
        const refreshed=available.slice(0,9);
        if(!refreshed.length)return replyInbound(identity,'⚠️ O sorteio escolhido foi encerrado. Não pague nada; tente novamente mais tarde.');
        await patch('rds10_orders','id=eq.'+order.id,{official_ticket_payload:{purchaseDrawOptions:refreshed},guided_step:'SORTEIO',updated_at:nowISO()});
        return replyInbound(identity,'⚠️ Esse sorteio não está mais disponível. Escolha um dos sorteios abertos:'+NL+NL+drawMenu(refreshed));
      }
      const data={official_draw_id:current.id,official_draw_title:current.title,official_ticket_payload:null,guided_step:'QUANTIDADE',status:'COLETANDO_DADOS',updated_at:nowISO()};
      if(current.price)data.unit_price=current.price;
      await patch('rds10_orders','id=eq.'+order.id,data);
      await logEvent('SORTEIO_SELECIONADO_NO_WHATSAPP',{phone:identity.phone,order:order.code,drawId:current.id,drawTitle:current.title});
      return replyInbound(identity,'✅ Sorteio escolhido: *'+current.title+'*'+NL+NL+'🎟️ *DIGITE QUANTOS BILHETES VOCÊ QUER:* 👇');
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
