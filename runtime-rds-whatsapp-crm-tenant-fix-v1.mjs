import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS WHATSAPP CRM TENANT FIX V1';
if(server.includes(marker)){
  console.log('[RDS] vínculo WhatsApp/CRM por vendedor já aplicado');
  process.exit(0);
}

function replaceBetween(source,startText,endText,replacement){
  const start=source.indexOf(startText);
  if(start<0)throw new Error('Bloco não localizado: '+startText);
  const end=source.indexOf(endText,start);
  if(end<0)throw new Error('Fim não localizado: '+endText);
  return source.slice(0,start)+replacement+'\n'+source.slice(end);
}

const logNew=[
"async function logMessage({phone=null,lid=null,direction,type='text',body=null,status='RECEBIDA',waId=null,raw={}}){",
"  try{",
"    const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;",
"    await insert('rds10_messages',{seller_id:sellerId||null,phone,lid,direction,message_type:type,body,wa_message_id:waId,status,raw_payload:raw,created_at:nowISO()},'minimal');",
"  }catch(e){ console.error('[RDS] logMessage:',e.message); }",
"}"
].join('\n');
server=replaceBetween(server,'async function logMessage(','async function getSettings',logNew);

const saveNew=[
"function rdsAutoCustomerContactName(name){",
"  const parts=cleanText(name).split(/\\s+/).filter(Boolean).slice(0,2);",
"  return parts.length ? 'Cliente '+parts.join(' ') : 'Cliente';",
"}",
"async function saveOrMergeContact(data, {preferExisting=true}={}){",
"  const phone=phoneKey(data.phone);",
"  if(!phone)throw new Error('Telefone inválido.');",
"  const existing=await findContact(phone);",
"  const name=cleanText(data.name);",
"  const origin=String(data.origin||'').trim().toUpperCase();",
"  if(existing){",
"    const patchData={updated_at:nowISO()};",
"    const crmOrigin=['MANUAL','IMPORTACAO'].includes(origin);",
"    if(name&&(isAutoContactName(existing.name)||data.force_name||crmOrigin))patchData.name=name;",
"    if(data.group_name&&(!existing.group_name||existing.group_name==='ENTRADA WHATSAPP'||data.force_group||crmOrigin))patchData.group_name=cleanText(data.group_name);",
"    if(data.city)patchData.city=cleanText(data.city);",
"    if(data.tags)patchData.tags=cleanText(data.tags);",
"    if(data.lid&&!existing.lid)patchData.lid=data.lid;",
"    if(data.last_seen_at)patchData.last_seen_at=data.last_seen_at;",
"    if(data.validated===true)patchData.validated=true;",
"    if(crmOrigin)patchData.origin=origin;",
"    const rows=await patch('rds10_contacts','id=eq.'+existing.id,patchData);",
"    return {contact:rows?.[0]||{...existing,...patchData},merged:true};",
"  }",
"  const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;",
"  const contactName=origin==='PEDIDO'?rdsAutoCustomerContactName(name):(name||('Cliente '+phone.slice(-4)));",
"  const rows=await insert('rds10_contacts',{",
"    seller_id:sellerId||null,",
"    name:contactName,phone,lid:data.lid||null,",
"    group_name:cleanText(data.group_name)||'NOVOS',",
"    city:cleanText(data.city)||null,tags:cleanText(data.tags)||null,",
"    status:data.status||'ATIVO',origin:data.origin||'MANUAL',",
"    validated:Boolean(data.validated),last_seen_at:data.last_seen_at||null,",
"    created_at:nowISO(),updated_at:nowISO()",
"  });",
"  return {contact:rows?.[0],merged:false};",
"}"
].join('\n');
server=replaceBetween(server,'function saveOrMergeContact(','// RDS CRM ISOLATION V1',saveNew);

const historyNeed="rows.push({\n      phone:identity.phone,";
const hp=server.indexOf(historyNeed);
if(hp<0)throw new Error('logHistoryMessages não localizado.');
server=server.slice(0,hp)+"const historySellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;\n    rows.push({\n      seller_id:historySellerId||null,\n      phone:identity.phone,"+server.slice(hp+historyNeed.length);

const crmNew=[
"async function rdsEnsureInterestedContact(phone,name,lid){",
"  try{",
"    const p=normalizeBR(phone);",
"    if(!validBRPhone(p))return;",
"    const sellerId=typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null;",
"    const sellerFilter=sellerId?'&seller_id=eq.'+encodeURIComponent(sellerId):'';",
"    const existing=await one('rds10_contacts','select=*&phone=eq.'+encodeURIComponent(p)+sellerFilter);",
"    if(existing){",
"      const patchData={validated:true,last_seen_at:nowISO(),updated_at:nowISO()};",
"      if(lid&&!existing.lid)patchData.lid=String(lid);",
"      await patch('rds10_contacts','id=eq.'+existing.id,patchData);",
"      return;",
"    }",
"    const data={seller_id:sellerId||null,name:rdsAutoCustomerContactName(cleanText(name)),phone:p,group_name:'INTERESSADOS',status:'ATIVO',origin:'PEDIDO',whatsapp_validated:true,validated:true,last_seen_at:nowISO(),updated_at:nowISO()};",
"    if(lid)data.lid=String(lid);",
"    await insert('rds10_contacts',data,'minimal');",
"  }catch(e){console.error('[RDS] CRM interessado:',e.message);}",
"}"
].join('\n');
if(server.includes('async function rdsEnsureInterestedContact(')){
  server=replaceBetween(server,'async function rdsEnsureInterestedContact(','async function rdsRestoreQueueAfterExpiration',crmNew);
}

server=marker+'\n'+server;
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] vínculo WhatsApp/CRM por vendedor aplicado');
