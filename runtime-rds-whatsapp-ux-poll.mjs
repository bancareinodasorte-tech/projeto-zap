import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS WHATSAPP UX POLL FINAL';
if(server.includes(marker)){
  console.log('[RDS] UX por poll já aplicada');
  process.exit(0);
}

const helper=String.raw`
${marker}
const rdsPollHandled=new Map();
function rdsPollHash(value){return crypto.createHash('sha256').update(Buffer.from(String(value||''))).digest('hex');}
function rdsPollMenu(kind){
  if(kind==='OTHER'){
    return {
      name:'⚙️ OUTRAS OPÇÕES\\n\\nEscolha uma opção para continuar:',
      values:['🟠 Recusar oferta','🔴 Sair da lista','↩️ Voltar ao menu principal'],
      selectableCount:1
    };
  }
  return {
    name:'🍀 CANAL DE VENDAS RDS\\n\\nOlá! 👋\\nComo posso ajudar você hoje?',
    values:['🛒 Comprar bilhetes','🔎 Consultar pedido','📝 Alterar pedido','❌ Cancelar pedido','🏢 Atendimento','⚙️ Outras opções'],
    selectableCount:1
  };
}
function rdsPollAction(kind,label){
  const map=kind==='OTHER'?{
    '🟠 Recusar oferta':'RECUSAR_OFERTA',
    '🔴 Sair da lista':'SAIR_DA_LISTA',
    '↩️ Voltar ao menu principal':'VOLTAR_MENU'
  }:{
    '🛒 Comprar bilhetes':'COMPRAR',
    '🔎 Consultar pedido':'CONSULTAR_PEDIDO',
    '📝 Alterar pedido':'ALTERAR_PEDIDO',
    '❌ Cancelar pedido':'CANCELAR_PEDIDO',
    '🏢 Atendimento':'ATENDIMENTO',
    '⚙️ Outras opções':'OUTRAS_OPCOES'
  };
  return map[label]||'';
}
function rdsPollJid(jid){
  const s=String(jid||'');
  if(!s)return '';
  return s.replace(/:\d+(?=@)/,'');
}
async function rdsDecryptPollVote(updateMsg,creationMsg){
  const vote=updateMsg?.pollUpdateMessage?.vote;
  const creationKey=updateMsg?.pollUpdateMessage?.pollCreationMessageKey;
  if(!vote?.encPayload||!vote?.encIv||!creationKey?.id)return null;
  const pollEncKey=creationMsg?.message?.messageContextInfo?.messageSecret;
  if(!pollEncKey)return null;
  const voterCandidates=[creationKey.remoteJid,updateMsg?.key?.remoteJidAlt,updateMsg?.key?.remoteJid,updateMsg?.key?.participantAlt,updateMsg?.key?.participant].filter(Boolean).map(rdsPollJid);
  const uniqueVoters=[...new Set(voterCandidates)];
  const creatorCandidates=[sock?.user?.lid,sock?.user?.id,connectedNumber?connectedNumber+'@s.whatsapp.net':''].filter(Boolean).map(rdsPollJid);
  const uniqueCreators=[...new Set(creatorCandidates)];
  for(const creator of uniqueCreators){
    for(const voter of uniqueVoters){
      try{
        const sign=Buffer.concat([Buffer.from(String(creationKey.id)),Buffer.from(creator),Buffer.from(voter),Buffer.from('Poll Vote'),Buffer.from([1])]);
        const key0=crypto.createHmac('sha256',Buffer.alloc(32)).update(Buffer.from(pollEncKey)).digest();
        const decKey=crypto.createHmac('sha256',key0).update(sign).digest();
        const aad=Buffer.from(String(creationKey.id)+'\\u0000'+voter);
        const enc=Buffer.from(vote.encPayload);
        const iv=Buffer.from(vote.encIv);
        if(enc.length<17)continue;
        const ciphertext=enc.subarray(0,enc.length-16),tag=enc.subarray(enc.length-16);
        const decipher=crypto.createDecipheriv('aes-256-gcm',decKey,iv);
        decipher.setAAD(aad);decipher.setAuthTag(tag);
        const plain=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
        const decoded=proto.Message.PollVoteMessage.decode(plain);
        if(decoded?.selectedOptions?.length)return {decoded,creator,voter};
      }catch{}
    }
  }
  return null;
}
async function rdsHandlePollUpdate(m){
  const p=m?.message?.pollUpdateMessage;
  if(!p?.pollCreationMessageKey?.id)return false;
  const creationId=String(p.pollCreationMessageKey.id);
  const creation=messageCache.get(creationId);
  if(!creation?.message?.pollCreationMessageV3&&!creation?.message?.pollCreationMessage&&!creation?.message?.pollCreationMessageV2)return false;
  const decrypted= p.vote?.selectedOptions?.length ? {decoded:p.vote} : await rdsDecryptPollVote(m,creation);
  if(!decrypted?.decoded?.selectedOptions?.length)return false;
  const voterPhone=normalizeBR(String(m?.key?.remoteJidAlt||m?.key?.remoteJid||m?.key?.participantAlt||m?.key?.participant||'').split('@')[0]);
  if(!validBRPhone(voterPhone))return false;
  const handledKey=voterPhone+':'+creationId;
  if(rdsPollHandled.has(handledKey))return true;
  const opts=creation.message.pollCreationMessageV3?.options||creation.message.pollCreationMessage?.options||creation.message.pollCreationMessageV2?.options||[];
  const selectedHash=String(decrypted.decoded.selectedOptions[0]);
  const selected=opts.find(o=>rdsPollHash(o?.optionName)===selectedHash)?.optionName||'';
  if(!selected)return false;
  const kind=opts.length===3?'OTHER':'MAIN';
  const action=rdsPollAction(kind,selected);
  if(!action)return false;
  rdsPollHandled.set(handledKey,Date.now());
  if(rdsPollHandled.size>1000){const first=rdsPollHandled.keys().next().value;rdsPollHandled.delete(first);}
  const identity={phone:voterPhone,remoteJid:m?.key?.remoteJid||m?.key?.remoteJidAlt||voterPhone+'@s.whatsapp.net',lid:m?.key?.remoteJid?.endsWith('@lid')?m.key.remoteJid:''};
  console.log('[RDS] interação poll recebida',kind,action,voterPhone);
  const synthetic={key:{remoteJid:identity.remoteJid,fromMe:false,id:'RDS-POLL-'+creationId+'-'+Date.now()},message:{conversation:action}};
  await handleInbound(synthetic);
  return true;
}
`;
const listen='app.listen(PORT,async()=>{';
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para UX por poll.');
server=server.slice(0,pos)+helper+'\n'+server.slice(pos);

const start='async function sendToJid(jid, content){';
const end='async function sendTextPhone(phone, text){';
const a=server.indexOf(start);
const b=server.indexOf(end,a);
if(a<0||b<0)throw new Error('sendToJid não localizado para UX por poll.');
const newSend=`async function sendToJid(jid, content){
  if(!sock || !connected) throw new Error('WhatsApp não está conectado.');
  let outgoing=content;
  const markerText=String(content?.text||'');
  if(markerText==='RDSUI:MAIN' || markerText==='RDSUI:OTHER'){
    const kind=markerText==='RDSUI:MAIN'?'MAIN':'OTHER';
    const poll=rdsPollMenu(kind);
    try{
      console.log('[RDS] enviando menu poll',kind);
      const rPoll=await sock.sendMessage(jid,{poll});
      console.log('[RDS] menu poll enviado',kind);
      rememberMessage(rPoll);
      try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
      return rPoll;
    }catch(e){
      outgoing={text:rdsInteractiveFallback(kind)};
      console.warn('[RDS] poll indisponível; usando fallback textual:',e?.message||e);
    }
  }
  const r = await sock.sendMessage(jid, outgoing);
  rememberMessage(r);
  try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
  return r;
}
`;
server=server.slice(0,a)+newSend+server.slice(b);

const loopOld=`for(const m of messages || []){
        rememberMessage(m);
        if(!m?.message || m.key?.fromMe) continue;`;
const loopNew=`for(const m of messages || []){
        rememberMessage(m);
        if(m?.message?.pollUpdateMessage){
          try{ if(await rdsHandlePollUpdate(m)) continue; }catch(e){ console.warn('[RDS] falha ao processar poll:',e?.message||e); }
        }
        if(!m?.message || m.key?.fromMe) continue;`;
if(!server.includes(loopOld))throw new Error('loop messages.upsert não localizado para UX por poll.');
server=server.replace(loopOld,loopNew);

fs.writeFileSync(path,server,'utf8');
console.log('[RDS] UX WhatsApp por poll instalada com fallback textual e parser de votos');
