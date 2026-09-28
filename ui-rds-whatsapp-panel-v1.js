(()=> {
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const F=async(u,o={})=>{const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||d.message||'Falha');return d;};
let activePhone='',pollTimer=null,chatPollTimer=null,searchText='',lastData=null,waBusy=false,autoStartIssued=false;

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
function countdown(v){
 const t=new Date(v||0).getTime()-Date.now();
 if(!Number.isFinite(t)||t<=0)return 'expirado';
 return Math.ceil(t/1000)+'s';
}
function waInstructions(){
 return '<div class="rds-wa-help"><div class="rds-wa-help-icon">▦</div><div><b>Conexão por QR Code</b><ol><li>Abra o <strong>WhatsApp no aparelho principal</strong> da conta.</li><li>Entre em <strong>Configurações → Dispositivos conectados → Conectar dispositivo</strong>.</li><li>Aponte a câmera para o QR Code exibido neste painel e confirme a vinculação.</li></ol><small>Depois da vinculação, a sessão de autenticação fica persistida no servidor. Quedas normais de internet/rede não exigem novo QR. O botão <strong>Desconectar</strong> é o único comando do painel que encerra a sessão intencionalmente.</small></div></div>';
}
function statusCard(s){
 const connected=Boolean(s?.connected), manual=Boolean(s?.manualDisconnect), starting=Boolean(s?.starting), qr=String(s?.qrDataUrl||''), err=String(s?.lastError||'').trim();
 if(connected){
  return '<div class="rds-wa-connect-card connected"><div class="rds-wa-connect-icon">✓</div><div><b>WhatsApp conectado</b><small>'+E(fmtPhone(s.number)||'Número conectado')+'</small><div class="rds-wa-session-meta"><span>● Sessão ativa</span><span>Servidor RDS</span><span>Conectado em '+E(fmtSince(s.lastConnectionAt))+'</span></div></div><button class="rds-wa-danger" onclick="rdsWaLogout()">Desconectar</button></div>';
 }
 if(qr){
  return '<div class="rds-wa-connect-card qr"><div class="rds-wa-qr-copy"><div class="rds-wa-connect-icon">▦</div><div><b>Conecte o WhatsApp pelo QR Code</b><small>QR Code ativo. Ele é renovado pelo servidor quando o WhatsApp solicitar.</small><div class="rds-wa-session-meta"><span>QR: '+E(countdown(s.qrExpiresAt))+'</span><span>Servidor RDS</span><span>Atualizado '+E(fmtSince(s.qrUpdatedAt))+'</span></div><div class="rds-wa-connect-buttons"><button class="btn primary" onclick="rdsWaRefreshQr()" '+(waBusy?'disabled':'')+'>'+(waBusy?'Gerando...':'Gerar novo QR')+'</button></div></div></div><div class="rds-wa-qr-wrap"><img src="'+E(qr)+'" alt="QR Code para conectar o WhatsApp"><small>APONTE O WHATSAPP PRINCIPAL PARA ESTE QR</small></div></div>'+waInstructions()+(err?'<div class="rds-wa-inline-error">'+E(err)+'</div>':'');
 }
 if(manual){
  return '<div class="rds-wa-connect-card offline manual"><div class="rds-wa-connect-icon">⏸</div><div><b>WhatsApp desconectado pelo painel</b><small>A sessão foi encerrada manualmente. Nenhuma reconexão automática será iniciada até você tocar em Conectar.</small><div class="rds-wa-connect-buttons"><button class="btn primary" onclick="rdsWaConnect()" '+(waBusy?'disabled':'')+'>'+ (waBusy?'Conectando...':'Conectar por QR Code') +'</button></div></div><span>OFFLINE</span></div>';
 }
 return '<div class="rds-wa-connect-card offline"><div class="rds-wa-connect-icon">'+(starting?'…':'↻')+'</div><div><b>'+(starting?'Preparando o QR Code':'WhatsApp aguardando conexão')+'</b><small>'+(starting?'O servidor está abrindo o canal seguro e aguardando o QR Code do WhatsApp.':'A sessão ainda não está vinculada. Inicie a conexão para gerar o QR Code.')+'</small><div class="rds-wa-connect-buttons"><button class="btn primary" onclick="rdsWaConnect()" '+(waBusy?'disabled':'')+'>'+ (waBusy?'Iniciando...':(starting?'Atualizar status':'Conectar por QR Code')) +'</button></div>'+(err?'<small class="rds-wa-pair-error">'+E(err)+'</small>':'')+'</div><span>OFFLINE</span></div>';
}
function shell(d){
 if(activePhone) return;
 lastData=d;const s=d.status||{};
 app.innerHTML='<section class="rds-wa-app"><header class="rds-wa-top"><div><span class="eyebrow">ATENDIMENTO • DISPOSITIVO RDS</span><h1>WhatsApp</h1><p>Central de conversas conectada ao número do CANAL DE VENDAS RDS.</p></div><div class="rds-wa-top-actions"><span class="rds-wa-state '+(s.connected?'on':'off')+'">● '+(s.connected?'Conectado':'Aguardando conexão')+'</span>'+(s.connected?'<span class="rds-wa-provider">DISPOSITIVO VINCULADO</span>':'')+'</div></header><div id="rdsWaStatus">'+statusCard(s)+'</div><div class="rds-wa-layout"><aside class="rds-wa-list"><div class="rds-wa-list-head"><b>Conversas</b><span id="rdsWaCount"></span></div><div class="rds-wa-search"><span>⌕</span><input id="rdsWaSearch" placeholder="Pesquisar nome ou número..."></div><div id="rdsWaChats"></div></aside><section class="rds-wa-chat"><div id="rdsWaEmpty" class="rds-wa-empty"><div class="rds-wa-logo">◉</div><h2>Central de conversas</h2><p>Selecione uma conversa à esquerda.</p><small>Mensagens recebidas e enviadas pelo dispositivo conectado ficam organizadas aqui.</small></div><div id="rdsWaConversation" hidden></div></section></div></section>';
 $('#rdsWaSearch').value=searchText;$('#rdsWaSearch').oninput=()=>{searchText=$('#rdsWaSearch').value;drawChats(d.chats||[])};drawChats(d.chats||[]);
}
function drawChats(chats){
 const q=searchText.toLowerCase().trim(),list=(chats||[]).filter(c=>(String(c.name||'')+' '+String(c.phone||'')+' '+String(c.group_name||'')).toLowerCase().includes(q));
 $('#rdsWaCount').textContent=list.length+' conversa'+(list.length===1?'':'s');
 $('#rdsWaChats').innerHTML=list.map(c=>'<button class="rds-wa-chat-row" onclick="rdsWaOpen(\''+E(c.phone||'')+'\')"><span class="rds-wa-avatar">'+E((c.name||c.phone||'?').slice(0,1).toUpperCase())+'</span><span class="rds-wa-chat-main"><b>'+E(c.name||c.phone)+'</b><small>'+E(c.messages?.[0]?.body || ({image:'📷 Foto',audio:'🎤 Áudio',video:'🎥 Vídeo',document:'📄 Documento',sticker:'🧩 Figurinha'}[c.messages?.[0]?.message_type] || 'Mensagem sem conteúdo disponível'))+'</small></span><time>'+((c.messages?.[0]?.created_at)?new Date(c.messages[0].created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</time></button>').join('')||'<div class="rds-wa-nochat">Nenhuma conversa encontrada.</div>';
}
async function loadData(){const [status,chats]=await Promise.all([F('/api/status'),F('/api/whatsapp/chats')]);return {status,chats:chats.chats||[]}}
function dataKey(d){return JSON.stringify({connected:d?.status?.connected,number:d?.status?.number,starting:d?.status?.starting,manual:d?.status?.manualDisconnect,qr:d?.status?.qrDataUrl,qrAt:d?.status?.qrUpdatedAt,qrExp:d?.status?.qrExpiresAt,lastError:d?.status?.lastError,code:d?.status?.lastDisconnectCode,retries:d?.status?.reconnectAttempts,chats:(d?.chats||[]).map(x=>[x.phone,x.messages?.[0]?.wa_message_id,x.messages?.[0]?.created_at,x.messages?.[0]?.body])})}
function startPolling(){
 clearInterval(pollTimer);clearInterval(chatPollTimer);
 // Status/QR polling is lightweight. Do not reload the full conversation list
 // every second: that was unnecessarily expensive and could freeze the panel
 // immediately after linking the WhatsApp device.
 pollTimer=setInterval(async()=>{
  if(page!=='whatsapp'||activePhone)return;
  try{
   const d=await F('/api/status');
   const before=lastData?.status||{};
   const changed=JSON.stringify({
     connected:before.connected,number:before.number,starting:before.starting,
     manualDisconnect:before.manualDisconnect,qrDataUrl:before.qrDataUrl,
     qrUpdatedAt:before.qrUpdatedAt,qrExpiresAt:before.qrExpiresAt,
     lastError:before.lastError,lastDisconnectCode:before.lastDisconnectCode,
     reconnectAttempts:before.reconnectAttempts
   })!==JSON.stringify({
     connected:d.connected,number:d.number,starting:d.starting,
     manualDisconnect:d.manualDisconnect,qrDataUrl:d.qrDataUrl,
     qrUpdatedAt:d.qrUpdatedAt,qrExpiresAt:d.qrExpiresAt,
     lastError:d.lastError,lastDisconnectCode:d.lastDisconnectCode,
     reconnectAttempts:d.reconnectAttempts
   });
   if(changed){
     const chats=(lastData?.chats||[]);
     shell({status:d,chats});
     if(d.connected && !before.connected) {
       try{ const c=await F('/api/whatsapp/chats'); shell({status:d,chats:c.chats||[]}); }catch{}
     }
   } else if(lastData) {
     lastData={...lastData,status:d};
   }
  }catch{}
 },1200);

 const refreshChats=async()=>{
   if(page!=='whatsapp'||activePhone||!lastData?.status?.connected)return;
   try{
     const d=await F('/api/whatsapp/chats');
     const chats=d.chats||[];
     const before=lastData?.chats||[];
     const same=JSON.stringify(chats.map(x=>[x.phone,x.messages?.[0]?.wa_message_id,x.messages?.[0]?.created_at,x.messages?.[0]?.body]))
       ===JSON.stringify(before.map(x=>[x.phone,x.messages?.[0]?.wa_message_id,x.messages?.[0]?.created_at,x.messages?.[0]?.body]));
     if(!same){ lastData={...lastData,chats}; drawChats(chats); }
   }catch{}
 };
 chatPollTimer=setInterval(refreshChats,5000);
}
function sConnected(){return Boolean(lastData?.status?.connected)}
window.rdsWaConnect=async()=>{
 if(waBusy)return;waBusy=true;
 try{toast('Abrindo conexão segura e preparando o QR Code...');await F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:true})});autoStartIssued=true;await waPage();}catch(e){toast(e.message);await waPage();}finally{waBusy=false;}
};
window.rdsWaRefreshQr=async()=>{if(waBusy)return;waBusy=true;try{toast('Gerando um novo QR Code...');await F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:true})});}catch(e){toast(e.message)}finally{waBusy=false;}};
window.rdsWaLogout=async()=>{
 if(waBusy)return;
 if(!confirm('ATENÇÃO\n\nVocê realmente deseja sair e desconectar o WhatsApp deste painel?\n\nA sessão salva no servidor será encerrada e o WhatsApp precisará ser vinculado novamente por QR Code.\n\nToque em OK somente se tiver certeza.'))return;
 waBusy=true;
 try{await F('/api/whatsapp/logout',{method:'POST',body:'{}'});toast('WhatsApp desconectado pelo painel.');await waPage();}catch(e){toast(e.message)}finally{waBusy=false;}
};
window.rdsWaReload=()=>{activePhone='';searchText='';waPage()};
window.rdsWaOpen=async phone=>{
 activePhone=String(phone||'');
 document.body.classList.add('rds-wa-mobile-open');
 app.innerHTML='<section class="rds-wa-conversation-screen"><header class="rds-wa-conversation-top"><button class="rds-wa-full-back" onclick="rdsWaBack()">‹ <span>WhatsApp</span></button><div class="rds-wa-full-title"><span class="rds-wa-avatar">•</span><div><b>Abrindo conversa...</b><small>'+E(fmtPhone(phone)||phone)+'</small></div></div></header><main id="rdsWaMessages" class="rds-wa-full-messages"><div class="rds-wa-full-loading">Carregando conversa...</div></main><form id="rdsWaSend" class="rds-wa-full-compose"><textarea id="rdsWaText" rows="1" placeholder="Digite uma mensagem..."></textarea><button class="rds-wa-full-send" type="submit">➤</button></form></section>';
 try{
  const d=await F('/api/whatsapp/chat/'+encodeURIComponent(phone)),c=d.contact||{},messages=d.messages||[];
  const contactName=c?.name||phone;
  const managed=Boolean(c?.id);
  const contactAction=managed
   ? '<button class="rds-wa-full-action" onclick="rdsWaEditContact(\''+E(phone)+'\')">Editar contato</button>'
   : '<button class="rds-wa-full-action" onclick="rdsWaSaveContact(\''+E(phone)+'\')">Salvar contato</button>';
  const messageHtml=messages.length
   ? messages.map(m=>{
      const type=String(m.message_type||'text').toLowerCase();
      const mediaUrl='/api/whatsapp/media/'+encodeURIComponent(m.wa_message_id||'');
      const body=m.body || ({image:'📷 Foto',audio:'🎤 Áudio',video:'🎥 Vídeo',document:'📄 Documento',sticker:'🧩 Figurinha',poll:'📊 Enquete',reaction:'❤️ Reação'}[type] || 'Mensagem sem conteúdo disponível');
      let mediaHtml='';
      if(m.wa_message_id && ['image','sticker'].includes(type)){
        mediaHtml='<button type="button" class="rds-wa-media-open" onclick="rdsWaOpenMedia(\''+E(mediaUrl)+'\',\''+E(type)+'\')"><img class="rds-wa-media-image" src="'+mediaUrl+'" alt="'+E(type==='image'?'Foto':'Figurinha')+'" loading="lazy"></button>';
      }else if(m.wa_message_id && type==='video'){
        mediaHtml='<video class="rds-wa-media-video" controls preload="metadata" src="'+mediaUrl+'"></video>';
      }else if(m.wa_message_id && type==='audio'){
        mediaHtml='<audio class="rds-wa-media-audio" controls preload="metadata" src="'+mediaUrl+'"></audio>';
      }else if(m.wa_message_id && type==='document'){
        mediaHtml='<button type="button" class="rds-wa-media-document" onclick="rdsWaOpenMedia(\''+E(mediaUrl)+'\',\'document\')">📄 Abrir documento / PDF</button>';
      }
      return '<div class="rds-wa-full-bubble '+(m.direction==='OUT'?'out':'in')+'">'+mediaHtml+(body?'<div>'+E(body)+'</div>':'')+'<small>'+new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' '+E(m.status||'')+'</small></div>';
    }).join('')
   : '<div class="rds-wa-full-no-message">Nenhuma mensagem registrada nesta conversa.</div>';
  app.innerHTML='<section class="rds-wa-conversation-screen"><header class="rds-wa-conversation-top"><div class="rds-wa-full-head-left"><button class="rds-wa-full-back" onclick="rdsWaBack()">‹ <span>WhatsApp</span></button><span class="rds-wa-avatar">'+E((contactName||phone).slice(0,1).toUpperCase())+'</span><div class="rds-wa-full-title"><b>'+E(contactName)+'</b><small>'+E(fmtPhone(c?.phone||phone)||phone)+' • '+(d.connected?'Conectado':'Desconectado')+'</small></div></div><div class="rds-wa-full-actions">'+contactAction+'<button class="rds-wa-full-action danger" onclick="rdsWaDeleteConversation(\''+E(phone)+'\')">Excluir</button></div></header><main id="rdsWaMessages" class="rds-wa-full-messages">'+messageHtml+'</main><form id="rdsWaSend" class="rds-wa-full-compose"><textarea id="rdsWaText" rows="1" placeholder="'+(d.connected?'Digite uma mensagem...':'WhatsApp desconectado')+'" '+(d.connected?'':'disabled')+'></textarea><button class="rds-wa-full-send" type="submit" '+(d.connected?'':'disabled')+'>➤</button></form></section>';
  $('#rdsWaSend').onsubmit=async e=>{
   e.preventDefault();const text=$('#rdsWaText').value.trim();if(!text)return;
   try{await F('/api/whatsapp/chat/'+encodeURIComponent(activePhone)+'/send',{method:'POST',body:JSON.stringify({text})});$('#rdsWaText').value='';await rdsWaOpen(activePhone);}
   catch(err){toast(err.message)}
  };
  const box=$('#rdsWaMessages');if(box)box.scrollTop=box.scrollHeight;
 }catch(e){
  app.innerHTML='<section class="rds-wa-conversation-screen"><header class="rds-wa-conversation-top"><button class="rds-wa-full-back" onclick="rdsWaBack()">‹ <span>WhatsApp</span></button><div><b>Erro ao abrir conversa</b><small>'+E(e.message)+'</small></div></header><main class="rds-wa-full-messages"><div class="rds-wa-full-no-message">Não foi possível carregar esta conversa.<br><button class="btn primary" onclick="rdsWaOpen(\''+E(phone)+'\')">Tentar novamente</button></div></main></section>';
 }
};
window.rdsWaOpenMedia=async(url,type)=>{
 try{
  const r=await fetch(url,{credentials:'same-origin'});
  if(!r.ok){const msg=await r.text();throw new Error(msg||'Mídia indisponível.');}
  const blob=await r.blob();
  const objectUrl=URL.createObjectURL(blob);
  if(type==='image'||type==='sticker'){
    const w=window.open('','_blank');
    if(w){w.document.write('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>RDS • Mídia</title></head><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="'+objectUrl+'" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>');w.document.close();}
    else window.location.href=objectUrl;
  }else{
    const w=window.open(objectUrl,'_blank');
    if(!w) window.location.href=objectUrl;
  }
 }catch(e){toast(e.message||'Mídia indisponível.');}
};
window.rdsWaSaveContact=async phone=>{
 try{const name=prompt('Nome do cliente:', '');if(name===null)return;const clean=String(name||'').trim();if(!clean){toast('Informe o nome do cliente.');return;}await F('/api/contacts',{method:'POST',body:JSON.stringify({name:clean,phone,group_name:'NOVOS',status:'ATIVO'})});toast('Contato salvo na agenda de Clientes.');await rdsWaOpen(phone);}catch(e){toast(e.message)}};
window.rdsWaEditContact=async phone=>{
 try{const d=await F('/api/whatsapp/chat/'+encodeURIComponent(phone)),c=d.contact||{};const name=prompt('Nome do cliente:',c.name&&c.name!==phone?c.name:'');if(name===null)return;const clean=String(name||'').trim();if(!clean){toast('Informe o nome do cliente.');return;}if(c.id)await F('/api/contacts/'+encodeURIComponent(c.id),{method:'PUT',body:JSON.stringify({name:clean,phone,group_name:c.group_name||'NOVOS'})});else await F('/api/contacts',{method:'POST',body:JSON.stringify({name:clean,phone,group_name:'NOVOS',status:'ATIVO'})});toast('Contato atualizado na agenda de Clientes.');await rdsWaOpen(phone);}catch(e){toast(e.message)}};
window.rdsWaDeleteConversation=async phone=>{
 if(!confirm('Excluir esta conversa do painel?\n\nAs mensagens serão removidas do histórico local do painel. O contato da agenda não será excluído.'))return;
 if(!confirm('CONFIRMAÇÃO FINAL\n\nExcluir definitivamente o histórico desta conversa deste painel?'))return;
 try{await F('/api/whatsapp/chat/'+encodeURIComponent(phone),{method:'DELETE',body:'{}'});toast('Conversa excluída do painel.');rdsWaBack();const d=await F('/api/whatsapp/chats');lastData={...lastData,chats:d.chats||[]};drawChats(lastData.chats);}catch(e){toast(e.message)}};
window.rdsWaBack=async()=>{activePhone='';document.body.classList.remove('rds-wa-mobile-open');await waPage();};
async function waPage(){
 try{clearInterval(pollTimer);const d=await loadData();shell(d);
   if(!d.status?.connected&&!d.status?.manualDisconnect&&!d.status?.starting&&!d.status?.qrAvailable&&!autoStartIssued){
     autoStartIssued=true;
     F('/api/whatsapp/connect',{method:'POST',body:JSON.stringify({force:false})}).catch(()=>{});
   }
   startPolling();
 }catch(e){app.innerHTML='<div class="rds-panel rds-error"><h2>WhatsApp</h2><p>'+E(e.message)+'</p><button class="btn primary" onclick="go(\'whatsapp\')">Tentar novamente</button></div>'}
}
if(!document.getElementById('rdsWaPanelOverrides')){const st=document.createElement('style');st.id='rdsWaPanelOverrides';st.textContent='.rds-wa-back{display:grid!important;place-items:center;width:35px;height:40px;border:0;background:transparent;font-size:30px;color:#55708f;cursor:pointer}.rds-wa-conv-actions{margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.rds-wa-contact-action{border:1px solid #d6e2ed;background:#fff;color:#24547f;border-radius:9px;padding:7px 9px;font-size:10px;font-weight:800;cursor:pointer}.rds-wa-contact-action.danger{color:#a33a43;border-color:#ebcbd0;background:#fff5f6}@media(max-width:760px){.rds-wa-conv-head{height:auto;min-height:70px;padding:8px;flex-wrap:wrap}.rds-wa-conv-head>div:first-child{min-width:0}.rds-wa-conv-actions{width:100%;margin-left:45px;justify-content:flex-start}.rds-wa-contact-action{font-size:9px;padding:6px 8px}}';document.head.appendChild(st)}
const oldRender=window.render;window.render=async function(){clearInterval(pollTimer);if(page==='whatsapp')return waPage();return oldRender.apply(this,arguments)};
})();