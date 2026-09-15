import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OPERATOR PAGES V1';
if(server.includes(marker)){console.log('[RDS] páginas de operadores já publicadas');process.exit(0);}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para páginas de operadores.');
const block=`// RDS OPERATOR PAGES V1
app.get('/operador',(req,res)=>res.sendFile(__dirname+'/operador.html'));
app.get('/admin-vendedores',(req,res)=>res.sendFile(__dirname+'/admin-vendedores.html'));
`;
server=server.slice(0,pos)+block+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] páginas de operadores publicadas');
