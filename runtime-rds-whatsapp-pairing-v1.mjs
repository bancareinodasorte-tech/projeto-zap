import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS WHATSAPP PAIRING CODE V1';
if(server.includes(marker)){console.log('[RDS] pairing code já instalado');process.exit(0);}

const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para pairing code.');

const block=[
marker,
'(()=>{',
' let rdsPairingBusy=false;',
" app.post('/api/whatsapp/pairing-code',async(req,res)=>{",
"   try{",
"     if(rdsPairingBusy)throw new Error('Já existe uma solicitação de código em andamento. Aguarde alguns segundos.');",
"     const phone=normalizeBR(req.body?.phone);",
"     if(!validBRPhone(phone))throw new Error('Informe o número completo com DDD e o código do país, somente números.');",
"     if(connected)throw new Error('O WhatsApp já está conectado. Desconecte o número atual antes de vincular outro.');",
"     rdsPairingBusy=true;",
"     try{",
"       if(!sock) await startWhatsApp(false);",
"       const deadline=Date.now()+12000;",
"       while(!sock && Date.now()<deadline) await new Promise(r=>setTimeout(r,300));",
"       if(!sock)throw new Error('Não foi possível iniciar o canal WhatsApp.');",
"       if(typeof sock.requestPairingCode!=='function')throw new Error('A biblioteca WhatsApp deste servidor não oferece código de vinculação.');",
"       const code=await sock.requestPairingCode(phone);",
"       qrDataUrl='';",
"       lastError='';",
"       res.json({ok:true,code:String(code||'').replace(/(.{4})/,'$1-')});",
"     }finally{rdsPairingBusy=false;}",
"   }catch(e){rdsPairingBusy=false;res.status(400).json({ok:false,error:e.message});}",
" });",
"})();"
].join('\n');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] pairing code WhatsApp instalado');
