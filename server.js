const express = require("express");
const crypto = require("crypto");
const pino = require("pino");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  DisconnectReason,
  Browsers,
  initAuthCreds,
  BufferJSON,
  proto
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "";
const STORAGE_BUCKET = "campaign-media";

let sock = null;
let connected = false;
let starting = false;
let qrDataUrl = "";
let connectedNumber = "";
let connectedName = "";
let lastError = "";
let lastConnectionAt = null;
let restartTimer = null;
let generation = 0;
let campaignRunnerBusy = false;

const PURCHASE_PHRASES = [
  "pagamento confirmado",
  "compra confirmada",
  "obrigado pela compra",
  "obrigada pela compra",
  "agradecemos sua compra",
  "compra realizada",
  "pagamento recebido"
];

function digits(v){ return String(v || "").replace(/\D/g, ""); }
function normalizeBR(v){
  let n = digits(v);
  if(n.startsWith("00")) n = n.slice(2);
  if(!n.startsWith("55") && (n.length === 10 || n.length === 11)) n = "55" + n;
  return n;
}
function tailPhone(v){ return digits(v).slice(-11); }
function nowIso(){ return new Date().toISOString(); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function randomBetween(min,max){
  const a = Math.max(1, Number(min)||4), b = Math.max(a, Number(max)||8);
  return Math.floor((a + Math.random()*(b-a))*1000);
}
function safeJson(v){
  return JSON.parse(JSON.stringify(v, BufferJSON.replacer));
}
function restoreJson(v){
  return JSON.parse(JSON.stringify(v), BufferJSON.reviver);
}

async function sb(path,opt={}){
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase não configurado no Render.");
  const r = await fetch(SUPABASE_URL + path, {
    ...opt,
    headers:{
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type":"application/json",
      ...(opt.headers||{})
    }
  });
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if(!r.ok) throw new Error(data?.message || data?.error || data?.details || `Supabase ${r.status}`);
  return data;
}

async function authRead(id){
  const rows = await sb(`/rest/v1/zap_auth?select=value&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows?.[0]?.value ? restoreJson(rows[0].value) : null;
}
async function authWrite(id,value){
  await sb("/rest/v1/zap_auth?on_conflict=id",{
    method:"POST",
    headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({id,value:safeJson(value),updated_at:nowIso()})
  });
}
async function authDelete(id){
  await sb(`/rest/v1/zap_auth?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});
}
async function authClearAll(){
  await sb("/rest/v1/zap_auth?id=not.is.null",{method:"DELETE"});
}
async function useSupabaseAuthState(){
  const creds = (await authRead("creds")) || initAuthCreds();
  return {
    state:{
      creds,
      keys:{
        get:async(type,ids)=>{
          const out={};
          await Promise.all(ids.map(async id=>{
            let v = await authRead(`${type}-${id}`);
            if(type==="app-state-sync-key" && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            out[id]=v;
          }));
          return out;
        },
        set:async(data)=>{
          const jobs=[];
          for(const category of Object.keys(data||{})){
            for(const id of Object.keys(data[category]||{})){
              const v=data[category][id];
              jobs.push(v ? authWrite(`${category}-${id}`,v) : authDelete(`${category}-${id}`));
            }
          }
          await Promise.all(jobs);
        }
      }
    },
    saveCreds:()=>authWrite("creds",creds)
  };
}

async function closeSocket(clearView=false){
  generation++;
  try { sock?.ws?.close?.(); } catch {}
  sock=null; connected=false; starting=false;
  if(clearView){ connectedNumber=""; connectedName=""; qrDataUrl=""; }
}
function scheduleRestart(delay=1800){
  clearTimeout(restartTimer);
  restartTimer=setTimeout(()=>startWhatsApp(false).catch(e=>{lastError=e.message;}),delay);
}

async function startWhatsApp(force=false){
  if(starting) return;
  if(sock && !force) return;
  starting=true;
  if(force) await closeSocket(false);
  const myGeneration=++generation;
  try{
    const {state,saveCreds}=await useSupabaseAuthState();
    sock=makeWASocket({
      auth:state,
      printQRInTerminal:false,
      logger:pino({level:"silent"}),
      browser:Browsers.ubuntu("Google Chrome"),
      markOnlineOnConnect:false,
      syncFullHistory:false,
      shouldSyncHistoryMessage:()=>false,
      generateHighQualityLinkPreview:false
    });
    const localSock=sock;
    localSock.ev.on("creds.update",saveCreds);
    localSock.ev.on("connection.update",async update=>{
      if(myGeneration!==generation) return;
      const {connection,lastDisconnect,qr}=update;
      if(qr){
        qrDataUrl=await QRCode.toDataURL(qr,{margin:2,width:420});
        connected=false; lastError="";
      }
      if(connection==="open"){
        connected=true; starting=false; qrDataUrl="";
        connectedNumber=digits(localSock.user?.id?.split(":")?.[0] || localSock.user?.id || "");
        connectedName=String(localSock.user?.name || localSock.user?.verifiedName || "Projeto Zap");
        lastConnectionAt=nowIso(); lastError="";
      }
      if(connection==="close"){
        connected=false; starting=false;
        const code = Number(lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 0);
        const loggedOut = code===DisconnectReason.loggedOut || code===401;
        const restartRequired = code===515;
        lastError = loggedOut ? "Sessão encerrada no WhatsApp." :
                    restartRequired ? "Finalizando pareamento..." :
                    String(lastDisconnect?.error?.message || `Conexão encerrada (${code||"sem código"}).`);
        try { localSock?.ws?.close?.(); } catch {}
        if(sock===localSock) sock=null;
        if(loggedOut){
          await authClearAll().catch(()=>{});
          connectedNumber=""; connectedName=""; qrDataUrl="";
        }else{
          scheduleRestart(restartRequired ? 900 : 2200);
        }
      }
    });
    localSock.ev.on("messages.upsert",async({messages})=>{
      for(const m of messages||[]){
        if(!m?.message) continue;
        await processMessage(m).catch(e=>console.log("Mensagem:",e.message));
      }
    });
  }catch(e){
    lastError=e.message; sock=null; connected=false; starting=false; scheduleRestart(3500); throw e;
  }
}

function getMessageText(m){
  const x=m?.message||{};
  return String(
    x.conversation ||
    x.extendedTextMessage?.text ||
    x.imageMessage?.caption ||
    x.videoMessage?.caption ||
    x.documentMessage?.caption ||
    ""
  ).trim();
}
function getMessageType(m){
  const x=m?.message||{};
  if(x.imageMessage) return "image";
  if(x.documentMessage) return String(x.documentMessage?.mimetype||"").includes("pdf") ? "pdf" : "document";
  if(x.videoMessage) return "video";
  if(x.audioMessage) return "audio";
  if(x.stickerMessage) return "sticker";
  return "text";
}
function isPurchaseConfirmation(text){
  const t=String(text||"").toLowerCase();
  return PURCHASE_PHRASES.some(p=>t.includes(p));
}

async function findContactByPhone(phone){
  const t=tailPhone(phone);
  const rows=await sb("/rest/v1/contacts?select=*&limit=3000");
  return (rows||[]).find(x=>tailPhone(x.phone)===t)||null;
}
async function findLatestRecipient(phone){
  const t=tailPhone(phone);
  const rows=await sb("/rest/v1/campaign_recipients?select=*&order=created_at.desc&limit=3000");
  return (rows||[]).find(x=>tailPhone(x.phone)===t && !["COMPRA_REALIZADA","NAO_INTERESSADO"].includes(x.status))||null;
}
async function upsertContactFromInbound(phone,pushName=""){
  let c=await findContactByPhone(phone);
  if(c) return c;
  const n=normalizeBR(phone);
  const rows=await sb("/rest/v1/contacts",{
    method:"POST",headers:{Prefer:"return=representation"},
    body:JSON.stringify({phone:n,name:pushName||`Cliente ${n.slice(-4)}`,status:"NOVO",consent:true,opt_out:false})
  });
  return rows?.[0]||null;
}
async function processMessage(m){
  const remote=String(m.key?.remoteJid||"");
  if(!remote || remote.endsWith("@g.us") || remote==="status@broadcast" || remote.endsWith("@broadcast")) return;
  const phone=normalizeBR(remote.split("@")[0]);
  if(!phone) return;
  const fromMe=Boolean(m.key?.fromMe);
  const text=getMessageText(m);
  const type=getMessageType(m);
  const contact=await upsertContactFromInbound(phone,m.pushName||"");
  const recipient=await findLatestRecipient(phone);
  const row={
    phone,contact_id:contact?.id||null,campaign_id:recipient?.campaign_id||null,recipient_id:recipient?.id||null,
    meta_message_id:String(m.key?.id||crypto.randomUUID()),direction:fromMe?"OUT":"IN",
    message_type:type,body:text||null,status:fromMe?"sent":"received",
    raw_payload:{key:m.key||null,pushName:m.pushName||null}
  };
  await sb("/rest/v1/whatsapp_messages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(row)}).catch(()=>{});
  if(!recipient) return;
  const patch={updated_at:nowIso()};
  if(!fromMe){
    patch.status=(type==="image"||type==="pdf"||type==="document")?"POSSIVEL_PAGAMENTO":"RESPONDEU";
    patch.responded_at=nowIso();
    patch.last_inbound_preview=text || `[${type}]`;
    patch.last_inbound_type=type;
    if(patch.status==="POSSIVEL_PAGAMENTO") patch.possible_payment_at=nowIso();
  }else if(isPurchaseConfirmation(text)){
    patch.status="COMPRA_REALIZADA"; patch.purchase_at=nowIso();
  }else return;
  await sb(`/rest/v1/campaign_recipients?id=eq.${recipient.id}`,{
    method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)
  });
}

async function targetJid(phone){
  const n=normalizeBR(phone);
  if(!/^55\d{10,11}$/.test(n)) throw new Error("Telefone inválido.");
  const jid=`${n}@s.whatsapp.net`;
  const exists=await sock.onWhatsApp(jid);
  return {n,jid:exists?.[0]?.jid||jid};
}
async function sendText(phone,text){
  if(!sock||!connected) throw new Error("WhatsApp não conectado.");
  const {n,jid}=await targetJid(phone);
  const r=await sock.sendMessage(jid,{text:String(text||"").trim()});
  return {to:n,id:r?.key?.id||null};
}
async function fetchMediaBuffer(url){
  const r=await fetch(url);
  if(!r.ok) throw new Error("Não foi possível carregar a imagem da campanha.");
  return Buffer.from(await r.arrayBuffer());
}
async function sendImageText(phone,imageUrl,text){
  if(!sock||!connected) throw new Error("WhatsApp não conectado.");
  const {n,jid}=await targetJid(phone);
  const image=await fetchMediaBuffer(imageUrl);
  const r=await sock.sendMessage(jid,{image,caption:String(text||"").trim()});
  return {to:n,id:r?.key?.id||null};
}

async function uploadCampaignImage(dataUrl,filename="campanha.jpg"){
  if(!dataUrl) return null;
  const m=String(dataUrl).match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if(!m) throw new Error("Imagem inválida. Use JPG, PNG ou WEBP.");
  const mime=m[1].toLowerCase()==="image/jpg"?"image/jpeg":m[1].toLowerCase();
  const ext=mime.includes("png")?"png":mime.includes("webp")?"webp":"jpg";
  const buf=Buffer.from(m[2],"base64");
  if(buf.length>5*1024*1024) throw new Error("Imagem maior que 5 MB.");
  const object=`${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${object}`,{
    method:"POST",
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":mime,"x-upsert":"false"},
    body:buf
  });
  if(!r.ok) throw new Error(`Falha ao salvar imagem (${r.status}). Execute MIGRACAO-V5.5.sql.`);
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${object}`;
}

app.get("/health",(req,res)=>res.json({
  ok:true,service:"projeto-zap",version:"5.5.0",connector:"baileys",connected
}));

app.get("/api/whatsapp/status",(req,res)=>res.json({
  ok:true,connected,starting,number:connectedNumber||null,name:connectedName||null,
  qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null,lastError:lastError||null,lastConnectionAt
}));
app.post("/api/whatsapp/connect",async(req,res)=>{
  try{ await startWhatsApp(Boolean(req.body?.force)); res.json({ok:true}); }
  catch(e){ res.status(500).json({error:e.message}); }
});
app.get("/api/whatsapp/qr",(req,res)=>res.json({ok:true,connected,qrAvailable:Boolean(qrDataUrl),qrDataUrl}));
app.post("/api/whatsapp/pairing-code",async(req,res)=>{
  try{
    const phone=normalizeBR(req.body?.phone);
    if(!/^55\d{10,11}$/.test(phone)) return res.status(400).json({error:"Telefone inválido."});
    if(!sock) await startWhatsApp(false);
    if(connected) return res.json({ok:true,connected:true});
    await sleep(800);
    const code=await sock.requestPairingCode(phone);
    res.json({ok:true,code});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/whatsapp/send-test",async(req,res)=>{
  try{ const d=await sendText(req.body?.to,req.body?.text||"Teste Projeto Zap V5.5 ✅"); res.json({ok:true,...d}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/whatsapp/logout",async(req,res)=>{
  try{ if(sock){try{await sock.logout();}catch{}} await closeSocket(true); await authClearAll(); res.json({ok:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/contacts",async(req,res)=>{
  try{
    const rows=await sb("/rest/v1/contacts?select=*&order=created_at.desc&limit=3000");
    res.json({ok:true,contacts:rows||[]});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/contacts",async(req,res)=>{
  try{
    const phone=normalizeBR(req.body?.phone);
    if(!/^55\d{10,11}$/.test(phone)) return res.status(400).json({error:"Telefone inválido."});
    const body={name:String(req.body?.name||"").trim()||`Cliente ${phone.slice(-4)}`,phone,
      status:String(req.body?.status||"NOVO"),consent:req.body?.consent!==false,opt_out:Boolean(req.body?.opt_out)};
    const rows=await sb("/rest/v1/contacts?on_conflict=phone",{
      method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(body)
    });
    res.json({ok:true,contact:rows?.[0]||body});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/campaigns",async(req,res)=>{
  try{
    const rows=await sb("/rest/v1/campaigns?select=*&order=created_at.desc&limit=200");
    res.json({ok:true,campaigns:rows||[]});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/campaigns",async(req,res)=>{
  try{
    const name=String(req.body?.name||"").trim();
    const messages=(Array.isArray(req.body?.messages)?req.body.messages:[]).map(x=>String(x||"").trim()).filter(Boolean).slice(0,5);
    const phones=(Array.isArray(req.body?.phones)?req.body.phones:[]).map(normalizeBR).filter(x=>/^55\d{10,11}$/.test(x));
    if(!name) return res.status(400).json({error:"Informe o nome da campanha."});
    if(!messages.length) return res.status(400).json({error:"Informe ao menos uma mensagem."});
    if(!phones.length) return res.status(400).json({error:"Selecione ao menos um contato."});
    const image_url=await uploadCampaignImage(req.body?.imageDataUrl,req.body?.imageName);
    const schedule_at=req.body?.scheduleAt?new Date(req.body.scheduleAt).toISOString():null;
    const campRows=await sb("/rest/v1/campaigns",{
      method:"POST",headers:{Prefer:"return=representation"},
      body:JSON.stringify({name,messages,image_url,image_name:req.body?.imageName||null,
        interval_min:Number(req.body?.intervalMin)||6,interval_max:Number(req.body?.intervalMax)||12,
        schedule_at,status:schedule_at&&new Date(schedule_at)>new Date()?"AGENDADA":"PRONTA"})
    });
    const campaign=campRows?.[0];
    const contacts=await sb("/rest/v1/contacts?select=*&limit=3000");
    const selected=(contacts||[]).filter(c=>phones.some(p=>tailPhone(p)===tailPhone(c.phone)) && c.consent!==false && !c.opt_out);
    if(!selected.length) return res.status(400).json({error:"Nenhum contato selecionado está autorizado para campanhas."});
    const recs=selected.map((c,i)=>({campaign_id:campaign.id,contact_id:c.id,phone:normalizeBR(c.phone),name:c.name,
      status:"PENDENTE",selected_message:i%messages.length}));
    await sb("/rest/v1/campaign_recipients",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(recs)});
    res.json({ok:true,campaign,recipients:recs.length});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/execution",async(req,res)=>{
  try{
    const rows=await sb("/rest/v1/campaign_recipients?select=*,campaigns(name,status)&order=created_at.desc&limit=1000");
    res.json({ok:true,items:rows||[]});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/campaigns/:id/start",async(req,res)=>{
  try{
    await sb(`/rest/v1/campaigns?id=eq.${encodeURIComponent(req.params.id)}`,{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"EM_EXECUCAO",started_at:nowIso()})
    });
    runCampaigns().catch(()=>{});
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/campaigns/:id/pause",async(req,res)=>{
  try{
    await sb(`/rest/v1/campaigns?id=eq.${encodeURIComponent(req.params.id)}`,{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"PAUSADA"})
    });
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/returns",async(req,res)=>{
  try{
    const rows=await sb("/rest/v1/campaign_recipients?status=in.(RESPONDEU,POSSIVEL_PAGAMENTO,EM_NEGOCIACAO)&select=*,campaigns(name)&order=responded_at.desc.nullslast&limit=500");
    res.json({ok:true,items:rows||[]});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/recipients/:id/status",async(req,res)=>{
  try{
    const allowed=["RESPONDEU","POSSIVEL_PAGAMENTO","EM_NEGOCIACAO","COMPRA_REALIZADA","NAO_INTERESSADO"];
    const status=String(req.body?.status||"");
    if(!allowed.includes(status)) return res.status(400).json({error:"Status inválido."});
    const patch={status,updated_at:nowIso()};
    if(status==="COMPRA_REALIZADA") patch.purchase_at=nowIso();
    await sb(`/rest/v1/campaign_recipients?id=eq.${encodeURIComponent(req.params.id)}`,{
      method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)
    });
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get("/api/purchases",async(req,res)=>{
  try{
    const rows=await sb("/rest/v1/campaign_recipients?status=eq.COMPRA_REALIZADA&select=*,campaigns(name)&order=purchase_at.desc.nullslast&limit=500");
    res.json({ok:true,items:rows||[]});
  }catch(e){res.status(500).json({error:e.message});}
});

async function runCampaigns(){
  if(campaignRunnerBusy||!connected) return;
  campaignRunnerBusy=true;
  try{
    const camps=await sb("/rest/v1/campaigns?status=in.(EM_EXECUCAO,AGENDADA)&select=*&order=created_at.asc&limit=50");
    for(const c of camps||[]){
      if(c.status==="AGENDADA" && c.schedule_at && new Date(c.schedule_at)>new Date()) continue;
      if(c.status==="AGENDADA"){
        await sb(`/rest/v1/campaigns?id=eq.${c.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"EM_EXECUCAO",started_at:nowIso()})});
      }
      const recs=await sb(`/rest/v1/campaign_recipients?campaign_id=eq.${c.id}&status=eq.PENDENTE&select=*&order=created_at.asc&limit=500`);
      if(!recs?.length){
        await sb(`/rest/v1/campaigns?id=eq.${c.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"FINALIZADA",finished_at:nowIso()})});
        continue;
      }
      for(const r of recs){
        const fresh=await sb(`/rest/v1/campaigns?id=eq.${c.id}&select=status&limit=1`);
        if(fresh?.[0]?.status!=="EM_EXECUCAO") break;
        try{
          const text=String(c.messages?.[Math.min(Number(r.selected_message)||0,(c.messages?.length||1)-1)] || c.messages?.[0] || "").trim();
          const out=c.image_url?await sendImageText(r.phone,c.image_url,text):await sendText(r.phone,text);
          await sb(`/rest/v1/campaign_recipients?id=eq.${r.id}`,{
            method:"PATCH",headers:{Prefer:"return=minimal"},
            body:JSON.stringify({status:"ENVIADA",meta_message_id:out.id,sent_at:nowIso(),updated_at:nowIso()})
          });
        }catch(e){
          await sb(`/rest/v1/campaign_recipients?id=eq.${r.id}`,{
            method:"PATCH",headers:{Prefer:"return=minimal"},
            body:JSON.stringify({status:"FALHA",error_text:e.message,updated_at:nowIso()})
          }).catch(()=>{});
        }
        await sleep(randomBetween(c.interval_min,c.interval_max));
      }
    }
  }finally{campaignRunnerBusy=false;}
}
setInterval(()=>runCampaigns().catch(()=>{}),10000);

app.get("/",(req,res)=>res.sendFile(__dirname+"/index.html"));
app.listen(PORT,async()=>{
  console.log(`Projeto Zap V5.5 online na porta ${PORT}`);
  try{await startWhatsApp(false);}catch(e){console.log("WhatsApp aguardando:",e.message);}
});