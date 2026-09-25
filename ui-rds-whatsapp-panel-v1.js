(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const F=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||d.message||'Falha');return d};
let activePhone='',pollTimer=null,searchText='',lastData=null;
function statusCard(s){
 const connected=Boolean(s?.connected),err=String(s?.lastError||'').trim();
 if(connected)return '<div class="rds-wa-connect-card connected"><div class="rds-wa-connect-icon">✓</div><div><b>WhatsApp conectado</b><small>'+E(s.number||'Número conectado')+'</small></div><span>ATIVO</span></div>';
 return '<div class="rds-wa-connect-card offline"><div class="rds-wa-connect-icon">!</div><div><b>WhatsApp desconectado</b><small>O painel usa a conexão WhatsApp do servidor (Baileys) com sessão persistida.'+(err?' Último estado: '+E(err):'')+'</small></div><span>OFFLINE</span></div>';
}
function shell(d){
 lastData=d;const s=d.status||{};
 app.innerHTML='<section class="rds-wa-app"><header class="rds-wa-top"><div><span class="eyebrow">ATENDIMENTO</span><h1>WhatsApp</h1><p>Converse com seus clientes pelo número conectado ao CANAL DE VENDAS RDS.</p></div><span class="rds-wa-state '+(s.connected?'on':'off')+'">● '+(s.connected?'Conectado':'Aguardando conexão')+'</span></header><div id="rdsWaStatus">'+statusCard(s)+'</div><div class="rds-wa-layout"><aside class="rds-wa-list"><div class="rds-wa-list-head"><b>Conversas</b><span id="rdsWaCount"></span></div><div class="rds-wa-search"><span>⌕</span><input id="rdsWaSearch" placeholder="Pesquisar nome ou número..."></div><div id="rdsWaChats"></div></aside><section class="rds-wa-chat"><div id="rdsWaEmpty" class="rds-wa-empty"><div class="rds-wa-logo">◉</div><h2>Central de conversas</h2><p>Selecione uma conversa à esquerda.</p><small>A conversa selecionada aparece aqui e você pode responder diretamente pelo WhatsApp conectado.</small></div><div id="rdsWaConversation" hidden></div></section></div></section>';
 $('#rdsWaSearch').value=searchText;$('#rdsWaSearch').oninput=()=>{searchText=$('#rdsWaSearch').value;drawChats(d.chats||[])};drawChats(d.chats||[]);
}
function drawChats(chats){
 const q=searchText.toLowerCase().trim(),list=(chats||[]).filter(c=>(String(c.name||'')+' '+String(c.phone||'')+' '+String(c.group_name||'')).toLowerCase().includes(q));
 $('#rdsWaCount').textContent=list.length+' conversa'+(list.length===1?'':'s');
 $('#rdsWaChats').innerHTML=list.map(c=>'<button class="rds-wa-chat-row" onclick="rdsWaOpen(\''+E(c.phone||'')+'\')"><span class="rds-wa-avatar">'+E((c.name||c.phone||'?').slice(0,1).toUpperCase())+'</span><span class="rds-wa-chat-main"><b>'+E(c.name||c.phone)+'</b><small>'+E(c.messages?.[0]?.body||'Sem mensagem registrada')+'</small></span><time>'+((c.messages?.[0]?.created_at)?new Date(c.messages[0].created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</time></button>').join('')||'<div class="rds-wa-nochat">Nenhuma conversa encontrada.</div>';
}
async function loadData(){const [status,chats]=await Promise.all([F('/api/status'),F('/api/whatsapp/chats')]);return {status,chats:chats.chats||[]}}
function dataKey(d){return JSON.stringify({connected:d?.status?.connected,number:d?.status?.number,lastError:d?.status?.lastError,chats:(d?.chats||[]).map(x=>[x.phone,x.messages?.[0]?.wa_message_id,x.messages?.[0]?.created_at,x.messages?.[0]?.body])})}
function startPolling(){
 clearInterval(pollTimer);pollTimer=setInterval(async()=>{if(page!=='whatsapp'||activePhone)return;try{const before=lastData,key=dataKey(before);const d=await loadData();if(key!==dataKey(d))shell(d)}catch{}},3000);
}
window.rdsWaReload=()=>{activePhone='';searchText='';waPage()};
window.rdsWaOpen=async phone=>{
 activePhone=phone;document.querySelector('.rds-wa-app')?.classList.add('rds-wa-open');
 const box=$('#rdsWaConversation');box.hidden=false;$('#rdsWaEmpty').hidden=true;box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><div><b>Abrindo conversa...</b><small>'+E(phone)+'</small></div></div></header><div class="rds-wa-open-error">Carregando...</div>';
 try{
  const d=await F('/api/whatsapp/chat/'+encodeURIComponent(phone)),c=d.contact||{},messages=d.messages||[];
  box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><span class="rds-wa-avatar">'+E((c.name||phone).slice(0,1).toUpperCase())+'</span><div><b>'+E(c.name||phone)+'</b><small>'+E(c.phone||phone)+' • '+(d.connected?'WhatsApp conectado':'WhatsApp desconectado')+'</small></div></div></header><div id="rdsWaMessages" class="rds-wa-messages">'+(messages.length?messages.map(m=>'<div class="rds-wa-bubble '+(m.direction==='OUT'?'out':'in')+'"><div>'+E(m.body||('['+(m.message_type||'mensagem')+']'))+'</div><small>'+new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' '+E(m.status||'')+'</small></div>').join(''):'<div class="rds-wa-nochat">Nenhuma mensagem registrada nesta conversa.</div>')+'</div><form id="rdsWaSend" class="rds-wa-compose"><textarea id="rdsWaText" rows="1" placeholder="'+(d.connected?'Digite uma mensagem...':'WhatsApp desconectado')+'" '+(d.connected?'':'disabled')+'></textarea><button class="btn primary" type="submit" '+(d.connected?'':'disabled')+'>➤</button></form>';
  $('#rdsWaSend').onsubmit=async e=>{e.preventDefault();const text=$('#rdsWaText').value.trim();if(!text)return;try{await F('/api/whatsapp/chat/'+encodeURIComponent(activePhone)+'/send',{method:'POST',body:JSON.stringify({text})});$('#rdsWaText').value='';await rdsWaOpen(activePhone)}catch(err){toast(err.message)}};
  $('#rdsWaMessages').scrollTop=$('#rdsWaMessages').scrollHeight;
 }catch(e){box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><div><b>Não foi possível abrir a conversa</b><small>'+E(e.message)+'</small></div></div></header><div class="rds-wa-open-error"><b>Erro ao carregar esta conversa.</b><span>'+E(e.message)+'</span><button class="btn primary" onclick="rdsWaOpen(\''+E(phone)+'\')">Tentar novamente</button></div>'}
};
window.rdsWaBack=()=>{activePhone='';document.querySelector('.rds-wa-app')?.classList.remove('rds-wa-open');$('#rdsWaConversation').hidden=true;$('#rdsWaEmpty').hidden=false};
async function waPage(){try{clearInterval(pollTimer);const d=await loadData();shell(d);startPolling()}catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>WhatsApp</h2><p>'+E(e.message)+'</p><button class="btn primary" onclick="go(\'whatsapp\')">Tentar novamente</button></div>'}}
const oldRender=window.render;window.render=async function(){clearInterval(pollTimer);if(page==='whatsapp')return waPage();return oldRender.apply(this,arguments)};
})();