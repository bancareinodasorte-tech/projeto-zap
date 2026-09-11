import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS OFFICIAL SALES DIAGNOSTICS V1';
if(server.includes(marker)){
  console.log('[RDS] diagnóstico oficial V1 já aplicado');
  process.exit(0);
}

const listen="app.listen(PORT,async()=>{";
const pos=server.indexOf(listen);
if(pos<0)throw new Error('app.listen não localizado para diagnóstico oficial V1.');

const block=String.raw`
${marker}
function rdsOfficialDiagV1(){
  return {
    api:'https://api.reinodasorte.com.br',
    emailPresent:Boolean(String(process.env.RDS_OFFICIAL_EMAIL||'').trim()),
    passwordPresent:Boolean(String(process.env.RDS_OFFICIAL_PASSWORD||'').trim()),
    encryptionKeyPresent:Boolean(String(process.env.RDS_OFFICIAL_AUTH_ENCRYPTION_KEY||'').trim()),
    deviceIdEnvPresent:Boolean(String(process.env.RDS_OFFICIAL_DEVICE_ID||'').trim())
  };
}
app.get('/api/v1011/official-sales/diagnostics',async(req,res)=>{
  try{
    const d=rdsOfficialDiagV1();
    const row=await one('rds10_official_sales_auth','select=id,email,device_id,refresh_token_enc,last_auth_at,last_error&id=eq.main');
    return res.json({...d,deviceRowPresent:Boolean(row),deviceIdStoredPresent:Boolean(String(row?.device_id||'').trim()),authorized:Boolean(row?.refresh_token_enc),lastAuthAt:row?.last_auth_at||null,lastError:row?.last_error||null});
  }catch(e){return res.status(500).json({ ...rdsOfficialDiagV1(), error:String(e?.message||e) });}
});

setTimeout(async()=>{
  try{
    const d=rdsOfficialDiagV1();
    const row=await one('rds10_official_sales_auth','select=id,email,device_id,refresh_token_enc,last_auth_at,last_error&id=eq.main');
    console.log('[RDS] OFICIAL DIAG V1 email='+d.emailPresent+' password='+d.passwordPresent+' key='+d.encryptionKeyPresent+' deviceEnv='+d.deviceIdEnvPresent+' deviceRow='+Boolean(row)+' deviceStored='+Boolean(String(row?.device_id||'').trim())+' authorized='+Boolean(row?.refresh_token_enc)+' lastAuth='+(row?.last_auth_at||'-')+' lastError='+(row?.last_error?'PRESENT':'-'));
  }catch(e){console.warn('[RDS] OFICIAL DIAG V1 falhou:',e?.message||e);}
},4000);
`;

server=server.slice(0,pos)+block+'\n'+server.slice(pos);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] diagnóstico oficial V1 aplicado');
