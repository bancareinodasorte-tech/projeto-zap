const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath,pathToFileURL}=require('node:url');

const dir=path.dirname(fileURLToPath(import.meta.url));
const serverPath=path.join(dir,'server.js');
const generatedPath=path.join(dir,'runtime-v10.60-generated.cjs');
let source=fs.readFileSync(serverPath,'utf8');

function findFunctionStart(src,signature){
  const start=src.indexOf(signature);
  if(start<0)throw new Error('Função não encontrada: '+signature);
  const brace=src.indexOf('{',start);
  if(brace<0)throw new Error('Abertura não encontrada: '+signature);
  return {start,brace};
}
function replaceFunction(signature,replacement){
  const {start,brace}=findFunctionStart(source,signature);
  let depth=0,inStr=null,esc=false,inLine=false,inBlock=false;
  for(let i=brace;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(inLine){if(c==='\n')inLine=false;continue;}
    if(inBlock){if(c==='*'&&n==='/'){inBlock=false;i++;}continue;}
    if(inStr){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===inStr)inStr=null;continue;}
    if(c==='/'&&n==='/'){inLine=true;i++;continue;}
    if(c==='/'&&n==='*'){inBlock=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){inStr=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0){source=source.slice(0,start)+replacement+source.slice(i+1);return;}}
  }
  throw new Error('Fechamento não encontrado: '+signature);
}

// FECHAMENTO 1 preservado: formulário Quantidade / Nome / CPF e identificação automática do WhatsApp.
replaceFunction('function parseOrderForm(text)',String.raw`function parseOrderForm(text){
  const t=cleanText(text);
  const get=label=>{const re=new RegExp(label+'\\s*[:\\-]\\s*([^\\n\\r]+)','i');return cleanText(t.match(re)?.[1]||'');};
  const quantity=Number((get('quantidade').match(/\\d+/)||[])[0]||0);
  const name=get('nome');
  const cpf=digits(get('cpf'));
  return {quantity,name,cpf};
}`);

replaceFunction('function looksLikeForm(text)',String.raw`function looksLikeForm(text){
  return /quantidade\\s*[:\\-]/i.test(text)&&/nome\\s*[:\\-]/i.test(text)&&/cpf\\s*[:\\-]/i.test(text);
}`);

replaceFunction('async function beginOrder(identity, campaignCode=null)',String.raw`async function beginOrder(identity,campaignCode=null){
  if(!identity.phone){
    await replyInbound(identity,'Recebi sua mensagem, mas não consegui identificar o número do WhatsApp. Envie novamente *QUERO COMPRAR*.');
    return;
  }
  const order=await createOrder(identity.phone,campaignCode);
  await replyInbound(identity,'🛒 *PREENCHER PEDIDO*');
  await sleep(350);
  await replyInbound(identity,'Copie, preencha e envie 👇\\n\\nQuantidade:\\nNome:\\nCPF:\\n\\nPedido: '+order.code);
  await cancelFutureDeliveries(identity.phone,'INTERESSE');
  await logEvent('INTERESSE',{phone:identity.phone,order:order.code,campaignCode});
}`);

replaceFunction('async function handleOrderForm(identity, order, text)',String.raw`async function handleOrderForm(identity,order,text){
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
  if(existing)await patch('rds10_contacts','id=eq.'+existing.id,{name:p.name,validated:true,last_seen_at:nowISO(),updated_at:nowISO()});
  else await saveOrMergeContact({name:p.name,phone:contact,group_name:'INTERESSADOS',origin:'PEDIDO',validated:true,last_seen_at:nowISO()});
  await patch('rds10_orders','id=eq.'+order.id,{customer_name:p.name,customer_tax_id:p.cpf,contact_phone:contact,quantity:p.quantity,total_amount:total,status:'AGUARDANDO_PAGAMENTO',updated_at:nowISO(),payment_last_error:null});
  await cancelFutureDeliveries(identity.phone,'PEDIDO_ATIVO');
  const fresh=await one('rds10_orders','select=*&id=eq.'+order.id);
  let pix=null,pixError=null;
  try{pix=await rdsPagBankCreatePix(fresh);}catch(e){pixError=e;await patch('rds10_orders','id=eq.'+order.id,{payment_last_error:String(e.message||e),updated_at:nowISO()});await addAlert('PAGBANK_PIX_FALHA','Falha ao criar PIX — '+order.code,{order:order.code,error:e.message}).catch(()=>{});}
  await logEvent('PEDIDO_DADOS_COMPLETOS',{phone:identity.phone,order:order.code,quantity:p.quantity,total,cpf:p.cpf,name:p.name,contact,pagbank:!!pix,pagbank_error:pixError?.message||null});
  if(pix&&pix.qr?.text){
    await sendPixToIdentity(identity,fresh,pix);
  }else if(pixError&&/não configurado/i.test(String(pixError.message||''))){
    await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ O pedido foi registrado. O PIX automático ainda não está configurado no sistema.');
  }else{
    await replyInbound(identity,'✅ *PEDIDO RECEBIDO*\\n\\n👤 '+p.name+'\\n🎟 '+p.quantity+' bilhete(s)\\n💰 Total: *R$ '+money(total)+'*\\n🧾 Pedido: '+order.code+'\\n\\n⚠️ Não foi possível gerar o PIX neste momento. O pedido permanece registrado para nova tentativa.');
  }
}`);

const helpers=String.raw`function validCPF(v){
  const cpf=digits(v);
  if(!/^\\d{11}$/.test(cpf)||/^([0-9])\\1{10}$/.test(cpf))return false;
  let sum=0;for(let i=0;i<9;i++)sum+=Number(cpf[i])*(10-i);
  let d1=(sum*10)%11;if(d1===10)d1=0;if(d1!==Number(cpf[9]))return false;
  sum=0;for(let i=0;i<10;i++)sum+=Number(cpf[i])*(11-i);
  let d2=(sum*10)%11;if(d2===10)d2=0;return d2===Number(cpf[10]);
}
function orderMenu(order){return 'Pedido *'+order.code+'* em andamento.\\n\\n1️⃣ Continuar\\n2️⃣ Corrigir\\n3️⃣ Recomeçar\\n4️⃣ Encerrar\\n5️⃣ Escritório\\n\\nResponda apenas com o número.';}
async function cancelOrderReal(order,reason){if(!order?.id)return;const why=reason||'CLIENTE_CANCELAMENTO';await patch('rds10_orders','id='+order.id,{status:'CANCELADO',cancel_reason:why,updated_at:nowISO()});await cancelFutureDeliveries(order.phone,why);await logEvent('PEDIDO_CANCELADO',{phone:order.phone,order:order.code,reason:why});}
async function askOrderForm(identity,order,prefix){await replyInbound(identity,prefix||'📝 *PREENCHER PEDIDO*');await sleep(250);return replyInbound(identity,'Quantidade:\\nNome:\\nCPF:');}
`;
const inboundPos=source.indexOf('async function handleInbound');
if(inboundPos<0)throw new Error('handleInbound base não encontrado');
source=source.slice(0,inboundPos)+helpers+source.slice(inboundPos);

replaceFunction('async function handleInbound(m)',String.raw`async function handleInbound(m){
  const identity=resolveInboundIdentity(m);
  const inbound=extractInbound(m);
  const pushName=cleanText(m?.pushName||'');
  await logMessage({phone:identity.phone||null,lid:identity.lid||null,direction:'IN',type:inbound.type,body:inbound.text||null,status:'RECEBIDA',waId:m?.key?.id,raw:{remoteJid:identity.remoteJid,remoteJidAlt:m?.key?.remoteJidAlt||null,senderPn:m?.key?.senderPn||null,pushName,rawKeys:inbound.rawKeys}});
  if(!identity.phone&&identity.lid)await addAlert('LID_SEM_PN','Mensagem recebida com LID sem número real ao sistema.',{lid:identity.lid,pushName,text:inbound.text});
  await upsertInboundContact(identity,pushName);
  const settings=await getSettings();
  if(!settings.bot_enabled)return;
  const text=cleanText(inbound.text);
  const order=identity.phone?await activeOrder(identity.phone):null;
  const cmd=text.toLowerCase().replace(/[.]/g,'').trim();
  const is1=/^(1|continuar|continuo)$/.test(cmd);
  const is2=/^(2|corrigir|corrijo)$/.test(cmd);
  const is3=/^(3|recomeçar|recomecar|novo|nova compra)$/.test(cmd);
  const is4=/^(4|encerrar|encerrar pedido|cancelar|cancele|desistir|não quero|nao quero)$/.test(cmd);
  const is5=/^(5|escritório|escritorio|atendente|outro assunto)$/.test(cmd);
  if(order&&inbound.media&&['AGUARDANDO_PAGAMENTO','AGUARDANDO_COMPROVANTE'].includes(order.status))return handleProof(identity,order,inbound);
  if(order){
    if(is4){await cancelOrderReal(order,'CLIENTE_ENCERRAMENTO');return replyInbound(identity,'Pedido *'+order.code+'* encerrado. Nenhuma nova cobrança será enviada.\\n\\nQuando quiser comprar novamente, envie *QUERO COMPRAR*.');}
    if(is5){await cancelOrderReal(order,'ENCAMINHADO_ESCRITORIO');const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);return replyInbound(identity,'🏢 Atendimento do escritório:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));}
    if(is3){const old=order.code;await cancelOrderReal(order,'CLIENTE_RECOMECAR');await replyInbound(identity,'Pedido *'+old+'* encerrado. Vamos começar um novo pedido.');await sleep(250);return beginOrder(identity,null);}
    if(order.status==='COLETANDO_DADOS'){
      if(is1||is2)return askOrderForm(identity,order,is2?'📝 *CORRIGIR PEDIDO*':'🛒 *PREENCHER PEDIDO*');
      if(looksLikeForm(text))return handleOrderForm(identity,order,text);
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_PAGAMENTO'){
      if(is1){if(order.pix_copy_paste)return replyInbound(identity,'💳 *PAGAMENTO PIX*\\nPedido *'+order.code+'*\\nValor: *R$ '+money(order.total_amount)+'*\\n\\n*PIX COPIA E COLA:*\\n'+order.pix_copy_paste+'\\n\\nApós pagar, aguarde a confirmação automática.');return replyInbound(identity,'Pedido *'+order.code+'*: aguardando pagamento de *R$ '+money(order.total_amount)+'*. O PIX ainda está sendo preparado.');}
      if(is2){await patch('rds10_orders','id=eq.'+order.id,{status:'COLETANDO_DADOS',updated_at:nowISO()});return askOrderForm(identity,order,'📝 *CORRIGIR PEDIDO*');}
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='AGUARDANDO_CONFERENCIA'){
      if(is1)return replyInbound(identity,'Comprovante do pedido *'+order.code+'* já recebido e aguardando conferência.');
      return replyInbound(identity,orderMenu(order));
    }
    if(order.status==='PAGO_AGUARDANDO_BILHETES'){
      if(is1)return replyInbound(identity,'Pagamento do pedido *'+order.code+'* confirmado ✅\\nOs bilhetes aguardam emissão/envio pelo operador.');
      return replyInbound(identity,orderMenu(order));
    }
  }
  if(isOfficeRoute(text)){const office=normalizeBR(settings.office_whatsapp||OFFICE_WA_DEFAULT);await logEvent('ENCAMINHADO_ESCRITORIO',{phone:identity.phone||null});return replyInbound(identity,'🏢 *OUTRO ASSUNTO*\\nFale diretamente com o escritório:\\nhttps://wa.me/'+office+'?text='+encodeURIComponent('Olá, vim pelo CANAL DE VENDAS RDS e preciso de atendimento.'));}
  if(isBuyRoute(text)){const code=(text.match(/RDS[-_:]?([A-Z0-9]{6,12})/i)||[])[1]||null;return beginOrder(identity,code);}
  return replyInbound(identity,routerMessage(settings));
}`);

// FECHAMENTO 2 — PagBank/PIX.
const jsonLine="app.use(express.json({ limit: '15mb' }));";
const jsonWithRaw="app.use(express.json({ limit: '15mb', verify:(req,res,buf)=>{ if(req.originalUrl==='/api/pagbank/webhook') req.rdsRawBody=buf.toString('utf8'); } }));";
if(source.includes(jsonLine))source=source.replace(jsonLine,jsonWithRaw);

const marker="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=source.indexOf(marker);
if(pos<0)throw new Error('ponto de inserção PagBank não localizado');
if(!source.includes('RDS_PAGBANK_V10_60')){
  const block=String.raw`// RDS_PAGBANK_V10_60
const PAGBANK_ENV=String(process.env.PAGBANK_ENV||'sandbox').toLowerCase()==='production'?'production':'sandbox';
const PAGBANK_TOKEN=String(process.env.PAGBANK_TOKEN||'').trim();
const PAGBANK_BASE=PAGBANK_ENV==='production'?'https://api.pagseguro.com':'https://sandbox.api.pagseguro.com';
const PAGBANK_WEBHOOK_URL=String(process.env.PAGBANK_WEBHOOK_URL||((PUBLIC_URL||'')+'/api/pagbank/webhook')).replace(/\\/+$/,'');
const PAGBANK_PIX_EXPIRATION_MINUTES=Math.max(15,Number(process.env.PAGBANK_PIX_EXPIRATION_MINUTES||1440));
function rdsPagBankConfigured(){return Boolean(PAGBANK_TOKEN);}
async function rdsPagBankRequest(endpoint,opt={}){
  if(!rdsPagBankConfigured())throw new Error('PagBank não configurado no Render. Defina PAGBANK_TOKEN nas variáveis de ambiente.');
  const r=await fetch(PAGBANK_BASE+endpoint,{...opt,headers:{Authorization:'Bearer '+PAGBANK_TOKEN,'Content-Type':'application/json',Accept:'application/json',...(opt.headers||{})}});
  const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt;}
  if(!r.ok){const e1=Array.isArray(data?.error_messages)?data.error_messages[0]:null;throw new Error([e1?.description,e1?.parameter_name,data?.message].filter(Boolean).join(' — ')||('PagBank HTTP '+r.status));}
  return data;
}
function rdsPagBankCharge(data){return Array.isArray(data?.charges)?data.charges[0]||null:null;}
function rdsPagBankQR(data){const c=rdsPagBankCharge(data);const q=c?.qr_code||data?.qr_codes?.[0]||data?.qr_code?.[0]||data?.qr_code||null;return q?{id:q.id||null,text:q.text||null,png:(c?.links||q.links||[]).find(x=>x.rel==='QRCODE.PNG')?.href||null,base64:(c?.links||q.links||[]).find(x=>x.rel==='QRCODE.BASE64')?.href||null,amount:Number(q.amount?.value||c?.amount?.value||0)}:null;}
function rdsPagBankPhone(phone){const n=digits(phone);const national=n.startsWith('55')?n.slice(2):n;if(!/^[0-9]{10,11}$/.test(national))return null;return {country:'55',area:national.slice(0,2),number:national.slice(2),type:'MOBILE'};}
function rdsPagBankCustomer(order){const name=cleanText(order.customer_name||'Cliente Reino da Sorte').replace(/[<>]/g,'').slice(0,120)||'Cliente Reino da Sorte';const tax=digits(order.customer_tax_id||order.tax_id||order.cpf||'');if(!validCPF(tax))throw new Error('CPF do pedido inválido para o PagBank.');const phone=rdsPagBankPhone(order.contact_phone||order.phone);return {name,tax_id:tax,...(phone?{phones:[phone]}:{})};}
function rdsPagBankExisting(order){const exp=order?.pix_expires_at?new Date(order.pix_expires_at).getTime():0;const waiting=String(order?.pagbank_status||'').toUpperCase()==='WAITING';if(order?.pagbank_order_id&&order?.pix_copy_paste&&waiting&&exp>Date.now()+30000)return {orderId:order.pagbank_order_id,chargeId:order.pagbank_charge_id,qr:{text:order.pix_copy_paste,amount:Math.round(Number(order.total_amount||0)*100),png:order.pix_qr_code_url||null},reused:true};return null;}
async function rdsPagBankCreatePix(order){
  if(!order)throw new Error('Pedido não encontrado.');
  if(['CONCLUIDO','CANCELADO','PAGO_AGUARDANDO_BILHETES'].includes(String(order.status||'').toUpperCase()))throw new Error('Este pedido não está aguardando pagamento.');
  const existing=rdsPagBankExisting(order);if(existing)return existing;
  const cents=Math.round(Number(order.total_amount||0)*100);if(!cents||cents<1)throw new Error('Valor do pedido inválido para PIX.');
  const customer=rdsPagBankCustomer(order);
  const expiration=new Date(Date.now()+PAGBANK_PIX_EXPIRATION_MINUTES*60000).toISOString();
  const reference=String(order.code||('RDS-'+order.id)).slice(0,64);
  const payload={reference_id:reference,customer,items:[{reference_id:reference,name:'Bilhetes Reino da Sorte - '+reference,quantity:Number(order.quantity||1),unit_amount:Math.round(cents/Math.max(1,Number(order.quantity||1)))}],charges:[{reference_id:(reference+'-PIX').slice(0,64),description:('Pagamento '+reference).slice(0,100),amount:{value:cents,currency:'BRL'},payment_method:{type:'PIX',pix:{expiration_date:expiration}}}]};
  if(PAGBANK_WEBHOOK_URL)payload.notification_urls=[PAGBANK_WEBHOOK_URL];
  const idem='rds-pix-'+String(order.id)+'-'+String(order.updated_at||'').replace(/\\D/g,'').slice(-20);
  const data=await rdsPagBankRequest('/orders',{method:'POST',headers:{'x-idempotency-key':idem.slice(0,200)},body:JSON.stringify(payload)});
  const charge=rdsPagBankCharge(data),qr=rdsPagBankQR(data);if(!data?.id||!charge?.id||!qr?.text)throw new Error('PagBank não retornou os dados completos do PIX.');
  const expRemote=charge?.payment_method?.pix?.expiration_date||expiration;
  const qrPng=qr.png||null;
  await patch('rds10_orders','id=eq.'+order.id,{pagbank_order_id:data.id,pagbank_charge_id:charge.id,pagbank_status:String(charge.status||'WAITING').toUpperCase(),pix_copy_paste:qr.text,pix_qr_code_url:qrPng,pix_expires_at:expRemote,payment_method:'PIX',payment_created_at:charge.created_at||nowISO(),payment_updated_at:nowISO(),payment_last_error:null,updated_at:nowISO()});
  await logEvent('PAGBANK_PIX_CRIADO',{order_id:order.id,order:order.code,pagbank_order_id:data.id,pagbank_charge_id:charge.id,amount:cents,environment:PAGBANK_ENV,qr_id:qr.id,expires_at:expRemote});
  return {orderId:data.id,chargeId:charge.id,qr:{...qr,amount:cents},reused:false};
}
async function sendPixToIdentity(identity,order,pix){
  const code=pix?.qr?.text||order?.pix_copy_paste;if(!code)return;
  const caption='💳 PAGAMENTO PIX\\nPedido '+order.code+'\\nValor: R$ '+money(order.total_amount)+'\\n\\nEscaneie o QR Code abaixo ou use o PIX Copia e Cola.';
  try{
    const jid=ensureTargetJid(identity.phone||order.phone);
    const image=await QRCode.toBuffer(code,{type:'png',width:700,margin:2});
    await sock.sendMessage(jid,{image,caption});
    await logMessage({phone:identity.phone||order.phone,direction:'OUT',type:'image',body:caption,status:'ENVIADA',waId:null,raw:{order:order.code,pagbank_order_id:pix.orderId}});
  }catch(e){await replyInbound(identity,caption);}
  await sleep(250);
  await replyInbound(identity,'*PIX COPIA E COLA:*\\n'+code+'\\n\\nApós o pagamento, aguarde a confirmação automática do PagBank.');
  await logEvent('PAGBANK_PIX_ENVIADO_WHATSAPP',{order_id:order.id,order:order.code,phone:order.phone,pagbank_order_id:pix.orderId,pagbank_charge_id:pix.chargeId,environment:PAGBANK_ENV});
}
function rdsPagBankStatus(data){return String(rdsPagBankCharge(data)?.status||data?.status||'WAITING').toUpperCase();}
function rdsPagBankAmount(data){const c=rdsPagBankCharge(data);return Number(c?.amount?.value||0);}
function rdsPagBankPaid(data){return rdsPagBankStatus(data)==='PAID';}
function rdsPagBankWebhookValid(req){const received=String(req.get('x-authenticity-token')||'').trim().toLowerCase();const raw=String(req.rdsRawBody||'');if(!received||!raw||!PAGBANK_TOKEN)return false;const expected=crypto.createHash('sha256').update(PAGBANK_TOKEN+'-'+raw,'utf8').digest('hex').toLowerCase();try{return received.length===expected.length&&crypto.timingSafeEqual(Buffer.from(received),Buffer.from(expected));}catch{return false;}}
async function rdsApplyPagBankResult(order,data,source){
  const ref=String(data?.reference_id||'');if(ref&&ref!==String(order.code))throw new Error('Referência PagBank não corresponde ao pedido RDS.');
  const amount=rdsPagBankAmount(data);const expected=Math.round(Number(order.total_amount||0)*100);if(amount&&amount!==expected)throw new Error('Valor PagBank diferente do valor do pedido RDS.');
  const status=rdsPagBankStatus(data);const charge=rdsPagBankCharge(data);const patchData={pagbank_status:status,payment_updated_at:nowISO(),updated_at:nowISO()};if(charge?.id)patchData.pagbank_charge_id=charge.id;
  if(status==='PAID'){
    if(order.status!=='PAGO_AGUARDANDO_BILHETES'&&order.status!=='CONCLUIDO'){
      patchData.status='PAGO_AGUARDANDO_BILHETES';patchData.payment_confirmed_at=nowISO();
      await patch('rds10_orders','id=eq.'+order.id,patchData);
      await cancelFutureDeliveries(order.phone,'PAGAMENTO_CONFIRMADO');
      await addAlert('PIX_CONFIRMADO','PIX confirmado automaticamente — '+order.code,{order:order.code,phone:order.phone,pagbank_order_id:data?.id||order.pagbank_order_id,source});
      await logEvent('PAGAMENTO_CONFIRMADO_PAGBANK',{order_id:order.id,order:order.code,pagbank_order_id:data?.id||order.pagbank_order_id,source});
      try{await sendTextPhone(order.phone,'✅ *PIX CONFIRMADO AUTOMATICAMENTE*\\nPedido *'+order.code+'*.\\nPagamento identificado pelo PagBank. Seus bilhetes serão emitidos e enviados em seguida.');}catch{}
    }
    return true;
  }
  if(['DECLINED','CANCELED','EXPIRED'].includes(status)){patchData.payment_last_error='PagBank status '+status;await patch('rds10_orders','id=eq.'+order.id,patchData);return false;}
  await patch('rds10_orders','id=eq.'+order.id,patchData);return false;
}
app.get('/api/pagbank/status',(req,res)=>res.json({ok:true,configured:rdsPagBankConfigured(),environment:PAGBANK_ENV,webhook_url:PAGBANK_WEBHOOK_URL||null}));
app.post('/api/pagbank/orders/:id/pix',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');if(req.body?.customer_tax_id){const tax=digits(req.body.customer_tax_id);if(!validCPF(tax))throw new Error('CPF inválido.');await patch('rds10_orders','id=eq.'+o.id,{customer_tax_id:tax,updated_at:nowISO()});}const fresh=await one('rds10_orders','select=*&id=eq.'+o.id);const pix=await rdsPagBankCreatePix(fresh);res.json({ok:true,...pix});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/pagbank/orders/:id/send-pix',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');if(req.body?.customer_tax_id){const tax=digits(req.body.customer_tax_id);if(!validCPF(tax))throw new Error('CPF inválido.');await patch('rds10_orders','id=eq.'+o.id,{customer_tax_id:tax,updated_at:nowISO()});}const fresh=await one('rds10_orders','select=*&id=eq.'+o.id);const pix=await rdsPagBankCreatePix(fresh);await sendPixToIdentity({phone:fresh.phone,remoteJid:fresh.phone},fresh,pix);res.json({ok:true,...pix,sent:true});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.post('/api/pagbank/orders/:id/reconcile',async(req,res)=>{try{const o=await one('rds10_orders','select=*&id=eq.'+req.params.id);if(!o)throw new Error('Pedido não encontrado.');if(!o.pagbank_order_id)throw new Error('Este pedido ainda não possui PIX PagBank gerado.');const data=await rdsPagBankRequest('/orders/'+encodeURIComponent(o.pagbank_order_id));const paid=await rdsApplyPagBankResult(o,data,'consulta');await logEvent('PAGBANK_CONSULTA',{order_id:o.id,order:o.code,pagbank_order_id:o.pagbank_order_id,status:rdsPagBankStatus(data),paid});res.json({ok:true,status:rdsPagBankStatus(data),paid,pagbank_order_id:o.pagbank_order_id,environment:PAGBANK_ENV});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.get('/api/pagbank/orders/:id/qrcode.png',async(req,res)=>{try{const o=await one('rds10_orders','select=pix_copy_paste&id=eq.'+req.params.id);if(!o?.pix_copy_paste)throw new Error('QR Code ainda não disponível.');const image=await QRCode.toBuffer(o.pix_copy_paste,{type:'png',width:700,margin:2});res.set('Content-Type','image/png').set('Cache-Control','no-store').send(image);}catch(e){res.status(404).json({ok:false,error:e.message});}});
app.post('/api/pagbank/webhook',async(req,res)=>{try{if(!rdsPagBankWebhookValid(req)){await logEvent('PAGBANK_WEBHOOK_REJEITADO',{reason:'assinatura_invalida'}).catch(()=>{});return res.status(401).json({ok:false,error:'Assinatura PagBank inválida.'});}const p=req.body||{};const ref=cleanText(p.reference_id||'');const o=ref?await one('rds10_orders','select=*&code=eq.'+encodeURIComponent(ref)):null;await logEvent('PAGBANK_WEBHOOK',{reference_id:ref,pagbank_order_id:p.id||null,status:rdsPagBankStatus(p)});if(!o)return res.json({ok:true,ignored:true});await rdsApplyPagBankResult(o,p,'webhook');return res.json({ok:true});}catch(e){console.error('PAGBANK_WEBHOOK',e.message);return res.status(400).json({ok:false,error:e.message});}});

`;
  source=source.slice(0,pos)+block+source.slice(pos);
}

fs.writeFileSync(generatedPath,source,'utf8');
console.log('[V10.60] generated from server.js with PagBank PIX + webhook + reconciliation');
await import(pathToFileURL(generatedPath).href+'?v=1060');
