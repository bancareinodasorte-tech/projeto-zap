import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS MERCADO PAGO OAUTH V1';
if(server.includes(marker)){
  console.log('[RDS] OAuth Mercado Pago já aplicado');
  process.exit(0);
}

const beforeRoute="app.get('*',(req,res)=>res.sendFile(__dirname + '/index.html'));";
const pos=server.indexOf(beforeRoute);
if(pos<0)throw new Error('catch-all não localizado para OAuth Mercado Pago.');

const block=String.raw`
${marker}
function rdsMpOAuthClientId(){return String(process.env.MERCADOPAGO_CLIENT_ID||process.env.MERCADOPAGO_OAUTH_CLIENT_ID||process.env.MP_CLIENT_ID||'').trim();}
function rdsMpOAuthClientSecret(){return String(process.env.MERCADOPAGO_CLIENT_SECRET||process.env.MERCADOPAGO_OAUTH_CLIENT_SECRET||process.env.MP_CLIENT_SECRET||'').trim();}
function rdsMpOAuthRedirectUri(){const base=String(process.env.MERCADOPAGO_REDIRECT_URI||'').trim();if(base)return base;const origin=String(process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL||'').trim().replace(/\/+$/,'');return (origin?origin:'https://projeto-zap-4tyg.onrender.com')+'/api/mercadopago/oauth/callback';}
const MERCADOPAGO_OAUTH_AUTH_URL='https://auth.mercadopago.com/authorization';
const MERCADOPAGO_OAUTH_TOKEN_URL='https://api.mercadopago.com/oauth/token';
const MERCADOPAGO_OAUTH_PKCE=String(process.env.MERCADOPAGO_OAUTH_PKCE||'false').toLowerCase()==='true';
function rdsMpOAuthHash(v){return crypto.createHash('sha256').update(String(v)).digest('hex');}
function rdsMpOAuthVerifier(){return crypto.randomBytes(48).toString('base64url');}
function rdsMpOAuthChallenge(v){return crypto.createHash('sha256').update(String(v)).digest('base64url');}
function rdsMpOAuthConfigured(){return Boolean(rdsMpOAuthClientId()&&rdsMpOAuthClientSecret());}
async function rdsMpOAuthStart(req,res){
  const session=await rdsOpRequire(req,res);if(!session)return;
  if(!rdsMpOAuthConfigured())return res.status(503).json({success:false,error:'OAuth do Mercado Pago ainda não está configurado no servidor.'});
  const state=crypto.randomBytes(32).toString('base64url');
  const verifier=MERCADOPAGO_OAUTH_PKCE?rdsMpOAuthVerifier():null;
  const expires=new Date(Date.now()+10*60*1000).toISOString();
  await insert('rds10_mercadopago_oauth_states',{seller_id:session.seller.id,state_hash:rdsMpOAuthHash(state),code_verifier:verifier,expires_at:expires,created_at:nowISO()},'minimal');
  const q=new URLSearchParams({
    client_id:rdsMpOAuthClientId(),
    response_type:'code',
    platform_id:'mp',
    state,
    redirect_uri:rdsMpOAuthRedirectUri(),
    scope:'offline_access read write'
  });
  if(verifier){q.set('code_challenge',rdsMpOAuthChallenge(verifier));q.set('code_challenge_method','S256');}
  const authorizationUrl=MERCADOPAGO_OAUTH_AUTH_URL+'?'+q.toString();
  if(String(req.query?.redirect||'')==='1')return res.redirect(302,authorizationUrl);
  return res.json({success:true,url:authorizationUrl,expiresAt:expires,pkce:MERCADOPAGO_OAUTH_PKCE});
}
async function rdsMpOAuthCallback(req,res){
  try{
    const code=cleanText(req.query?.code),state=cleanText(req.query?.state),error=cleanText(req.query?.error),errorDescription=cleanText(req.query?.error_description);
    if(error)return res.status(400).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Mercado Pago</title><style>body{font-family:Arial;padding:32px;color:#17325c} .card{max-width:620px;margin:auto;padding:28px;border:1px solid #dbe6f7;border-radius:18px}</style><div class="card"><h2>Conexão Mercado Pago não concluída</h2><p>'+String(errorDescription||error).replace(/[<>&]/g,'')+'</p><p>Você pode fechar esta janela e tentar novamente pelo RDS.</p></div></html>');
    if(!code||!state)throw new Error('Retorno OAuth incompleto.');
    const row=await one('rds10_mercadopago_oauth_states','select=id,seller_id,code_verifier,expires_at,used_at&state_hash=eq.'+encodeURIComponent(rdsMpOAuthHash(state)));
    if(!row)throw new Error('Solicitação OAuth inválida ou expirada.');
    if(row.used_at)throw new Error('Esta autorização já foi utilizada.');
    if(new Date(row.expires_at).getTime()<=Date.now())throw new Error('A autorização expirou. Inicie uma nova conexão.');
    if(!rdsMpOAuthConfigured())throw new Error('OAuth do Mercado Pago não configurado no servidor.');
    const form=new URLSearchParams({
      client_id:rdsMpOAuthClientId(),
      client_secret:rdsMpOAuthClientSecret(),
      grant_type:'authorization_code',
      code,
      redirect_uri:rdsMpOAuthRedirectUri()
    });
    if(row.code_verifier)form.set('code_verifier',row.code_verifier);
    const tokenResponse=await fetch(MERCADOPAGO_OAUTH_TOKEN_URL,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
    const raw=await tokenResponse.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}
    if(!tokenResponse.ok)throw new Error('Mercado Pago recusou a autorização ('+tokenResponse.status+').');
    const accessToken=cleanText(data.access_token),refreshToken=cleanText(data.refresh_token);
    if(!accessToken)throw new Error('Mercado Pago não retornou Access Token.');
    const live=Boolean(data.live_mode);
    const expiresAt=data.expires_in?new Date(Date.now()+Number(data.expires_in)*1000).toISOString():null;
    await sb('/rest/v1/rds10_seller_settings?on_conflict=seller_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({
      seller_id:row.seller_id,
      mp_public_key:cleanText(data.public_key)||null,
      mp_access_token_enc:rdsOpEnc(accessToken),
      mp_refresh_token_enc:refreshToken?rdsOpEnc(refreshToken):null,
      mp_environment:live?'production':'sandbox',
      mp_user_id:data.user_id?String(data.user_id):null,
      mp_token_expires_at:expiresAt,
      mp_oauth_scope:cleanText(data.scope)||null,
      mp_oauth_connected_at:nowISO(),
      updated_at:nowISO()
    })});
    await patch('rds10_mercadopago_oauth_states','id=eq.'+encodeURIComponent(row.id),{used_at:nowISO()});
    return res.send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mercado Pago conectado</title><style>body{font-family:Arial;background:#f3f7ff;padding:28px;color:#17325c}.card{max-width:620px;margin:40px auto;background:white;padding:30px;border-radius:20px;box-shadow:0 8px 30px #17325c14;text-align:center}.ok{color:#146b35;font-size:20px;font-weight:800}button{padding:12px 18px;border:0;border-radius:12px;background:#0b3f86;color:white;font-weight:800}</style><div class="card"><div class="ok">✓ Mercado Pago conectado com sucesso</div><p>A conta do vendedor foi vinculada ao RDS e as credenciais foram protegidas no servidor.</p><button type="button" onclick="window.location.href=&quot;/?rds=account&amp;mp=connected&quot;">Voltar para o RDS</button></div></html>');
  }catch(e){
    console.error('[RDS MP OAuth] callback:',e.message);
    return res.status(400).send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Mercado Pago</title><style>body{font-family:Arial;padding:32px;color:#17325c}.card{max-width:620px;margin:auto;padding:28px;border:1px solid #dbe6f7;border-radius:18px}</style><div class="card"><h2>Não foi possível conectar o Mercado Pago</h2><p>'+String(e?.message||e).replace(/[<>&]/g,'')+'</p><p>Feche esta janela e tente novamente pelo RDS.</p></div></html>');
  }
}
app.get('/api/mercadopago/oauth/start',async(req,res)=>{
  try{
    console.log('[RDS MP OAuth] início da autorização');
    return await rdsMpOAuthStart(req,res);
  }catch(e){
    console.error('[RDS MP OAuth] falha ao iniciar:',e?.message||e);
    return res.status(500).json({success:false,error:String(e?.message||e)});
  }
});
app.get('/api/mercadopago/oauth/callback',rdsMpOAuthCallback);
app.get('/api/operator/mercadopago/status',async(req,res)=>{
  try{
    const session=await rdsOpRequire(req,res);if(!session)return;
    const row=await one('rds10_seller_settings','select=mp_public_key,mp_environment,mp_user_id,mp_token_expires_at,mp_oauth_scope,mp_oauth_connected_at&seller_id=eq.'+session.seller.id);
    const expires=row?.mp_token_expires_at?new Date(row.mp_token_expires_at).getTime():0;
    return res.json({success:true,configured:Boolean(row?.mp_public_key||row?.mp_user_id),oauthConfigured:rdsMpOAuthConfigured(),environment:row?.mp_environment||null,publicKey:row?.mp_public_key||null,userId:row?.mp_user_id||null,tokenExpiresAt:row?.mp_token_expires_at||null,tokenExpired:Boolean(expires&&expires<=Date.now()),scope:row?.mp_oauth_scope||null,connectedAt:row?.mp_oauth_connected_at||null,pkce:MERCADOPAGO_OAUTH_PKCE});
  }catch(e){return res.status(500).json({success:false,error:String(e?.message||e)});}
});
app.post('/api/operator/mercadopago/oauth/disconnect',async(req,res)=>{
  try{
    const session=await rdsOpRequire(req,res);if(!session)return;
    await patch('rds10_seller_settings','seller_id=eq.'+session.seller.id,{mp_public_key:null,mp_access_token_enc:null,mp_refresh_token_enc:null,mp_user_id:null,mp_token_expires_at:null,mp_oauth_scope:null,mp_oauth_connected_at:null,updated_at:nowISO()});
    return res.json({success:true});
  }catch(e){return res.status(400).json({success:false,error:String(e?.message||e)});}
});
console.log('[RDS] OAuth Mercado Pago V1 aplicado');
console.log('[RDS] MP OAuth env: client='+Boolean(rdsMpOAuthClientId())+' secret='+Boolean(rdsMpOAuthClientSecret())+' redirect='+rdsMpOAuthRedirectUri());
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] OAuth Mercado Pago V1 aplicado');
