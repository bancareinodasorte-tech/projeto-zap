import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS WHATSAPP PANEL V1';
if(server.includes(marker)){console.log('[RDS] painel WhatsApp V1 já aplicado');process.exit(0);}
const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para painel WhatsApp.');
const block=String.raw`
${marker}
(()=>{
 async function waPanelSession(req,res){
   if(typeof requireTenant==='function')return requireTenant(req,res);
   return {seller:{id:null}};
 }
 app.get('/api/whatsapp/chats',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     const messages=await list('rds10_messages','select=id,phone,direction,message_type,body,status,created_at,wa_message_id&order=created_at.desc&limit=2000');
     const contacts=await list('rds10_contacts','select=id,name,phone,group_name,validated&order=updated_at.desc&limit=2000');
     const cm=new Map(contacts.map(c=>[String(c.phone||''),c]));
     const map=new Map();
     for(const m of messages){
       const phone=String(m.phone||'');if(!phone)continue;
       if(!map.has(phone))map.set(phone,{phone,name:cm.get(phone)?.name||phone,group_name:cm.get(phone)?.group_name||'',validated:Boolean(cm.get(phone)?.validated),messages:[]});
       const c=map.get(phone);if(c.messages.length<1)c.messages.push(m);
     }
     res.json({connected,number:connectedNumber,starting,qrAvailable:Boolean(qrDataUrl),qrDataUrl,lastError,chats:[...map.values()].sort((a,b)=>new Date(b.messages[0]?.created_at||0)-new Date(a.messages[0]?.created_at||0)).slice(0,200)});
   }catch(e){res.status(500).json({error:e.message});}
 });
 app.get('/api/whatsapp/chat/:phone',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     const phone=normalizeBR(req.params.phone);if(!validBRPhone(phone))throw new Error('WhatsApp inválido.');
     const c=await one('rds10_contacts','select=id,name,phone,group_name,validated,city,tags&phone=eq.'+encodeURIComponent(phone));
     const messages=await list('rds10_messages','select=id,phone,direction,message_type,body,status,created_at,wa_message_id&phone=eq.'+encodeURIComponent(phone)+'&order=created_at.asc&limit=500');
     res.json({ok:true,connected,number:connectedNumber,contact:c||{name:phone,phone},messages});
   }catch(e){console.error('[RDS WA PANEL] chat:',e.message);res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/chat/:phone/send',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     if(!connected)throw new Error('WhatsApp não está conectado.');
     const phone=normalizeBR(req.params.phone);if(!validBRPhone(phone))throw new Error('WhatsApp inválido.');
     const text=cleanText(req.body?.text);if(!text)throw new Error('Mensagem vazia.');
     const r=await sendTextPhone(phone,text);
     res.json({ok:true,...r});
   }catch(e){res.status(400).json({error:e.message});}
 });
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] painel WhatsApp V1 instalado');
