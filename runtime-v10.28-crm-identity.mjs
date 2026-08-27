import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(__dirname,'server.js');
try{
  let s=fs.readFileSync(serverPath,'utf8');
  const old=`  // O nome informado pelo comprador passa a ser a referência do CRM, sem criar duplicado.\n  if(identity.phone){\n    const existing = await findContact(identity.phone);\n    if(existing){\n      await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{\n        name:p.name,\n        validated:true,\n        last_seen_at:nowISO(),\n        updated_at:nowISO()\n      });\n    }else{\n      await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});\n    }\n  }`;
  const neu=`  // V10.28: telefone é a identidade única do CRM.\n  // Um novo pedido NUNCA substitui o nome principal de um contato já cadastrado.\n  // O nome informado permanece apenas no pedido (customer_name).\n  if(identity.phone){\n    const existing = await findContact(identity.phone);\n    if(existing){\n      await patch('rds10_contacts',\`id=eq.\${existing.id}\`,{\n        validated:true,\n        last_seen_at:nowISO(),\n        updated_at:nowISO()\n      });\n    }else{\n      await saveOrMergeContact({name:p.name,phone:identity.phone,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});\n    }\n  }`;
  if(s.includes(old)){
    s=s.replace(old,neu);
    fs.writeFileSync(serverPath,s,'utf8');
    console.log('[V10.28] identidade do CRM preservada por telefone');
  }else if(s.includes('V10.28: telefone é a identidade única do CRM.')){
    console.log('[V10.28] regra de identidade do CRM já aplicada');
  }else{
    console.warn('[V10.28] bloco legado de atualização de nome não localizado');
  }
}catch(e){console.error('[V10.28]',e.message);process.exitCode=1;}
await import('./runtime-v10.26-security.mjs');
