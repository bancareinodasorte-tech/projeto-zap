import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS PIX UX FINAL';
if(server.includes(marker)){
  console.log('[RDS] UX final do PIX já aplicada');
  process.exit(0);
}

const block=String.raw`
${marker}
async function rdsPixUxSend(identity,order,pix){
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

  const interactive={
    interactiveMessage:{
      body:{text:paymentText},
      footer:{text:'Toque no botão para copiar somente o PIX.'},
      nativeFlowMessage:{
        messageParamsJson:'{}',
        messageVersion:1,
        buttons:[{
          name:'cta_copy',
          buttonParamsJson:JSON.stringify({display_text:'📋 COPIAR PIX',id:'rds_pix_'+order.code,copy_code:code})
        }]
      }
    }
  };

  try{
    const r=await sendToJid(jid,interactive);
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:paymentText,status:'ENVIADA',waId:r?.key?.id,raw:{jid,interactive:'cta_copy',messageVersion:1}});
    console.log('[RDS] PIX enviado com botão cta_copy V2');
    return r;
  }catch(e){
    console.warn('[RDS] cta_copy indisponível nesta execução; usando PIX em texto:',e.message);
    const r=await sendToJid(jid,{text:paymentText});
    await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'OUT',type:'text',body:paymentText,status:'ENVIADA',waId:r?.key?.id,raw:{jid,fallback:'text'}});
    return r;
  }
}

sendPixToIdentity=rdsPixUxSend;
`;

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para UX PIX.');
server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] UX PIX aplicada: botão cta_copy V2 + fallback texto');
