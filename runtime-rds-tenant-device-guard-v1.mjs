import fs from 'node:fs';

const path='server.js';
let server=fs.readFileSync(path,'utf8');
const marker='// RDS TENANT DEVICE GUARD V1';
if(server.includes(marker)){
  console.log('[RDS] proteção de dispositivo na ponte multi-vendedor já aplicada');
  process.exit(0);
}

const start=server.indexOf('  async function tenantSession(req){');
const end=server.indexOf('  async function requireTenant(req,res){',start);
if(start<0||end<0)throw new Error('Função tenantSession da ponte multi-vendedor não localizada.');
const guarded=`  ${marker}
  async function tenantSession(req){
    // Reutiliza a sessão canônica: valida expiração, revogação, status do vendedor
    // e estado ATIVO do dispositivo associado à sessão.
    if(typeof rdsOpSession!=='function')throw new Error('Autenticação canônica de vendedor indisponível.');
    const s=await rdsOpSession(req);
    if(!s?.seller||s.seller.status!=='ATIVO')return null;
    return {session:s.session,seller:s.seller};
  }
`;
server=server.slice(0,start)+guarded+server.slice(end);
fs.writeFileSync(path,server,'utf8');
console.log('[RDS] proteção de dispositivo aplicada à ponte multi-vendedor');
