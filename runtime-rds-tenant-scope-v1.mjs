import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS TENANT SCOPE V1';
if(server.includes(marker)){console.log('[RDS] escopo multi-vendedor V1 já aplicado');process.exit(0);}

const insertFn="async function insert(table, row, returning='representation'){";
const helper = [
  "// RDS TENANT SCOPE V1",
  "const RDS_TENANT_TABLES=new Set(['rds10_groups','rds10_contacts','rds10_campaigns','rds10_campaign_steps','rds10_deliveries','rds10_messages','rds10_events','rds10_alerts','rds10_orders','rds10_whatsapp_chat_state','rds10_seller_settings','rds10_ticket_documents']);",
  "async function rdsTenantPrepareInsertRow(table,row,sellerId,companyId){",
  "  if(!RDS_TENANT_TABLES.has(table))return row;",
  "  let activeCompanyPromise=null;",
  "  const activeCheckCache=new Map(),membershipCheckCache=new Map();",
  "  const onlyActiveCompany=async()=>{if(!activeCompanyPromise)activeCompanyPromise=(async()=>{const rows=await list('rds10_companies','select=id&active=eq.true&limit=2');const ids=[...new Set((rows||[]).map(c=>String(c.id||'')).filter(Boolean))];if(ids.length!==1)throw new Error(ids.length?'RDS_TENANT_COMPANY_AMBIGUOUS':'RDS_TENANT_COMPANY_REQUIRED');return ids[0];})();return activeCompanyPromise;};",
  "  const prepare=async(item)=>{",
  "    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('RDS_TENANT_ROW_INVALID');",
  "    let out={...item};",
  "    if(sellerId&&!out.seller_id)out.seller_id=sellerId;",
  "    if(companyId&&!out.company_id)out.company_id=companyId;",
  "    const rowSeller=String(out.seller_id||sellerId||'');",
  "    if(sellerId&&rowSeller&&rowSeller!==String(sellerId))throw new Error('RDS_TENANT_SELLER_MISMATCH');",
  "    if(companyId&&out.company_id&&String(out.company_id)!==String(companyId))throw new Error('RDS_TENANT_COMPANY_MISMATCH');",
  "    if(!out.company_id){",
  "      if(rowSeller){const memberships=await list('rds10_seller_companies','select=company_id&seller_id=eq.'+encodeURIComponent(rowSeller)+'&active=eq.true&limit=1000');const ids=[...new Set((memberships||[]).map(m=>String(m.company_id||'')).filter(Boolean))];if(ids.length!==1)throw new Error(ids.length?'RDS_TENANT_COMPANY_AMBIGUOUS':'RDS_TENANT_COMPANY_REQUIRED');out.company_id=ids[0];}",
  "      else out.company_id=await onlyActiveCompany();",
  "    }",
  "    const companyKey=String(out.company_id);let activeCheck=activeCheckCache.get(companyKey);if(!activeCheck){activeCheck=one('rds10_companies','select=id&active=eq.true&id=eq.'+encodeURIComponent(companyKey));activeCheckCache.set(companyKey,activeCheck);}const active=await activeCheck;",
  "    if(!active)throw new Error('RDS_TENANT_COMPANY_MISMATCH');",
  "    if(rowSeller){const membershipKey=rowSeller+'|'+String(out.company_id);let membershipCheck=membershipCheckCache.get(membershipKey);if(!membershipCheck){membershipCheck=one('rds10_seller_companies','select=seller_id&seller_id=eq.'+encodeURIComponent(rowSeller)+'&company_id=eq.'+encodeURIComponent(String(out.company_id))+'&active=eq.true');membershipCheckCache.set(membershipKey,membershipCheck);}const membership=await membershipCheck;if(!membership)throw new Error('RDS_TENANT_COMPANY_MISMATCH');}",
  "    return out;",
  "  };",
  "  return Array.isArray(row)?Promise.all(row.map(prepare)):prepare(row);",
  "}",
  "function rdsTenantScope(){try{const s=typeof rdsRequestScope==='object'?rdsRequestScope.getStore?.():null;return s?.sellerId||null;}catch{return null}}",
  "function rdsTenantCompanyScope(){try{const s=typeof rdsRequestScope==='object'?rdsRequestScope.getStore?.():null;return s?.companyId||null;}catch{return null}}",
  "function rdsHasSellerFilter(q){return /(?:^|&)seller_id=/.test(String(q||''));}",
  "function rdsHasCompanyFilter(q){return /(?:^|&)company_id=/.test(String(q||''));}",
  "function rdsTenantFilter(table,q,sellerId,companyId){let out=String(q||'');if(sellerId&&RDS_TENANT_TABLES.has(table))out=out?out+'&seller_id=eq.'+encodeURIComponent(sellerId):'seller_id=eq.'+encodeURIComponent(sellerId);if(companyId&&RDS_TENANT_TABLES.has(table))out=out?out+'&company_id=eq.'+encodeURIComponent(companyId):'company_id=eq.'+encodeURIComponent(companyId);return out;}"
].join('\n');
const p=server.indexOf(insertFn);if(p<0)throw new Error('função insert não localizada.');
server=server.slice(0,p)+helper+'\n'+server.slice(p);

const oldInsert = "async function insert(table, row, returning='representation'){\n  return sb(\`/rest/v1/\${table}\`, { method:'POST', headers:{Prefer:\`return=\${returning}\`}, body:JSON.stringify(row) });\n}";
const newInsert = "async function insert(table, row, returning='representation'){\n  const sellerId=rdsTenantScope(),companyId=rdsTenantCompanyScope();\n  row=await rdsTenantPrepareInsertRow(table,row,sellerId,companyId);\n  return sb('/rest/v1/'+table, { method:'POST', headers:{Prefer:'return='+returning}, body:JSON.stringify(row) });\n}";
if(!server.includes(oldInsert))throw new Error('função insert não localizada para substituição.');
server=server.replace(oldInsert,newInsert);

const oldPatch = "async function patch(table, filter, row){\n  return sb(\`/rest/v1/\${table}?\${filter}\`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row) });\n}";
const newPatch = "async function patch(table, filter, row){\n  const sellerId=rdsTenantScope(),companyId=rdsTenantCompanyScope();\n  if(sellerId&&RDS_TENANT_TABLES.has(table)&&row&&typeof row==='object'){\n    if(Object.prototype.hasOwnProperty.call(row,'seller_id')&&String(row.seller_id||'')!==String(sellerId))throw new Error('RDS_TENANT_SELLER_MISMATCH');\n    if(Object.prototype.hasOwnProperty.call(row,'company_id')&&String(row.company_id||'')!==String(companyId||''))throw new Error('RDS_TENANT_COMPANY_MISMATCH');\n  }\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(table,filter,sellerId,companyId):filter;\n  return sb('/rest/v1/'+table+'?'+scoped, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row) });\n}";
if(!server.includes(oldPatch))throw new Error('função patch não localizada para substituição.');
server=server.replace(oldPatch,newPatch);

const oldDel = "async function del(table, filter){\n  return sb(\`/rest/v1/\${table}?\${filter}\`, { method:'DELETE', headers:{Prefer:'return=minimal'} });\n}";
const newDel = "async function del(table, filter){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(table,filter,sellerId,rdsTenantCompanyScope()):filter;\n  return sb(\`/rest/v1/\${table}?\${scoped}\`, { method:'DELETE', headers:{Prefer:'return=minimal'} });\n}";
if(!server.includes(oldDel))throw new Error('função del não localizada para substituição.');
server=server.replace(oldDel,newDel);

const oldOne = "async function one(table, query){\n  const rows = await sb(\`/rest/v1/\${table}?\${query}&limit=1\`);\n  return Array.isArray(rows) ? rows[0] || null : null;\n}";
const newOne = "async function one(table, query){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(table,query,sellerId,rdsTenantCompanyScope()):query;\n  const rows = await sb(\`/rest/v1/\${table}?\${scoped}&limit=1\`);\n  return Array.isArray(rows) ? rows[0] || null : null;\n}";
if(!server.includes(oldOne))throw new Error('função one não localizada para substituição.');
server=server.replace(oldOne,newOne);

const oldList = "async function list(table, query='select=*'){\n  const rows = await sb(\`/rest/v1/\${table}?\${query}\`);\n  return Array.isArray(rows) ? rows : [];\n}";
const newList = "async function list(table, query='select=*'){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(table,query,sellerId,rdsTenantCompanyScope()):query;\n  const rows = await sb(\`/rest/v1/\${table}?\${scoped}\`);\n  return Array.isArray(rows) ? rows : [];\n}";
if(!server.includes(oldList))throw new Error('função list não localizada para substituição.');
server=server.replace(oldList,newList);

const importAnchor="const express = require('express');";
if(!server.includes("const rdsRequestScope=new AsyncLocalStorage()")){
  if(!server.includes(importAnchor))throw new Error('import express não localizado.');
  server=server.replace(importAnchor,importAnchor+"\nconst { AsyncLocalStorage } = require('node:async_hooks');\nconst rdsRequestScope=new AsyncLocalStorage();");
}
const jsonAnchor="app.use(express.json({ limit: '15mb' }));";
const jp=server.indexOf(jsonAnchor);if(jp<0)throw new Error('express.json não localizado.');
const middleware = [
  "app.use(async(req,res,next)=>{",
  "  if(!String(req.path||'').startsWith('/api'))return next();",
  "  if(['/api/rds/unified/login','/api/rds/unified/context','/api/rds/unified/logout'].includes(String(req.path||'')))return next();",
  "  const sellerToken=(typeof rdsOpBearer==='function'?rdsOpBearer(req):null)||(typeof rdsOpCookie==='function'?rdsOpCookie(req):null);",
  "  if(!sellerToken)return next();",
  "  let session=null;try{if(typeof rdsOpSession==='function')session=await rdsOpSession(req);}catch{}",
  "  if(!session?.seller?.id){",
  "    let admin=null;try{if((typeof rdsAdminBearer==='function'&&rdsAdminBearer(req))||(typeof rdsAdminCookie==='function'&&rdsAdminCookie(req)))admin=await rdsAdminSession(req);}catch{}",
  "    if(admin?.admin?.id)return next();",
  "    return res.status(401).json({success:false,code:'SELLER_SESSION_INVALID',error:'Sessão de vendedor inválida ou expirada. Entre novamente.'});",
  "  }",
  "  let memberships;try{memberships=await list('rds10_seller_companies','select=company_id&seller_id=eq.'+encodeURIComponent(session.seller.id)+'&active=eq.true&limit=1000');}catch(e){return res.status(503).json({success:false,code:'COMPANY_MEMBERSHIP_UNAVAILABLE',error:'Não foi possível validar a empresa vinculada à conta. Tente novamente.'});}",
  "  const companyIds=[...new Set((memberships||[]).map(m=>String(m.company_id||'')).filter(Boolean))];",
  "  if(!companyIds.length)return res.status(403).json({success:false,code:'COMPANY_MEMBERSHIP_REQUIRED',error:'Esta conta não possui vínculo ativo com uma empresa.'});",
  "  const requested=String(req.headers['x-rds-company-id']||req.query?.company_id||req.body?.company_id||'').trim();",
  "  if(requested&&!companyIds.includes(requested))return res.status(403).json({success:false,code:'COMPANY_MEMBERSHIP_MISMATCH',error:'A empresa selecionada não está autorizada para esta conta.'});",
  "  if(companyIds.length>1&&!requested)return res.status(409).json({success:false,code:'COMPANY_SELECTION_REQUIRED',error:'Selecione a empresa antes de continuar.'});",
  "  const companyId=requested||companyIds[0];",
  "  let company;try{company=await one('rds10_companies','select=id&active=eq.true&id=eq.'+encodeURIComponent(companyId));}catch(e){return res.status(503).json({success:false,code:'COMPANY_STATUS_UNAVAILABLE',error:'Não foi possível validar o estado da empresa. Tente novamente.'});}",
  "  if(!company)return res.status(403).json({success:false,code:'COMPANY_INACTIVE',error:'A empresa selecionada está inativa ou não existe.'});",
  "  return rdsRequestScope.run({sellerId:session.seller.id,companyId},()=>next());",
  "});"
].join(String.fromCharCode(10));
server=server.slice(0,jp+jsonAnchor.length)+'\n'+middleware+server.slice(jp+jsonAnchor.length);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] escopo multi-vendedor V1 instalado');
