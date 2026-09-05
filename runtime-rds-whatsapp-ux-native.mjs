import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS NATIVE INTERACTIVE UX FINAL';
if(server.includes(marker)){
  console.log('[RDS] UX nativa WhatsApp já aplicada');
  process.exit(0);
}

const oldImport=`  proto,\n  fetchLatestBaileysVersion,`;
const newImport=`  proto,\n  generateWAMessageFromContent,\n  fetchLatestBaileysVersion,`;
if(!server.includes(oldImport))throw new Error('Import do Baileys não localizado para UX nativa.');
server=server.replace(oldImport,newImport);

const helper=String.raw`
${marker}
function rdsNativeMenu(kind){
  const rows=kind==='OTHER' ? [
    {title:'🟠 Recusar oferta',description:'Recusar somente a oferta atual',id:'RECUSAR_OFERTA'},
    {title:'🔴 Sair da lista',description:'Bloquear campanhas automáticas',id:'SAIR_DA_LISTA'},
    {title:'↩️ Voltar ao menu principal',description:'Retornar ao atendimento',id:'VOLTAR_MENU'}
  ] : [
    {title:'🛒 Comprar bilhetes',description:'Iniciar um novo pedido',id:'COMPRAR'},
    {title:'🔎 Consultar pedido',description:'Ver o andamento do pedido',id:'CONSULTAR_PEDIDO'},
    {title:'📝 Alterar pedido',description:'Corrigir ou atualizar dados',id:'ALTERAR_PEDIDO'},
    {title:'❌ Cancelar pedido',description:'Encerrar um pedido em andamento',id:'CANCELAR_PEDIDO'},
    {title:'🏢 Atendimento',description:'Falar com o escritório',id:'ATENDIMENTO'},
    {title:'⚙️ Outras opções',description:'Preferências e privacidade',id:'OUTRAS_OPCOES'}
  ];
  return {
    body:{text:kind==='OTHER'?'Escolha uma opção para continuar:':'Olá! 👋\\n\\nComo posso ajudar você hoje?'},
    footer:{text:'CANAL DE VENDAS RDS'},
    nativeFlowMessage:{buttons:[{name:'single_select',buttonParamsJson:JSON.stringify({title:kind==='OTHER'?'VER OPÇÕES':'ABRIR MENU',sections:[{title:kind==='OTHER'?'Preferências':'Atendimento e compras',rows}]})}]}
  };
}
function rdsNativeActionFromInbound(m){
  const x=unwrapMessageContent(m);
  const raw=x?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if(!raw)return '';
  try{
    const p=JSON.parse(raw);
    return cleanText(p.id||p.selected_id||p.row_id||p.selectedRowId||p.button_id||'');
  }catch{return '';}
}
`;
const listen='app.listen(PORT,async()=>{';
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para UX nativa.');
server=server.slice(0,pos)+helper+'\n'+server.slice(pos);

const start='async function sendToJid(jid, content){';
const end='async function sendTextPhone(phone, text){';
const a=server.indexOf(start), b=server.indexOf(end,a);
if(a<0||b<0)throw new Error('sendToJid não localizado para UX nativa.');
const newSend=`async function sendToJid(jid, content){
  if(!sock || !connected) throw new Error('WhatsApp não está conectado.');
  const markerText=String(content?.text||'');
  if(markerText==='RDSUI:MAIN' || markerText==='RDSUI:OTHER'){
    const kind=markerText==='RDSUI:MAIN'?'MAIN':'OTHER';
    try{
      const flow=rdsNativeMenu(kind);
      const msg=generateWAMessageFromContent(jid,{viewOnceMessage:{message:{messageContextInfo:{deviceListMetadata:{},deviceListMetadataVersion:2},interactiveMessage:proto.Message.InteractiveMessage.create(flow)}}},{userJid:sock.user?.id});
      await sock.relayMessage(jid,msg.message,{messageId:msg.key.id});
      console.log('[RDS] menu nativo enviado',kind);
      rememberMessage(msg);
      try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
      return msg;
    }catch(e){
      console.warn('[RDS] menu nativo indisponível; usando fallback textual:',e?.message||e);
      const fallback=kind==='MAIN'?'🍀 *CANAL DE VENDAS RDS*\\n\\n1️⃣ 🛒 *COMPRAR BILHETES*\\n2️⃣ 🔎 *CONSULTAR PEDIDO*\\n3️⃣ 📝 *ALTERAR PEDIDO*\\n4️⃣ ❌ *CANCELAR PEDIDO*\\n5️⃣ 🏢 *ATENDIMENTO*\\n6️⃣ ⚙️ *OUTRAS OPÇÕES*\\n\\nEscolha uma opção pelo número.':'⚙️ *OUTRAS OPÇÕES*\\n\\n1️⃣ 🟠 *RECUSAR OFERTA*\\n2️⃣ 🔴 *SAIR DA LISTA*\\n3️⃣ ↩️ *VOLTAR AO MENU PRINCIPAL*\\n\\nEscolha uma opção pelo número.';
      const r=await sock.sendMessage(jid,{text:fallback});
      rememberMessage(r);
      return r;
    }
  }
  const r=await sock.sendMessage(jid,content);
  rememberMessage(r);
  try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
  return r;
}
`;
server=server.slice(0,a)+newSend+server.slice(b);

const extractAnchor=`function extractInbound(m){\n  const x = unwrapMessageContent(m);\n  const text = cleanText(`;
const extractReplace=`function extractInbound(m){\n  const x = unwrapMessageContent(m);\n  const nativeText = rdsNativeActionFromInbound(m);\n  const text = cleanText(nativeText || `;
if(!server.includes(extractAnchor))throw new Error('extractInbound não localizado para UX nativa.');
server=server.replace(extractAnchor,extractReplace);

fs.writeFileSync(path,server,'utf8');
console.log('[RDS] UX WhatsApp nativa instalada: single_select + fallback textual');
