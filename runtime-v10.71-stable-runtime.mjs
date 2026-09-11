import fs from 'node:fs';
let source=fs.readFileSync('runtime-v10.70-stable.mjs','utf8');
source=source.replaceAll('?v=1070','?v=1071');
fs.writeFileSync('runtime-v10.71-stable-runtime.mjs',source,'utf8');
await import('./runtime-rds-official-sales-auth-v2.mjs');
await import('./runtime-rds-order-expiration-crm-final.mjs');
await import('./runtime-rds-mercadopago-reconcile-auto.mjs');
