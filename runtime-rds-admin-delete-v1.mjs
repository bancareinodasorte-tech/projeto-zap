import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS ADMIN DELETE V1';
if(server.includes(marker)){
  console.log('[RDS] exclusão administrativa segura já aplicada');
  process.exit(0);
}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all GET não localizado para exclusão administrativa.');
const block=`${marker}
app.post('/api/contacts/bulk-delete',async(req,res)=>{
  try{
    const password=String(req.body?.password||'');
    const expected=String(process.env.RDS_ADMIN_DELETE_PASSWORD||'');
    if(!expected)return res.status(503).json({error:'Senha administrativa não configurada no servidor.'});
    if(!password||password!==expected)return res.status(403).json({error:'Senha administrativa incorreta.'});
    const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String).filter(Boolean))]:[];
    if(!ids.length)return res.status(400).json({error:'Nenhum cliente selecionado.'});
    for(const id of ids)await del('rds10_contacts','id=eq.'+encodeURIComponent(id));
    res.json({ok:true,deleted:ids.length});
  }catch(e){res.status(400).json({error:e.message});}
});
`;
server=server.slice(0,pos)+block+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] exclusão administrativa segura aplicada');
