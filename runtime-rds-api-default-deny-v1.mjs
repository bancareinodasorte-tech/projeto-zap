import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS API DEFAULT-DENY GATE V1';
if(server.includes(marker)){
  console.log('[RDS] barreira default-deny de APIs já aplicada');
}else{
  const anchor="app.use(express.json({ limit: '15mb' }));";
  const pos=server.indexOf(anchor);
  if(pos<0)throw new Error('express.json não localizado para barreira de APIs.');
  const gate=String.raw`
${marker}
app.use(async(req,res,next)=>{
  const pathname=String(req.path||'');
  if(!pathname.startsWith('/api/'))return next();

  // Rotas públicas estritamente necessárias para callbacks assinados/validados.
  if(req.method==='POST' && pathname==='/api/mercadopago/webhook')return next();
  if((req.method==='GET'||req.method==='POST') && pathname==='/api/whatsapp/meta/webhook')return next();
  if(req.method==='GET' && pathname==='/api/mercadopago/oauth/callback')return next();

  // As rotas do operador têm controles próprios de login, sessão e papel.
  if(pathname==='/api/operator' || pathname.startsWith('/api/operator/'))return next();

  // Toda API legada fica fechada por padrão. Só administrador autenticado
  // pode usar o painel antigo/global; a ausência de sessão nunca cria escopo.
  try{
    if(typeof rdsAdminRequire!=='function'){
      return res.status(503).json({success:false,error:'Proteção administrativa indisponível.'});
    }
    const admin=await rdsAdminRequire(req,res);
    if(!admin)return;
    req.rdsAdminContext=admin;
    return next();
  }catch(e){
    return res.status(401).json({success:false,error:'Autenticação administrativa obrigatória.'});
  }
});
`;
  server=server.slice(0,pos+anchor.length)+'\n'+gate+server.slice(pos+anchor.length);
  fs.writeFileSync(path,server,'utf8');
  console.log('[RDS] barreira default-deny de APIs instalada');
}
