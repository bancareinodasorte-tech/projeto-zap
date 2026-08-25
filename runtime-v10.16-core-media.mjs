import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  const old=`  const body = cleanText(step.message) + cta;\n  const result = await sendTextPhone(d.phone,body);`;
  const replacement=`  let rawMessage = String(step.message || '');\n  let imageData = '';\n  const imageMatch = rawMessage.match(/^\\[\\[RDS_IMAGE:(data:image\\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+)\\]\\]\\n?/);\n  if(imageMatch){\n    imageData = imageMatch[1];\n    rawMessage = rawMessage.slice(imageMatch[0].length);\n  }\n  const body = cleanText(rawMessage) + cta;\n  let result;\n  if(imageData){\n    const parsed=imageData.match(/^data:(image\\/(?:png|jpeg|jpg|webp));base64,(.+)$/);\n    if(!parsed) throw new Error('Imagem da campanha inválida.');\n    const {phone:n,jid}=await ensureTargetJid(d.phone);\n    const r=await sendToJid(jid,{image:Buffer.from(parsed[2],'base64'),caption:body});\n    await logMessage({phone:n,direction:'OUT',type:'image',body,status:'ENVIADA',waId:r?.key?.id,raw:{jid,media:'campaign-image'}});\n    result={id:r?.key?.id,phone:n,jid};\n  }else{\n    result = await sendTextPhone(d.phone,body);\n  }`;
  if(s.includes(old)){
    s=s.replace(old,replacement);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.16] envio de imagem em campanhas ativado');
  }else if(s.includes('RDS_IMAGE:')){
    console.log('[V10.16] suporte a imagem já aplicado');
  }else{
    console.error('[V10.16] ponto de integração de mídia não localizado');
    process.exitCode=1;
  }
}catch(e){
  console.error('[V10.16] mídia campanhas:',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.12.2-root-stability.mjs');
