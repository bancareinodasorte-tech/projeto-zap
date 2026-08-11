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
      browser:["Projeto Zap V5.2","Chrome","1.0.0"],
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


app.get("/",(req,res)=>res.type("html").send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Projeto Zap V5.2</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#071426;color:#eef4ff}
main{max-width:760px;margin:auto;padding:18px}.brand{padding:18px 0}.brand h1{margin:0;font-size:28px}.brand p{margin:6px 0;color:#9db0c9}
.card{background:#101f35;border:1px solid #28415f;border-radius:20px;padding:18px;margin-bottom:14px}
.status{display:flex;align-items:center;gap:10px;font-weight:700}.dot{width:12px;height:12px;border-radius:50%;background:#7d8796}
.dot.on{background:#21c56d}.dot.wait{background:#f1b83b}.dot.err{background:#ef5b67}
#qr{display:none;width:min(360px,100%);margin:18px auto;background:white;padding:12px;border-radius:16px}
button,input,textarea{width:100%;padding:14px;border-radius:12px;border:1px solid #38516f;background:#0a1728;color:white;font-size:16px;margin-top:10px}
button{background:#176bff;border:0;font-weight:700}button.secondary{background:#263b57}button.danger{background:#a62d3b}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.small{font-size:13px;color:#9db0c9;line-height:1.45}
#pairCode{font-size:28px;font-weight:800;letter-spacing:4px;text-align:center;padding:14px}
.msg{margin-top:10px;padding:10px;border-radius:10px;background:#0a1728;display:none}
@media(max-width:560px){.row{grid-template-columns:1fr}}
</style></head><body><main>
<div class="brand"><h1>Projeto Zap V5.2</h1><p>Central de conexão do WhatsApp</p></div>
<div class="card">
 <div class="status"><span id="dot" class="dot"></span><span id="statusText">Verificando conexão...</span></div>
 <div id="number" class="small" style="margin-top:8px"></div>
 <img id="qr" alt="QR Code do WhatsApp">
 <div id="msg" class="msg"></div>
</div>
<div class="card">
 <strong>Acesso ao painel</strong>
 <div class="small">Cole o token de acesso do Supabase. Ele fica salvo somente neste navegador.</div>
 <input id="token" type="password" placeholder="Token de acesso">
 <button onclick="saveToken()">Salvar e verificar</button>
</div>
<div class="card">
 <strong>Conectar WhatsApp</strong>
 <button onclick="connect(false)">Gerar / atualizar QR Code</button>
 <div class="small" style="margin-top:10px">No WhatsApp: Aparelhos conectados → Conectar um aparelho → leia o QR.</div>
 <hr style="border:0;border-top:1px solid #28415f;margin:18px 0">
 <strong>Ou conectar pelo número</strong>
 <input id="pairPhone" inputmode="numeric" placeholder="DDD + número, ex.: 88999999999">
 <button class="secondary" onclick="pair()">Gerar código de pareamento</button>
 <div id="pairCode"></div>
</div>
<div class="card">
 <strong>Teste após conectar</strong>
 <input id="testPhone" inputmode="numeric" placeholder="DDD + número de teste">
 <textarea id="testText" rows="3">Teste Projeto Zap V5.2 ✅</textarea>
 <button onclick="sendTest()">Enviar mensagem de teste</button>
</div>
<div class="card"><button class="danger" onclick="logout()">Desconectar WhatsApp</button></div>
</main>
<script>
const $=id=>document.getElementById(id);
$("token").value=localStorage.getItem("pz_token")||"";
function auth(){const t=$("token").value.trim()||localStorage.getItem("pz_token")||"";return t?{"Authorization":"Bearer "+t}:{}}
function show(m){$("msg").style.display="block";$("msg").textContent=m}
async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{...auth(),"Content-Type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({error:"Resposta inválida"}));if(!r.ok)throw new Error(d.error||("Erro "+r.status));return d}
function saveToken(){localStorage.setItem("pz_token",$("token").value.trim());refresh()}
async function refresh(){
 try{
  const d=await api("/api/whatsapp/status");
  $("dot").className="dot "+(d.connected?"on":d.qrAvailable?"wait":"");
  $("statusText").textContent=d.connected?"WhatsApp conectado":d.starting?"Iniciando conexão...":d.qrAvailable?"Aguardando leitura do QR Code":"WhatsApp desconectado";
  $("number").textContent=d.number?"Número conectado: +"+d.number:(d.lastError?"Último aviso: "+d.lastError:"");
  if(d.qrAvailable&&d.qrDataUrl){$("qr").src=d.qrDataUrl;$("qr").style.display="block"}else{$("qr").style.display="none"}
 }catch(e){$("dot").className="dot err";$("statusText").textContent="Informe um token válido";$("number").textContent=e.message}
}
async function connect(force){try{show("Gerando conexão...");await api("/api/whatsapp/connect",{method:"POST",body:JSON.stringify({force})});setTimeout(refresh,1000)}catch(e){show(e.message)}}
async function pair(){try{const d=await api("/api/whatsapp/pairing-code",{method:"POST",body:JSON.stringify({phone:$("pairPhone").value})});$("pairCode").textContent=d.code||d.message||"";refresh()}catch(e){show(e.message)}}
async function sendTest(){try{const d=await api("/api/whatsapp/send-test",{method:"POST",body:JSON.stringify({to:$("testPhone").value,text:$("testText").value})});show("Mensagem enviada com sucesso. ID: "+(d.messageId||"-"))}catch(e){show(e.message)}}
async function logout(){if(!confirm("Desconectar e remover a sessão do WhatsApp?"))return;try{await api("/api/whatsapp/logout",{method:"POST",body:"{}"});$("pairCode").textContent="";show("WhatsApp desconectado.");refresh()}catch(e){show(e.message)}}
refresh();setInterval(refresh,3000);
</script></body></html>`));

app.get("/health",(req,res)=>res.json({ok:true,service:"projeto-zap-v5.2",connector:"baileys",connected}));

app.get("/api/whatsapp/status",verifyUser,(req,res)=>res.json({
  ok:true,connector:"baileys",connected,starting,number:connectedNumber||null,
  qrAvailable:Boolean(qrDataUrl),qrDataUrl:qrDataUrl||null,lastError:lastError||null,lastConnectionAt
}));

app.get("/api/whatsapp/connect",async(req,res)=>{
  try{
    await startWhatsApp(false);
    res.json({
      ok:true,
      message: connected ? "WhatsApp já conectado." : "Conexão iniciada.",
      connector:"baileys",
      connected,
      starting,
      qrAvailable:Boolean(qrDataUrl),
      qrDataUrl:qrDataUrl||null,
      lastError:lastError||null
    });
  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
});

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
    const text=String(req.body?.text||"Teste Projeto Zap V5.2 ✅").trim();
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
  console.log(`Projeto Zap V5.2 online na porta ${PORT}`);
  try{ await startWhatsApp(false); }catch(e){ console.log("WhatsApp aguardando configuração:",e.message); }
});
