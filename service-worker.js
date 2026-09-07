/* MTX Group Retail Suite — Offline-first service worker
   Strategy:
   - App shell (HTML/CSS/JS/assets): cache-first, so the POS opens instantly and works with zero internet.
   - Everything else: network-first with cache fallback.
   Business data lives in IndexedDB (see js/db.js) — one database per store,
   never in the network and never in this cache. */

/* Bump this on every deploy. The shell is served cache-first, so a stale
   cache will keep showing the previous build's HTML/CSS/JS until the name
   changes and `activate` sweeps the old one away. */
const CACHE = 'mtx-shell-v11';

// NOTE: we cache the clean root ('./') only — never './index.html', which some
// static servers 301-redirect to './'. A cached redirected response cannot be
// used to satisfy a navigation request, so caching it would break offline load.
const SHELL = [
  './',
  './manifest.webmanifest',
  './css/styles.css',
  './js/db.js',
  './js/stores.js',
  './js/sync.js',
  './js/ui.js',
  './js/xlsx.js',
  './js/i18n.js',
  './js/seed.js',
  './js/views-core.js',
  './js/views-catchup.js',
  './js/views-catpos.js',
  './js/views-ops.js',
  './js/views-finance.js',
  './js/views-admin.js',
  './js/app.js',
  './assets/mtx-mark.svg',
  './assets/mtx-mark-light.svg',
  './assets/melora-logo.png',
  './assets/bangeen-logo.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png',
  './assets/favicon-16.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // don't touch cross-origin
  // Sync API — always straight to the network, never cached. Matters when the
  // app is served from the same origin as the server (SERVE_STATIC).
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests -> serve the app shell (SPA) from the clean root.
  // Try network first so redirects resolve normally; fall back to cached root offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./') || caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for known shell + assets
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
    })
  );
});
