import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const baseInnerPath=path.join(dir,'runtime-v10.60-pagbank.mjs');
const currentFixPath=path.join(dir,'runtime-v10.60-fix.mjs');
const innerPatchedPath=path.join(dir,'runtime-v10.69-pagbank-base.mjs');
const fixPatchedPath=path.join(dir,'runtime-v10.69-fix-generated.mjs');

let inner=fs.readFileSync(baseInnerPath,'utf8');

// Fechamento 2.69 — máquina de estados do pedido:
// - pedido de compra/dados/pagamento expira após o prazo configurado;
// - pedido expirado deixa de bloquear uma nova compra;
// - qualquer tentativa de continuar/corrigir um pedido expirado recebe orientação clara;
// - menu passa a ser orientado ao estado do pedido.
const marker='// FECHAMENTO 2 — PagBank/PIX.';
const flowPatch=String.raw`
// RDS_ORDER_FLOW_V10_69
const RDS_ORDER_EXPIRATION_HOURS=Math.max(1,Number(process.env.RDS_ORDER_EXPIRATION_HOURS||process.env.ORDER_EXPIRATION_HOURS||24));
const RDS_ORDER_EXPIRATION_MS=RDS_ORDER_EXPIRATION_HOURS*60*60*1000;
function rdsOrderIsExpirable(order){return Boolean(order&&['COLETANDO_DADOS','AGUARDANDO_PAGAMENTO'].includes(String(order.status||'')));}
function rdsOrderIsExpired(order){
  if(!rdsOrderIsExpirable(order)||!order.created_at)return false;
  const created=Date.parse(order.created_at);
  return Number.isFinite(created)&&(Date.now()-created)>=RDS_ORDER_EXPIRATION_MS;
}
async function rdsExpireOrderIfNeeded(order,identity,allowNewPurchase=false){
  if(!rdsOrderIsExpired(order))return false;
  await patch('rds10_orders','id=eq.'+order.id,{status:'CANCELADO',cancel_reason:'PEDIDO_EXPIRADO',payment_last_error:null,updated_at:nowISO()});
  await cancelFutureDeliveries(order.phone,'PEDIDO_EXPIRADO');
  await logEvent('PEDIDO_EXPIRADO',{phone:order.phone,order:order.code,created_at:order.created_at,expiration_hours:RDS_ORDER_EXPIRATION_HOURS});
  if(!allowNewPurchase){
    await replyInbound(identity,'⏰ *PEDIDO EXPIRADO*\\n\\nO pedido *'+order.code+'* ultrapassou o prazo de validade e foi encerrado automaticamente.\\n\\nPara fazer uma nova compra, envie *QUERO COMPRAR*.');
  }
  return true;
}
function rdsProfessionalOrderMenu(order){
  const status=String(order?.status||'');
  if(status==='COLETANDO_DADOS')return 'Pedido *'+order.code+'* em andamento.\\n\\n📝 *DADOS DO PEDIDO*\\n1️⃣ Continuar preenchimento\\n2️⃣ Corrigir dados\\n3️⃣ Recomeçar pedido\\n4️⃣ Encerrar pedido\\n5️⃣ Falar com o escritório\\n\\nResponda apenas com o número.';
  if(status==='AGUARDANDO_PAGAMENTO')return 'Pedido *'+order.code+'* aguardando pagamento.\\n\\n💳 *PAGAMENTO*\\n1️⃣ Ver PIX / continuar pagamento\\n2️⃣ Corrigir dados\\n3️⃣ Recomeçar pedido\\n4️⃣ Encerrar pedido\\n5️⃣ Falar com o escritório\\n\\nResponda apenas com o número.';
  if(status==='AGUARDANDO_CONFERENCIA')return 'Pedido *'+order.code+'* com comprovante recebido.\\n\\n🔎 *CONFERÊNCIA*\\n1️⃣ Consultar status\\n2️⃣ Corrigir dados\\n3️⃣ Recomeçar pedido\\n4️⃣ Encerrar pedido\\n5️⃣ Falar com o escritório\\n\\nResponda apenas com o número.';
  if(status==='PAGO_AGUARDANDO_BILHETES')return 'Pedido *'+order.code+'* com pagamento confirmado.\\n\\n🎟 *EMISSÃO DOS BILHETES*\\n1️⃣ Consultar status\\n3️⃣ Recomeçar pedido\\n4️⃣ Encerrar pedido\\n5️⃣ Falar com o escritório\\n\\nResponda apenas com o número.';
  return 'Pedido *'+order.code+'* em andamento.\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.';
}
const rdsOriginalOrderMenuNeedle='function orderMenu(order){return \'Pedido *\'+order.code+\'* em andamento.\\\\n\\\\n1️⃣ Continuar\\\\n2️⃣ Corrigir\\\\n3️⃣ Recomeçar\\\\n4️⃣ Encerrar\\\\n5️⃣ Escritório\\\\n\\\\nResponda apenas com o número.\';}';
source=source.replace(rdsOriginalOrderMenuNeedle,'function orderMenu(order){return rdsProfessionalOrderMenu(order);}');

const rdsOriginalHandleNeedle='async function handleInbound(m){';
const rdsBaseName='async function handleInboundV1069Base(m){';
if(source.includes(rdsOriginalHandleNeedle))source=source.replace(rdsOriginalHandleNeedle,rdsBaseName);
const rdsWrapper=String.raw`async function handleInbound(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const text=cleanText(inbound.text);
  const order=identity.phone?await activeOrder(identity.phone):null;
  if(order&&rdsOrderIsExpired(order)){
    const wantsNew=isBuyRoute(text);
    const expired=await rdsExpireOrderIfNeeded(order,identity,wantsNew);
    if(expired&&!wantsNew)return;
  }
  return handleInboundV1069Base(m);
}
`;
if(!source.includes('async function handleInboundV1069Base(m)'))throw new Error('Base handleInbound V10.69 não localizada.');
source=source.replace('async function handleInboundV1069Base(m){',rdsBaseName);
const firstMarker=source.indexOf('// RDS_ORDER_FLOW_V10_69');
if(firstMarker>=0){
  const end=source.indexOf('\n// FECHAMENTO 2 — PagBank/PIX.',firstMarker);
  if(end>firstMarker)source=source.slice(0,end)+'\n'+rdsWrapper+source.slice(end);
}
`;

if(!inner.includes(marker))throw new Error('Marcador do Fechamento 2 não localizado no runtime interno.');
inner=inner.replace(marker,flowPatch+'\n'+marker);
fs.writeFileSync(innerPatchedPath,inner,'utf8');

let fix=fs.readFileSync(currentFixPath,'utf8');
const oldSource="const sourcePath = path.join(dir, 'runtime-v10.60-pagbank.mjs');";
const oldFixed="const fixedPath = path.join(dir, 'runtime-v10.60-pagbank-fixed.mjs');";
if(!fix.includes(oldSource)||!fix.includes(oldFixed))throw new Error('Runtime V10.68 incompatível com V10.69.');
fix=fix.replace(oldSource,"const sourcePath = path.join(dir, 'runtime-v10.69-pagbank-base.mjs');");
fix=fix.replace(oldFixed,"const fixedPath = path.join(dir, 'runtime-v10.69-pagbank-fixed.mjs');");
fix=fix.replace("'?v=1068'","'?v=1069'");
fs.writeFileSync(fixPatchedPath,fix,'utf8');
console.log('[V10.69] ciclo de vida e menu profissional preparados; preservando deduplicação e PagBank da V10.68');
await import(pathToFileURL(fixPatchedPath).href+'?v=1069');
