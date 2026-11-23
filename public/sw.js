/* Service worker Crypte Néon — cache du shell pour mode installé / hors ligne partiel. */
const CACHE = 'crypte-neon-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API : réseau uniquement (scores / sauvegarde)
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname) || url.pathname === '/')) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      // Navigation : réseau d'abord, sinon cache
      if (req.mode === 'navigate') {
        return network.then((res) => res || cache.match('/index.html'));
      }
      return cached || network;
    }),
  );
});
