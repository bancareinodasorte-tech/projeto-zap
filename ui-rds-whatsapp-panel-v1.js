(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const F=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha');return d};
const B=(t,f,c)=>typeof btn==='function'?btn(t,f,c||'btn'):'<button class="'+(c||'btn')+'" onclick="'+f+'">'+E(t)+'</button>';
let activePhone='',pollTimer=null,searchText='';
function statusCard(d){
 const m=d.meta||{};
 if(m.connected)return '<div class="rds-wa-connect-card connected"><div class="rds-wa-connect-icon">✓</div><div><b>WhatsApp oficial conectado</b><small>'+E(m.number||'Número conectado')+(m.verifiedName?' • '+E(m.verifiedName):'')+'</small></div><span>ATIVO</span></div>';
 if(m.clientConfigured)return '<div class="rds-wa-connect-card offline meta-ready"><div class="rds-wa-connect-icon">!</div><div><b>WhatsApp oficial pronto para configuração</b><small>O CANAL DE VENDAS RDS está preparado para a conexão oficial da Meta. A ativação do número será feita pelo fluxo oficial de cadastro e verificação.</small></div><span>AGUARDANDO</span></div>';
 return '<div class="rds-wa-connect-card offline meta-setup"><div class="rds-wa-connect-icon">!</div><div><b>Conexão oficial Meta ainda não configurada</b><small>O painel não usará QR Code nem código de vinculação do WhatsApp Web. A próxima etapa é configurar o WhatsApp Business Platform da Meta para que o número seja verificado e opere diretamente neste painel.</small></div><span>CONFIGURAÇÃO</span></div>';
}
function shell(d){
 app.innerHTML='<section class="rds-wa-app">'+
 '<header class="rds-wa-top"><div><span class="eyebrow">ATENDIMENTO</span><h1>WhatsApp</h1><p>Converse com seus clientes pelo número conectado ao CANAL DE VENDAS RDS.</p></div><span class="rds-wa-state '+(d.connected?'on':'off')+'">● '+(d.connected?'Conectado':'Desconectado')+'</span></header>'+
 '<div id="rdsWaStatus">'+statusCard(d)+'</div><div id="rdsWaPairBox"></div>'+
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
 clearInterval(pollTimer);pollTimer=setInterval(async()=>{if(page!=='whatsapp')return;try{const [meta,chats]=await Promise.all([F('/api/whatsapp/meta/status').catch(e=>({connected:false,error:e.message})),F('/api/whatsapp/meta/chats').catch(()=>({chats:[]}))]);const d={meta,chats:chats.chats||[]};if(!activePhone)shell(d);}catch{}},2500);
}
window.rdsWaReload=()=>{activePhone='';searchText='';waPage()};


window.rdsWaRequestPair=async()=>{const phone=String($('#rdsWaPairPhone')?.value||'').replace(/\\D/g,'');if(phone.length<12){toast('Informe o número completo com DDD e código do país.');return}try{const d=await F('/api/whatsapp/pairing-code',{method:'POST',body:JSON.stringify({phone})});$('#rdsWaPairResult').innerHTML='<strong>'+E(d.code||'Código indisponível')+'</strong><small>Abra o WhatsApp nesse número → Configurações → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone e informe o código.</small>';}catch(e){$('#rdsWaPairResult').innerHTML='<span class="rds-wa-pair-error">'+E(e.message)+'</span>'}};
window.rdsWaOpen=async(phone,refreshOnly=false)=>{
 activePhone=phone;
 document.querySelector('.rds-wa-app')?.classList.add('rds-wa-open');
 const box=$('#rdsWaConversation');box.hidden=false;$('#rdsWaEmpty').hidden=true;
 box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><div><b>Abrindo conversa...</b><small>'+E(phone)+'</small></div></div></header><div class="rds-wa-open-error">Carregando...</div>';
 try{
  const d=await F('/api/whatsapp/meta/chat/'+encodeURIComponent(phone)),c=d.contact||{};
  box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><span class="rds-wa-avatar">'+E((c.name||phone).slice(0,1).toUpperCase())+'</span><div><b>'+E(c.name||phone)+'</b><small>'+E(c.phone||phone)+' • '+(d.connected?'WhatsApp conectado':'WhatsApp desconectado')+'</small></div></div></header><div id="rdsWaMessages" class="rds-wa-messages">'+(d.messages.length?d.messages.map(m=>'<div class="rds-wa-bubble '+(m.direction==='OUT'?'out':'in')+'"><div>'+E(m.body||('['+(m.message_type||'mensagem')+']'))+'</div><small>'+new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' '+E(m.status||'')+'</small></div>').join(''):'<div class="rds-wa-nochat">Nenhuma mensagem registrada nesta conversa.</div>')+'</div><form id="rdsWaSend" class="rds-wa-compose"><textarea id="rdsWaText" rows="1" placeholder="'+(d.connected?'Digite uma mensagem...':'WhatsApp desconectado')+'" '+(d.connected?'':'disabled')+'></textarea><button class="btn primary" type="submit" '+(d.connected?'':'disabled')+'>➤</button></form>';
 $('#rdsWaSend').onsubmit=async e=>{e.preventDefault();const text=$('#rdsWaText').value.trim();if(!text)return;try{await F('/api/whatsapp/meta/chat/'+encodeURIComponent(activePhone)+'/send',{method:'POST',body:JSON.stringify({text})});$('#rdsWaText').value='';await rdsWaOpen(activePhone,true)}catch(err){toast(err.message)}};
 $('#rdsWaMessages').scrollTop=$('#rdsWaMessages').scrollHeight;
 }catch(e){
  box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><div><b>Não foi possível abrir a conversa</b><small>'+E(e.message)+'</small></div></div></header><div class="rds-wa-open-error"><b>Erro ao carregar esta conversa.</b><span>'+E(e.message)+'</span><button class="btn primary" onclick="rdsWaOpen(\''+E(phone)+'\')">Tentar novamente</button></div>';
 }
};
window.rdsWaBack=()=>{activePhone='';document.querySelector('.rds-wa-app')?.classList.remove('rds-wa-open');$('#rdsWaConversation').hidden=true;$('#rdsWaEmpty').hidden=false};
async function waPage(){try{const [meta,chats]=await Promise.all([F('/api/whatsapp/meta/status').catch(e=>({connected:false,error:e.message})),F('/api/whatsapp/meta/chats')]);shell({meta,chats:chats.chats||[]});startPolling()}catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>WhatsApp</h2><p>'+E(e.message)+'</p><button class="btn primary" onclick="go(\'whatsapp\')">Tentar novamente</button></div>'}}
const oldRender=window.render;window.render=async function(){clearInterval(pollTimer);if(page==='whatsapp')return waPage();return oldRender.apply(this,arguments)};
})();