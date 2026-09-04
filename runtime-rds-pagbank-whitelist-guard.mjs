import fs from 'node:fs';

const path='runtime-v10.60-pagbank.mjs';
let s=fs.readFileSync(path,'utf8');
const marker='// RDS PAGBANK WHITELIST GUARD V5';
if(s.includes(marker)){
  console.log('[RDS] proteção de whitelist PagBank V5 já aplicada');
  process.exit(0);
}

const oldInit="let pix=null,pixError=null;";
const newInit="let pix=null,pixError=null,pixBlocked=false;";
if(!s.includes(oldInit))throw new Error('Inicialização do PIX não localizada.');
s=s.replace(oldInit,newInit);

const oldCatch="pixError=e;await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e.message||e),updated_at:nowISO()});";
const newCatch="pixError=e;const emsg=String(e?.message||e);const whitelist=/whitelist access required|access required|homologa[cç][aã]o|não autorizado|nao autorizado|forbidden|403/i.test(emsg)&&String(process.env.PAGBANK_ENV||'').toLowerCase()==='production';pixBlocked=whitelist;await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:emsg,status:whitelist?'CANCELADO':'AGUARDANDO_PAGAMENTO',updated_at:nowISO()});if(whitelist)await logEvent('PAGBANK_WHITELIST_BLOQUEIO',{phone:identity.phone,order:order.code,error:emsg});";
if(!s.includes(oldCatch))throw new Error('Tratamento de falha PagBank não localizado.');
s=s.replace(oldCatch,newCatch);

const oldMessage='O pedido permanece registrado para nova tentativa.';
const newMessage="O pedido foi encerrado para não ficar pendente. Quando o PagBank liberar a produção, você poderá iniciar uma nova compra.";
if(!s.includes(oldMessage))throw new Error('Mensagem de falha PagBank não localizada.');
s=s.replace(oldMessage,newMessage);

s=s.replace('async function handleOrderForm(identity, order, text){','async function handleOrderForm(identity, order, text){\n  '+marker);
fs.writeFileSync(path,s,'utf8');
console.log('[RDS] proteção de whitelist PagBank V5 instalada');
