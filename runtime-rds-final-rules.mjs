import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS FINAL COMMERCIAL RULES';
if(server.includes(marker)){
  console.log('[RDS] regras comerciais finais já aplicadas');
  process.exit(0);
}

const block=String.raw`
${marker}
async function beginOrder(identity,campaignCode=null){
  if(!identity.phone){await replyInbound(identity,'Não consegui identificar seu número de WhatsApp.');return;}
  const order=await createOrder(identity.phone,campaignCode);
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
  await replyInbound(identity,'🛒 *PREENCHA O PEDIDO*');
  await replyInbound(identity,'Quantidade:\nNome:\nCPF:');
}
function looksLikeForm(text){return /quantidade\s*[:\-]/i.test(text)&&/nome\s*[:\-]/i.test(text)&&/cpf\s*[:\-]/i.test(text);}
function rdsMainMenu(settings){
  const bot=normalizeBR(connectedNumber||'');
  const buy=bot?'https://wa.me/'+bot+'?text='+encodeURIComponent('COMPRAR'):'';
  return '🍀 *CANAL DE VENDAS RDS*\n\n1️⃣ *COMPRAR BILHETES*'+(buy?'\n👉 '+buy:'')+'\n2️⃣ *CONSULTAR PEDIDO*\n3️⃣ *ALTERAR PEDIDO*\n4️⃣ *CANCELAR PEDIDO*\n5️⃣ *ATENDIMENTO*\n6️⃣ *OUTRAS OPÇÕES*\n\nEscolha uma opção pelo número.';
}
function rdsOtherOptions(){return '⚙️ *OUTRAS OPÇÕES*\n\n1️⃣ 🟠 *RECUSAR OFERTA*\n2️⃣ 🔴 *SAIR DA LISTA*\n3️⃣ ↩️ *VOLTAR AO MENU PRINCIPAL*\n\nEscolha uma opção pelo número.';}
function rdsCampaignMessageClean(body){return cleanText(body).replace(/\s*🛒\s*\*COMPRE AGORA:[\s\S]*$/i,'').trim();}
async function rdsCancelOrderFinal(order,reason){if(!order?.id)return;await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',updated_at:nowISO()});await cancelFutureDeliveries(order.phone,reason||'CLIENTE_CANCELAMENTO');await logEvent('PEDIDO_CANCELADO',{phone:order.phone,order:order.code,reason:reason||'CLIENTE_CANCELAMENTO'});}
const rdsOtherMenuState=new Map();
async function rdsRefuseOffer(identity){
  const phone=normalizeBR(identity?.phone||'');
  if(!phone)return replyInbound(identity,'Não consegui identificar seu número.');
  const latest=await one('rds10_deliveries','select=campaign_id&phone=eq.'+encodeURIComponent(phone)+'&status=eq.ENVIADA&order=sent_at.desc').catch(()=>null);
  if(latest?.campaign_id)await logEvent('CAMPAIGN_OFFER_REFUSED',{phone,campaign_id:latest.campaign_id});
  rdsOtherMenuState.delete(phone);
  return replyInbound(identity,'🟠 *OFERTA RECUSADA*\n\nVocê não receberá mais esta oferta. Seu cadastro permanece ativo para outras campanhas.');
}
async function rdsOptOutGlobal(identity){
  const phone=normalizeBR(identity?.phone||'');
  if(!phone)return replyInbound(identity,'Não consegui identificar seu número.');
  await logEvent('CAMPAIGN_GLOBAL_OPTOUT',{phone});
  rdsOtherMenuState.delete(phone);
  await cancelFutureDeliveries(phone,'SAIU_DA_LISTA');
  return replyInbound(identity,'🔴 *SAÍDA DA LISTA*\n\nOs envios automáticos de campanhas foram bloqueados para este contato. Seu cadastro permanece no sistema.');
}
async function rdsCampaignBlocked(phone,campaignId){
  const rows=await list('rds10_events','select=kind,payload,created_at&kind=in.(CAMPAIGN_GLOBAL_OPTOUT,CAMPAIGN_OFFER_REFUSED)&order=created_at.desc&limit=5000');
  for(const x of rows){if(String(x?.payload?.phone||'')!==String(phone))continue;if(x.kind==='CAMPAIGN_GLOBAL_OPTOUT')return true;if(x.kind==='CAMPAIGN_OFFER_REFUSED'&&String(x?.payload?.campaign_id||'')===String(campaignId))return true;}
  return false;
}
async function rdsConsultOrder(identity,code){
  const phone=normalizeBR(identity?.phone||'');
  let order=null;
  if(code)order=await one('rds10_orders','select=*&code=eq.'+encodeURIComponent(code)+'&order=created_at.desc').catch(()=>null);
  if(!order&&phone)order=await one('rds10_orders','select=*&phone=eq.'+encodeURIComponent(phone)+'&order=created_at.desc').catch(()=>null);
  if(!order)return replyInbound(identity,'🔎 *CONSULTAR PEDIDO*\n\nNão encontrei pedido para este número.');
  return replyInbound(identity,'🔎 *PEDIDO '+order.code+'*\n\nStatus: *'+String(order.status||'').replaceAll('_',' ')+'*\nQuantidade: '+Number(order.quantity||0)+' bilhete(s)\nTotal: *R$ '+money(order.total_amount||0)+'*');
}
function rdsCampaignAudienceSignature(c){
  const mode=String(c?.target_mode||'all');
  if(mode==='group')return 'group:'+String(c?.target_group||'').trim().toUpperCase();
  if(mode==='individual')return 'individual:'+((Array.isArray(c?.selected_contact_ids)?c.selected_contact_ids:[]).map(String).sort().join(','));
  return 'all';
}
function rdsShuffleFinal(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
async function rdsSmartRules(campaignId){return {...(await rdsCampaignRules(campaignId)),interval_seconds:15,intelligent_distribution:true};}
async function rdsSmartCompatible(campaignId){
  const current=await one('rds10_campaigns','select=*&id=eq.'+campaignId);if(!current)throw new Error('Campanha não encontrada.');
  const sig=rdsCampaignAudienceSignature(current);
  const all=await list('rds10_campaigns','select=*&status=eq.ATIVA&order=created_at.asc');
  return all.filter(c=>rdsCampaignAudienceSignature(c)===sig);
}
async function rdsSmartRebuild(campaignId){
  const campaigns=await rdsSmartCompatible(campaignId);
  if(campaigns.length<2)return {waiting_for_campaigns:true,campaigns:campaigns.length,targets:0,deliveries:0};
  const targetSets=[];
  const stepRows=new Map();
  for(const c of campaigns){targetSets.push(await rdsCampaignTargets(c));stepRows.set(c.id,await list('rds10_campaign_steps','select=*&campaign_id=eq.'+c.id+'&order=step_index.asc'));}
  const common=new Map();
  for(const set of targetSets){for(const x of set)common.set(String(x.id),x);}
  const contacts=[...common.values()];
  if(!contacts.length)throw new Error('Nenhum cliente qualificado compartilhado entre as campanhas compatíveis.');
  const ids=campaigns.map(c=>c.id);
  const old=await list('rds10_deliveries','select=id,campaign_id,phone,status&campaign_id=in.('+ids.join(',')+')&status=eq.AGENDADA&limit=10000');
  for(const d of old)await patch('rds10_deliveries','id=eq.'+d.id,{status:'CANCELADA',cancel_reason:'REDISTRIBUICAO_INTELIGENTE',updated_at:nowISO()});
  const outbound=await list('rds10_messages','select=phone,body,direction&direction=eq.OUT&limit=10000');
  const history=new Map();
  for(const m of outbound){const p=String(m.phone||'');if(!p)continue;const set=history.get(p)||new Set();set.add(rdsCampaignMessageClean(m.body||''));history.set(p,set);}
  let deliveries=0;
  for(const contact of rdsShuffleFinal(contacts.slice())){
    const used=new Set();
    const max=Math.max(0,...[...stepRows.values()].map(x=>x.length));
    for(let idx=0;idx<max;idx++){
      const candidates=rdsShuffleFinal(campaigns.filter(c=>stepRows.get(c.id)?.[idx]));
      const sent=history.get(String(contact.phone))||new Set();
      let chosen=null;
      for(const c of candidates){
        if(used.has(c.id)&&campaigns.length>1)continue;
        const step=stepRows.get(c.id)[idx];
        const clean=rdsCampaignMessageClean(step.message||'');
        if((await rdsSmartRules(c.id)).avoid_repeat!==false&&sent.has(clean))continue;
        chosen={c,step};break;
      }
      if(!chosen){
        for(const c of candidates){const step=stepRows.get(c.id)[idx];if(!used.has(c.id)||campaigns.length===1){chosen={c,step};break;}}
      }
      if(!chosen)continue;
      used.add(chosen.c.id);
      const start=new Date(chosen.c.start_at);if(Number.isNaN(start.getTime()))continue;
      let cumulative=0;const rows=stepRows.get(chosen.c.id)||[];for(let j=0;j<=idx;j++)cumulative+=Number(rows[j]?.delay_minutes||0);
      const scheduled=new Date(start.getTime()+cumulative*60000).toISOString();
      await insert('rds10_deliveries',{campaign_id:chosen.c.id,campaign_code:chosen.c.code,step_id:chosen.step.id,step_index:chosen.step.step_index,contact_id:contact.id,phone:contact.phone,scheduled_at:scheduled,status:'AGENDADA',created_at:nowISO(),updated_at:nowISO()},'minimal');
      deliveries++;
    }
  }
  return {waiting_for_campaigns:false,campaigns:campaigns.length,targets:contacts.length,deliveries};
}
async function activateCampaign(campaignId){
  const c=await one('rds10_campaigns','select=*&id=eq.'+campaignId);if(!c)throw new Error('Campanha não encontrada.');
  const steps=await list('rds10_campaign_steps','select=*&campaign_id=eq.'+campaignId+'&order=step_index.asc');if(!steps.length)throw new Error('Campanha sem mensagens.');
  const targets=await rdsCampaignTargets(c);if(!targets.length)throw new Error('Nenhum cliente qualificado selecionado.');
  await patch('rds10_campaigns','id=eq.'+campaignId,{status:'ATIVA',activated_at:nowISO(),updated_at:nowISO()});
  const result=await rdsSmartRebuild(campaignId);
  if(result.waiting_for_campaigns)return {targets:targets.length,deliveries:0,waiting_for_campaigns:true,message:'Distribuição inteligente aguarda pelo menos 2 campanhas compatíveis ativas.'};
  return result;
}
async function rdsLastSentGlobal(){return one('rds10_deliveries','select=sent_at&status=eq.ENVIADA&order=sent_at.desc').catch(()=>null);}
async function rdsCampaignSentCount(campaignId,since){const rows=await list('rds10_deliveries','select=id&campaign_id=eq.'+campaignId+'&status=eq.ENVIADA&sent_at=gte.'+encodeURIComponent(since));return rows.length;}
async function sendDelivery(d){
  const order=await activeOrder(d.phone);if(order){await patch('rds10_deliveries','id=eq.'+d.id,{status:'CANCELADA',cancel_reason:'CLIENTE_EM_PEDIDO',updated_at:nowISO()});return;}
  const c=await one('rds10_campaigns','select=*&id=eq.'+d.campaign_id);if(!c)throw new Error('Campanha não encontrada.');
  if(await rdsCampaignBlocked(d.phone,d.campaign_id)){await patch('rds10_deliveries','id=eq.'+d.id,{status:'CANCELADA',cancel_reason:'CLIENTE_BLOQUEADO',updated_at:nowISO()});return;}
  const rule=await rdsSmartRules(d.campaign_id);if(!rdsWithinWindow(rule)){if(rdsAfterWindow(rule))await patch('rds10_deliveries','id=eq.'+d.id,{status:'CANCELADA',cancel_reason:'HORARIO_CAMPANHA_ENCERRADO',updated_at:nowISO()});return;}
  const step=await one('rds10_campaign_steps','select=*&id=eq.'+d.step_id);if(!step)throw new Error('Etapa não encontrada.');
  const body=cleanText(step.message||'')+(c.cta_enabled!==false?'\n\n🛒 *COMPRE AGORA:* https://wa.me/'+connectedNumber+'?text='+encodeURIComponent('COMPRAR'):'' );
  if(rule.avoid_repeat!==false&&await rdsSameMessageSent(d.phone,body)){await patch('rds10_deliveries','id=eq.'+d.id,{status:'CANCELADA',cancel_reason:'MENSAGEM_REPETIDA',updated_at:nowISO()});return;}
  if(Number(rule.max_per_day||0)>0){const day=new Date();day.setHours(0,0,0,0);if(await rdsCampaignSentCount(d.campaign_id,day.toISOString())>=Number(rule.max_per_day)){await patch('rds10_deliveries','id=eq.'+d.id,{scheduled_at:new Date(Date.now()+3600000).toISOString(),updated_at:nowISO()});return;}}
  if(Number(rule.max_per_hour||0)>0){const hour=new Date(Date.now()-3600000).toISOString();if(await rdsCampaignSentCount(d.campaign_id,hour)>=Number(rule.max_per_hour)){await patch('rds10_deliveries','id=eq.'+d.id,{scheduled_at:new Date(Date.now()+900000).toISOString(),updated_at:nowISO()});return;}}
  const result=await sendTextPhone(d.phone,body);await patch('rds10_deliveries','id=eq.'+d.id,{status:'ENVIADA',sent_at:nowISO(),wa_message_id:result.id,updated_at:nowISO()});
}
let queueBusyFinal=false;let rdsNextGlobalSendAt=0;
async function processQueue(){
  if(queueBusyFinal||!connected)return;queueBusyFinal=true;
  try{const due=await list('rds10_deliveries','select=*&status=eq.AGENDADA&scheduled_at=lte.'+encodeURIComponent(nowISO())+'&order=scheduled_at.asc&limit=50');for(const d of due){if(Date.now()<rdsNextGlobalSendAt)break;try{await sendDelivery(d);}catch(e){await patch('rds10_deliveries','id=eq.'+d.id,{status:'FALHA',error_text:e.message,updated_at:nowISO()});await addAlert('FALHA_ENVIO','Falha no envio para '+d.phone,{delivery:d.id,error:e.message});}rdsNextGlobalSendAt=Date.now()+15000;}}finally{queueBusyFinal=false;}
}
async function rdsSendMenuFinal(identity){return replyInbound(identity,rdsMainMenu(await getSettings()));}
async function handleInbound(m){
  const identity=resolveInboundIdentity(m);const inbound=extractInbound(m);const pushName=cleanText(m?.pushName||'');
  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName,rawKeys:inbound.rawKeys}});
  const settings=await getSettings();if(!settings.bot_enabled)return;
  const text=cleanText(inbound.text);const cmd=text.toLowerCase().replace(/[.]/g,'').trim();
  if(cmd==='6'||cmd==='outras opcoes'||cmd==='outras opções'){if(identity.phone)rdsOtherMenuState.set(identity.phone,Date.now()+10*60*1000);return replyInbound(identity,rdsOtherOptions());}
  if(identity.phone&&rdsOtherMenuState.get(identity.phone)){const exp=rdsOtherMenuState.get(identity.phone);if(Date.now()>exp)rdsOtherMenuState.delete(identity.phone);else if(cmd==='1')return rdsRefuseOffer(identity);else if(cmd==='2')return rdsOptOutGlobal(identity);else if(cmd==='3')return rdsSendMenuFinal(identity);}
  if(['menu','inicio','início','0','voltar'].includes(cmd))return rdsSendMenuFinal(identity);
  const order=identity.phone?await activeOrder(identity.phone):null;
  if(order&&inbound.media&&['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(order.status))return handleProof(identity,order,inbound);
  if(order){
    if(cmd==='4'||/^(cancelar|cancelar pedido|encerrar|desistir|não quero|nao quero)$/.test(cmd)){await rdsCancelOrderFinal(order,'CLIENTE_CANCELAMENTO');return rdsSendMenuFinal(identity);}
    if(cmd==='5'||isOfficeRoute(text)){await rdsCancelOrderFinal(order,'ENCAMINHADO_ESCRITORIO');const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 Atendimento do escritório:\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));}
    if(order.status==='COLETANDO_DADOS'){
      if(cmd==='2'||cmd==='corrigir')return replyInbound(identity,'📝 *CORRIGIR PEDIDO*\n\nQuantidade:\nNome:\nCPF:');
      if(looksLikeForm(text))return handleOrderForm(identity,order,text);
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_PAGAMENTO')return replyInbound(identity,'💳 *PAGAMENTO PENDENTE*\nPedido *'+order.code+'*\nValor: *R$ '+money(order.total_amount)+'*.\n\nEnvie o comprovante após pagar ou digite *4* para cancelar.');
    if(order.status==='AGUARDANDO_CONFERENCIA')return replyInbound(identity,'Comprovante do pedido *'+order.code+'* já recebido e aguardando conferência.');
    if(order.status==='PAGO_AGUARDANDO_BILHETES')return replyInbound(identity,'Pagamento do pedido *'+order.code+'* confirmado ✅\nOs bilhetes aguardam emissão/envio.');
  }
  if(isBuyRoute(text)||cmd==='1')return beginOrder(identity,null);
  if(cmd==='2'){const code=(text.match(/RDS[-_: ]?([A-Z0-9]{6,12})/i)||[])[1]||null;return rdsConsultOrder(identity,code);}
  if(cmd==='3')return replyInbound(identity,'📝 *ALTERAR PEDIDO*\n\nNão há pedido ativo para alterar.');
  if(cmd==='4')return replyInbound(identity,'❌ *CANCELAR PEDIDO*\n\nNão há pedido ativo para cancelar.');
  if(cmd==='5'||isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *ATENDIMENTO*\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));}
  if(cmd==='recusar oferta')return rdsRefuseOffer(identity);
  if(cmd==='sair da lista')return rdsOptOutGlobal(identity);
  return rdsSendMenuFinal(identity);
}
`;

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para regras finais.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] regras comerciais finais aplicadas');
