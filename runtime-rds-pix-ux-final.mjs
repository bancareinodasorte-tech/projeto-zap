import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS PIX UX FINAL V4';
if(server.includes(marker)){
  console.log('[RDS] UX final do PIX V4 já aplicada');
  process.exit(0);
}

const block=String.raw`
${marker}
async function rdsPixUxSendV4(identity,order,pix){
  const code=cleanText(pix?.qr?.text||order?.pix_copy_paste||'');
  if(!code)throw new Error('PIX sem código copia e cola.');
  const total=money(order?.total_amount);
  await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n🧾 N° do Pedido: '+order.code);
  await sleep(250);

  const paymentText='💳 *PAGAMENTO VIA PIX*\\n\\n💰 Valor: *R$ '+total+'*\\n\\n📋 *PIX COPIA E COLA:*\\n\\n'+code+'\\n\\n⬆️ Copie o código acima e faça o pagamento.';
  let jid=identity?.remoteJid||'';
  if(identity?.phone){
    try{jid=(await ensureTargetJid(identity.phone)).jid;}catch{}
  }

  try{
    const baileys=await import('@whiskeysockets/baileys');
    const generateWAMessageFromContent=baileys.generateWAMessageFromContent;
    const normalizeMessageContent=baileys.normalizeMessageContent;
    const isJidGroup=baileys.isJidGroup;
    if(typeof generateWAMessageFromContent!=='function' || typeof normalizeMessageContent!=='function'){
      throw new Error('Helpers de mensagem interativa não disponíveis.');
    }

    const interactive={
      interactiveMessage:{
        header:{title:'Pagamento via PIX',hasMediaAttachment:false},
        body:{text:paymentText},
        footer:{text:'Toque no botão para copiar somente o PIX.'},
        nativeFlowMessage:{
          messageParamsJson:'',
          buttons:[{
            name:'cta_copy',
            buttonParamsJson:JSON.stringify({display_text:'📋 COPIAR PIX',copy_code:code})
          }]
        }
      }
    };

    const fullMsg=generateWAMessageFromContent(jid,interactive,{
      userJid:sock?.user?.id,
      timestamp:new Date()
    });
    const normalized=normalizeMessageContent(fullMsg.message);
    const nativeFlow=normalized?.interactiveMessage?.nativeFlowMessage;
    if(!nativeFlow?.buttons?.length)throw new Error('Botão cta_copy não foi serializado.');

    const additionalNodes=[{
      tag:'biz',
      attrs:{},
      content:[{
        tag:'interactive',
        attrs:{type:'native_flow',v:'1'},
        content:[{
          tag:'native_flow',
          attrs:{v:'9',name:'mixed'}
        }]
      }]
    }];
    if(typeof isJidGroup!=='function' || !isJidGroup(jid)){
      additionalNodes.push({tag:'bot',attrs:{biz_bot:'1'}});
    }

    await sock.relayMessage(jid,fullMsg.message,{messageId:fullMsg.key.id,additionalNodes});
    rememberMessage(fullMsg);
    try{ await sock.sendPresenceUpdate('unavailable'); }catch{}
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:paymentText,status:'ENVIADA',waId:fullMsg?.key?.id,raw:{jid,interactive:'cta_copy',relay:'native_flow_v4'}});
    console.log('[RDS] PIX enviado com cta_copy V4 via relayMessage/native_flow');
    return fullMsg;
  }catch(e){
    console.warn('[RDS] cta_copy V4 indisponível; usando PIX em texto:',e.message);
    const r=await sendToJid(jid,{text:paymentText});
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:paymentText,status:'ENVIADA',waId:r?.key?.id,raw:{jid,fallback:'text_v4'}});
    return r;
  }
}

sendPixToIdentity=rdsPixUxSendV4;
`;

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para UX PIX V4.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] UX PIX V4 aplicada: relayMessage + native_flow + bot node');
