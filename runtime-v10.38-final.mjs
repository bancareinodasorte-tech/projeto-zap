import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Primeiro executa todo o fechamento V10.37/V10.36.
await import('./runtime-v10.37-final-refinement.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

// V10.38: fechamento de produção do PIX.
// Em produção o sistema opera em fail-closed: se o PagBank falhar,
// nunca envia a chave PIX estática como fallback ao cliente.
try {
  let s = fs.readFileSync(serverPath, 'utf8');

  if (!s.includes('RDS_PAGBANK_PRODUCTION_GATE_V10_38')) {
    const fallbackOld = `if(!payMsg){\n    const pix=cleanText(s.pix_key||'PIX NÃO CONFIGURADO');\n    payMsg=`;
    const fallbackNew = `if(!payMsg){\n    if(String(process.env.PAGBANK_ENV||'sandbox').toLowerCase()==='production'){\n      payMsg='⚠️ *PAGAMENTO PIX TEMPORARIAMENTE INDISPONÍVEL*\\n\\nSeu pedido foi registrado, mas a cobrança automática não pôde ser criada neste momento. Aguarde o atendimento do Reino da Sorte. Não realize pagamento por outra chave enviada fora do sistema.';\n    }else{\n      const pix=cleanText(s.pix_key||'PIX NÃO CONFIGURADO');\n      payMsg=`;
    if (s.includes(fallbackOld)) s = s.replace(fallbackOld, fallbackNew);

    if (s.includes(fallbackNew)) {
      const closeOld = `  }\n  await replyInbound(identity,payMsg);`;
      const closeNew = `    }\n  }\n  await replyInbound(identity,payMsg);`;
      if (s.includes(closeOld)) s = s.replace(closeOld, closeNew);
    }

    const marker = "app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
    const pos = s.indexOf(marker);
    if (pos < 0) throw new Error('ponto de inserção V10.38 não localizado');

    const block = `// RDS_PAGBANK_PRODUCTION_GATE_V10_38\napp.get('/api/pagbank/preflight',async(req,res)=>{\n  try{\n    const environment=String(process.env.PAGBANK_ENV||'sandbox').toLowerCase();\n    const token=String(process.env.PAGBANK_TOKEN||'').trim();\n    const publicUrl=String(process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL||'').replace(/\\/+$/,'');\n    const production=environment==='production';\n    const webhook=publicUrl?publicUrl+'/api/pagbank/webhook':null;\n    const checks={\n      environmentProduction:production,\n      tokenPresent:Boolean(token),\n      publicUrlPresent:Boolean(publicUrl),\n      publicUrlHttps:/^https:\\/\\//i.test(publicUrl),\n      webhookConfigured:Boolean(webhook),\n      staticPixFallbackDisabledInProduction:true\n    };\n    const ready=Object.values(checks).every(Boolean);\n    res.json({ok:true,ready,environment,publicUrl:webhook?publicUrl:null,webhook,checks});\n  }catch(e){res.status(500).json({ok:false,error:e.message});}\n});\n\n`;
    s = s.slice(0, pos) + block + s.slice(pos);
    fs.writeFileSync(serverPath, s, 'utf8');
    console.log('[V10.38] gate de produção PagBank aplicado');
  }
} catch (e) {
  console.error('[V10.38]', e.message);
  process.exitCode = 1;
}
