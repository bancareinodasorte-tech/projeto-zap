(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const F=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha');return d};
const B=(t,f,c)=>typeof btn==='function'?btn(t,f,c||'btn'):'<button class="'+(c||'btn')+'" onclick="'+f+'">'+E(t)+'</button>';
let activePhone='';
async function waPage(){
 try{
  const d=await F('/api/whatsapp/chats');
  app.innerHTML='<section class="rds-wa-app"><aside class="rds-wa-sidebar"><div class="rds-wa-head"><div><span class="eyebrow">ATENDIMENTO</span><h1>WhatsApp</h1></div><span class="rds-wa-state '+(d.connected?'on':'off')+'">● '+(d.connected?'Conectado':'Offline')+'</span></div><div class="rds-wa-actions">'+(d.connected?B('↻ Atualizar','rdsWaReload()'):B('Conectar WhatsApp','rdsWaConnect()','btn primary'))+'</div><div class="rds-wa-search"><span>⌕</span><input id="rdsWaSearch" placeholder="Pesquisar conversas..."></div><div id="rdsWaChats"></div></aside><section class="rds-wa-chat"><div id="rdsWaEmpty" class="rds-wa-empty"><div class="rds-wa-logo">◉</div><h2>Central de conversas</h2><p>Selecione uma conversa para iniciar o atendimento.</p><small>As mensagens recebidas e enviadas pelo canal aparecem aqui.</small></div><div id="rdsWaConversation" hidden></div></section></section>';
  window.rdsWaData=d;if(!d.connected&&d.qrAvailable&&d.qrDataUrl){$('#rdsWaQr').innerHTML='<div class="rds-wa-qr"><img src="'+d.qrDataUrl+'"><small>WhatsApp → Aparelhos conectados → Conectar aparelho</small></div>';}drawChats(d.chats||[]);$('#rdsWaSearch').oninput=()=>drawChats(d.chats||[]);
 }catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>WhatsApp</h2><p>'+E(e.message)+'</p></div>'}
}
function drawChats(chats){const q=String($('#rdsWaSearch')?.value||'').toLowerCase();const list=chats.filter(c=>(c.name+' '+c.phone+' '+c.group_name).toLowerCase().includes(q));$('#rdsWaChats').innerHTML=list.map(c=>'<button class="rds-wa-chat-row" onclick="rdsWaOpen(\''+E(c.phone)+'\')"><span class="rds-wa-avatar">'+E((c.name||c.phone).slice(0,1).toUpperCase())+'</span><span><b>'+E(c.name||c.phone)+'</b><small>'+E(c.messages[0]?.body||'Sem mensagens')+'</small></span><time>'+((c.messages[0]?.created_at)?new Date(c.messages[0].created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</time></button>').join('')||'<div class="rds-wa-nochat">Nenhuma conversa registrada.</div>'}
window.rdsWaReload=()=>{activePhone='';return waPage()};
window.rdsWaConnect=async()=>{try{await F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:false})});toast('Conexão iniciada. Aguarde o QR Code.');setTimeout(()=>go('whatsapp'),900)}catch(e){toast(e.message)}};
window.rdsWaOpen=async phone=>{
 activePhone=phone;document.querySelector('.rds-wa-app')?.classList.add('rds-wa-open');const d=await F('/api/whatsapp/chat/'+encodeURIComponent(phone));const c=d.contact||{};$('#rdsWaEmpty').hidden=true;const box=$('#rdsWaConversation');box.hidden=false;
 box.innerHTML='<header class="rds-wa-conv-head"><div><span class="rds-wa-avatar">'+E((c.name||phone).slice(0,1).toUpperCase())+'</span><div><b>'+E(c.name||phone)+'</b><small>'+E(c.phone||phone)+' • '+(d.connected?'canal conectado':'canal offline')+'</small></div></div><button class="btn" onclick="rdsWaReload()">← Conversas</button></header><div id="rdsWaMessages" class="rds-wa-messages">'+d.messages.map(m=>'<div class="rds-wa-bubble '+(m.direction==='OUT'?'out':'in')+'"><div>'+E(m.body||('['+(m.message_type||'mensagem')+']'))+'</div><small>'+new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' '+E(m.status||'')+'</small></div>').join('')+'</div><form id="rdsWaSend" class="rds-wa-compose"><textarea id="rdsWaText" rows="1" placeholder="Digite uma mensagem..."></textarea><button class="btn primary" type="submit">➤</button></form>';
 $('#rdsWaSend').onsubmit=async e=>{e.preventDefault();const text=$('#rdsWaText').value.trim();if(!text)return;try{await F('/api/whatsapp/chat/'+encodeURIComponent(activePhone)+'/send',{method:'POST',body:JSON.stringify({text})});$('#rdsWaText').value='';rdsWaOpen(activePhone)}catch(err){toast(err.message)}};
 $('#rdsWaMessages').scrollTop=$('#rdsWaMessages').scrollHeight;
};
const oldRender=window.render;window.render=async function(){if(page==='whatsapp')return waPage();return oldRender.apply(this,arguments)};
})();
