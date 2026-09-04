import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS PAGBANK WHITELIST GUARD V2';
if(s.includes(marker)){
  console.log('[RDS] proteção de whitelist PagBank V2 já aplicada');
  process.exit(0);
}

function replaceFunction(src,signature,replacement){
  const start=src.indexOf(signature);
  if(start<0)throw new Error('Função não localizada: '+signature);
  const brace=src.indexOf('{',start);
  if(brace<0)throw new Error('Abertura não localizada: '+signature);
  let depth=0,inStr=null,esc=false,inLine=false,inBlock=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i],n=src[i+1];
    if(inLine){if(c==='\n')inLine=false;continue;}
    if(inBlock){if(c==='*'&&n==='/'){inBlock=false;i++;}continue;}
    if(inStr){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===inStr)inStr=null;continue;}
    if(c==='/'&&n==='/'){inLine=true;i++;continue;}
    if(c==='/'&&n==='*'){inBlock=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){inStr=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return src.slice(0,start)+replacement+src.slice(i+1);}
  }
  throw new Error('Fechamento não localizado: '+signature);
}

const replacement=String.raw`async function handleOrderForm(identity,order,text){
  const p=parseOrderForm(text);
  const missing=[];
  if(!p.quantity||p.quantity<1)missing.push('Quantidade');
  if(!p.name)missing.push('Nome');
  if(!validCPF(p.cpf))missing.push('CPF');
  if(missing.length){await replyInbound(identity,'Falta preencher ou corrigir: *'+missing.join(', ')+'*.\\nEnvie novamente o bloco completo.');return;}
  const contact=normalizeBR(identity.phone||'');
  if(!contact||!validBRPhone(contact)){await replyInbound(identity,'Não consegui identificar o número de WhatsApp deste pedido. Envie novamente *QUERO COMPRAR*.');return;}
  const total=Number((p.quantity*Number(order.unit_price||3)).toFixed(2));
  const existing=await findContact(contact);
  if(existing)await patch('rds10_contacts','id=eq.'+existing.id,{name:p.name,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,whatsapp_validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
  else await saveOrMergeContact({name:p.name,phone:contact,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,whatsapp_validated:true,last_seen_at:nowISO()});
  await patch('rds10_orders','id=eq.'+order.id,{customer_name:p.name,customer_tax_id:p.cpf,contact_phone:contact,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO(),payment_last_error:null});
  await cancelFutureDeliveries(identity.phone,'PEDIDO_ATIVO');
  const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);
  let pix=null,pixError=null;
  try{pix=await rdsPagBankCreatePix(fresh);}catch(e){
    pixError=e;
    const emsg=String(e?.message||e);
    const whitelist=/whitelist access required|access required|homologa[cç][aã]o|não autorizado|nao autorizado|forbidden|403/i.test(emsg)&&String(process.env.PAGBANK_ENV||'').toLowerCase()==='production';
    await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:emsg,status:whitelist?'CANCELADO':'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});
    await addAlert('PAGBANK_PIX_FALHA',(whitelist?'PagBank produção ainda não autorizado para criar PIX — ':'Falha ao criar PIX — ')+order.code,{order:order.code,error:emsg,production_whitelist:whitelist}).catch(()=>{});
    if(whitelist)await logEvent('PAGBANK_WHITELIST_BLOQUEIO',{phone:identity.phone,order:order.code,error:emsg});
  }
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,name:p.name,contact,pagbank:!!pix,pagbank_error:pixError?.message||null});
  if(pix&&pix.qr?.text){
    await sendPixToIdentity(identity,fresh,pix);
  }else if(pixError&&/não configurado/i.test(String(pixError.message||''))){
    await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ O pedido foi registrado. O PIX automático ainda não está configurado no sistema.');
  }else{
    const blocked=/whitelist access required|access required|homologa[cç][aã]o|não autorizado|nao autorizado|forbidden|403/i.test(String(pixError?.message||''))&&String(process.env.PAGBANK_ENV||'').toLowerCase()==='production';
    await replyInbound(identity,blocked?'⚠️ *PAGAMENTO TEMPORARIAMENTE INDISPONÍVEL*\\n\\nO pedido *'+order.code+'* foi encerrado porque o PagBank ainda não liberou a criação de PIX em produção.\\n\\nAssim que a homologação for liberada, você poderá iniciar uma nova compra enviando *QUERO COMPRAR*.':'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ Não foi possível gerar o PIX neste momento.');
  }
}
${marker}`;

s=replaceFunction(s,'async function handleOrderForm(identity,order,text)',replacement);
fs.writeFileSync(path,s,'utf8');
console.log('[RDS] proteção de whitelist PagBank V2 instalada');
