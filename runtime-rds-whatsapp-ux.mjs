import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS WHATSAPP UX INTERACTIVE FINAL';
if(server.includes(marker)){
  console.log('[RDS] UX interativa WhatsApp já aplicada');
  process.exit(0);
}

const helpers=String.raw`
${marker}
function rdsInteractiveMain(){
  return {
    title:'🍀 CANAL DE VENDAS RDS',
    text:'Olá! 👋\n\nComo posso ajudar você hoje?',
    footer:'Escolha uma opção abaixo',
    buttonText:'ABRIR MENU',
    listType:1,
    sections:[{
      title:'Atendimento e compras',
      rows:[
        {title:'🛒 Comprar bilhetes',description:'Iniciar um novo pedido',rowId:'COMPRAR'},
        {title:'🔎 Consultar pedido',description:'Ver o andamento do pedido',rowId:'CONSULTAR_PEDIDO'},
        {title:'📝 Alterar pedido',description:'Corrigir ou atualizar dados',rowId:'ALTERAR_PEDIDO'},
        {title:'❌ Cancelar pedido',description:'Encerrar um pedido em andamento',rowId:'CANCELAR_PEDIDO'},
        {title:'🏢 Atendimento',description:'Falar com o escritório',rowId:'ATENDIMENTO'},
        {title:'⚙️ Outras opções',description:'Preferências e privacidade',rowId:'OUTRAS_OPCOES'}
      ]
    }]
  };
}
function rdsInteractiveOther(){
  return {
    title:'⚙️ OUTRAS OPÇÕES',
    text:'Escolha uma opção para continuar:',
    footer:'Você continua cadastrado no CRM',
    buttonText:'VER OPÇÕES',
    listType:1,
    sections:[{
      title:'Preferências',
      rows:[
        {title:'🟠 Recusar oferta',description:'Recusar somente a campanha atual',rowId:'RECUSAR_OFERTA'},
        {title:'🔴 Sair da lista',description:'Bloquear campanhas automáticas',rowId:'SAIR_DA_LISTA'},
        {title:'↩️ Voltar ao menu principal',description:'Retornar ao atendimento',rowId:'VOLTAR_MENU'}
      ]
    }]
  };
}
function rdsInteractiveFallback(kind){
  if(kind==='MAIN')return '🍀 *CANAL DE VENDAS RDS*\n\n1️⃣ 🛒 *COMPRAR BILHETES*\n2️⃣ 🔎 *CONSULTAR PEDIDO*\n3️⃣ 📝 *ALTERAR PEDIDO*\n4️⃣ ❌ *CANCELAR PEDIDO*\n5️⃣ 🏢 *ATENDIMENTO*\n6️⃣ ⚙️ *OUTRAS OPÇÕES*\n\nEscolha uma opção pelo número.';
  return '⚙️ *OUTRAS OPÇÕES*\n\n1️⃣ 🟠 *RECUSAR OFERTA*\n2️⃣ 🔴 *SAIR DA LISTA*\n3️⃣ ↩️ *VOLTAR AO MENU PRINCIPAL*\n\nEscolha uma opção pelo número.';
}
`;
const listen='app.listen(PORT,async()=>{';
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para UX WhatsApp.');
server=server.slice(0,pos)+helpers+'\n'+server.slice(pos);

const oldSend=`async function sendToJid(jid, content){\n  if(!sock || !connected) throw new Error('WhatsApp não está conectado.');\n  const r = await sock.sendMessage(jid, content);`;
const newSend=`async function sendToJid(jid, content){\n  if(!sock || !connected) throw new Error('WhatsApp não está conectado.');\n  let outgoing=content;\n  const markerText=String(content?.text||'');\n  if(markerText==='RDSUI:MAIN' || markerText==='RDSUI:OTHER'){\n    const kind=markerText==='RDSUI:MAIN'?'MAIN':'OTHER';\n    const interactive=kind==='MAIN'?rdsInteractiveMain():rdsInteractiveOther();\n    try{\n      console.log('[RDS] enviando menu interativo',kind);\n      const rInteractive=await sock.sendMessage(jid,interactive);\n      console.log('[RDS] menu interativo enviado',kind);\n      rememberMessage(rInteractive);\n      try{ await sock.sendPresenceUpdate('unavailable'); }catch{}\n      return rInteractive;\n    }catch(e){\n      outgoing={text:rdsInteractiveFallback(kind)};\n      console.warn('[RDS] menu interativo indisponível; usando fallback textual:',e?.message||e);\n    }\n  }\n  const r = await sock.sendMessage(jid, outgoing);`;
if(!server.includes(oldSend))throw new Error('sendToJid base não localizado.');
server=server.replace(oldSend,newSend);

const oldExtract=`x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption ||\n    x.documentMessage?.caption || x.buttonsResponseMessage?.selectedDisplayText || x.listResponseMessage?.title ||\n    x.templateButtonReplyMessage?.selectedDisplayText || ''`;
const newExtract=`x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption ||\n    x.documentMessage?.caption || x.buttonsResponseMessage?.selectedButtonId || x.buttonsResponseMessage?.selectedDisplayText ||\n    x.listResponseMessage?.singleSelectReply?.selectedRowId || x.listResponseMessage?.title ||\n    x.templateButtonReplyMessage?.selectedId || x.templateButtonReplyMessage?.selectedDisplayText ||\n    x.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || ''`;
if(!server.includes(oldExtract))throw new Error('extractInbound base não localizado.');
server=server.replace(oldExtract,newExtract);

const oldMain=`function rdsMainMenu(settings){\n  return '🍀 *CANAL DE VENDAS RDS*\\n\\n1️⃣ 🛒 *COMPRAR BILHETES*\\n2️⃣ 🔎 *CONSULTAR PEDIDO*\\n3️⃣ 📝 *ALTERAR PEDIDO*\\n4️⃣ ❌ *CANCELAR PEDIDO*\\n5️⃣ 🏢 *ATENDIMENTO*\\n6️⃣ ⚙️ *OUTRAS OPÇÕES*\\n\\nEscolha uma opção pelo número.';\n}`;
const newMain=`function rdsMainMenu(settings){ return 'RDSUI:MAIN'; }`;
if(!server.includes(oldMain))throw new Error('rdsMainMenu refinado não localizado.');
server=server.replace(oldMain,newMain);

const oldOther=`function rdsOtherOptions(){return '⚙️ *OUTRAS OPÇÕES*\\n\\n1️⃣ 🟠 *RECUSAR OFERTA*\\n2️⃣ 🔴 *SAIR DA LISTA*\\n3️⃣ ↩️ *VOLTAR AO MENU PRINCIPAL*\\n\\nEscolha uma opção pelo número.';}`;
const newOther=`function rdsOtherOptions(){return 'RDSUI:OTHER';}`;
if(!server.includes(oldOther))throw new Error('rdsOtherOptions não localizado.');
server=server.replace(oldOther,newOther);

fs.writeFileSync(path,server,'utf8');
console.log('[RDS] UX interativa WhatsApp corrigida: quebras de linha reais + listType + diagnóstico de envio');
