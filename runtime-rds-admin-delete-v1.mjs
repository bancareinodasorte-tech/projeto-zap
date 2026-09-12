import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS ADMIN DELETE V1';
if(!server.includes(marker)){
 const point="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
 const pos=server.indexOf(point);
 if(pos<0) throw new Error('ponto de inserção da segurança administrativa não localizado');
 const block=`// RDS ADMIN DELETE V1\napp.post('/api/contacts/bulk-delete',async(req,res)=>{\n  try{\n    const password=String(req.body?.password||'');\n    const expected=String(process.env.RDS_ADMIN_DELETE_PASSWORD||'');\n    if(!expected) return res.status(503).json({error:'Senha administrativa não configurada no servidor.'});\n    if(!password || password!==expected) return res.status(403).json({error:'Senha administrativa incorreta.'});\n    const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String).filter(Boolean))]:[];\n    if(!ids.length) return res.status(400).json({error:'Nenhum cliente selecionado.'});\n    for(const id of ids) await del('rds10_contacts',\`id=eq.\${encodeURIComponent(id)}\`);\n    res.json({ok:true,deleted:ids.length});\n  }catch(e){res.status(400).json({error:e.message});}\n});\n`;
 server=server.slice(0,pos)+block+server.slice(pos);fs.writeFileSync(path,server,'utf8');console.log('[RDS] segurança administrativa de exclusão aplicada');
}else console.log('[RDS] segurança administrativa de exclusão já aplicada');
