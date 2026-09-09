import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS PIX UX FINAL V7';
if(server.includes(marker)){
  console.log('[RDS] UX PIX V7 já aplicada');
  process.exit(0);
}

const block=String.raw`
${marker}
async function rdsPixUxSendV7(identity,order,pix){
  const code=cleanText(pix?.qr?.text||order?.pix_copy_paste||'');
  if(!code)throw new Error('PIX sem código copia e cola.');
  const total=money(order?.total_amount);
  const paymentText='🧾 *N° do Pedido:* '+order.code+'\\n\\n💳 *DADOS PARA PAGAMENTO*\\n\\n💰 *VALOR:* R$ '+total+'\\n\\n🔑 *CHAVE PIX*\\n'+code;
  let jid=identity?.remoteJid||'';
  if(identity?.phone){
    try{jid=(await ensureTargetJid(identity.phone)).jid;}catch{}
  }
  try{
    const baileys=await import('@whiskeysockets/baileys');
    const generateWAMessageFromContent=baileys.generateWAMessageFromContent;
    const normalizeMessageContent=baileys.normalizeMessageContent;
    const isJidGroup=baileys.isJidGroup;
    if(typeof generateWAMessageFromContent!=='function'||typeof normalizeMessageContent!=='function')throw new Error('Helpers de mensagem interativa não disponíveis.');
    const interactive={
      interactiveMessage:{
        body:{text:paymentText},
        nativeFlowMessage:{
          messageParamsJson:'',
          buttons:[{name:'cta_copy',buttonParamsJson:JSON.stringify({display_text:'📋 COPIAR PIX',copy_code:code})}]
        }
      }
    };
    const fullMsg=generateWAMessageFromContent(jid,interactive,{userJid:sock?.user?.id,timestamp:new Date()});
    const normalized=normalizeMessageContent(fullMsg.message);
    if(!normalized?.interactiveMessage?.nativeFlowMessage?.buttons?.length)throw new Error('Botão cta_copy não foi serializado.');
    const additionalNodes=[{tag:'biz',attrs:{},content:[{tag:'interactive',attrs:{type:'native_flow',v:'1'},content:[{tag:'native_flow',attrs:{v:'9',name:'mixed'}}]}]}];
    if(typeof isJidGroup!=='function'||!isJidGroup(jid))additionalNodes.push({tag:'bot',attrs:{biz_bot:'1'}});
    await sock.relayMessage(jid,fullMsg.message,{messageId:fullMsg.key.id,additionalNodes});
    rememberMessage(fullMsg);
    try{await sock.sendPresenceUpdate('unavailable');}catch{}
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:paymentText,status:'ENVIADA',waId:fullMsg?.key?.id,raw:{jid,interactive:'cta_copy',relay:'native_flow_v7'}});
    console.log('[RDS] PIX V7 enviado: pedido + pagamento + chave + copiar em uma mensagem');
    return fullMsg;
  }catch(e){
    console.warn('[RDS] PIX V7 nativo indisponível; usando texto:',e.message);
    const fallback=await sendToJid(jid,{text:paymentText+'\\n\\n📋 COPIAR PIX'});
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:paymentText,status:'ENVIADA',waId:fallback?.key?.id,raw:{jid,fallback:'text_v7'}});
    return fallback;
  }
}

sendPixToIdentity=rdsPixUxSendV7;
`;

const listen='app.listen(PORT,async()=>{';
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para UX PIX V7.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] UX PIX V7 aplicada: uma única mensagem compacta');
