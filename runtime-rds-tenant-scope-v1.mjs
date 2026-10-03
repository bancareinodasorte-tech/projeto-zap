import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS TENANT SCOPE V1';
if(server.includes(marker)){console.log('[RDS] escopo multi-vendedor V1 já aplicado');process.exit(0);}

const insertFn="async function insert(table, row, returning='representation'){";
const helper = "// RDS TENANT SCOPE V1"
  + "const RDS_TENANT_TABLES=new Set(['rds10_groups','rds10_contacts','rds10_campaigns','rds10_campaign_steps','rds10_deliveries','rds10_messages','rds10_events','rds10_alerts','rds10_orders']);"
  + "function rdsTenantScope(){try{const s=typeof rdsRequestScope==='object'?rdsRequestScope.getStore?.():null;return s?.sellerId||null;}catch{return null}}"
  + "function rdsHasSellerFilter(q){return /(?:^|&)seller_id=/.test(String(q||''));}"
  + "function rdsTenantFilter(q,sellerId){const base=String(q||'');if(!sellerId||rdsHasSellerFilter(base))return base;return base?base+'&seller_id=eq.'+encodeURIComponent(sellerId):'seller_id=eq.'+encodeURIComponent(sellerId);}";
const p=server.indexOf(insertFn);if(p<0)throw new Error('função insert não localizada.');
server=server.slice(0,p)+helper+'\n'+server.slice(p);

const oldInsert = "async function insert(table, row, returning='representation'){\n  return sb(\`/rest/v1/\${table}\`, { method:'POST', headers:{Prefer:\`return=\${returning}\`}, body:JSON.stringify(row) });\n}";
const newInsert = "async function insert(table, row, returning='representation'){\n  const sellerId=rdsTenantScope();\n  if(sellerId&&RDS_TENANT_TABLES.has(table)&&row&&row.seller_id==null)row={...row,seller_id:sellerId};\n  return sb(\`/rest/v1/\${table}\`, { method:'POST', headers:{Prefer:\`return=\${returning}\`}, body:JSON.stringify(row) });\n}";
if(!server.includes(oldInsert))throw new Error('função insert não localizada para substituição.');
server=server.replace(oldInsert,newInsert);

const oldPatch = "async function patch(table, filter, row){\n  return sb(\`/rest/v1/\${table}?\${filter}\`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row) });\n}";
const newPatch = "async function patch(table, filter, row){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(filter,sellerId):filter;\n  return sb(\`/rest/v1/\${table}?\${scoped}\`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(row) });\n}";
if(!server.includes(oldPatch))throw new Error('função patch não localizada para substituição.');
server=server.replace(oldPatch,newPatch);

const oldDel = "async function del(table, filter){\n  return sb(\`/rest/v1/\${table}?\${filter}\`, { method:'DELETE', headers:{Prefer:'return=minimal'} });\n}";
const newDel = "async function del(table, filter){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(filter,sellerId):filter;\n  return sb(\`/rest/v1/\${table}?\${scoped}\`, { method:'DELETE', headers:{Prefer:'return=minimal'} });\n}";
if(!server.includes(oldDel))throw new Error('função del não localizada para substituição.');
server=server.replace(oldDel,newDel);

const oldOne = "async function one(table, query){\n  const rows = await sb(\`/rest/v1/\${table}?\${query}&limit=1\`);\n  return Array.isArray(rows) ? rows[0] || null : null;\n}";
const newOne = "async function one(table, query){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(query,sellerId):query;\n  const rows = await sb(\`/rest/v1/\${table}?\${scoped}&limit=1\`);\n  return Array.isArray(rows) ? rows[0] || null : null;\n}";
if(!server.includes(oldOne))throw new Error('função one não localizada para substituição.');
server=server.replace(oldOne,newOne);

const oldList = "async function list(table, query='select=*'){\n  const rows = await sb(\`/rest/v1/\${table}?\${query}\`);\n  return Array.isArray(rows) ? rows : [];\n}";
const newList = "async function list(table, query='select=*'){\n  const sellerId=rdsTenantScope();\n  const scoped=sellerId&&RDS_TENANT_TABLES.has(table)?rdsTenantFilter(query,sellerId):query;\n  const rows = await sb(\`/rest/v1/\${table}?\${scoped}\`);\n  return Array.isArray(rows) ? rows : [];\n}";
if(!server.includes(oldList))throw new Error('função list não localizada para substituição.');
server=server.replace(oldList,newList);

const importAnchor="import express from 'express';";
if(!server.includes("const rdsRequestScope=new AsyncLocalStorage()")){
  if(!server.includes(importAnchor))throw new Error('import express não localizado.');
  server=server.replace(importAnchor,importAnchor+"\nimport { AsyncLocalStorage } from 'node:async_hooks';\nconst rdsRequestScope=new AsyncLocalStorage();");
}
const jsonAnchor="app.use(express.json({ limit:'15mb' }));";
const jp=server.indexOf(jsonAnchor);if(jp<0)throw new Error('express.json não localizado.');
const middleware=\`app.use(async(req,res,next)=>{
  if(!String(req.path||'').startsWith('/api'))return next();
  try{
    if(typeof rdsOpSession==='function'){
      const s=await rdsOpSession(req).catch(()=>null);
      if(s?.seller?.id)return rdsRequestScope.run({sellerId:s.seller.id},()=>next());
    }
  }catch{}
  return next();
});
\`;
server=server.slice(0,jp+jsonAnchor.length)+'\n'+middleware+server.slice(jp+jsonAnchor.length);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] escopo multi-vendedor V1 instalado');
