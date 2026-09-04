import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS CAMPAIGN CTA FINAL';
if(server.includes(marker)){
  console.log('[RDS] CTA de campanha já aplicado');
  process.exit(0);
}

let changed=false;
const oldCreate="cta_enabled:b.cta_enabled!==false,status:'RASCUNHO'";
const newCreate="cta_enabled:b.cta_enabled!==false,cta_text:cleanText(b.cta_text)||'🛒 COMPRAR BILHETES',status:'RASCUNHO'";
if(server.includes(oldCreate)){
  server=server.replace(oldCreate,newCreate);
  changed=true;
}

const ctaPattern=/const body=cleanText\(step\.message\|\|''\)\+\(c\.cta_enabled!==false\?[\s\S]*?\);/;
if(ctaPattern.test(server)){
  server=server.replace(ctaPattern,"const ctaLabel=cleanText(c.cta_text||'🛒 COMPRAR BILHETES'); const cta=c?.cta_enabled!==false?'\\n\\n'+ctaLabel+': https://wa.me/'+connectedNumber+'?text='+encodeURIComponent('COMPRAR'):''; const body=cleanText(step.message||'')+cta;");
  changed=true;
}

server='\n'+marker+'\n'+server;
fs.writeFileSync(path,server,'utf8');
console.log(changed?'[RDS] CTA de campanha: texto editável e link direto de compra':'[RDS] CTA de campanha: nenhum trecho compatível encontrado');
