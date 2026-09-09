import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS COPY DATA UX V1';
if(server.includes(marker)){
  console.log('[RDS] COPIAR NOME/CPF já aplicado');
  process.exit(0);
}

const guidedMarker='// RDS GUIDED PURCHASE FLOW FINAL';
const guidedPos=server.indexOf(guidedMarker);
if(guidedPos<0)throw new Error('Fluxo guiado não localizado para COPIAR NOME/CPF.');

const block=String.raw`
${marker}
async function rdsSendCopyData(identity,title,value,buttonLabel){
  const code=cleanText(value||'');
  if(!code)throw new Error('Dado vazio para copiar.');
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
        header:{title:title.replace(/\\*/g,''),hasMediaAttachment:false},
        body:{text:title+'\\n\\n'+code},
        footer:{text:'Toque no botão para copiar somente este dado.'},
        nativeFlowMessage:{
          messageParamsJson:'',
          buttons:[{
            name:'cta_copy',
            buttonParamsJson:JSON.stringify({display_text:buttonLabel,copy_code:code})
          }]
        }
      }
    };
    const fullMsg=generateWAMessageFromContent(jid,interactive,{userJid:sock?.user?.id,timestamp:new Date()});
    const normalized=normalizeMessageContent(fullMsg.message);
    const nativeFlow=normalized?.interactiveMessage?.nativeFlowMessage;
    if(!nativeFlow?.buttons?.length)throw new Error('Botão cta_copy não foi serializado.');
    const additionalNodes=[{
      tag:'biz',attrs:{},content:[{
        tag:'interactive',attrs:{type:'native_flow',v:'1'},content:[{
          tag:'native_flow',attrs:{v:'9',name:'mixed'}
        }]
      }]
    }];
    if(typeof isJidGroup!=='function' || !isJidGroup(jid))additionalNodes.push({tag:'bot',attrs:{biz_bot:'1'}});
    await sock.relayMessage(jid,fullMsg.message,{messageId:fullMsg.key.id,additionalNodes});
    rememberMessage(fullMsg);
    try{await sock.sendPresenceUpdate('unavailable');}catch{}
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:title+'\\n\\n'+code,status:'ENVIADA',waId:fullMsg?.key?.id,raw:{jid,interactive:'cta_copy',copy:'data',button:buttonLabel}});
    console.log('[RDS] '+buttonLabel+' enviado com native_flow');
    return fullMsg;
  }catch(e){
    console.warn('[RDS] '+buttonLabel+' indisponível; usando texto:',e.message);
    return replyInbound(identity,title+'\\n\\n'+code);
  }
}
`;
server=server.slice(0,guidedPos)+block+'\n'+server.slice(guidedPos);

const nameOld="state.name=name;state.step='CPF';state.expiresAt=Date.now()+15*60*1000;\n      return replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');";
const nameNew="state.name=name;state.step='CPF';state.expiresAt=Date.now()+15*60*1000;\n      await rdsSendCopyData(identity,'👤 *NOME*',state.name,'📋 COPIAR NOME');\n      await sleep(250);\n      return replyInbound(identity,'🧾 *DIGITE SEU CPF:* 👇');";
if(!server.includes(nameOld))throw new Error('Etapa NOME não localizada para inserir COPIAR NOME.');
server=server.replace(nameOld,nameNew);

const cpfOld="state.cpf=cpf;\n      return rdsGuidedConfirm(identity,state);";
const cpfNew="state.cpf=cpf;\n      await rdsSendCopyData(identity,'🧾 *CPF*',state.cpf,'📋 COPIAR CPF');\n      await sleep(250);\n      return rdsGuidedConfirm(identity,state);";
if(!server.includes(cpfOld))throw new Error('Etapa CPF não localizada para inserir COPIAR CPF.');
server=server.replace(cpfOld,cpfNew);

fs.writeFileSync(path,server,'utf8');
console.log('[RDS] COPIAR NOME e COPIAR CPF aplicados ao fluxo guiado');
