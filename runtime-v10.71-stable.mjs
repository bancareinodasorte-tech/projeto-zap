import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
const v70Path=path.join(dir,'runtime-v10.70-stable.mjs');
const basePagPath=path.join(dir,'runtime-v10.60-pagbank.mjs');
const pag71Path=path.join(dir,'runtime-v10.71-pagbank.mjs');
const v71Path=path.join(dir,'runtime-v10.71-runner.mjs');

// V10.71: máquina de estados coerente. Não permite que pedido pago seja tratado como pedido editável.
let server=fs.readFileSync(serverPath,'utf8');
const oldBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA/i.test(text); }";
const newBuy="function isBuyRoute(text){ return /RDS[-_: ]?COMPRAR|QUERO\\s*COMPRAR|COMPRE\\s*AGORA|^\\s*COMPRA\\s*$/i.test(text); }";
if(server.includes(oldBuy))server=server.replace(oldBuy,newBuy);

// Menu principal refinado: ações úteis e link de compra com mensagem pré-preenchida.
const menuFunction="function rdsRouterMessageV2(settings){const bot=normalizeBR(connectedNumber||'');const buyText=encodeURIComponent('QUERO COMPRAR\\n\\nQuantidade:\\nNome:\\nCPF:');const buyLink=bot?'https://wa.me/'+bot+'?text='+buyText:'';return '🍀 *CANAL DE VENDAS RDS*\\n\\n'+'1️⃣ *COMPRAR BILHETES*'+(buyLink?'\\n👉 '+buyLink:'')+'\\n\\n2️⃣ *CONSULTAR PEDIDO*\\n3️⃣ *ALTERAR PEDIDO*\\n4️⃣ *CANCELAR PEDIDO*\\n5️⃣ *ATENDIMENTO*\\n\\nEscolha uma opção pelo número ou toque no link de *COMPRAR BILHETES*.\\n\\n🔒 Pagamentos confirmados não podem ser alterados ou cancelados pelo menu.';}";
if(!server.includes('function rdsRouterMessageV2('))server=server.replace('function isBuyRoute',menuFunction+'\nfunction isBuyRoute');
fs.writeFileSync(serverPath,server,'utf8');

let pag=fs.readFileSync(basePagPath,'utf8');

// O menu numérico passa a ter semântica consistente:
// 1 comprar/continuar, 2 consultar, 3 alterar, 4 cancelar, 5 atendimento.
pag=pag.replace("const is3=/^(3|recomeçar|recomecar|novo|nova compra)$/.test(cmd);","const is3=/^(3|alterar|corrigir|editar|altero|edito)$/.test(cmd);");
pag=pag.replace("if(is1||is2)return askOrderForm(identity,order,is2?'📝 *CORRIGIR PEDIDO*':'🛒 *PREENCHER PEDIDO*');","if(is1||is3)return askOrderForm(identity,order,is3?'📝 *ALTERAR PEDIDO*':'🛒 *PREENCHER PEDIDO*');");
pag=pag.replace("if(is2){await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});return askOrderForm(identity,order,'📝 *CORRIGIR PEDIDO*');}","if(is3){await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});return askOrderForm(identity,order,'📝 *ALTERAR PEDIDO*');}");

// Consulta útil de pedido: mostra código, situação, quantidade e valor, sem alterar o estado.
const consultBlock="if(is2){const statusLabel={COLETANDO_DADOS:'aguardando preenchimento dos dados',AGUARDANDO_PAGAMENTO:'aguardando pagamento',AGUARDANDO_CONFERENCIA:'comprovante recebido e aguardando conferência',PAGO_AGUARDANDO_BILHETES:'pagamento confirmado e aguardando emissão dos bilhetes',CONCLUIDO:'concluído',CANCELADO:'cancelado'}[String(order.status||'')]||String(order.status||'');return replyInbound(identity,'🔎 *CONSULTA DO PEDIDO*\\n\\n🧾 Pedido: *'+order.code+'*\\n🎟 Quantidade: *'+(order.quantity||0)+'*\\n💰 Total: *R$ '+money(order.total_amount||0)+'*\\n📌 Situação: *'+statusLabel+'*'+(order.pix_expires_at&&order.status==='AGUARDANDO_PAGAMENTO'?'\\n⏳ PIX válido até: '+new Date(order.pix_expires_at).toLocaleString('pt-BR'):'')+'\\n\\nPara alterar, escolha *3*. Para cancelar, escolha *4*. Para atendimento, escolha *5*.');}\n    if(is4){";
if(!pag.includes("const statusLabel={COLETANDO_DADOS")&&pag.includes("if(order){\n    if(is4){"))pag=pag.replace("if(order){\n    if(is4){", "if(order){\n    "+consultBlock);

// Novo pedido quando o cliente digita 1 diretamente no menu.
pag=pag.replace("if(isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);", "if(is1){return beginOrder(identity,null);}\n  if(is2&&identity.phone){const latest=await one('rds10_orders','select=*&phone=eq.'+encodeURIComponent(identity.phone)+'&order=created_at.desc');if(latest)return replyInbound(identity,'🔎 *ÚLTIMO PEDIDO*\\n\\n🧾 Pedido: *'+latest.code+'*\\n🎟 Quantidade: *'+(latest.quantity||0)+'*\\n💰 Total: *R$ '+money(latest.total_amount||0)+'*\\n📌 Situação: *'+String(latest.status||'').replaceAll('_',' ')+'*\\n\\nEnvie *QUERO COMPRAR* para iniciar uma nova compra.');return replyInbound(identity,'🔎 Você ainda não possui um pedido registrado.\\n\\n👉 Para comprar, envie *QUERO COMPRAR* ou use o link de *COMPRAR BILHETES* no menu.');}\n  if(is3){return replyInbound(identity,'ℹ️ Não há pedido ativo para alterar.\\n\\nPara iniciar uma compra, envie *QUERO COMPRAR*.');}\n  if(is4){return replyInbound(identity,'ℹ️ Não há pedido ativo para cancelar.\\n\\nPara iniciar uma compra, envie *QUERO COMPRAR*.');}\n  if(isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);");
pag=pag.replace("return replyInbound(identity,routerMessage(settings));","return replyInbound(identity,rdsRouterMessageV2(settings));");

const guard="  if(order){\n    if(is4){";
const guardNew="  if(order){\n    if(['PAGO_AGUARDANDO_BILHETES','CONCLUIDO'].includes(String(order.status||''))){\n      if(is1)return replyInbound(identity,'Pedido *'+order.code+'*: pagamento já confirmado ✅. '+(order.status==='CONCLUIDO'?'Este pedido já foi concluído.':'Os bilhetes aguardam emissão/envio pelo operador.')+'\\n\\nSe precisar de atendimento, escolha *5 — Atendimento*.');\n      if(is2)return replyInbound(identity,'🔎 *CONSULTA DO PEDIDO*\\n\\n🧾 Pedido: *'+order.code+'*\\n🎟 Quantidade: *'+(order.quantity||0)+'*\\n💰 Total: *R$ '+money(order.total_amount||0)+'*\\n📌 Situação: *'+(order.status==='CONCLUIDO'?'concluído':'pagamento confirmado — aguardando emissão/envio dos bilhetes')+'*\\n\\nPara atendimento, escolha *5*.');\n      if(is5){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 *ATENDIMENTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento sobre meu pedido '+order.code+'.'));}\n      if(is3||is4)return replyInbound(identity,'🔒 O pedido *'+order.code+'* já possui pagamento confirmado e não pode ser alterado ou cancelado pelo menu.\\n\\nPara atendimento, escolha *5 — Atendimento*.');\n      return replyInbound(identity,'Pedido *'+order.code+'* com pagamento confirmado ✅. Para atendimento, escolha *5 — Atendimento*.');\n    }\n    if(is4){";
if(!pag.includes('V10.71_PAID_STATE')&&pag.includes(guard))pag=pag.replace(guard,guardNew+'\n  // V10.71_PAID_STATE');
pag=pag.replace("{status:'CANCELADO',cancel_reason:why,updated_at:nowISO()}","{status:'CANCELADO',updated_at:nowISO()}");
fs.writeFileSync(pag71Path,pag,'utf8');

// Extensão operacional: não transformar qualquer mensagem recebida em cliente de campanha.
const opsMarker='// RDS V10.71 OPERATIONAL EXTENSION';
if(!server.includes(opsMarker)){
const ops=`
${opsMarker}
function rdsQualifiedContact(c){const o=String(c?.origin||'').toUpperCase();const g=String(c?.group_name||'').toUpperCase();return ['MANUAL','IMPORTACAO','PEDIDO','COMPRA'].includes(o)||(!['ENTRADA WHATSAPP','NOVOS'].includes(g)&&o!=='WHATSAPP');}
function rdsCampaignDefaults(){return {max_per_day:0,max_per_hour:0,interval_minutes:0,window_start:'08:00',window_end:'20:00',batch_limit:0,shuffle:false,avoid_repeat:true,stop_on_order:true,shuffle_pool:''};}
async function rdsCampaignRules(campaignId){const rows=await list('rds10_events',`select=*&kind=eq.CAMPAIGN_RULES&order=created_at.desc&limit=300`);const hit=rows.find(x=>String(x?.payload?.campaign_id||'')===String(campaignId));return {...rdsCampaignDefaults(),...(hit?.payload?.rules||{})};}
function rdsTimeBR(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Number(p.find(x=>x.type==='hour')?.value||0)*60+Number(p.find(x=>x.type==='minute')?.value||0);}
function rdsHm(v,fallback){const m=String(v||fallback).match(/^(\\d{1,2}):(\\d{2})$/);return m?Math.max(0,Math.min(1439,Number(m[1])*60+Number(m[2]))):rdsHm(fallback,'08:00');}
function rdsWithinWindow(rule){const n=rdsTimeBR(),a=rdsHm(rule.window_start,'08:00'),b=rdsHm(rule.window_end,'20:00');return a<=b?n>=a&&n<=b:n>=a||n<=b;}
function rdsAfterWindow(rule){const n=rdsTimeBR(),a=rdsHm(rule.window_start,'08:00'),b=rdsHm(rule.window_end,'20:00');return a<=b?n>b:(n>b&&n<a);}
function rdsShuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function rdsQualifiedTargetQuery(){return 'select=*&status=eq.ATIVO&validated=eq.true';}
async function rdsCampaignTargets(c){
  let q=rdsQualifiedTargetQuery();
  if(c.target_mode==='individual'){const ids=Array.isArray(c.selected_contact_ids)?c.selected_contact_ids:[];if(!ids.length)return [];q+='&id=in.('+ids.join(',')+')';}
  else if(c.target_mode==='group')q+='&group_name=eq.'+encodeURIComponent(c.target_group);
  const rows=await list('rds10_contacts',q);return rows.filter(rdsQualifiedContact);
}
async function activateCampaign(campaignId){
  const c=await one('rds10_campaigns',`select=*&id=eq.${campaignId}`);if(!c)throw new Error('Campanha não encontrada.');
  const steps=await list('rds10_campaign_steps',`select=*&campaign_id=eq.${campaignId}&order=step_index.asc`);if(!steps.length)throw new Error('Campanha sem mensagens.');
  const rule=await rdsCampaignRules(campaignId);let targets=await rdsCampaignTargets(c);if(!targets.length)throw new Error('Nenhum cliente qualificado selecionado.');
  if(rule.shuffle)rdsShuffle(targets);
  // Grupo de embaralhamento: cada campanha recebe uma fatia diferente da mesma carteira na primeira onda.
  if(rule.shuffle_pool){const all=await list('rds10_campaigns','select=*&order=created_at.asc');const pool=[];for(const x of all){const rr=await rdsCampaignRules(x.id);if(String(rr.shuffle_pool||'')===String(rule.shuffle_pool))pool.push(x);}const idx=Math.max(0,pool.findIndex(x=>x.id===c.id));const n=Math.max(1,pool.length);targets=targets.filter((_,i)=>i%n===idx);}
  const start=new Date(c.start_at);if(Number.isNaN(start.getTime()))throw new Error('Data/hora inicial inválida.');
  let cumulative=0;for(const contact of targets){cumulative=0;for(const step of steps){cumulative+=Number(step.delay_minutes||0);const scheduled=new Date(start.getTime()+cumulative*60000).toISOString();await insert('rds10_deliveries',{campaign_id:c.id,campaign_code:c.code,step_id:step.id,step_index:step.step_index,contact_id:contact.id,phone:contact.phone,scheduled_at:scheduled,status:'AGENDADA',created_at:nowISO(),updated_at:nowISO()},'minimal');}}
  await patch('rds10_campaigns',`id=eq.${campaignId}`,{status:'ATIVA',activated_at:nowISO(),updated_at:nowISO()});return {targets:targets.length,deliveries:targets.length*steps.length};
}
async function rdsLastSent(phone){return one('rds10_deliveries',`select=sent_at&phone=eq.${encodeURIComponent(phone)}&status=eq.ENVIADA&order=sent_at.desc`).catch(()=>null);}
async function rdsSameMessageSent(phone,body){const rows=await list('rds10_messages',`select=body,created_at&phone=eq.${encodeURIComponent(phone)}&direction=eq.OUT&order=created_at.desc&limit=100`);const clean=cleanText(body).replace(/\\s*🛒\\s*\\*COMPRE AGORA:[\\s\\S]*$/i,'').trim();return rows.some(x=>cleanText(x.body).replace(/\\s*🛒\\s*\\*COMPRE AGORA:[\\s\\S]*$/i,'').trim()===clean);}
async function rdsCampaignSentCount(campaignId,since){const rows=await list('rds10_deliveries',`select=id&campaign_id=eq.${campaignId}&status=eq.ENVIADA&sent_at=gte.${encodeURIComponent(since)}`);return rows.length;}
async function sendDelivery(d){
  const order=await activeOrder(d.phone);if(order){await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:'CLIENTE_EM_PEDIDO',updated_at:nowISO()});return;}
  const c=await one('rds10_campaigns',`select=*&id=eq.${d.campaign_id}`);if(!c)throw new Error('Campanha não encontrada.');const rule=await rdsCampaignRules(d.campaign_id);
  if(rule.stop_on_order!==false&&order){await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:'CLIENTE_EM_PEDIDO',updated_at:nowISO()});return;}
  if(!rdsWithinWindow(rule)){if(rdsAfterWindow(rule)){await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:'HORARIO_CAMPANHA_ENCERRADO',updated_at:nowISO()});}return;}
  const last=await rdsLastSent(d.phone);if(last?.sent_at&&Number(rule.interval_minutes||0)>0){const due=new Date(last.sent_at).getTime()+Number(rule.interval_minutes)*60000;if(Date.now()<due){await patch('rds10_deliveries',`id=eq.${d.id}`,{scheduled_at:new Date(due).toISOString(),updated_at:nowISO()});return;}}
  const startDay=new Date();startDay.setHours(0,0,0,0);if(Number(rule.max_per_day||0)>0&&await rdsCampaignSentCount(d.campaign_id,startDay.toISOString())>=Number(rule.max_per_day)){await patch('rds10_deliveries',`id=eq.${d.id}`,{scheduled_at:new Date(Date.now()+3600000).toISOString(),updated_at:nowISO()});return;}
  const hour=new Date(Date.now()-3600000).toISOString();if(Number(rule.max_per_hour||0)>0&&await rdsCampaignSentCount(d.campaign_id,hour)>=Number(rule.max_per_hour)){await patch('rds10_deliveries',`id=eq.${d.id}`,{scheduled_at:new Date(Date.now()+900000).toISOString(),updated_at:nowISO()});return;}
  const step=await one('rds10_campaign_steps',`select=*&id=eq.${d.step_id}`);if(!step)throw new Error('Etapa não encontrada.');
  const cta=c.cta_enabled!==false?`\\n\\n🛒 *COMPRE AGORA:* https://wa.me/${connectedNumber}?text=${encodeURIComponent('QUERO COMPRAR RDS-'+(c.code||''))}`:'';const body=cleanText(step.message)+cta;
  if(rule.avoid_repeat!==false&&await rdsSameMessageSent(d.phone,body)){await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'CANCELADA',cancel_reason:'MENSAGEM_REPETIDA',updated_at:nowISO()});return;}
  const result=await sendTextPhone(d.phone,body);await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'ENVIADA',sent_at:nowISO(),wa_message_id:result.id,updated_at:nowISO()});
}
let queueBusy=false;
async function processQueue(){if(queueBusy||!connected)return;queueBusy=true;try{const due=await list('rds10_deliveries',`select=*&status=eq.AGENDADA&scheduled_at=lte.${encodeURIComponent(nowISO())}&order=scheduled_at.asc&limit=20`);for(const d of due){try{await sendDelivery(d);}catch(e){await patch('rds10_deliveries',`id=eq.${d.id}`,{status:'FALHA',error_text:e.message,updated_at:nowISO()});await addAlert('FALHA_ENVIO',`Falha no envio para ${d.phone}`,{delivery:d.id,error:e.message});}await sleep(900);}}finally{queueBusy=false;}}
setInterval(()=>processQueue().catch(()=>{}),15000);
async function rdsCleanupOldOrders(){const cutoff=new Date(Date.now()-30*24*60*60*1000).toISOString();const rows=await list('rds10_orders',`select=id,status,created_at&status=in.(CONCLUIDO,CANCELADO)&created_at=lt.${encodeURIComponent(cutoff)}&limit=1000`);for(const o of rows)await del('rds10_orders',`id=eq.${o.id}`);return rows.length;}
setInterval(()=>rdsCleanupOldOrders().catch(()=>{}),3600000);rdsCleanupOldOrders().catch(()=>{});

// Não criar cliente apenas porque uma mensagem/ligação entrou. Cliente qualificado nasce por pedido preenchido ou ação manual/importação.
server=server.replace("const contact = await upsertInboundContact(identity,pushName);","const contact = identity.phone ? await findContact(identity.phone) : null; if(contact) await patch('rds10_contacts',`id=eq.${contact.id}`,{last_seen_at:nowISO(),updated_at:nowISO()});");
// Campanhas só podem usar a carteira qualificada.
server=server.replace("app.get('/api/contacts',async(req,res)=>{ try{res.json(await list('rds10_contacts','select=*&order=created_at.desc'));}catch(e){res.status(500).json({error:e.message});} });","app.get('/api/contacts',async(req,res)=>{ try{const rows=await list('rds10_contacts','select=*&order=created_at.desc');res.json(req.query.all==='1'?rows:rows.filter(rdsQualifiedContact));}catch(e){res.status(500).json({error:e.message});} });");
// Retornos significam mensagens que realmente ficaram sem resposta posterior, não o total bruto de mensagens recebidas.
server=server.replace("app.get('/api/returns',async(req,res)=>{ try{res.json(await list('rds10_messages','select=*&direction=eq.IN&order=created_at.desc&limit=300'));}catch(e){res.status(500).json({error:e.message});} });","app.get('/api/returns',async(req,res)=>{ try{const all=await list('rds10_messages','select=*&order=created_at.desc&limit=2000');if(req.query.all==='1')return res.json(all.filter(x=>x.direction==='IN'));const by=new Map();for(const m of all){if(!m.phone)continue;const x=by.get(m.phone)||{};if(!x.in&&m.direction==='IN')x.in=m;if(!x.out&&m.direction==='OUT')x.out=m;by.set(m.phone,x);}const pending=[...by.values()].filter(x=>x.in&&(!x.out||new Date(x.in.created_at)>new Date(x.out.created_at))).map(x=>x.in);res.json(pending);}catch(e){res.status(500).json({error:e.message});} });");
// Endpoints de regras, estatísticas e limpeza.
server=server.replace("app.get('/api/campaigns/:id/details',async(req,res)=>",`app.get('/api/campaigns/:id/rules',async(req,res)=>{try{res.json(await rdsCampaignRules(req.params.id));}catch(e){res.status(500).json({error:e.message});}});\napp.put('/api/campaigns/:id/rules',async(req,res)=>{try{const rules={...rdsCampaignDefaults(),...(req.body||{})};await insert('rds10_events',{kind:'CAMPAIGN_RULES',payload:{campaign_id:req.params.id,rules},created_at:nowISO()},'minimal');res.json(rules);}catch(e){res.status(400).json({error:e.message});}});\napp.get('/api/campaigns/:id/stats',async(req,res)=>{try{const ds=await list('rds10_deliveries',`select=id,phone,status,sent_at&campaign_id=eq.${req.params.id}`);const incoming=await list('rds10_messages','select=phone,direction,created_at&direction=eq.IN&order=created_at.desc&limit=5000');const sentPhones=new Set(ds.filter(x=>x.status==='ENVIADA').map(x=>x.phone));const replies=new Set();for(const m of incoming){if(!sentPhones.has(m.phone))continue;const first=ds.find(x=>x.phone===m.phone&&x.status==='ENVIADA'&&x.sent_at);if(first&&new Date(m.created_at)>new Date(first.sent_at))replies.add(m.phone);}res.json({total:ds.length,queued:ds.filter(x=>x.status==='AGENDADA').length,sent:ds.filter(x=>x.status==='ENVIADA').length,failed:ds.filter(x=>x.status==='FALHA').length,cancelled:ds.filter(x=>x.status==='CANCELADA').length,replies:replies.size});}catch(e){res.status(500).json({error:e.message});}});\napp.post('/api/orders/cleanup',async(req,res)=>{try{res.json({ok:true,deleted:await rdsCleanupOldOrders()});}catch(e){res.status(500).json({error:e.message});}});\napp.get('/api/campaigns/:id/details',`);
// Dashboard de retornos deve refletir pendências reais.
server=server.replace("list('rds10_messages','select=id&direction=eq.IN'),","list('rds10_messages','select=id,phone,direction,created_at&order=created_at.desc&limit=2000'),");
server=server.replace("returns:returns.length,orders:orders.length", "returns:(()=>{const m=new Map();for(const x of returns){if(!x.phone)continue;const z=m.get(x.phone)||{};if(!z.in&&x.direction==='IN')z.in=x;if(!z.out&&x.direction==='OUT')z.out=x;m.set(x.phone,z);}return [...m.values()].filter(x=>x.in&&(!x.out||new Date(x.in.created_at)>new Date(x.out.created_at))).length;})(),orders:orders.length");

server=server.replace("app.listen(PORT,async()=>{","app.listen(PORT,async()=>{");
fs.writeFileSync(serverPath,server,'utf8');
}

console.log('[V10.71] operações refinadas: carteira qualificada, retornos reais, regras de campanha, embaralhamento, limites, horário e limpeza de histórico');
await import(pathToFileURL(v71Path).href+'?stable=1071');
