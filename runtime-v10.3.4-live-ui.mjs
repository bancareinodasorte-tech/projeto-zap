import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(__dirname, 'app.js');
const serverPath = path.join(__dirname, 'server.js');

try {
  let src = fs.readFileSync(appPath, 'utf8');

  src = src.replace(
    "fetch(url,{...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}})",
    "fetch(url,{cache:'no-store',...opt,headers:{'Content-Type':'application/json','Cache-Control':'no-cache',...(opt.headers||{})}})"
  );

  for (const marker of ['/* RDS_LIVE_UI_V10_3_4 */','/* RDS_LIVE_UI_V10_3_7 */','/* RDS_AUTO_REFRESH_V10_4_2 */']) {
    const i = src.indexOf(marker);
    if (i >= 0) src = src.slice(0, i).trimEnd() + '\n';
  }

  src = src.replace(
    "async function render(){app.innerHTML='<div class=\"card\"><span class=mut>Carregando operação...</span></div>';try{",
    "async function render(){if(app?.dataset?.rdsPage===page&&app.children.length)return;app.dataset.rdsPage=page;app.innerHTML='<div class=\"card\"><span class=mut>Carregando operação...</span></div>';try{"
  );

  // V10.4.4 — em Compras, o cliente é a identificação principal; código do pedido fica secundário.
  src = src.replace(
    "<div><h2 style=\"margin:0\">${esc(o.code)}</h2><p class=mut>${esc(o.customer_name||o.phone)} • ${o.quantity||'—'} bilhete(s) • ${money(o.total_amount)}</p></div>${badge(o.status)}",
    "<div><h2 style=\"margin:0\">${esc(o.customer_name||o.phone||'Cliente')}</h2><p class=mut>${esc(o.code)} • ${o.quantity||'—'} bilhete(s) • ${money(o.total_amount)}</p></div>${badge(o.status)}"
  );

  // V10.4.5 — Retornos usa o nome salvo no CRM/agenda como identificação principal.
  src = src.replace(
    "async function returnsPage(){const [rs,os]=await Promise.all([api('/api/returns'),api('/api/orders')]);state.returns=rs;const latest=new Map();for(const r of rs){if(r.phone&&!latest.has(r.phone))latest.set(r.phone,r)}",
    "async function returnsPage(){const [rs,os,cs]=await Promise.all([api('/api/returns'),api('/api/orders'),api('/api/contacts')]);state.returns=rs;const phoneDigits=v=>String(v||'').replace(/\\D/g,'');const aliases=v=>{const n=phoneDigits(v);const a=new Set([n]);if(n.startsWith('55')&&n.length>=12){const p=n.slice(0,4),l=n.slice(4);if(l.length===9&&l[0]==='9')a.add(p+l.slice(1));if(l.length===8)a.add(p+'9'+l)}return [...a]};const samePhone=(a,b)=>{const bb=new Set(aliases(b));return aliases(a).some(x=>bb.has(x))};const contactFor=p=>cs.find(c=>samePhone(c.phone,p));state.contacts=cs;const latest=new Map();for(const r of rs){if(r.phone&&!latest.has(r.phone))latest.set(r.phone,r)}"
  );
  src = src.replace(
    "<div><h2 style=\"margin:0\">${esc(r.phone||'Identidade pendente')}</h2><p class=mut>${dt(r.created_at)}</p></div>${badge(o?.status||'NOVO RETORNO')}",
    "<div><h2 style=\"margin:0\">${esc(contactFor(r.phone)?.name||r.phone||'Identidade pendente')}</h2><p class=mut>${contactFor(r.phone)?.name?esc(r.phone)+' • ':''}${dt(r.created_at)}</p></div>${badge(o?.status||'NOVO RETORNO')}"
  );

  src += `\n/* RDS_AUTO_REFRESH_V10_4_2 */\nlet rdsSilentBusy=false;\nasync function rdsSilentRefresh(){\n  if(rdsSilentBusy || document.hidden || document.querySelector('.modal')) return;\n  rdsSilentBusy=true;\n  try{\n    if(page==='contacts'){ const oldSearch=$('#contactSearch')?.value||''; const oldGroup=$('#contactGroup')?.value||''; await loadContacts(); if($('#contactSearch')) $('#contactSearch').value=oldSearch; if($('#contactGroup')) $('#contactGroup').value=oldGroup; if($('#contactsBody')) filterContacts(); }\n    else if(page==='returns'){ await returnsPage(); }\n    else if(page==='orders'){ await orders(); }\n    else if(page==='home'){ await home(); }\n    else if(page==='execution'){ await automation(); }\n    else if(page==='campaigns'){ await campaigns(); }\n  }catch(e){} finally{rdsSilentBusy=false;}\n}\nsetInterval(rdsSilentRefresh,5000);\n`;

  fs.writeFileSync(appPath, src, 'utf8');
  console.log('[V10.4.5] UI automática silenciosa + nomes do CRM em Retornos');
} catch (err) {
  console.error('[V10.4.5] falha ao preparar interface:', err?.message || err);
}

try {
  let s = fs.readFileSync(serverPath, 'utf8');

  if(!s.includes('RDS_PHONE_EQUIV_V10_4_2')){
    s = s.replace(
      "function phoneKey(v){\n  const n = normalizeBR(v);\n  return validBRPhone(n) ? n : '';\n}",
      `function phoneKey(v){\n  const n = normalizeBR(v);\n  return validBRPhone(n) ? n : '';\n}\n// RDS_PHONE_EQUIV_V10_4_2\nfunction phoneAliases(v){\n  const n=phoneKey(v); if(!n) return [];\n  const out=new Set([n]);\n  const local=n.slice(4);\n  const prefix=n.slice(0,4);\n  if(local.length===9 && local[0]==='9') out.add(prefix+local.slice(1));\n  if(local.length===8) out.add(prefix+'9'+local);\n  return [...out];\n}\nfunction sameBRPhone(a,b){\n  const aa=phoneAliases(a), bb=new Set(phoneAliases(b));\n  return aa.some(x=>bb.has(x));\n}`
    );
    s = s.replace(
      "  return rows.find(x => phoneKey(x.phone) === key) || null;",
      "  return rows.find(x => sameBRPhone(x.phone, key)) || null;"
    );
  }

  if(!s.includes('RDS_MERGE_DUP_CONTACTS_V10_4_3')){
    const anchor = "function isAutoContactName(name=''){";
    const pos = s.indexOf(anchor);
    if(pos >= 0){
      const helper = `// RDS_MERGE_DUP_CONTACTS_V10_4_3\nasync function mergeDuplicateContacts(){\n  const rows=await list('rds10_contacts','select=*&order=updated_at.desc');\n  const groups=[];\n  for(const c of rows){\n    let g=groups.find(x=>sameBRPhone(x[0].phone,c.phone));\n    if(g) g.push(c); else groups.push([c]);\n  }\n  for(const g of groups.filter(x=>x.length>1)){\n    g.sort((a,b)=>{\n      const score=x=>((x.origin==='WHATSAPP'||x.origin==='MANUAL')?100:0)+(!isAutoContactName(x.name)?20:0)+(x.group_name==='COMPRA REALIZADA'?10:0)+(x.validated?5:0);\n      return score(b)-score(a) || new Date(b.updated_at||0)-new Date(a.updated_at||0);\n    });\n    const keep=g[0];\n    for(const dup of g.slice(1)){\n      const patchData={updated_at:nowISO()};\n      if((!keep.name||isAutoContactName(keep.name)) && dup.name && !isAutoContactName(dup.name)) patchData.name=dup.name;\n      if((!keep.group_name||keep.group_name==='NOVOS') && dup.group_name && dup.group_name!=='NOVOS') patchData.group_name=dup.group_name;\n      if(!keep.city && dup.city) patchData.city=dup.city;\n      if(!keep.tags && dup.tags) patchData.tags=dup.tags;\n      if(!keep.lid && dup.lid) patchData.lid=dup.lid;\n      if(dup.validated) patchData.validated=true;\n      if(Object.keys(patchData).length>1) await patch('rds10_contacts',\`id=eq.\${keep.id}\`,patchData);\n      await del('rds10_contacts',\`id=eq.\${dup.id}\`);\n    }\n  }\n}\n`;
      s = s.slice(0,pos) + helper + s.slice(pos);
    }

    s = s.replace(
      "app.get('/api/contacts',async(req,res)=>{ try{res.json(await list('rds10_contacts','select=*&order=created_at.desc'));}catch(e){res.status(500).json({error:e.message});} });",
      "app.get('/api/contacts',async(req,res)=>{ try{await mergeDuplicateContacts();res.json(await list('rds10_contacts','select=*&order=created_at.desc'));}catch(e){res.status(500).json({error:e.message});} });"
    );
  }

  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.4.5] backend: deduplicação de contatos preservada');
}catch(err){ console.error('[V10.4.5] falha backend:',err?.message||err); }

await import('./bootstrap-v10.3.3-v10.mjs');
