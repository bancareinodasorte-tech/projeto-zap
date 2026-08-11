const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let contacts=[],selectedPhones=new Set(),imageDataUrl=null;

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
async function api(url,opt={}){
  const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json",...(opt.headers||{})}});
  let d={};try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||`Erro ${r.status}`);
  return d;
}
function fmtDate(v){if(!v)return"—";try{return new Date(v).toLocaleString("pt-BR")}catch{return v}}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function badge(s){
  const x=String(s||"").toUpperCase();let c="gray";
  if(x.includes("COMPRA")||x==="ENVIADA")c="ok"; else if(x.includes("PAGAMENTO"))c="hot"; else if(x==="RESPONDEU"||x.includes("EXEC"))c="warn";
  return `<span class="badge ${c}">${esc(x||"—")}</span>`;
}
function showPage(id){
  $$(".page").forEach(x=>x.classList.toggle("active",x.id===id));
  $$(".bottom button").forEach(x=>x.classList.toggle("active",x.dataset.page===id));
  if(id==="contacts")loadContacts(); if(id==="campaigns"){loadContacts().then(renderCampaignContacts);loadCampaigns()}
  if(id==="execution")loadExecution(); if(id==="returns")loadReturns(); if(id==="purchases")loadPurchases(); if(id==="settings")waStatus();
  scrollTo(0,0);
}
$$(".bottom button").forEach(b=>b.onclick=()=>showPage(b.dataset.page));

async function waStatus(){
  try{
    const d=await api("/api/whatsapp/status");
    $("#stWhats").textContent=d.connected?"✅":"—";
    const badgeEl=$("#waBadge"), detail=$("#waDetail");
    if(d.connected){
      badgeEl.textContent="Conectado ✅";badgeEl.className="badge ok";
      detail.textContent=`${d.name||"WhatsApp"}${d.number?" • "+d.number:""}`;
    }else if(d.starting){
      badgeEl.textContent="Conectando";badgeEl.className="badge warn";detail.textContent="Inicializando conexão...";
    }else{
      badgeEl.textContent="Desconectado";badgeEl.className="badge gray";detail.textContent=d.lastError||"WhatsApp desconectado.";
    }
    if(d.qrAvailable&&d.qrDataUrl){$("#qr").src=d.qrDataUrl;$("#qr").classList.remove("hidden")}
    else $("#qr").classList.add("hidden");
  }catch(e){$("#waDetail").textContent=e.message}
}
$("#generateQr").onclick=async()=>{try{await api("/api/whatsapp/connect",{method:"POST",body:JSON.stringify({force:true})});toast("Gerando QR...");setTimeout(waStatus,1200)}catch(e){toast(e.message)}}
$("#pairCode").onclick=async()=>{try{const d=await api("/api/whatsapp/pairing-code",{method:"POST",body:JSON.stringify({phone:$("#pairPhone").value})});$("#pairResult").textContent=d.code||"";toast(d.connected?"WhatsApp já conectado":"Código gerado")}catch(e){toast(e.message)}}
$("#logoutWa").onclick=async()=>{if(!confirm("Desconectar e remover a sessão do WhatsApp?"))return;try{await api("/api/whatsapp/logout",{method:"POST",body:"{}"});toast("WhatsApp desconectado");waStatus()}catch(e){toast(e.message)}}
$("#sendTest").onclick=async()=>{try{await api("/api/whatsapp/send-test",{method:"POST",body:JSON.stringify({to:$("#testPhone").value,text:$("#testText").value})});toast("Mensagem enviada ✅")}catch(e){toast(e.message)}}

async function loadContacts(){
  try{const d=await api("/api/contacts");contacts=d.contacts||[];$("#stContacts").textContent=contacts.length;renderContacts();return contacts}catch(e){toast(e.message);return[]}
}
function renderContacts(){
  $("#contactsList").innerHTML=contacts.length?contacts.map(c=>`<div class="item"><div class="itemline"><div><b>${esc(c.name)}</b><span class="muted">${esc(c.phone)}</span></div>${c.opt_out?badge("BLOQUEADO"):c.consent!==false?badge("AUTORIZADO"):badge("SEM AUTORIZAÇÃO")}</div></div>`).join(""):`<p class="muted">Nenhum contato.</p>`;
}
$("#addContact").onclick=async()=>{try{await api("/api/contacts",{method:"POST",body:JSON.stringify({name:$("#contactName").value,phone:$("#contactPhone").value,consent:$("#contactConsent").checked})});$("#contactName").value="";$("#contactPhone").value="";toast("Contato salvo");loadContacts()}catch(e){toast(e.message)}}
$("#refreshContacts").onclick=loadContacts;

function renderCampaignContacts(){
  const valid=contacts.filter(c=>c.consent!==false&&!c.opt_out);
  $("#campaignContacts").innerHTML=valid.length?valid.map(c=>`<label class="item"><input type="checkbox" data-phone="${esc(c.phone)}" ${selectedPhones.has(c.phone)?"checked":""}><span><b>${esc(c.name)}</b><small class="muted">${esc(c.phone)}</small></span></label>`).join(""):`<p class="muted">Cadastre contatos autorizados primeiro.</p>`;
  $$("#campaignContacts input").forEach(x=>x.onchange=()=>x.checked?selectedPhones.add(x.dataset.phone):selectedPhones.delete(x.dataset.phone));
}
$("#selectAllContacts").onclick=()=>{contacts.filter(c=>c.consent!==false&&!c.opt_out).forEach(c=>selectedPhones.add(c.phone));renderCampaignContacts()}
$("#clearSelectedContacts").onclick=()=>{selectedPhones.clear();renderCampaignContacts()}
$("#campImage").onchange=()=>{
  const f=$("#campImage").files?.[0];imageDataUrl=null;
  if(!f){$("#campPreview").classList.add("hidden");return}
  if(f.size>5*1024*1024){toast("Imagem maior que 5 MB");$("#campImage").value="";return}
  const r=new FileReader();r.onload=()=>{imageDataUrl=r.result;$("#campPreview").src=r.result;$("#campPreview").classList.remove("hidden")};r.readAsDataURL(f)
}
$("#saveCampaign").onclick=async()=>{
  try{
    const messages=$$(".msg").map(x=>x.value.trim()).filter(Boolean);
    const body={name:$("#campName").value,messages,phones:[...selectedPhones],imageDataUrl,imageName:$("#campImage").files?.[0]?.name||null,
      intervalMin:$("#intervalMin").value,intervalMax:$("#intervalMax").value,scheduleAt:$("#scheduleAt").value||null};
    const d=await api("/api/campaigns",{method:"POST",body:JSON.stringify(body)});
    toast(`Campanha salva • ${d.recipients} contatos`);selectedPhones.clear();imageDataUrl=null;$("#campImage").value="";$("#campPreview").classList.add("hidden");loadCampaigns();
  }catch(e){toast(e.message)}
}
async function loadCampaigns(){
  try{
    const d=await api("/api/campaigns"), rows=d.campaigns||[];
    $("#campaignList").innerHTML=rows.length?rows.map(c=>`<div class="item"><div class="itemline"><div><b>${esc(c.name)}</b><span class="muted">${fmtDate(c.created_at)}${c.image_url?" • 🖼️ imagem":""}</span></div>${badge(c.status)}</div><div class="actions">${["PRONTA","PAUSADA","AGENDADA"].includes(c.status)?`<button class="small startCamp" data-id="${c.id}">Iniciar</button>`:""}${c.status==="EM_EXECUCAO"?`<button class="small secondary pauseCamp" data-id="${c.id}">Pausar</button>`:""}</div></div>`).join(""):`<p class="muted">Nenhuma campanha.</p>`;
    $$(".startCamp").forEach(b=>b.onclick=async()=>{try{await api(`/api/campaigns/${b.dataset.id}/start`,{method:"POST",body:"{}"});toast("Campanha iniciada");loadCampaigns()}catch(e){toast(e.message)}});
    $$(".pauseCamp").forEach(b=>b.onclick=async()=>{try{await api(`/api/campaigns/${b.dataset.id}/pause`,{method:"POST",body:"{}"});toast("Campanha pausada");loadCampaigns()}catch(e){toast(e.message)}});
  }catch(e){toast(e.message)}
}
$("#refreshCampaigns").onclick=loadCampaigns;

async function loadExecution(){
  try{
    const d=await api("/api/execution"),rows=d.items||[];
    $("#executionList").innerHTML=rows.length?rows.map(r=>`<div class="item"><div class="itemline"><div><b>${esc(r.name||r.phone)}</b><span class="muted">${esc(r.phone)} • ${esc(r.campaigns?.name||"Campanha")}</span></div>${badge(r.status)}</div><span class="muted">${r.sent_at?"Enviado "+fmtDate(r.sent_at):r.error_text?esc(r.error_text):"Aguardando fila"}</span></div>`).join(""):`<article class="card"><p class="muted">Fila vazia.</p></article>`;
  }catch(e){toast(e.message)}
}
$("#refreshExecution").onclick=loadExecution;

async function setRecipientStatus(id,status){try{await api(`/api/recipients/${id}/status`,{method:"POST",body:JSON.stringify({status})});toast("Status atualizado");loadReturns();loadPurchases()}catch(e){toast(e.message)}}
async function loadReturns(){
  try{
    const d=await api("/api/returns"),rows=d.items||[];$("#stReturns").textContent=rows.length;
    $("#returnsList").innerHTML=rows.length?rows.map(r=>`<div class="item"><div class="itemline"><div><b>${esc(r.name||r.phone)}</b><span class="muted">${esc(r.phone)} • ${esc(r.campaigns?.name||"Campanha")}</span></div>${badge(r.status)}</div><p>${esc(r.last_inbound_preview||"Cliente respondeu")}</p><span class="muted">${fmtDate(r.responded_at)}</span><div class="actions"><button class="small success" data-buy="${r.id}">Compra realizada ✅</button><button class="small secondary" data-neg="${r.id}">Em negociação</button><button class="small danger" data-no="${r.id}">Não interessado</button></div></div>`).join(""):`<article class="card"><p class="muted">Nenhum retorno pendente.</p></article>`;
    $$("[data-buy]").forEach(b=>b.onclick=()=>setRecipientStatus(b.dataset.buy,"COMPRA_REALIZADA"));
    $$("[data-neg]").forEach(b=>b.onclick=()=>setRecipientStatus(b.dataset.neg,"EM_NEGOCIACAO"));
    $$("[data-no]").forEach(b=>b.onclick=()=>setRecipientStatus(b.dataset.no,"NAO_INTERESSADO"));
  }catch(e){toast(e.message)}
}
$("#refreshReturns").onclick=loadReturns;

async function loadPurchases(){
  try{
    const d=await api("/api/purchases"),rows=d.items||[];$("#stPurchases").textContent=rows.length;
    $("#purchasesList").innerHTML=rows.length?rows.map(r=>`<div class="item"><div class="itemline"><div><b>${esc(r.name||r.phone)}</b><span class="muted">${esc(r.phone)} • ${esc(r.campaigns?.name||"Campanha")}</span></div>${badge("COMPRA_REALIZADA")}</div><span class="muted">${fmtDate(r.purchase_at)}</span></div>`).join(""):`<article class="card"><p class="muted">Nenhuma compra registrada.</p></article>`;
  }catch(e){toast(e.message)}
}

async function dashboard(){await Promise.allSettled([waStatus(),loadContacts(),loadReturns(),loadPurchases()])}
setInterval(waStatus,12000);
if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
showPage("home");dashboard();