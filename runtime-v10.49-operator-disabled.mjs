import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(dir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// V10.49: operator authentication temporarily disabled while commercial flow is stabilized.
// Keep auth-v10.34.js in the repository; it will be re-enabled only in the final security closure.
html = html.replace(/<script\s+src=["']auth-v10\.34\.js[^>]*><\/script>\s*/i, '');
fs.writeFileSync(indexPath, html, 'utf8');
console.log('[V10.49] acesso do operador temporariamente desativado; operação liberada');
await import('./server.js');
