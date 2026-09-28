(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const F=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||d.message||'Falha');return d;};
let activePhone='',pollTimer=null,searchText='',lastData=null,waBusy=false;

function fmtPhone(v){
 const n=String(v||'').replace(/\D/g,'');
 if(n.length===13)return '+'+n.slice(0,2)+' ('+n.slice(2,4)+') '+n.slice(4,9)+'-'+n.slice(9);
 if(n.length===12)return '+'+n.slice(0,2)+' ('+n.slice(2,4)+') '+n.slice(4,8)+'-'+n.slice(8);
 return v||'';
}
function fmtSince(v){
 if(!v)return '—';
 const d=new Date(v); if(Number.isNaN(d.getTime()))return '—';
 return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function waInstructions(){
 return '<div class="rds-wa-help"><div class="rds-wa-help-icon">▣</div><div><b>Como conectar com QR Code</b><ol><li>Abra o <strong>WhatsApp</strong> no celular principal.</li><li>Entre em <strong>Configurações → Aparelhos conectados → Conectar aparelho</strong>.</li><li>Aponte a câmera para o QR Code exibido neste painel.</li></ol><small>Depois de conectado, o painel mantém a sessão salva no servidor e tenta reconectar automaticamente em quedas de conexão. A desconexão definitiva é feita pelo botão <strong>Desconectar</strong>.</small></div></div>';
}
function statusCard(s){
 const connected=Boolean(s?.connected), manual=Boolean(s?.manualDisconnect), qr=String(s?.qrDataUrl||''), err=String(s?.lastError||'').trim();
 if(connected){
  return '<div class="rds-wa-connect-card connected"><div class="rds-wa-connect-icon">✓</div><div><b>WhatsApp conectado</b><small>'+E(fmtPhone(s.number)||'Número conectado')+'</small><div class="rds-wa-session-meta"><span>● Sessão ativa</span><span>Servidor RDS</span><span>Conectado em '+E(fmtSince(s.lastConnectionAt))+'</span></div></div><button class="rds-wa-danger" onclick="rdsWaLogout()">Desconectar</button></div>';
 }
 if(qr){
  return '<div class="rds-wa-connect-card qr"><div class="rds-wa-qr-copy"><div class="rds-wa-connect-icon">▦</div><div><b>Conecte o WhatsApp pelo QR Code</b><small>O QR é renovado automaticamente pelo WhatsApp. Escaneie usando o aparelho principal da conta.</small><div class="rds-wa-connect-buttons"><button class="btn primary" onclick="rdsWaRefreshQr()" '+(waBusy?'disabled':'')+'>'+(waBusy?'Gerando...':'Gerar novo QR')+'</button></div></div></div><div class="rds-wa-qr-wrap"><img src="'+E(qr)+'" alt="QR Code para conectar o WhatsApp"><small>QR ativo</small></div></div>'+waInstructions()+(err?'<div class="rds-wa-inline-error">'+E(err)+'</div>':'');
 }
 if(manual){
  return '<div class="rds-wa-connect-card offline manual"><div class="rds-wa-connect-icon">⏸</div><div><b>WhatsApp desconectado pelo painel</b><small>A sessão foi encerrada manualmente. Nenhuma reconexão automática será iniciada até você tocar em Conectar.</small><div class="rds-wa-connect-buttons"><button class="btn primary" onclick="rdsWaConnect()" '+(waBusy?'disabled':'')+'>'+ (waBusy?'Conectando...':'Conectar WhatsApp') +'</button></div></div><span>OFFLINE</span></div>';
 }
 return '<div class="rds-wa-connect-card offline"><div class="rds-wa-connect-icon">↻</div><div><b>Preparando conexão segura</b><small>O servidor está aguardando o QR Code do WhatsApp. Esta tela atualiza automaticamente.</small><div class="rds-wa-connect-buttons"><button class="btn primary" onclick="rdsWaConnect()" '+(waBusy?'disabled':'')+'>'+ (waBusy?'Iniciando...':'Iniciar conexão') +'</button></div>'+(err?'<small class="rds-wa-pair-error">'+E(err)+'</small>':'')+'</div><span>OFFLINE</span></div>';
}
function shell(d){
 lastData=d;const s=d.status||{};
 app.innerHTML='<section class="rds-wa-app"><header class="rds-wa-top"><div><span class="eyebrow">ATENDIMENTO • DISPOSITIVO RDS</span><h1>WhatsApp</h1><p>Central de conversas conectada ao número do CANAL DE VENDAS RDS.</p></div><div class="rds-wa-top-actions"><span class="rds-wa-state '+(s.connected?'on':'off')+'">● '+(s.connected?'Conectado':'Aguardando conexão')+'</span>'+(s.connected?'<span class="rds-wa-provider">DISPOSITIVO VINCULADO</span>':'')+'</div></header><div id="rdsWaStatus">'+statusCard(s)+'</div><div class="rds-wa-security-strip"><span>🔐 Sessão persistente no servidor</span><span>↻ Reconexão automática</span><span>⚠ Desconexão somente pelo painel ou pelo WhatsApp</span></div><div class="rds-wa-layout"><aside class="rds-wa-list"><div class="rds-wa-list-head"><b>Conversas</b><span id="rdsWaCount"></span></div><div class="rds-wa-search"><span>⌕</span><input id="rdsWaSearch" placeholder="Pesquisar nome ou número..."></div><div id="rdsWaChats"></div></aside><section class="rds-wa-chat"><div id="rdsWaEmpty" class="rds-wa-empty"><div class="rds-wa-logo">◉</div><h2>Central de conversas</h2><p>Selecione uma conversa à esquerda.</p><small>Mensagens recebidas e enviadas pelo dispositivo conectado ficam organizadas aqui.</small></div><div id="rdsWaConversation" hidden></div></section></div></section>';
 $('#rdsWaSearch').value=searchText;$('#rdsWaSearch').oninput=()=>{searchText=$('#rdsWaSearch').value;drawChats(d.chats||[])};drawChats(d.chats||[]);
}
function drawChats(chats){
 const q=searchText.toLowerCase().trim(),list=(chats||[]).filter(c=>(String(c.name||'')+' '+String(c.phone||'')+' '+String(c.group_name||'')).toLowerCase().includes(q));
 $('#rdsWaCount').textContent=list.length+' conversa'+(list.length===1?'':'s');
 $('#rdsWaChats').innerHTML=list.map(c=>'<button class="rds-wa-chat-row" onclick="rdsWaOpen(\\''+E(c.phone||'')+'\\')"><span class="rds-wa-avatar">'+E((c.name||c.phone||'?').slice(0,1).toUpperCase())+'</span><span class="rds-wa-chat-main"><b>'+E(c.name||c.phone)+'</b><small>'+E(c.messages?.[0]?.body||'Sem mensagem registrada')+'</small></span><time>'+((c.messages?.[0]?.created_at)?new Date(c.messages[0].created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</time></button>').join('')||'<div class="rds-wa-nochat">Nenhuma conversa encontrada.</div>';
}
async function loadData(){const [status,chats]=await Promise.all([F('/api/status'),F('/api/whatsapp/chats')]);return {status,chats:chats.chats||[]}}
function dataKey(d){return JSON.stringify({connected:d?.status?.connected,number:d?.status?.number,manual:d?.status?.manualDisconnect,qr:d?.status?.qrDataUrl,qrAt:d?.status?.qrUpdatedAt,lastError:d?.status?.lastError,chats:(d?.chats||[]).map(x=>[x.phone,x.messages?.[0]?.wa_message_id,x.messages?.[0]?.created_at,x.messages?.[0]?.body])})}
function startPolling(){
 clearInterval(pollTimer);
 pollTimer=setInterval(async()=>{
  if(page!=='whatsapp'||activePhone)return;
  try{
   const before=lastData,key=dataKey(before),d=await loadData();
   if(key!==dataKey(d))shell(d);
  }catch{}
 },sConnected()?3500:1800);
}
function sConnected(){return Boolean(lastData?.status?.connected)}
window.rdsWaConnect=async()=>{
 if(waBusy)return;waBusy=true;
 try{toast('Iniciando conexão do WhatsApp...');await F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:true})});await waPage();}catch(e){toast(e.message);waBusy=false;await waPage();}finally{waBusy=false;}
};
window.rdsWaRefreshQr=async()=>{if(waBusy)return;waBusy=true;try{toast('Gerando um novo QR Code...');await F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:true})});}catch(e){toast(e.message)}finally{waBusy=false;}};
window.rdsWaLogout=async()=>{
 if(waBusy)return;
 if(!confirm('Desconectar o WhatsApp deste painel? A sessão salva será encerrada e será necessário escanear um novo QR para conectar novamente.'))return;
 waBusy=true;
 try{await F('/api/whatsapp/logout',{method:'POST',body:'{}'});toast('WhatsApp desconectado pelo painel.');await waPage();}catch(e){toast(e.message)}finally{waBusy=false;}
};
window.rdsWaReload=()=>{activePhone='';searchText='';waPage()};
window.rdsWaOpen=async phone=>{
 activePhone=phone;document.querySelector('.rds-wa-app')?.classList.add('rds-wa-open');
 const box=$('#rdsWaConversation');box.hidden=false;$('#rdsWaEmpty').hidden=true;
 box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><div><b>Abrindo conversa...</b><small>'+E(fmtPhone(phone)||phone)+'</small></div></div></header><div class="rds-wa-open-error">Carregando...</div>';
 try{
  const d=await F('/api/whatsapp/chat/'+encodeURIComponent(phone)),c=d.contact||{},messages=d.messages||[];
  box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><span class="rds-wa-avatar">'+E((c.name||phone).slice(0,1).toUpperCase())+'</span><div><b>'+E(c.name||phone)+'</b><small>'+E(fmtPhone(c.phone||phone)||phone)+' • '+(d.connected?'Conectado':'Desconectado')+'</small></div></div></header><div id="rdsWaMessages" class="rds-wa-messages">'+(messages.length?messages.map(m=>'<div class="rds-wa-bubble '+(m.direction==='OUT'?'out':'in')+'"><div>'+E(m.body||('['+(m.message_type||'mensagem')+']'))+'</div><small>'+new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' '+E(m.status||'')+'</small></div>').join(''):'<div class="rds-wa-nochat">Nenhuma mensagem registrada nesta conversa.</div>')+'</div><form id="rdsWaSend" class="rds-wa-compose"><textarea id="rdsWaText" rows="1" placeholder="'+(d.connected?'Digite uma mensagem...':'WhatsApp desconectado')+'" '+(d.connected?'':'disabled')+'></textarea><button class="btn primary" type="submit" '+(d.connected?'':'disabled')+'>➤</button></form>';
  $('#rdsWaSend').onsubmit=async e=>{e.preventDefault();const text=$('#rdsWaText').value.trim();if(!text)return;try{await F('/api/whatsapp/chat/'+encodeURIComponent(activePhone)+'/send',{method:'POST',body:JSON.stringify({text})});$('#rdsWaText').value='';await rdsWaOpen(activePhone)}catch(err){toast(err.message)}};
  $('#rdsWaMessages').scrollTop=$('#rdsWaMessages').scrollHeight;
 }catch(e){box.innerHTML='<header class="rds-wa-conv-head"><div><button class="rds-wa-back" onclick="rdsWaBack()">‹</button><div><b>Não foi possível abrir a conversa</b><small>'+E(e.message)+'</small></div></div></header><div class="rds-wa-open-error"><b>Erro ao carregar esta conversa.</b><span>'+E(e.message)+'</span><button class="btn primary" onclick="rdsWaOpen(\\''+E(phone)+'\\')">Tentar novamente</button></div>'}
};
window.rdsWaBack=()=>{activePhone='';document.querySelector('.rds-wa-app')?.classList.remove('rds-wa-open');$('#rdsWaConversation').hidden=true;$('#rdsWaEmpty').hidden=false};
async function waPage(){
 try{clearInterval(pollTimer);const d=await loadData();shell(d);startPolling();}
 catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>WhatsApp</h2><p>'+E(e.message)+'</p><button class="btn primary" onclick="go(\\'whatsapp\\')">Tentar novamente</button></div>'}
}
const oldRender=window.render;window.render=async function(){clearInterval(pollTimer);if(page==='whatsapp')return waPage();return oldRender.apply(this,arguments)};
})();