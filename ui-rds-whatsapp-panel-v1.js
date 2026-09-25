(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const F=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha');return d};
const B=(t,f,c)=>typeof btn==='function'?btn(t,f,c||'btn'):'<button class="'+(c||'btn')+'" onclick="'+f+'">'+E(t)+'</button>';
let activePhone='',pollTimer=null,searchText='';
function statusCard(d){
 if(d.connected)return '<div class="rds-wa-connect-card connected"><div class="rds-wa-connect-icon">✓</div><div><b>WhatsApp conectado</b><small>'+E(d.number||'Número conectado')+'</small></div><span>ATIVO</span></div>';
 if(d.qrAvailable&&d.qrDataUrl)return '<div class="rds-wa-connect-card qr"><div><b>Conecte seu WhatsApp</b><small>Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho e escaneie o QR Code.</small></div><img src="'+d.qrDataUrl+'" alt="QR Code WhatsApp"></div>';
 return '<div class="rds-wa-connect-card offline"><div class="rds-wa-connect-icon">!</div><div><b>WhatsApp desconectado</b><small>'+E(d.lastError||'Clique em Conectar WhatsApp para iniciar a conexão.')+'</small></div>'+B('Conectar','rdsWaConnect()','btn primary')+'</div>';
}
function shell(d){
 app.innerHTML='<section class="rds-wa-app">'+
 '<header class="rds-wa-top"><div><span class="eyebrow">ATENDIMENTO</span><h1>WhatsApp</h1><p>Converse com seus clientes pelo número conectado ao CANAL DE VENDAS RDS.</p></div><span class="rds-wa-state '+(d.connected?'on':'off')+'">● '+(d.connected?'Conectado':'Desconectado')+'</span></header>'+
 '<div id="rdsWaStatus">'+statusCard(d)+'</div>'+
 '<div class="rds-wa-layout">'+
 '<aside class="rds-wa-list"><div class="rds-wa-list-head"><b>Conversas</b><span id="rdsWaCount"></span></div><div class="rds-wa-search"><span>⌕</span><input id="rdsWaSearch" placeholder="Pesquisar nome ou número..."></div><div id="rdsWaChats"></div></aside>'+
 '<section class="rds-wa-chat"><div id="rdsWaEmpty" class="rds-wa-empty"><div class="rds-wa-logo">◉</div><h2>Central de conversas</h2><p>Selecione uma conversa à esquerda.</p><small>A conversa selecionada aparece aqui e você pode responder diretamente pelo WhatsApp conectado.</small></div><div id="rdsWaConversation" hidden></div></section>'+
 '</div></section>';
 $('#rdsWaSearch').value=searchText;$('#rdsWaSearch').oninput=()=>{searchText=$('#rdsWaSearch').value;drawChats(d.chats||[])};
 drawChats(d.chats||[]);
}
function drawChats(chats){
 const q=searchText.toLowerCase().trim(),list=chats.filter(c=>(c.name+' '+c.phone+' '+c.group_name).toLowerCase().includes(q));
 $('#rdsWaCount').textContent=list.length+' conversa'+(list.length===1?'':'s');
 $('#rdsWaChats').innerHTML=list.map(c=>'<button class="rds-wa-chat-row" onclick="rdsWaOpen(\''+E(c.phone)+'\')"><span class="rds-wa-avatar">'+E((c.name||c.phone).slice(0,1).toUpperCase())+'</span><span class="rds-wa-chat-main"><b>'+E(c.name||c.phone)+'</b><small>'+E(c.messages[0]?.body||'Sem mensagem registrada')+'</small></span><time>'+((c.messages[0]?.created_at)?new Date(c.messages[0].created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</time></button>').join('')||'<div class="rds-wa-nochat">Nenhuma conversa encontrada.</div>';
}
function startPolling(){
 clearInterval(pollTimer);pollTimer=setInterval(async()=>{if(page!=='whatsapp')return;try{const d=await F('/api/whatsapp/chats');if(d.connected||d.qrAvailable||d.starting){shell(d);if(activePhone)await rdsWaOpen(activePhone,true);}else if(!activePhone){$('#rdsWaStatus').innerHTML=statusCard(d);}}catch{}},2500);
}
window.rdsWaReload=()=>{activePhone='';searchText='';waPage()};
window.rdsWaConnect=async()=>{try{await F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:false})});toast('Conexão iniciada. O QR Code aparecerá aqui quando estiver disponível.');startPolling();}catch(e){toast(e.message)}};
window.rdsWaOpen=async(phone,refreshOnly=false)=>{
 activePhone=phone;
 const d=await F('/api/whatsapp/chat/'+encodeURIComponent(phone)),c=d.contact||{};
 document.querySelector('.rds-wa-app')?.classList.add('rds-wa-open');
 $('#rdsWaEmpty').hidden=true;const box=$('#rdsWaConversation');box.hidden=false;
 box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><span class="rds-wa-avatar">'+E((c.name||phone).slice(0,1).toUpperCase())+'</span><div><b>'+E(c.name||phone)+'</b><small>'+E(c.phone||phone)+' • '+(d.connected?'WhatsApp conectado':'WhatsApp desconectado')+'</small></div></div></header><div id="rdsWaMessages" class="rds-wa-messages">'+(d.messages.length?d.messages.map(m=>'<div class="rds-wa-bubble '+(m.direction==='OUT'?'out':'in')+'"><div>'+E(m.body||('['+(m.message_type||'mensagem')+']'))+'</div><small>'+new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' '+E(m.status||'')+'</small></div>').join(''):'<div class="rds-wa-nochat">Nenhuma mensagem registrada nesta conversa.</div>')+'</div><form id="rdsWaSend" class="rds-wa-compose"><textarea id="rdsWaText" rows="1" placeholder="'+(d.connected?'Digite uma mensagem...':'WhatsApp desconectado')+'" '+(d.connected?'':'disabled')+'></textarea><button class="btn primary" type="submit" '+(d.connected?'':'disabled')+'>➤</button></form>';
 $('#rdsWaSend').onsubmit=async e=>{e.preventDefault();const text=$('#rdsWaText').value.trim();if(!text)return;try{await F('/api/whatsapp/chat/'+encodeURIComponent(activePhone)+'/send',{method:'POST',body:JSON.stringify({text})});$('#rdsWaText').value='';await rdsWaOpen(activePhone,true)}catch(err){toast(err.message)}};
 $('#rdsWaMessages').scrollTop=$('#rdsWaMessages').scrollHeight;
 if(!refreshOnly)document.querySelector('.rds-wa-app')?.classList.add('rds-wa-open');
};
window.rdsWaBack=()=>{activePhone='';document.querySelector('.rds-wa-app')?.classList.remove('rds-wa-open');$('#rdsWaConversation').hidden=true;$('#rdsWaEmpty').hidden=false};
async function waPage(){try{const d=await F('/api/whatsapp/chats');shell(d);startPolling()}catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>WhatsApp</h2><p>'+E(e.message)+'</p><button class="btn primary" onclick="go(\'whatsapp\')">Tentar novamente</button></div>'}}
const oldRender=window.render;window.render=async function(){clearInterval(pollTimer);if(page==='whatsapp')return waPage();return oldRender.apply(this,arguments)};
})();