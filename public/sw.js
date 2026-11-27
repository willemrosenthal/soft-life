// Offline support. Network first, so a new version shows up as soon as you're online; every
// successful response is cached, so after one visit the app also opens with no connection.
const CACHE = 'softlife-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      // Offline. Pattern links differ only after "#", which never reaches here, so pages match as-is.
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      if (request.mode === 'navigate') return (await cache.match('./')) ?? (await cache.match('./index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});
