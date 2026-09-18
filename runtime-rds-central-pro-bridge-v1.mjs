import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS CENTRAL PRO BRIDGE V1';
if(!server.includes(marker)){
  const anchor="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
  const pos=server.indexOf(anchor);
  if(pos<0)throw new Error('catch-all do server.js não localizado para Central PRO.');
  const block=String.raw`
(()=>{
// RDS CENTRAL PRO BRIDGE V1
const allowed=['https://bancareinodasorte-tech.github.io','http://localhost','http://127.0.0.1'];
function cors(req,res){
  const origin=String(req.headers.origin||'');
  if(allowed.includes(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
app.options('/api/v1/central-pro/:resource',(req,res)=>{cors(req,res);res.status(204).end();});
app.get('/api/v1/central-pro/official-draw',async(req,res)=>{
  cors(req,res);
  try{
    const base='http://127.0.0.1:'+(process.env.PORT||10000);
    const r=await fetch(base+'/api/v1011/official-sales/draw-info',{headers:{Accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d?.success===false)throw new Error(d?.message||'Falha ao consultar sorteio oficial.');
    const x=d?.data||{};
    return res.json({success:true,source:'REINO DA SORTE — API OFICIAL',data:{
      drawId:x.drawId??null,
      drawTitle:x.drawTitle??x.title??x.name??null,
      pricePerTicket:x.pricePerTicket??x.ticketPrice??null,
      totalBooklets:x.totalBooklets??null,
      availableBooklets:x.availableBooklets??null,
      isDrawClosed:Boolean(x.isDrawClosed),
      rawSafe:x
    }});
  }catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}
});
app.get('/api/v1/central-pro/official-status',async(req,res)=>{
  cors(req,res);
  try{
    const base='http://127.0.0.1:'+(process.env.PORT||10000);
    const r=await fetch(base+'/api/v1011/official-sales/bootstrap',{headers:{Accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    return res.status(r.ok?200:502).json({success:r.ok,configured:Boolean(d.configured),authorized:Boolean(d.authorized),deviceId:d.deviceId||null,lastAuthAt:d.lastAuthAt||null,message:d.message||null});
  }catch(e){return res.status(502).json({success:false,message:String(e?.message||e)});}
});
})();
`;
  server=server.slice(0,pos)+block+'\n'+server.slice(pos);
  fs.writeFileSync(path,server,'utf8');
  console.log('[RDS] ponte Central PRO instalada antes do catch-all');
}
