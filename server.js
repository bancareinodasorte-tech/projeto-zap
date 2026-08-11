const express = require("express");
const crypto = require("crypto");
const pino = require("pino");
const QRCode = require("qrcode");
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, initAuthCreds, BufferJSON, proto } = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json({limit:"4mb"}));

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/,"");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

app.use((req,res,next)=>{
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  if(req.method==="OPTIONS") return res.sendStatus(204);
  next();
});

function digits(v){ return String(v||"").replace(/\D/g,""); }
function normalizeBR(v){
  let n=digits(v);
  if(n.startsWith("00")) n=n.slice(2);
  if(!n.startsWith("55") && (n.length===10 || n.length===11)) n="55"+n;
  return n;
}
function tailPhone(v){ return digits(v).slice(-11); }

async function sb(path,opt={},service=true){
  const key=service?SUPABASE_SERVICE_ROLE_KEY:SUPABASE_ANON_KEY;
  if(!SUPABASE_URL || !key) throw new Error("Supabase não configurado.");
  const r=await fetch(SUPABASE_URL+path,{
    ...opt,
    headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",...(opt.headers||{})}
  });
  const txt=await r.text(); let data=null;
  try{ data=txt?JSON.parse(txt):null; }catch{ data=txt; }
  if(!r.ok) throw new Error(data?.message||data?.details||`Supabase ${r.status}`);
  return data;
}

async function verifyUser(req,res,next){
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!token) return res.status(401).json({error:"Sessão ausente."});
    const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
    const u=await r.json();
    if(!r.ok||!u?.id) return res.status(401).json({error:"Sessão inválida."});
    req.user=u; next();
  }catch(e){ res.status(401).json({error:"Não foi possível validar a sessão."}); }
}

let sock=null, starting=false, connected=false, qrDataUrl="", connectedNumber="", lastError="", lastConnectionAt=null;

async function authRead(id){
  const rows=await sb(`/rest/v1/zap_auth?select=value&id=eq.${encodeURIComponent(id)}&limit=1`);
  const row=Array.isArray(rows)?rows[0]:null;
  return row ? JSON.parse(JSON.stringify(row.value), BufferJSON.reviver) : null;
}
async function authWrite(id,value){
  const safe=JSON.parse(JSON.stringify(value,BufferJSON.replacer));
  await sb("/rest/v1/zap_auth?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id,value:safe,updated_at:new Date().toISOString()})});
}
async function authDelete(id){ await sb(`/rest/v1/zap_auth?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"}); }
async function authClearAll(){ await sb("/rest/v1/zap_auth?id=not.is.null",{method:"DELETE"}); }

async function useSupabaseAuthState(){
  const creds=(await authRead("creds"))||initAuthCreds();
  return {
    state:{
      creds,
      keys:{
        get:async(type,ids)=>{
          const data={};
          await Promise.all(ids.map(async id=>{
            let value=await authRead(`${type}-${id}`);
            if(type==="app-state-sync-key" && value) value=proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id]=value;
          }));
          return data;
        },
        set:async(data)=>{
          const tasks=[];
          for(const category of Object.keys(data))
            for(const id of Object.keys(data[category])){
              const value=data[category][id];
              tasks.push(value?authWrite(`${category}-${id}`,value):authDelete(`${category}-${id}`));
            }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds:()=>authWrite("creds",creds)
  };
}

async function closeSocket(){ try{ sock?.ws?.close?.(); }catch{} sock=null; connected=false; connectedNumber=""; }

async function startWhatsApp(force=false){
  if(starting) return;
  if(sock && !force) return;
  starting=true;
  if(force) await closeSocket();
  try{
    const {state,saveCreds}=await useSupabaseAuthState();
    const {version}=await fetchLatestBaileysVersion();
    sock=makeWASocket({
      version,auth:state,printQRInTerminal:false,logger:pino({level:"silent"}),
      browser:["Projeto Zap V5.1","Chrome","1.0.0"],
      markOnlineOnConnect:false,syncFullHistory:false,shouldSyncHistoryMessage:()=>false,
      generateHighQualityLinkPreview:false
    });
    sock.ev.on("creds.update",saveCreds);
    sock.ev.on("connection.update",async update=>{
      const {connection,lastDisconnect,qr}=update;
      if(qr){ qrDataUrl=await QRCode.toDataURL(qr,{margin:2,width:420}); connected=false; lastError=""; }
      if(connection==="open"){
        connected=true; qrDataUrl="";
        connectedNumber=digits(sock.user?.id?.split(":")?.[0]||sock.user?.id||"");
        lastConnectionAt=new Date().toISOString(); lastError="";
      }
      if(connection==="close"){
        connected=false;
        const code=lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 0;
        const loggedOut=code===DisconnectReason.loggedOut;
        lastError=loggedOut?"WhatsApp desconectado pelo usuário.":String(lastDisconnect?.error?.message||"Conexão encerrada.");
        await closeSocket();
        if(!loggedOut) setTimeout(()=>startWhatsApp(false).catch(()=>{}),2500);
      }
    });
    sock.ev.on("messages.upsert",async({messages,type})=>{
      if(type!=="notify") return;
      for(const m of messages||[]){
        if(!m?.message || m.key?.fromMe) continue;
        const remote=String(m.key?.remoteJid||"");
        if(remote.endsWith("@g.us") || remote==="status@broadcast") continue;
        const from=digits(remote.split("@")[0]);
        const text=m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || "";
        await handleInboundBaileys(from,text,m).catch(()=>{});
      }
    });
  }catch(e){ lastError=e.message; await closeSocket(); throw e; }
  finally{ starting=false; }
}

async function findContactByPhone(from){
  const rows=await sb("/rest/v1/contacts?select=id,owner_id,phone,name&limit=2000");
  const tail=tailPhone(from);
  return (rows||[]).find(c=>tailPhone(c.phone)===tail)||null;
}
async function latestActiveRecipient(contactId){
  if(!contactId) return null;
  const rows=await sb(`/rest/v1/campaign_recipients?contact_id=eq.${encodeURIComponent(contactId)}&status=in.(PENDENTE,REENVIO_AGENDADO,ENVIADA,ENTREGUE,LIDA)&select=*&order=created_at.desc&limit=1`);
  return rows?.[0]||null;
}
async function logEvent(recipient,type,source="baileys"){
  if(!recipient) return;
  try{
    await sb("/rest/v1/campaign_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      owner_id:recipient.owner_id,recipient_id:recipient.id,campaign_id:recipient.campaign_id,
      contact_id:recipient.contact_id,event_type:type,event_source:source
    })});
  }catch{}
}
async function handleInboundBaileys(from,body,raw){
  const contact=await findContactByPhone(from);
  const recipient=await latestActiveRecipient(contact?.id);
  const ownerId=contact?.owner_id||recipient?.owner_id||null;
  if(ownerId){
    try{
      await sb("/rest/v1/whatsapp_messages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
        owner_id:ownerId,contact_id:contact?.id||null,campaign_id:recipient?.campaign_id||null,
        recipient_id:recipient?.id||null,meta_message_id:String(raw?.key?.id||crypto.randomUUID()),
        direction:"IN",message_type:"text",body:body||null,status:"received",phone:from,raw_payload:{key:raw?.key||null}
      })});
    }catch{}
  }
  if(recipient){
    const now=new Date().toISOString();
    await sb(`/rest/v1/campaign_recipients?id=eq.${recipient.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"RESPONDEU",responded_at:now,next_action_at:null,updated_at:now})});
    await logEvent(recipient,"RESPONDEU");
  }
}

async function sendText(to,text){
  if(!sock || !connected) throw new Error("WhatsApp ainda não está conectado.");
  const n=normalizeBR(to);
  if(!/^55\d{10,11}$/.test(n)) throw new Error("Telefone inválido. Use DDD + número.");
  const jid=`${n}@s.whatsapp.net`;
  const exists=await sock.onWhatsApp(jid);
  const target=exists?.[0]?.jid||jid;
  const r=await sock.sendMessage(target,{text:String(text||"").trim()});
  return {id:r?.key?.id||null,to:n};
}

app.get("/health",(req,res)=>res.json({ok:true,service:"projeto-zap-v5.1",connector:"baileys",connected}));

app.get("/api/whatsapp/status",verifyUser,(req,res)=>res.json({
  ok:true,connector:"baileys",connected,starting,number:connectedNumber||null,
  qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null,lastError:lastError||null,lastConnectionAt
}));

app.post("/api/whatsapp/connect",verifyUser,async(req,res)=>{
  try{ await startWhatsApp(Boolean(req.body?.force)); res.json({ok:true,message:"Conexão iniciada."}); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/whatsapp/pairing-code",verifyUser,async(req,res)=>{
  try{
    const phone=normalizeBR(req.body?.phone);
    if(!/^55\d{10,11}$/.test(phone)) return res.status(400).json({error:"Telefone inválido."});
    if(!sock) await startWhatsApp(false);
    if(connected) return res.json({ok:true,connected:true,message:"WhatsApp já conectado."});
    if(typeof sock?.requestPairingCode!=="function") return res.status(503).json({error:"Pareamento por código indisponível. Use QR Code."});
    const code=await sock.requestPairingCode(phone);
    res.json({ok:true,code});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/whatsapp/send-test",verifyUser,async(req,res)=>{
  try{
    const text=String(req.body?.text||"Teste Projeto Zap V5.1 ✅").trim();
    const d=await sendText(req.body?.to,text);
    res.json({ok:true,messageId:d.id,to:d.to});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.post("/api/whatsapp/logout",verifyUser,async(req,res)=>{
  try{
    if(sock){ try{ await sock.logout(); }catch{} }
    await closeSocket(); await authClearAll();
    qrDataUrl=""; lastError="";
    res.json({ok:true,message:"Sessão removida."});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/whatsapp/qr",verifyUser,(req,res)=>res.json({ok:true,connected,qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null}));

app.listen(PORT,async()=>{
  console.log(`Projeto Zap V5.1 online na porta ${PORT}`);
  try{ await startWhatsApp(false); }catch(e){ console.log("WhatsApp aguardando configuração:",e.message); }
});
