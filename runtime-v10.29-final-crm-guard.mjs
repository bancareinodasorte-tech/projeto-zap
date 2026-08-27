import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');
  const oldBlock=`  // O nome informado pelo comprador passa a ser a referência do CRM, sem criar duplicado.\n  if(identity.phone){\n    const existing = await findContact(identity.phone);\n    if(existing){\n      await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{\n        name:p.name,\n        validated:true,\n        last_seen_at:nowISO(),\n        updated_at:nowISO()\n      });\n    }else{\n      await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});\n    }\n  }`;
  const newBlock=`  // V10.29: o telefone é a identidade única do CRM.\n  // Um novo pedido nunca sobrescreve o nome principal de um contato já cadastrado.\n  if(identity.phone){\n    const existing = await findContact(identity.phone);\n    if(existing){\n      await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{\n        validated:true,\n        last_seen_at:nowISO(),\n        updated_at:nowISO()\n      });\n    }else{\n      await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});\n    }\n  }`;
  if(s.includes(oldBlock)){
    s=s.replace(oldBlock,newBlock);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.29] proteção do nome principal do CRM ativada');
  }else if(s.includes('V10.29: o telefone é a identidade única do CRM.')||s.includes('V10.28: telefone é a identidade única do CRM.')){
    console.log('[V10.29] proteção do CRM já aplicada');
  }else{
    console.warn('[V10.29] bloco legado do CRM não localizado; servidor mantido sem alteração');
  }
}catch(e){
  console.error('[V10.29]',e.message);
  process.exitCode=1;
}

await import('./runtime-v10.28-crm-identity.mjs');
