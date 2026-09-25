import fs from 'node:fs';
import crypto from 'node:crypto';

const serverPath='server.js';
let server=fs.readFileSync(serverPath,'utf8');
const marker='// RDS WHATSAPP META CLOUD V1';
if(server.includes(marker)){console.log('[RDS] WhatsApp Meta Cloud V1 já aplicado');process.exit(0);}

const jsonMarker="app.use(express.json({ limit:'15mb' }));";
if(server.includes(jsonMarker) && !server.includes("req.rawBody=buf")){
  server=server.replace(jsonMarker,"app.use(express.json({ limit:'15mb', verify:(req,res,buf)=>{ req.rawBody=Buffer.from(buf); } }));");
}

const catchAll="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(catchAll);
if(pos<0)throw new Error('catch-all não localizado para WhatsApp Meta Cloud.');

const block=String.raw`
// RDS WHATSAPP META CLOUD V1
(()=>{
 const META_GRAPH_VERSION=String(process.env.META_GRAPH_API_VERSION||'v26.0').replace(/^v?/,'v');
 const META_ACCESS_TOKEN=String(process.env.META_WHATSAPP_ACCESS_TOKEN||process.env.WHATSAPP_ACCESS_TOKEN||'').trim();
 const META_PHONE_NUMBER_ID=String(process.env.META_WHATSAPP_PHONE_NUMBER_ID||process.env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
 const META_VERIFY_TOKEN=String(process.env.META_WHATSAPP_VERIFY_TOKEN||process.env.WHATSAPP_VERIFY_TOKEN||'').trim();
 const META_APP_SECRET=String(process.env.META_APP_SECRET||'').trim();
 const META_APP_ID=String(process.env.META_APP_ID||'').trim();
 const META_CONFIG_ID=String(process.env.META_EMBEDDED_SIGNUP_CONFIG_ID||'').trim();
 const META_WABA_ID=String(process.env.META_WHATSAPP_WABA_ID||process.env.WHATSAPP_WABA_ID||'').trim();
 const META_API='https://graph.facebook.com/'+META_GRAPH_VERSION;

 function metaConfigured(){return Boolean(META_ACCESS_TOKEN&&META_PHONE_NUMBER_ID);}
 function metaClientConfigured(){return Boolean(META_APP_ID&&META_CONFIG_ID);}
 function metaAuthHeaders(){return {'Authorization':'Bearer '+META_ACCESS_TOKEN,'Content-Type':'application/json'};}
 async function metaFetch(path,opt={}){
   if(!META_ACCESS_TOKEN)throw new Error('WhatsApp oficial Meta ainda não está configurado no Render.');
   const r=await fetch(META_API+path,{...opt,headers:{...metaAuthHeaders(),...(opt.headers||{})}});
   const txt=await r.text();
   let data=null;try{data=txt?JSON.parse(txt):null;}catch{data=txt;}
   if(!r.ok)throw new Error(data?.error?.message||data?.error?.error_user_msg||('Meta Graph API '+r.status));
   return data;
 }
 function metaTenant(req,res){
   if(typeof requireTenant==='function')return requireTenant(req,res);
   return {seller:{id:null}};
 }
 function metaPhone(v){
   let n=String(v||'').replace(/\D/g,'');
   if(n.startsWith('00'))n=n.slice(2);
   if(!n.startsWith('55'))n='55'+n;
   return n;
 }
 function metaMessageBody(m){
   if(m?.type==='text')return String(m.text?.body||'').trim();
   if(m?.type==='image')return String(m.image?.caption||'[Imagem]').trim();
   if(m?.type==='video')return String(m.video?.caption||'[Vídeo]').trim();
   if(m?.type==='audio')return '[Áudio]';
   if(m?.type==='document')return String(m.document?.caption||'[Documento]').trim();
   if(m?.type==='sticker')return '[Figurinha]';
   if(m?.type==='location')return '[Localização]';
   if(m?.type==='contacts')return '[Contato]';
   if(m?.type==='interactive')return '[Interativo]';
   return '['+String(m?.type||'mensagem')+']';
 }
 function verifyMetaSignature(req){
   if(!META_APP_SECRET)return true;
   const header=String(req.headers['x-hub-signature-256']||'');
   if(!header.startsWith('sha256='))return false;
   const raw=Buffer.isBuffer(req.rawBody)?req.rawBody:Buffer.from(JSON.stringify(req.body||{}));
   const expected='sha256='+crypto.createHmac('sha256',META_APP_SECRET).update(raw).digest('hex');
   return crypto.timingSafeEqual(Buffer.from(header),Buffer.from(expected));
 }
 async function saveMetaInbound(message,profileName){
   const phone=metaPhone(message.from);
   if(!phone)return;
   const id=String(message.id||'');
   if(id){
     const exists=await one('rds10_messages','select=id&wa_message_id=eq.'+encodeURIComponent(id)).catch(()=>null);
     if(exists)return;
   }
   const body=metaMessageBody(message);
   const created=message.timestamp?new Date(Number(message.timestamp)*1000).toISOString():nowISO();
   await insert('rds10_messages',{
     phone,
     direction:'IN',
     message_type:String(message.type||'text'),
     body,
     status:'RECEIVED',
     wa_message_id:id||null,
     created_at:created
   });
   try{
     const c=await one('rds10_contacts','select=id,name,phone&phone=eq.'+encodeURIComponent(phone));
     if(c?.id){
       const patchData={updated_at:nowISO()};
       if(profileName && !String(c.name||'').trim())patchData.name=profileName;
       await patch('rds10_contacts','id=eq.'+encodeURIComponent(c.id),patchData);
     }else if(profileName){
       await insert('rds10_contacts',{name:profileName,phone,validated:true,updated_at:nowISO()}).catch(()=>{});
     }
   }catch{}
 }
 async function saveMetaStatus(status){
   const id=String(status?.id||'');if(!id)return;
   const patchData={status:String(status.status||'').toUpperCase(),updated_at:nowISO()};
   try{await patch('rds10_messages','wa_message_id=eq.'+encodeURIComponent(id),patchData);}catch{}
 }
 app.get('/api/whatsapp/meta/config',(req,res)=>{
   res.json({
     ok:true,
     configured:metaConfigured(),
     clientConfigured:metaClientConfigured(),
     graphVersion:META_GRAPH_VERSION,
     webhookPath:'/api/whatsapp/meta/webhook',
     appId:META_APP_ID||null,
     configId:META_CONFIG_ID||null,
     phoneNumberId:META_PHONE_NUMBER_ID||null,
     wabaId:META_WABA_ID||null
   });
 });
 app.get('/api/whatsapp/meta/status',async(req,res)=>{
   try{
     const s=await metaTenant(req,res);if(!s)return;
     if(!metaConfigured())return res.json({ok:true,provider:'meta_cloud',configured:false,connected:false,clientConfigured:metaClientConfigured()});
     const info=await metaFetch('/'+encodeURIComponent(META_PHONE_NUMBER_ID)+'?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status,platform_type');
     res.json({ok:true,provider:'meta_cloud',configured:true,connected:true,clientConfigured:metaClientConfigured(),phoneNumberId:info.id,number:info.display_phone_number||'',verifiedName:info.verified_name||'',quality:info.quality_rating||'',verification:info.code_verification_status||'',platformType:info.platform_type||'CLOUD_API'});
   }catch(e){res.status(400).json({ok:false,provider:'meta_cloud',configured:metaConfigured(),connected:false,error:e.message});}
 });
 app.get('/api/whatsapp/meta/chats',async(req,res)=>{
   try{
     const s=await metaTenant(req,res);if(!s)return;
     const messages=await list('rds10_messages','select=id,phone,direction,message_type,body,status,created_at,wa_message_id&order=created_at.desc&limit=3000');
     const contacts=await list('rds10_contacts','select=id,name,phone,group_name,validated&order=updated_at.desc&limit=3000');
     const cm=new Map(contacts.map(c=>[String(c.phone||''),c]));
     const map=new Map();
     for(const m of messages){
       const phone=String(m.phone||'');if(!phone)continue;
       if(!map.has(phone))map.set(phone,{phone,name:cm.get(phone)?.name||phone,group_name:cm.get(phone)?.group_name||'',validated:Boolean(cm.get(phone)?.validated),messages:[]});
       const c=map.get(phone);if(c.messages.length<1)c.messages.push(m);
     }
     res.json({ok:true,provider:'meta_cloud',connected:metaConfigured(),number:'',chats:[...map.values()].sort((a,b)=>new Date(b.messages[0]?.created_at||0)-new Date(a.messages[0]?.created_at||0)).slice(0,300)});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.get('/api/whatsapp/meta/chat/:phone',async(req,res)=>{
   try{
     const s=await metaTenant(req,res);if(!s)return;
     const phone=metaPhone(req.params.phone);
     if(!/^55\d{10,11}$/.test(phone))throw new Error('WhatsApp inválido.');
     const c=await one('rds10_contacts','select=id,name,phone,group_name,validated,city,tags&phone=eq.'+encodeURIComponent(phone));
     const messages=await list('rds10_messages','select=id,phone,direction,message_type,body,status,created_at,wa_message_id&phone=eq.'+encodeURIComponent(phone)+'&order=created_at.asc&limit=500');
     res.json({ok:true,provider:'meta_cloud',connected:metaConfigured(),contact:c||{name:phone,phone},messages});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/meta/chat/:phone/send',async(req,res)=>{
   try{
     const s=await metaTenant(req,res);if(!s)return;
     if(!metaConfigured())throw new Error('WhatsApp oficial Meta ainda não está conectado.');
     const phone=metaPhone(req.params.phone);
     if(!/^55\d{10,11}$/.test(phone))throw new Error('WhatsApp inválido.');
     const body=String(req.body?.text||'').replace(/\u0000/g,'').trim();
     if(!body)throw new Error('Mensagem vazia.');
     if(body.length>4096)throw new Error('A mensagem excede 4096 caracteres.');
     const data=await metaFetch('/'+encodeURIComponent(META_PHONE_NUMBER_ID)+'/messages',{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,type:'text',text:{preview_url:false,body}})});
     const waId=data?.messages?.[0]?.id||'';
     await insert('rds10_messages',{phone,direction:'OUT',message_type:'text',body,status:'SENT',wa_message_id:waId||null,created_at:nowISO()});
     res.json({ok:true,provider:'meta_cloud',id:waId,data});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/meta/verification/request',async(req,res)=>{
   try{
     const s=metaTenant(req,res);if(!s)return;
     if(!metaConfigured())throw new Error('Configure primeiro o token Meta e o Phone Number ID no Render.');
     const method=String(req.body?.method||'SMS').toUpperCase();
     if(!['SMS','VOICE'].includes(method))throw new Error('Método inválido. Use SMS ou VOICE.');
     const data=await metaFetch('/'+encodeURIComponent(META_PHONE_NUMBER_ID)+'/request_code',{method:'POST',body:JSON.stringify({code_method:method,locale:'pt_BR'})});
     res.json({ok:true,success:Boolean(data?.success??true),method});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/meta/verification/verify',async(req,res)=>{
   try{
     const s=metaTenant(req,res);if(!s)return;
     if(!metaConfigured())throw new Error('Configure primeiro o token Meta e o Phone Number ID no Render.');
     const code=String(req.body?.code||'').replace(/\D/g,'');
     if(!/^\d{6}$/.test(code))throw new Error('Informe o código de 6 dígitos recebido por SMS.');
     const data=await metaFetch('/'+encodeURIComponent(META_PHONE_NUMBER_ID)+'/verify_code',{method:'POST',body:JSON.stringify({code})});
     res.json({ok:true,success:Boolean(data?.success??true)});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/meta/register',async(req,res)=>{
   try{
     const s=metaTenant(req,res);if(!s)return;
     if(!metaConfigured())throw new Error('Configure primeiro o token Meta e o Phone Number ID no Render.');
     const pin=String(req.body?.pin||'').replace(/\D/g,'');
     if(!/^\d{6}$/.test(pin))throw new Error('Crie um PIN de 6 dígitos para a proteção em duas etapas.');
     const data=await metaFetch('/'+encodeURIComponent(META_PHONE_NUMBER_ID)+'/register',{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',pin})});
     let subscribed=null;
     if(META_WABA_ID){
       try{subscribed=await metaFetch('/'+encodeURIComponent(META_WABA_ID)+'/subscribed_apps',{method:'POST'});}catch(e){subscribed={success:false,error:e.message};}
     }
     res.json({ok:true,success:Boolean(data?.success??true),subscribed});
   }catch(e){res.status(400).json({ok:false,error:e.message});}
 });
 app.post('/api/whatsapp/meta/onboard',(req,res)=>{
   res.status(501).json({ok:false,error:'O cadastro oficial do número precisa ser concluído pelo Embedded Signup da Meta. Configure META_APP_ID e META_EMBEDDED_SIGNUP_CONFIG_ID antes de habilitar esta etapa.'});
 });
 app.get('/api/whatsapp/meta/webhook',async(req,res)=>{
   const mode=String(req.query['hub.mode']||'');
   const token=String(req.query['hub.verify_token']||'');
   const challenge=String(req.query['hub.challenge']||'');
   if(mode==='subscribe'&&META_VERIFY_TOKEN&&token===META_VERIFY_TOKEN)return res.status(200).send(challenge);
   return res.sendStatus(403);
 });
 app.post('/api/whatsapp/meta/webhook',async(req,res)=>{
   try{
     if(!verifyMetaSignature(req))return res.sendStatus(403);
     if(req.body?.object!=='whatsapp_business_account')return res.sendStatus(404);
     for(const entry of req.body.entry||[]){
       for(const change of entry.changes||[]){
         const value=change.value||{};
         for(const message of value.messages||[]){
           const profile=value.contacts?.find(c=>String(c.wa_id||'')===String(message.from||''))?.profile?.name||'';
           await saveMetaInbound(message,profile);
         }
         for(const status of value.statuses||[])await saveMetaStatus(status);
       }
     }
     res.sendStatus(200);
   }catch(e){console.error('[RDS WA META WEBHOOK]',e.message);res.sendStatus(200);}
 });
})();
`;
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(serverPath,server,'utf8');
console.log('[RDS] WhatsApp Meta Cloud V1 instalado');
