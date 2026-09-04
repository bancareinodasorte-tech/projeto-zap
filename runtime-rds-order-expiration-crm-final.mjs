import fs from 'node:fs';
const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS ORDER EXPIRATION CRM FINAL';
if(s.includes(marker)){console.log('[RDS] expiração/CRM final já aplicada');process.exit(0);}

const logOld="async function logEvent(kind, payload={}){\n  try{ await insert('rds10_events',{kind,payload,created_at:nowISO()},'minimal'); }catch{}\n}";
const logNew="async function logEvent(kind, payload={}){\n  try{\n    if(kind==='PEDIDO_DADOS_COMPLETOS' && payload?.phone){\n      const ord=payload.order?await one('rds10_orders','select=customer_name,code&code=eq.'+encodeURIComponent(payload.order)).catch(()=>null):null;\n      await saveOrMergeContact({name:payload.name||ord?.customer_name||'',phone:payload.phone,group_name:'INTERESSADOS',origin:'PEDIDO',status:'ATIVO',validated:true,force_group:true,last_seen_at:nowISO()}).catch(()=>{});\n    }\n    await insert('rds10_events',{kind,payload,created_at:nowISO()},'minimal');\n  }catch{}\n}";
if(s.includes(logOld))s=s.replace(logOld,logNew);

s=s.replace("function rdsQualifiedContact(c){const o=String(c?.origin||'').toUpperCase();const g=String(c?.group_name||'').toUpperCase();return ['MANUAL','IMPORTACAO','PEDIDO','COMPRA'].includes(o)||(!['ENTRADA WHATSAPP','NOVOS'].includes(g)&&o!=='WHATSAPP');}","function rdsQualifiedContact(c){const o=String(c?.origin||'').toUpperCase();const g=String(c?.group_name||'').toUpperCase();return ['MANUAL','IMPORTACAO','PEDIDO','COMPRA'].includes(o)||(!['ENTRADA WHATSAPP','NOVOS'].includes(g));}");

const oldConst="const RDS_ORDER_EXPIRATION_HOURS=Math.max(1,Number(process.env.RDS_ORDER_EXPIRATION_HOURS||process.env.ORDER_EXPIRATION_HOURS||24));\nconst RDS_ORDER_EXPIRATION_MS=RDS_ORDER_EXPIRATION_HOURS*60*60*1000;";
const newConst="async function rdsOrderExpirationHours(){try{const st=await getSettings();const n=Number(st.order_expiration_hours||3);return Math.max(0.25,Math.min(168,n));}catch{return 3;}}";
if(s.includes(oldConst))s=s.replace(oldConst,newConst);
const oldFn="function rdsOrderIsExpiredV1070(order){if(!order||!['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(String(order.status||''))||!order.created_at)return false;const created=Date.parse(order.created_at);return Number.isFinite(created)&&(Date.now()-created)>=RDS_ORDER_EXPIRATION_MS;}";
const newFn="async function rdsOrderIsExpiredV1070(order){if(!order||!['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(String(order.status||''))||!order.created_at)return false;const created=Date.parse(order.created_at);const hours=await rdsOrderExpirationHours();return Number.isFinite(created)&&(Date.now()-created)>=hours*60*60*1000;}";
if(s.includes(oldFn))s=s.replace(oldFn,newFn);

const helper=`\n${marker}\nasync function rdsRestoreCampaignQueueAfterExpiration(phone){\n  try{\n    const rows=await list('rds10_deliveries','select=id,scheduled_at,status,campaign_id,step_id,step_index,cancel_reason&phone=eq.'+encodeURIComponent(phone)+'&status=eq.CANCELADA&limit=500');\n    const eligible=rows.filter(x=>['INTERESSE','CLIENTE_EM_PEDIDO'].includes(String(x.cancel_reason||'')));\n    const now=Date.now();\n    for(const d of eligible){\n      const when=new Date(d.scheduled_at||now).getTime();\n      await patch('rds10_deliveries','id=eq.'+d.id,{status:'AGENDADA',scheduled_at:new Date(Math.max(now,Number.isFinite(when)?when:now)).toISOString(),updated_at:nowISO()});\n    }\n    if(eligible.length)await logEvent('PEDIDO_EXPIRADO_RETORNO_FILA',{phone,count:eligible.length});\n  }catch(e){console.error('[RDS] retorno à fila após expiração:',e.message);}\n}\n`;
if(!s.includes('async function rdsRestoreCampaignQueueAfterExpiration'))s=s.replace('async function rdsExpireOrderV1070(order){',helper+'\nasync function rdsExpireOrderV1070(order){');
s=s.replace("await cancelFutureDeliveries(order.phone,'PEDIDO_EXPIRADO');\nawait logEvent('PEDIDO_EXPIRADO'", "await rdsRestoreCampaignQueueAfterExpiration(order.phone);\nawait logEvent('PEDIDO_EXPIRADO'");

if(!s.includes('const rdsExpiredReset'))s=s.replace('const rdsPendingExpiredNotice=new Map();','const rdsPendingExpiredNotice=new Map();\nconst rdsExpiredReset=new Map();');
s=s.replace("rdsPendingExpiredNotice.set(order.phone,{code:order.code});", "rdsPendingExpiredNotice.set(order.phone,{code:order.code});\n  rdsExpiredReset.set(order.phone,{at:Date.now()});");

const apiMarker="app.get('/api/settings',async(req,res)=>";
if(!s.includes("app.get('/api/order-expiration',async(req,res)=>")){const pos=s.indexOf(apiMarker);if(pos>=0){const routes="app.get('/api/order-expiration',async(req,res)=>{try{res.json({hours:await rdsOrderExpirationHours(),default_hours:3});}catch(e){res.status(500).json({error:e.message});}});app.put('/api/order-expiration',async(req,res)=>{try{const hours=Math.max(0.25,Math.min(168,Number(req.body?.hours||3)));await patch('rds10_settings','id=eq.1',{order_expiration_hours:hours,updated_at:nowISO()});res.json({ok:true,hours});}catch(e){res.status(400).json({error:e.message});}});\n\n";s=s.slice(0,pos)+routes+s.slice(pos);}}

const cmdAnchor="const text=cleanText(inbound.text);const cmd=text.toLowerCase().replace(/[.]/g,'').trim();";
const cmdInject="const text=cleanText(inbound.text);const cmd=text.toLowerCase().replace(/[.]/g,'').trim();\n  const expiredReset=identity.phone?rdsExpiredReset.get(normalizeBR(identity.phone)):null;\n  if(expiredReset && !order){\n    rdsExpiredReset.delete(normalizeBR(identity.phone));\n    rdsPendingExpiredNotice.delete(normalizeBR(identity.phone));\n    await replyInbound(identity,rdsMainMenu(settings));\n    return;\n  }\n  if(expiredReset && order)rdsExpiredReset.delete(normalizeBR(identity.phone));";
if(s.includes(cmdAnchor)&&!s.includes('const expiredReset=identity.phone?rdsExpiredReset.get'))s=s.replace(cmdAnchor,cmdInject);

const guardMarker="// RDS NO ACTIVE ORDER PURCHASE ONLY";
const guardCode=String.raw`\n${guardMarker}\nasync function rdsPurchaseOnlyWithoutOrder(identity,cmd){\n  if(!identity.phone)return false;\n  const o=await activeOrder(identity.phone);\n  if(o)return false;\n  if(['2','3','4','5','6','consultar pedido','consultar meu pedido','alterar pedido','cancelar pedido','atendimento','outras opcoes','outras opções'].includes(cmd)){await replyInbound(identity,'🛒 *COMPRAR BILHETES*\\n\\nEnvie *COMPRAR* para iniciar.');return true;}\n  return false;\n}\n`;
if(!s.includes(guardMarker)){
  s=s.replace("const settings=await getSettings();if(!settings.bot_enabled)return;",guardCode+"\n  const settings=await getSettings();if(!settings.bot_enabled)return;");
  const finalAnchor="const text=cleanText(inbound.text);const cmd=text.toLowerCase().replace(/[.]/g,'').trim();";
  if(s.includes(finalAnchor))s=s.replace(finalAnchor,cmdInject+'\n  if(await rdsPurchaseOnlyWithoutOrder(identity,cmd))return;');
}

if(!s.includes('rdsExpireActiveOrdersTick')){const listen='app.listen(PORT,async()=>{';const tick=`async function rdsExpireActiveOrdersTick(){try{const rows=await list('rds10_orders','select=*&status=in.(COLETANDO_DADOS,AGUARDANDO_PAGAMENTO)&order=created_at.asc&limit=500');for(const o of rows)await rdsExpireOrderV1070(o,'SCHEDULED_EXPIRATION');}catch(e){console.error('[RDS] expiração automática:',e.message);}}\nsetTimeout(()=>rdsExpireActiveOrdersTick().catch(()=>{}),15000);\nsetInterval(()=>rdsExpireActiveOrdersTick().catch(()=>{}),60000);\n`;const p=s.indexOf(listen);if(p>=0)s=s.slice(0,p)+tick+s.slice(p);}

fs.writeFileSync(path,s,'utf8');
console.log('[RDS] expiração 3h editável + CRM interessado + retorno à fila + reset pós-expiração aplicados');