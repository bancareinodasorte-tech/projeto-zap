import fs from 'node:fs';
const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS WHATSAPP PANEL V1';
const mediaMarker='// RDS WHATSAPP PANEL MEDIA V1';
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
     const messages=await list('rds10_messages','select=id,phone,direction,message_type,body,status,created_at,wa_message_id&order=created_at.desc&limit=500');
     const contactsAll=await list('rds10_contacts','select=id,name,phone,group_name,validated,origin&order=updated_at.desc&limit=500');
     const sellerId=s?.seller?.id||(typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null);
     const readQuery=sellerId
       ? 'select=phone,last_read_at&seller_id=eq.'+encodeURIComponent(sellerId)+'&limit=5000'
       : 'select=phone,last_read_at&limit=5000';
     const readStates=await list('rds10_whatsapp_chat_state',readQuery).catch(()=>[]);
     const readMap=new Map(readStates.map(x=>[String(x.phone||''),x.last_read_at]));
     const unreadMap=new Map();
     for(const m of messages){
       const phone=String(m.phone||'');if(!phone)continue;
       if(String(m.direction||'').toUpperCase()==='IN'){
         const lastRead=readMap.get(phone);
         if(!lastRead || new Date(m.created_at).getTime()>new Date(lastRead).getTime()){
           unreadMap.set(phone,(unreadMap.get(phone)||0)+1);
         }
       }
     }
     const crmContacts=contactsAll.filter(c=>!['WHATSAPP','WHATSAPP_HISTORICO'].includes(String(c?.origin||'').trim().toUpperCase()));
     const cm=new Map(crmContacts.map(c=>[String(c.phone||''),c]));
     const waNames=new Map(contactsAll.map(c=>[String(c.phone||''),c]));
     const map=new Map();
     for(const m of messages){
       const phone=String(m.phone||'');if(!phone)continue;
       if(!map.has(phone))map.set(phone,{phone,name:cm.get(phone)?.name||waNames.get(phone)?.name||phone,group_name:cm.get(phone)?.group_name||'',validated:Boolean(cm.get(phone)?.validated),unread_count:unreadMap.get(phone)||0,messages:[]});
       const c=map.get(phone);if(c.messages.length<1)c.messages.push(m);
     }
     for(const c of map.values()) if(!cm.has(c.phone)) c.name=c.phone;
     res.json({connected,number:connectedNumber,starting,qrAvailable:Boolean(qrDataUrl),qrDataUrl,lastError,chats:[...map.values()].sort((a,b)=>new Date(b.messages[0]?.created_at||0)-new Date(a.messages[0]?.created_at||0)).slice(0,200)});
   }catch(e){res.status(500).json({error:e.message});}
 });
 app.get('/api/whatsapp/chat/:phone',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     const phone=normalizeBR(req.params.phone);if(!validBRPhone(phone))throw new Error('WhatsApp inválido.');
     const allContacts=await list('rds10_contacts','select=id,name,phone,group_name,validated,city,tags,origin&phone=eq.'+encodeURIComponent(phone));
     const crmContact=allContacts.find(x=>!['WHATSAPP','WHATSAPP_HISTORICO'].includes(String(x?.origin||'').trim().toUpperCase()))||null;
     const waContact=allContacts[0]||null;
     const displayContact=crmContact||waContact;
     const c=displayContact ? {...displayContact,id:crmContact?.id||null} : null;
     const messagesDesc=await list('rds10_messages','select=id,phone,direction,message_type,body,status,created_at,wa_message_id,raw_payload&phone=eq.'+encodeURIComponent(phone)+'&order=created_at.desc&limit=1000');
     const messages=messagesDesc.sort((a,b)=>{
       const ta=new Date(a.created_at||0).getTime(), tb=new Date(b.created_at||0).getTime();
       if(ta!==tb) return ta-tb;
       return String(a.wa_message_id||a.id||'').localeCompare(String(b.wa_message_id||b.id||''));
     });
     res.json({ok:true,connected,number:connectedNumber,contact:c||{name:phone,phone},messages});
   }catch(e){console.error('[RDS WA PANEL] chat:',e.message);res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/chat/:phone/read',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     const phone=normalizeBR(req.params.phone);if(!validBRPhone(phone))throw new Error('WhatsApp inválido.');
     const readAt=cleanText(req.body?.read_at)||nowISO();
     const sellerId=s?.seller?.id||(typeof rdsWhatsappSellerId==='function'?await rdsWhatsappSellerId():null)||'00000000-0000-0000-0000-000000000000';
     await sb('/rest/v1/rds10_whatsapp_chat_state?on_conflict=seller_id,phone',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({seller_id:sellerId,phone,last_read_at:readAt,updated_at:nowISO()})});
     res.json({ok:true,phone,last_read_at:readAt});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.delete('/api/whatsapp/chat/:phone',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     const phone=normalizeBR(req.params.phone);if(!validBRPhone(phone))throw new Error('WhatsApp inválido.');
     await del('rds10_messages','phone=eq.'+encodeURIComponent(phone));
     res.json({ok:true,phone});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
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
const mediaBlock=String.raw`
// RDS WHATSAPP PANEL MEDIA V1
(()=>{
 app.get('/api/whatsapp/media/:messageId',async(req,res)=>{
   try{
     const s=await waPanelSession(req,res);if(!s)return;
     if(!sock || !connected) throw new Error('WhatsApp não está conectado.');
     const messageId=cleanText(req.params.messageId);
     if(!messageId) throw new Error('Mensagem inválida.');
     const row=await one('rds10_messages','select=wa_message_id,message_type,raw_payload&wa_message_id=eq.'+encodeURIComponent(messageId));
     if(!row?.raw_payload?.rawMessage) throw new Error('A mídia desta mensagem ainda não está disponível para abertura.');
     const raw=JSON.parse(JSON.stringify(row.raw_payload.rawMessage),BufferJSON.reviver);
     if(!raw?.message) throw new Error('Conteúdo de mídia indisponível.');
     const wamessage=proto.WebMessageInfo.fromObject(raw);
     const node=unwrapMessageContent(wamessage);
     const mediaNode=node?.imageMessage||node?.videoMessage||node?.audioMessage||node?.documentMessage||node?.stickerMessage;
     if(!mediaNode) throw new Error('Esta mensagem não contém mídia abrível.');
     const buffer=await downloadMediaMessage(wamessage,'buffer',{}, {logger:signalLogger,reuploadRequest:sock.updateMediaMessage});
     const type=String(row.message_type||'').toLowerCase();
     const fallback={image:'image/jpeg',video:'video/mp4',audio:'audio/ogg',document:'application/pdf',sticker:'image/webp'}[type]||'application/octet-stream';
     const mime=String(mediaNode.mimetype||fallback);
     const ext={image:'jpg',video:'mp4',audio:'ogg',document:'pdf',sticker:'webp'}[type]||'bin';
     const filename=cleanText(mediaNode.fileName||('rds-'+messageId+'.'+ext)).replace(/["\\\r\n]/g,'_');
     res.setHeader('Content-Type',mime);
     res.setHeader('Content-Disposition','inline; filename="'+filename+'"');
     res.setHeader('Cache-Control','private, max-age=300');
     res.send(buffer);
   }catch(e){
     console.error('[RDS WA PANEL] media:',e.message);
     res.status(404).send(e.message||'Mídia indisponível.');
   }
 });
})();
`;
if(!server.includes(marker)){
  server=server.slice(0,pos)+block+'\n'+server.slice(pos);
  console.log('[RDS] painel WhatsApp V1 instalado');
}
if(!server.includes(mediaMarker)){
  const chatRoute=server.indexOf("app.get('/api/whatsapp/chat/:phone'");
  if(chatRoute<0) throw new Error('rota de conversa WhatsApp não localizada para mídia.');
  server=server.slice(0,chatRoute)+mediaBlock+'\n'+server.slice(chatRoute);
  console.log('[RDS] mídia do painel WhatsApp instalada');
}
fs.writeFileSync(path,server,'utf8');
