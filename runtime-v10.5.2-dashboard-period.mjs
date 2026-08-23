import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname,'server.js');
const appPath = path.join(__dirname,'app.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');

  const old=`app.get('/api/dashboard',async(req,res)=>{\n  try{\n    const [contacts,campaigns,queue,sent,returns,orders,alerts,failed] = await Promise.all([\n      list('rds10_contacts','select=id&status=eq.ATIVO'),\n      list('rds10_campaigns','select=id,status&status=neq.EXCLUIDA'),\n      list('rds10_deliveries','select=id,scheduled_at&status=eq.AGENDADA'),\n      list('rds10_deliveries','select=id&status=eq.ENVIADA'),\n      list('rds10_messages','select=id&direction=eq.IN'),\n      list('rds10_orders','select=id,status,total_amount'),\n      list('rds10_alerts','select=id&is_read=eq.false'),\n      list('rds10_deliveries','select=id&status=eq.FALHA')\n    ]);\n    const purchases=orders.filter(x=>x.status==='CONCLUIDO');\n    const revenue=purchases.reduce((s,x)=>s+Number(x.total_amount||0),0);\n    res.json({\n      contacts:contacts.length,campaigns:campaigns.length,queue:queue.length,sent:sent.length,\n      returns:returns.length,orders:orders.length,purchases:purchases.length,revenue,\n      alerts:alerts.length,failed:failed.length,connected,number:connectedNumber,\n      proofReview:orders.filter(x=>x.status==='AGUARDANDO_CONFERENCIA').length,\n      ticketsPending:orders.filter(x=>x.status==='PAGO_AGUARDANDO_BILHETES').length,\n      nextSend:queue.sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))[0]?.scheduled_at||null\n    });\n  }catch(e){res.status(500).json({error:e.message});}\n});`;

  const neu=`app.get('/api/dashboard',async(req,res)=>{\n  try{\n    const period=String(req.query.period||'today');\n    const campaignCode=cleanText(req.query.campaign||'');\n    const [contacts,campaigns,queue,sent,returns,orders,alerts,failed] = await Promise.all([\n      list('rds10_contacts','select=id&status=eq.ATIVO'),\n      list('rds10_campaigns','select=id,code,name,status,start_at&status=neq.EXCLUIDA&order=created_at.desc'),\n      list('rds10_deliveries','select=id,scheduled_at&status=eq.AGENDADA'),\n      list('rds10_deliveries','select=id&status=eq.ENVIADA'),\n      list('rds10_messages','select=id&direction=eq.IN'),\n      list('rds10_orders','select=id,status,total_amount,campaign_code,created_at,updated_at'),\n      list('rds10_alerts','select=id&is_read=eq.false'),\n      list('rds10_deliveries','select=id&status=eq.FALHA')\n    ]);\n    const now=new Date();\n    let from=null;\n    if(period==='today'){ from=new Date(now); from.setHours(0,0,0,0); }\n    else if(period==='7d') from=new Date(now.getTime()-7*86400000);\n    else if(period==='30d') from=new Date(now.getTime()-30*86400000);\n    const periodOrders=orders.filter(o=>{\n      if(campaignCode && String(o.campaign_code||'')!==campaignCode) return false;\n      if(!from) return true;\n      const d=new Date(o.updated_at||o.created_at||0);\n      return !Number.isNaN(d.getTime()) && d>=from;\n    });\n    const purchases=periodOrders.filter(x=>x.status==='CONCLUIDO');\n    const revenue=purchases.reduce((sum,x)=>sum+Number(x.total_amount||0),0);\n    res.json({\n      contacts:contacts.length,campaigns:campaigns.length,queue:queue.length,sent:sent.length,\n      returns:returns.length,orders:periodOrders.length,purchases:purchases.length,revenue,\n      alerts:alerts.length,failed:failed.length,connected,number:connectedNumber,\n      proofReview:orders.filter(x=>x.status==='AGUARDANDO_CONFERENCIA').length,\n      ticketsPending:orders.filter(x=>x.status==='PAGO_AGUARDANDO_BILHETES').length,\n      nextSend:queue.sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))[0]?.scheduled_at||null,\n      period,campaign:campaignCode||null,campaignOptions:campaigns.map(c=>({code:c.code,name:c.name,start_at:c.start_at,status:c.status}))\n    });\n  }catch(e){res.status(500).json({error:e.message});}\n});`;

  if(!s.includes('campaignOptions:campaigns.map')){
    if(!s.includes(old)) throw new Error('endpoint dashboard não localizado');
    s=s.replace(old,neu);
  }
  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.5.2] dashboard por período/campanha aplicado');
}catch(e){console.error('[V10.5.2] backend:',e.message);process.exitCode=1;}

try{
  let a=fs.readFileSync(appPath,'utf8');
  a=a.replace(
    "async function home(){\n const d=await api('/api/dashboard');",
    "async function home(){\n const period=window.rdsDashPeriod||'today',campaign=window.rdsDashCampaign||'';\n const d=await api(`/api/dashboard?period=${encodeURIComponent(period)}&campaign=${encodeURIComponent(campaign)}`);"
  );
  a=a.replace(
    "<div class=grid>${[\n  ['Clientes ativos',d.contacts],['Campanhas',d.campaigns],['Na fila',d.queue],['Enviadas',d.sent],",
    "<div class=toolbar><select id=dashPeriod onchange=\"window.rdsDashPeriod=this.value;home()\"><option value=today>Hoje</option><option value=7d>Últimos 7 dias</option><option value=30d>Últimos 30 dias</option><option value=all>Todo período</option></select><select id=dashCampaign onchange=\"window.rdsDashCampaign=this.value;home()\"><option value=\"\">Todas as campanhas</option>${(d.campaignOptions||[]).map(c=>`<option value=\"${esc(c.code)}\">${esc(c.name)} • ${esc(c.code)}</option>`).join('')}</select></div><div class=grid>${[\n  ['Clientes ativos',d.contacts],['Campanhas',d.campaigns],['Na fila',d.queue],['Enviadas',d.sent],"
  );
  a=a.replace(
    " </div>`;\n}\n\nasync function showDiag()",
    " </div>`;\n if($('#dashPeriod')) $('#dashPeriod').value=period; if($('#dashCampaign')) $('#dashCampaign').value=campaign;\n}\n\nasync function showDiag()"
  );
  fs.writeFileSync(appPath,a,'utf8');
  console.log('[V10.5.2] filtros da Central de Vendas aplicados');
}catch(e){console.error('[V10.5.2] frontend:',e.message);process.exitCode=1;}

await import('./runtime-v10.5-campaign-premium.mjs');
