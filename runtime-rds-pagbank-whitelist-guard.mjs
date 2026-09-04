import fs from 'node:fs';

const path='server.js';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS PAGBANK WHITELIST GUARD';
if(s.includes(marker)){
  console.log('[RDS] proteção de whitelist PagBank já aplicada');
  process.exit(0);
}

const oldCatch="try{pix=await rdsPagBankCreatePix(fresh);}catch(e){pixError=e;await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e.message||e),updated_at:nowISO()});await addAlert('PAGBANK_PIX_FALHA','Falha ao criar PIX — '+order.code,{order:order.code,error:e.message}).catch(()=>{});}";
const newCatch="try{pix=await rdsPagBankCreatePix(fresh);}catch(e){pixError=e;const emsg=String(e?.message||e);const whitelist=/whitelist access required|access required|homologa[cç][aã]o|não autorizado|nao autorizado|forbidden|403/i.test(emsg)&&String(process.env.PAGBANK_ENV||'').toLowerCase()==='production';await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:emsg,status:whitelist?'CANCELADO':'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});await addAlert('PAGBANK_PIX_FALHA',(whitelist?'PagBank produção ainda não autorizado para criar PIX — ':'Falha ao criar PIX — ')+order.code,{order:order.code,error:emsg,production_whitelist:whitelist}).catch(()=>{});if(whitelist)await logEvent('PAGBANK_WHITELIST_BLOQUEIO',{phone:identity.phone,order:order.code,error:emsg});}";
if(!s.includes(oldCatch))throw new Error('Trecho de falha PagBank não localizado.');
s=s.replace(oldCatch,newCatch);

const oldElse="}else{await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ Não foi possível gerar o PIX neste momento. O pedido permanece registrado para nova tentativa.');}";
const newElse="}else{const blocked=String(pixError?.message||'').match(/whitelist access required|access required|homologa[cç][aã]o|não autorizado|nao autorizado|forbidden|403/i)&&String(process.env.PAGBANK_ENV||'').toLowerCase()==='production';await replyInbound(identity,blocked?'⚠️ *PAGAMENTO TEMPORARIAMENTE INDISPONÍVEL*\\n\\nO pedido *'+order.code+'* foi encerrado porque o PagBank ainda não liberou a criação de PIX em produção.\\n\\nAssim que a homologação for liberada, você poderá iniciar uma nova compra enviando *QUERO COMPRAR*.':'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ Não foi possível gerar o PIX neste momento.');}"
if(!s.includes(oldElse))throw new Error('Mensagem final de falha PagBank não localizada.');
s=s.replace(oldElse,newElse);

const anchor='// RDS PAGBANK WHITELIST GUARD';
s=s.replace(newElse,newElse+'\n'+anchor);
fs.writeFileSync(path,s,'utf8');
console.log('[RDS] proteção de whitelist PagBank instalada');
