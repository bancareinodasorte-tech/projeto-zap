const express=require("express");
const crypto=require("crypto");

const app=express();
app.use(express.json({limit:"2mb"}));

const PORT=process.env.PORT||3000;
const GRAPH_VERSION=process.env.GRAPH_API_VERSION||"v26.0";
const WA_TOKEN=process.env.META_WA_TOKEN||"";
const PHONE_ID=process.env.META_PHONE_NUMBER_ID||"";
const VERIFY_TOKEN=process.env.META_VERIFY_TOKEN||"";
const SUPABASE_URL=(process.env.SUPABASE_URL||"").replace(/\/+$/,"");
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||"";
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const FRONTEND_ORIGIN=process.env.FRONTEND_ORIGIN||"*";

app.use((req,res,next)=>{
  res.setHeader("Access-Control-Allow-Origin",FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  if(req.method==="OPTIONS") return res.sendStatus(204);
  next();
});

function ready(){
  return Boolean(WA_TOKEN&&PHONE_ID&&VERIFY_TOKEN&&SUPABASE_URL&&SUPABASE_ANON_KEY&&SUPABASE_SERVICE_ROLE_KEY);
}
function digits(v){return String(v||"").replace(/\D/g,"")}
function tailPhone(v){const n=digits(v);return n.slice(-11)}

async function sb(path,opt={},service=true){
  const key=service?SUPABASE_SERVICE_ROLE_KEY:SUPABASE_ANON_KEY;
  const r=await fetch(SUPABASE_URL+path,{
    ...opt,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      ...(opt.headers||{})
    }
  });
  const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(data?.message||data?.details||`Supabase ${r.status}`);
  return data;
}

async function verifyUser(req,res,next){
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!token) return res.status(401).json({error:"Sessão ausente."});
    const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}
    });
    const u=await r.json();
    if(!r.ok||!u?.id) return res.status(401).json({error:"Sessão inválida."});
    req.user=u;next();
  }catch(e){res.status(401).json({error:"Não foi possível validar a sessão."})}
}

async function metaSendTemplate({to,templateName,language}){
  const r=await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`,{
    method:"POST",
    headers:{Authorization:`Bearer ${WA_TOKEN}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      messaging_product:"whatsapp",
      to:digits(to),
      type:"template",
      template:{name:templateName,language:{code:language}}
    })
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d?.error?.message||`Meta ${r.status}`);
  return d;
}

app.get("/health",(req,res)=>res.json({ok:true,service:"projeto-zap-v5",graphVersion:GRAPH_VERSION}));

app.get("/api/whatsapp/status",verifyUser,(req,res)=>{
  res.json({ok:true,ready:ready(),graphVersion:GRAPH_VERSION,phoneNumberIdConfigured:Boolean(PHONE_ID),tokenConfigured:Boolean(WA_TOKEN),webhookVerifyConfigured:Boolean(VERIFY_TOKEN)});
});

app.post("/api/whatsapp/send-test",verifyUser,async(req,res)=>{
  try{
    if(!ready()) return res.status(503).json({error:"Backend ainda não possui todas as variáveis obrigatórias."});
    const to=digits(req.body?.to);
    const templateName=String(req.body?.templateName||"hello_world").trim();
    const language=String(req.body?.language||"en_US").trim();
    if(to.length<10) return res.status(400).json({error:"Telefone de teste inválido."});
    const d=await metaSendTemplate({to,templateName,language});
    const messageId=d?.messages?.[0]?.id||null;
    if(messageId){
      await sb("/rest/v1/whatsapp_messages",{
        method:"POST",
        headers:{Prefer:"return=minimal"},
        body:JSON.stringify({
          owner_id:req.user.id,
          meta_message_id:messageId,
          direction:"OUT",
          message_type:"template",
          body:templateName,
          status:"accepted",
          phone:to,
          raw_payload:d
        })
      });
    }
    res.json({ok:true,messageId});
  }catch(e){res.status(500).json({error:e.message})}
});

app.get("/webhook",(req,res)=>{
  const mode=req.query["hub.mode"],token=req.query["hub.verify_token"],challenge=req.query["hub.challenge"];
  if(mode==="subscribe"&&token===VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

async function findContactByPhone(from){
  const rows=await sb("/rest/v1/contacts?select=id,owner_id,phone,name&limit=2000");
  const tail=tailPhone(from);
  return (rows||[]).find(c=>tailPhone(c.phone)===tail)||null;
}
async function latestActiveRecipient(contactId){
  if(!contactId)return null;
  const rows=await sb(`/rest/v1/campaign_recipients?contact_id=eq.${encodeURIComponent(contactId)}&status=in.(PENDENTE,REENVIO_AGENDADO,ENVIADA,ENTREGUE,LIDA)&select=*&order=created_at.desc&limit=1`);
  return rows?.[0]||null;
}
async function logEvent(recipient,type,source="webhook"){
  if(!recipient)return;
  try{
    await sb("/rest/v1/campaign_events",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      owner_id:recipient.owner_id,
      recipient_id:recipient.id,
      campaign_id:recipient.campaign_id,
      contact_id:recipient.contact_id,
      event_type:type,
      event_source:source
    })});
  }catch{}
}

async function handleInbound(value,msg){
  const from=msg.from||value?.contacts?.[0]?.wa_id||"";
  const contact=await findContactByPhone(from);
  const recipient=await latestActiveRecipient(contact?.id);
  const ownerId=contact?.owner_id||recipient?.owner_id||null;
  const body=msg?.text?.body||msg?.button?.text||msg?.interactive?.button_reply?.title||msg?.interactive?.list_reply?.title||null;
  if(ownerId){
    await sb("/rest/v1/whatsapp_messages",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({
      owner_id:ownerId,contact_id:contact?.id||null,campaign_id:recipient?.campaign_id||null,recipient_id:recipient?.id||null,
      meta_message_id:msg.id,direction:"IN",message_type:msg.type||"unknown",body,status:"received",phone:from,raw_payload:msg
    })});
  }
  if(recipient){
    const now=new Date().toISOString();
    await sb(`/rest/v1/campaign_recipients?id=eq.${recipient.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"RESPONDEU",responded_at:now,next_action_at:null,updated_at:now})});
    await logEvent(recipient,"RESPONDEU");
  }
}
async function handleStatus(st){
  const metaId=st.id;if(!metaId)return;
  const rows=await sb(`/rest/v1/whatsapp_messages?meta_message_id=eq.${encodeURIComponent(metaId)}&select=*&limit=1`);
  const wm=rows?.[0];
  let recipient=null;
  if(wm?.recipient_id){
    const rs=await sb(`/rest/v1/campaign_recipients?id=eq.${wm.recipient_id}&select=*&limit=1`);
    recipient=rs?.[0];
  }else{
    const rs=await sb(`/rest/v1/campaign_recipients?meta_message_id=eq.${encodeURIComponent(metaId)}&select=*&limit=1`);
    recipient=rs?.[0];
  }
  const status=String(st.status||"").toLowerCase();
  const map={sent:"ENVIADA",delivered:"ENTREGUE",read:"LIDA",failed:"FALHA"};
  const appStatus=map[status];
  const now=new Date().toISOString();
  const err=st?.errors?.[0]?.title||st?.errors?.[0]?.message||null;
  if(wm){
    await sb(`/rest/v1/whatsapp_messages?id=eq.${wm.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,error_text:err,raw_payload:st,updated_at:now})});
  }
  if(recipient&&appStatus){
    const patch={status:appStatus,whatsapp_status:status,updated_at:now};
    if(status==="sent")patch.sent_at=now;
    if(status==="delivered")patch.delivered_at=now;
    if(status==="read")patch.read_at=now;
    if(status==="failed"){patch.failed_at=now;patch.whatsapp_error=err;patch.next_action_at=null}
    await sb(`/rest/v1/campaign_recipients?id=eq.${recipient.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(patch)});
    await logEvent(recipient,appStatus);
  }
}

app.post("/webhook",(req,res)=>{
  res.sendStatus(200);
  (async()=>{
    try{
      for(const entry of req.body?.entry||[]){
        for(const change of entry?.changes||[]){
          const value=change?.value||{};
          for(const msg of value.messages||[]) await handleInbound(value,msg);
          for(const st of value.statuses||[]) await handleStatus(st);
        }
      }
    }catch(e){console.error("webhook error",e.message)}
  })();
});

app.listen(PORT,()=>console.log(`Projeto Zap V5 backend online na porta ${PORT}`));
