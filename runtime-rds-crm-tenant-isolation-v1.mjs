import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS CRM TENANT ISOLATION V1';
if(server.includes(marker)){
  console.log('[RDS] isolamento do CRM por vendedor já aplicado');
  process.exit(0);
}

function replaceRoute(source,startMarker,nextMarker,newText,label){
  const a=source.indexOf(startMarker);
  if(a<0)throw new Error('Trecho não localizado: '+label);
  const b=source.indexOf(nextMarker,a);
  if(b<0)throw new Error('Fim não localizado: '+label);
  return source.slice(0,a)+newText+'\n'+source.slice(b);
}

const groupsGetNew="app.get('/api/groups',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const sid=encodeURIComponent(s.seller.id); let rows=await list('rds10_groups','select=*&seller_id=eq.'+sid+'&order=name.asc'); const defaults=['NOVOS','IMPORTADOS','CLIENTES','INTERESSADOS']; const have=new Set(rows.map(x=>String(x.name||'').toUpperCase())); for(const name of defaults){ if(!have.has(name)){ const normalized=name.normalize('NFD').replace(/[\\\\u0300-\\\\u036f]/g,''); const ins=await insert('rds10_groups',{seller_id:s.seller.id,name,normalized_name:normalized,is_system:true,created_at:nowISO()}); if(ins?.[0])rows.push(ins[0]); } } rows.sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')); res.json(rows); }catch(e){res.status(500).json({error:e.message});} });";
const groupsPostNew="app.post('/api/groups',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const name=cleanText(req.body.name).toUpperCase(); if(!name)throw new Error('Nome obrigatório.'); const normalized=name.normalize('NFD').replace(/[\\\\u0300-\\\\u036f]/g,''); const existing=await one('rds10_groups','select=*&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&normalized_name=eq.'+encodeURIComponent(normalized)); if(existing)return res.json(existing); const rows=await insert('rds10_groups',{seller_id:s.seller.id,name,normalized_name:normalized,is_system:false,created_at:nowISO()}); res.json(rows[0]); }catch(e){res.status(400).json({error:e.message});} });";

server=replaceRoute(server,"app.get('/api/groups'","app.post('/api/groups'",groupsGetNew,'groups GET');
server=replaceRoute(server,"app.post('/api/groups'","app.get('/api/contacts'",groupsPostNew,'groups POST');

const contactsGetNew="app.get('/api/contacts',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const rows=await list('rds10_contacts','select=*&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&origin=not.in.(WHATSAPP,WHATSAPP_HISTORICO)&order=created_at.desc'); res.json(rows); }catch(e){res.status(500).json({error:e.message});} });";
const contactsPostNew="app.post('/api/contacts',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const phone=phoneKey(req.body.phone); if(!phone)throw new Error('Telefone inválido.'); const found=connected?await sock.onWhatsApp(phone+'@s.whatsapp.net'):null; const valid=connected?Boolean(found?.[0]?.exists):false; const existing=await one('rds10_contacts','select=*&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&phone=eq.'+encodeURIComponent(phone)); if(existing){ const rows=await patch('rds10_contacts','id=eq.'+encodeURIComponent(existing.id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),{name:cleanText(req.body.name)||existing.name,group_name:cleanText(req.body.group_name)||existing.group_name,city:cleanText(req.body.city)||null,tags:cleanText(req.body.tags)||null,validated:valid,updated_at:nowISO()}); return res.json({...rows[0],merged:true}); } const rows=await insert('rds10_contacts',{seller_id:s.seller.id,name:cleanText(req.body.name)||('Cliente '+phone.slice(-4)),phone,group_name:cleanText(req.body.group_name)||'NOVOS',city:cleanText(req.body.city)||null,tags:cleanText(req.body.tags)||null,status:req.body.status||'ATIVO',origin:'MANUAL',validated:valid,created_at:nowISO(),updated_at:nowISO()}); res.json({...rows[0],merged:false}); }catch(e){res.status(400).json({error:e.message});} });";
const contactsPutNew="app.put('/api/contacts/:id',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const id=cleanText(req.params.id); const current=await one('rds10_contacts','select=id&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&id=eq.'+encodeURIComponent(id)); if(!current)throw new Error('Cliente não encontrado para este vendedor.'); const row={...req.body,updated_at:nowISO()}; delete row.seller_id; if(row.phone)row.phone=normalizeBR(row.phone); const rows=await patch('rds10_contacts','id=eq.'+encodeURIComponent(id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),row); res.json(rows[0]); }catch(e){res.status(400).json({error:e.message});} });";
const contactsDeleteNew="app.delete('/api/contacts/:id',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; await del('rds10_contacts','id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id)); res.json({ok:true}); }catch(e){res.status(400).json({error:e.message});} });";
const contactsValidateNew="app.post('/api/contacts/:id/validate',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const c=await one('rds10_contacts','select=*&id=eq.'+encodeURIComponent(req.params.id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id)); if(!c)throw new Error('Contato não encontrado.'); if(!sock||!connected)throw new Error('WhatsApp não está conectado.'); const pn=normalizeBR(c.phone)+'@s.whatsapp.net'; const f=await sock.onWhatsApp(pn); const ok=Boolean(f?.[0]?.exists); const rows=await patch('rds10_contacts','id=eq.'+encodeURIComponent(c.id)+'&seller_id=eq.'+encodeURIComponent(s.seller.id),{validated:ok,updated_at:nowISO()}); res.json(rows[0]); }catch(e){res.status(400).json({error:e.message});} });";
const contactsImportNew="app.post('/api/contacts/import',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const items=Array.isArray(req.body.items)?req.body.items:[]; const saved=[],duplicates=[],invalid=[]; for(const item of items){ const phone=normalizeBR(item.phone); if(!validBRPhone(phone)){invalid.push(item);continue;} const existing=await one('rds10_contacts','select=id&seller_id=eq.'+encodeURIComponent(s.seller.id)+'&phone=eq.'+encodeURIComponent(phone)); if(existing){duplicates.push(item);continue;} const rows=await insert('rds10_contacts',{seller_id:s.seller.id,name:cleanText(item.name)||('Cliente '+phone.slice(-4)),phone,group_name:cleanText(item.group_name)||'IMPORTADOS',status:'ATIVO',origin:'IMPORTACAO',validated:false,created_at:nowISO(),updated_at:nowISO()}); if(rows?.[0])saved.push(rows[0]); } res.json({saved:saved.length,duplicates:duplicates.length,invalid:invalid.length}); }catch(e){res.status(400).json({error:e.message});} });";

server=replaceRoute(server,"app.get('/api/contacts'","app.post('/api/contacts'",contactsGetNew,'contacts GET');
server=replaceRoute(server,"app.post('/api/contacts'","app.put('/api/contacts/:id'",contactsPostNew,'contacts POST');
server=replaceRoute(server,"app.put('/api/contacts/:id'","app.delete('/api/contacts/:id'",contactsPutNew,'contacts PUT');
server=replaceRoute(server,"app.delete('/api/contacts/:id'","app.post('/api/contacts/:id/validate'",contactsDeleteNew,'contacts DELETE');
server=replaceRoute(server,"app.post('/api/contacts/:id/validate'","app.post('/api/contacts/import'",contactsValidateNew,'contacts validate');
server=replaceRoute(server,"app.post('/api/contacts/import'","app.get('/api/campaigns'",contactsImportNew,'contacts import');

const profileNew="app.get('/api/contacts/:id/profile',async(req,res)=>{ try{ const s=await rdsOpRequire(req,res); if(!s)return; const sid=encodeURIComponent(s.seller.id); const id=encodeURIComponent(req.params.id); const c=await one('rds10_contacts','select=*&id=eq.'+id+'&seller_id=eq.'+sid); if(!c)throw new Error('Contato não encontrado.'); const phone=encodeURIComponent(c.phone); const [orders,messages,deliveries]=await Promise.all([list('rds10_orders','select=*&seller_id=eq.'+sid+'&phone=eq.'+phone+'&order=updated_at.desc'),list('rds10_messages','select=*&seller_id=eq.'+sid+'&phone=eq.'+phone+'&order=created_at.desc&limit=100'),list('rds10_deliveries','select=*&seller_id=eq.'+sid+'&phone=eq.'+phone+'&order=scheduled_at.desc&limit=100')]); const completed=orders.filter(x=>x.status==='CONCLUIDO'); res.json({contact:c,orders,messages,deliveries,metrics:{orders:orders.length,purchases:completed.length,spent:completed.reduce((a,x)=>a+Number(x.total_amount||0),0),inbound:messages.filter(x=>x.direction==='IN').length,campaigns:new Set(deliveries.map(x=>x.campaign_id).filter(Boolean)).size}}); }catch(e){res.status(400).json({error:e.message});} });";
server=replaceRoute(server,"app.get('/api/contacts/:id/profile'","app.get('/api/automation-center'",profileNew,'contacts profile');

const markerPos=server.indexOf("app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));");
if(markerPos<0)throw new Error('catch-all não localizado.');
server=server.slice(0,markerPos)+"console.log('[RDS] CRM isolado por vendedor: clientes, grupos e perfis por tenant.');\n"+server.slice(markerPos);

fs.writeFileSync(path,server,'utf8');
console.log('[RDS] isolamento do CRM por vendedor aplicado');
