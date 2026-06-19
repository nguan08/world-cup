const CACHE_NAME = 'wc2026-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/js/main.js',
  '/js/bundle.js',
  '/js/constants.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/scoring.js',
  '/js/sync.js',
  '/js/persist.js',
  '/js/admin.js',
  '/js/notifications.js',
  '/js/pwa.js',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

let lastDataHash = '';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/data.json' || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstData(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;

  // Always fetch JS modules from network first (avoid stale bundles after deploy)
  if (url.pathname.startsWith('/js/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

async function networkFirstData(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.url.includes('data.json')) {
      const clone = response.clone();
      const text = await clone.text();
      const hash = simpleHash(text);
      if (lastDataHash && hash !== lastDataHash) {
        await notifyClients('มีการอัปเดตผลการแข่งขันหรือข้อมูลผู้เล่นใหม่');
        await self.registration.showNotification('World Cup 2026 — อัปเดตข้อมูล', {
          body: 'มีการอัปเดตผลการแข่งขันหรือข้อมูลผู้เล่นใหม่',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'wc-data-update',
          renotify: true
        });
      }
      lastDataHash = hash;
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return String(h);
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'DATA_UPDATED', message }));
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});