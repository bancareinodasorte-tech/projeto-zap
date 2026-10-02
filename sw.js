// RDS SERVICE WORKER V12 — cache reset for unified access
const CACHE='rds-v12-unified';
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
// Intentionally no fetch handler: during the unified-access rollout,
// HTML/JS must always come directly from the server without stale cache.
