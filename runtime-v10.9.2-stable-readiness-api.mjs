import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');
const appPath=path.join(__dirname,'app.js');

// Registra as APIs estáveis ANTES de qualquer import que inicialize o servidor.
try{
  let s=fs.readFileSync(serverPath,'utf8');
  if(!s.includes('RDS_STABLE_READINESS_API_V10_9_2')){
    const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
    const pos=s.indexOf(marker);
    if(pos<0) throw new Error('ponto de inserção das APIs V10.9.2 não localizado');
    const routes=`// RDS_STABLE_READINESS_API_V10_9_2\nfunction rds1092FromPeriod(period){\n  const now=new Date();\n  if(period==='today'){const d=new Date(now);d.setHours(0,0,0,0);return d;}\n  if(period==='7d')return new Date(now.getTime()-7*86400000);\n  if(period==='30d')return new Date(now.getTime()-30*86400000);\n  return null;\n}\napp.get('/api/v1092/readiness',async(req,res)=>{\n  try{\n    const [settings,contacts,failed,alerts,queue,orders]=await Promise.all([\n      getSettings(),\n      list('rds10_contacts','select=id,validated,status&status=eq.ATIVO&limit=5000'),\n      list('rds10_deliveries','select=id&status=eq.FALHA&limit=5000'),\n      list('rds10_alerts','select=id&is_read=eq.false&limit=1000'),\n      list('rds10_deliveries','select=id&status=eq.AGENDADA&limit=5000'),\n      list('rds10_orders','select=id,status&status=not.in.(CONCLUIDO,CANCELADO)&limit=1000')\n    ]);\n    const checks=[\n      {key:'whatsapp',label:'WhatsApp conectado',ok:Boolean(connected),detail:connectedNumber||'Desconectado'},\n      {key:'pix',label:'PIX configurado',ok:Boolean(cleanText(settings?.pix_key||'')),detail:cleanText(settings?.pix_name||'')||'Favorecido não informado'},\n      {key:'price',label:'Preço padrão configurado',ok:Number(settings?.unit_price||0)>0,detail:money(settings?.unit_price||0)},\n      {key:'contacts',label:'Contatos válidos disponíveis',ok:contacts.some(c=>c.validated),detail:contacts.filter(c=>c.validated).length+' validado(s)'},\n      {key:'failures',label:'Sem falhas de envio pendentes',ok:failed.length===0,detail:failed.length+' falha(s)'},\n      {key:'alerts',label:'Alertas operacionais revisados',ok:alerts.length===0,detail:alerts.length+' alerta(s) não lido(s)'}\n    ];\n    const score=Math.round(checks.filter(x=>x.ok).length/checks.length*100);\n    res.json({ok:true,version:'10.9.2',score,ready:score===100,checks,operational:{queue:queue.length,activeOrders:orders.length,failed:failed.length,alerts:alerts.length}});\n  }catch(e){res.status(500).json({ok:false,error:e.message});}\n});\napp.get('/api/v1092/reports',async(req,res)=>{\n  try{\n    const period=String(req.query.period||'30d');\n    const from=rds1092FromPeriod(period);\n    const [orders,campaigns,deliveries,messages]=await Promise.all([\n      list('rds10_orders','select=*&order=created_at.desc&limit=5000'),\n      list('rds10_campaigns','select=id,code,name,status&status=neq.EXCLUIDA&order=created_at.desc&limit=1000'),\n      list('rds10_deliveries','select=id,campaign_id,campaign_code,phone,status,created_at,sent_at,updated_at&limit=10000'),\n      list('rds10_messages','select=id,phone,direction,created_at&limit=10000')\n    ]);\n    const inPeriod=x=>{if(!from)return true;const t=new Date(x.updated_at||x.sent_at||x.created_at||0).getTime();return Number.isFinite(t)&&t>=from.getTime();};\n    const os=orders.filter(inPeriod),ds=deliveries.filter(inPeriod),ms=messages.filter(inPeriod);\n    const completed=os.filter(x=>x.status==='CONCLUIDO');\n    const uniqueSent=new Set(ds.filter(x=>x.status==='ENVIADA'&&x.phone).map(x=>String(x.phone)));\n    const uniqueInbound=new Set(ms.filter(x=>x.direction==='IN'&&x.phone).map(x=>String(x.phone)));\n    const revenue=completed.reduce((n,x)=>n+Number(x.total_amount||0),0);\n    const campaignRows=campaigns.map(c=>{\n      const cd=ds.filter(d=>String(d.campaign_id||'')===String(c.id)||String(d.campaign_code||'')===String(c.code||''));\n      const co=os.filter(o=>String(o.campaign_code||'')===String(c.code||''));\n      const cc=co.filter(o=>o.status==='CONCLUIDO');\n      const phones=new Set(cd.filter(d=>d.status==='ENVIADA'&&d.phone).map(d=>String(d.phone)));\n      return {id:c.id,code:c.code,name:c.name,status:c.status,sent:cd.filter(d=>d.status==='ENVIADA').length,failed:cd.filter(d=>d.status==='FALHA').length,orders:co.length,purchases:cc.length,revenue:cc.reduce((n,o)=>n+Number(o.total_amount||0),0),conversion:phones.size?Number((cc.length/phones.size*100).toFixed(1)):0};\n    }).filter(x=>x.sent||x.orders||x.purchases).sort((a,b)=>b.revenue-a.revenue||b.purchases-a.purchases).slice(0,100);\n    res.json({ok:true,version:'10.9.2',period,metrics:{sent:ds.filter(x=>x.status==='ENVIADA').length,failed:ds.filter(x=>x.status==='FALHA').length,uniqueInbound:uniqueInbound.size,orders:os.length,purchases:completed.length,revenue,conversion:uniqueSent.size?Number((completed.length/uniqueSent.size*100).toFixed(1)):0,responseRate:uniqueSent.size?Number((uniqueInbound.size/uniqueSent.size*100).toFixed(1)):0},campaigns:campaignRows});\n  }catch(e){res.status(500).json({ok:false,error:e.message});}\n});\n\n`;
    s=s.slice(0,pos)+routes+s.slice(pos);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.9.2] APIs estáveis registradas antes do servidor');
  }
}catch(e){
  console.error('[V10.9.2] backend:',e.message);
  process.exitCode=1;
}

// Aplica toda a cadeia anterior; o servidor iniciará já contendo as APIs acima.
await import('./runtime-v10.9.1-stable-reports-ui.mjs');

// Depois da cadeia, aponta a interface exclusivamente para as rotas estáveis.
try{
  let a=fs.readFileSync(appPath,'utf8');
  if(!a.includes('RDS_STABLE_READINESS_UI_V10_9_2')){
    a=a.replaceAll("api('/api/readiness')","api('/api/v1092/readiness')");
    a=a.replaceAll("api('/api/reports/overview?period=30d')","api('/api/v1092/reports?period=30d')");
    a=a.replaceAll("api('/api/reports/overview?period='+encodeURIComponent(p))","api('/api/v1092/reports?period='+encodeURIComponent(p))");
    a=a.replaceAll('Relatórios ainda não disponíveis. Atualize a página após o deploy.','Relatórios indisponíveis neste momento.');
    a=a.replaceAll('Checklist ainda não disponível. Atualize a página após o deploy.','Checklist indisponível neste momento.');
    a += `\n/* RDS_STABLE_READINESS_UI_V10_9_2 */\n`;
    fs.writeFileSync(appPath,a,'utf8');
    console.log('[V10.9.2] interface apontada para APIs estáveis');
  }
}catch(e){
  console.error('[V10.9.2] frontend:',e.message);
  process.exitCode=1;
}
