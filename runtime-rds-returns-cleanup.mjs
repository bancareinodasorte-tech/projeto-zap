import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS RETURNS CLEANUP FINAL';
if(server.includes(marker)){
  console.log('[RDS] limpeza dos retornos inválidos já aplicada');
  process.exit(0);
}

const start=server.indexOf("app.get('/api/returns'");
if(start<0)throw new Error('Endpoint /api/returns não localizado.');
const end=server.indexOf("app.get(",start+10);
if(end<0)throw new Error('Próximo endpoint após /api/returns não localizado.');

const route=`app.get('/api/returns',async(req,res)=>{ try{
  const all=await list('rds10_messages','select=*&order=created_at.desc&limit=2000');
  if(req.query.all==='1')return res.json(all.filter(x=>x.direction==='IN'&&/^55\\d{10,11}$/.test(String(x.phone||''))));
  const by=new Map();
  for(const m of all){
    if(!m.phone||!/^55\\d{10,11}$/.test(String(m.phone)))continue;
    const x=by.get(m.phone)||{};
    if(!x.in&&m.direction==='IN')x.in=m;
    if(!x.out&&m.direction==='OUT')x.out=m;
    by.set(m.phone,x);
  }
  res.json([...by.values()].filter(x=>x.in&&(!x.out||new Date(x.in.created_at)>new Date(x.out.created_at))).map(x=>x.in));
 }catch(e){res.status(500).json({error:e.message});} });
`;
server=server.slice(0,start)+route+server.slice(end);

server += `\n${marker}\n`;
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] retornos: somente números WhatsApp válidos e pendências reais');
