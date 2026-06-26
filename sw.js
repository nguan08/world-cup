const CACHE_NAME = 'wc2026-v61-fetch-fallback';
const META_CACHE = 'wc-meta-v1';
const BROADCAST_META_KEY = '/__last_broadcast_id__';
const MOBILE_NO_NOTIF_KEY = '/__mobile_no_update_notif__';
const STATIC_ASSETS = [
  './',
  'index.html',
  'style.css',
  'js/main.js',
  'js/bundle.js',
  'js/constants.js',
  'js/state.js',
  'js/utils.js',
  'js/scoring.js',
  'js/sync.js',
  'js/persist.js',
  'js/github-config.js',
  'js/admin.js',
  'js/notifications.js',
  'js/pwa.js',
  'js/app-path.js',
  'js/device.js',
  'js/push-config.js',
  'js/push.js',
  'js/github-api.js',
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

let lastDataHash = '';
const NOTIFICATION_TAG = 'wc-latest';

async function closeAllNotifications() {
  const notifications = await self.registration.getNotifications();
  notifications.forEach((n) => n.close());
}

async function setMobileNoUpdateNotif(enabled) {
  const cache = await caches.open(META_CACHE);
  await cache.put(MOBILE_NO_NOTIF_KEY, new Response(enabled ? '1' : '0'));
}

async function isMobileNoUpdateNotif() {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match(MOBILE_NO_NOTIF_KEY);
  if (!res) return false;
  return (await res.text()) === '1';
}

function iconUrl() {
  const base = self.registration?.scope || self.location.href.replace(/sw\.js.*$/, '');
  return new URL('icons/icon-192.png', base).href;
}

async function cacheStaticAssets(cache) {
  await Promise.all(STATIC_ASSETS.map(async (asset) => {
    try {
      await cache.add(asset);
    } catch (e) {
      console.warn('[SW] cache skip', asset, e);
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cacheStaticAssets(cache))
      .then(() => self.skipWaiting())
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
  if (url.pathname.endsWith('/data.json') || url.pathname.includes('/api/')) {
    event.respondWith(networkFirstData(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;

  if (url.pathname.includes('/js/')) {
    event.respondWith(respondWithCacheThenNetwork(event.request, { updateCache: true }));
    return;
  }

  event.respondWith(respondWithCacheThenNetwork(event.request));
});

async function respondWithCacheThenNetwork(request, { updateCache = false } = {}) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (updateCache && response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    console.warn('[SW] network failed, no cache:', request.url, err);
    const fallback = await caches.match(request);
    if (fallback) return fallback;
    if (request.mode === 'navigate') {
      const shell = await caches.match('./') || await caches.match('index.html');
      if (shell) return shell;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkFirstData(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    if (response.ok && request.url.includes('data.json')) {
      const clone = response.clone();
      const text = await clone.text();
      const hash = simpleHash(text);
      if (lastDataHash && hash !== lastDataHash) {
        let scoreMsg = '';
        try {
          const data = JSON.parse(text);
          const bc = data.broadcast;
          if (bc?.id) {
            const lastBroadcastId = await getStoredBroadcastId();
            if (bc.id > lastBroadcastId) {
              await setStoredBroadcastId(bc.id);
            }
          }
          scoreMsg = await getScoreUpdateMessage(data.matches);
        } catch {
          // ignore parse errors
        }

        if (scoreMsg && !(await isMobileNoUpdateNotif())) {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          const hasVisibleClient = clients.some((client) => client.visibilityState === 'visible');
          clients.forEach((client) => {
            client.postMessage({ type: 'SCORE_UPDATED', message: scoreMsg });
          });
          if (!hasVisibleClient) {
            try {
              await closeAllNotifications();
              await self.registration.showNotification('World Cup 2026 — อัปเดตสกอร์', {
                body: scoreMsg.replace(/^⚽\s*/, ''),
                icon: iconUrl(),
                badge: iconUrl(),
                tag: NOTIFICATION_TAG,
                renotify: true
              });
            } catch {
              // permission not granted
            }
          }
        }
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

async function getStoredBroadcastId() {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match(BROADCAST_META_KEY);
  if (!res) return 0;
  return Number(await res.text()) || 0;
}

async function setStoredBroadcastId(id) {
  const cache = await caches.open(META_CACHE);
  await cache.put(BROADCAST_META_KEY, new Response(String(id)));
}

const MATCHES_META_KEY = '/__last_matches_scores__';

function matchScoreKey(m) {
  if (!m) return '';
  return `${m.id}:${m.homeScore ?? 'n'}-${m.awayScore ?? 'n'}-${m.status || 'pending'}`;
}

async function getStoredMatchScores() {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match(MATCHES_META_KEY);
  if (!res) return {};
  try {
    return JSON.parse(await res.text());
  } catch {
    return {};
  }
}

async function setStoredMatchScores(map) {
  const cache = await caches.open(META_CACHE);
  await cache.put(MATCHES_META_KEY, new Response(JSON.stringify(map)));
}

async function getScoreUpdateMessage(matches) {
  if (!Array.isArray(matches) || !matches.length) return '';
  const prev = await getStoredMatchScores();
  const next = {};
  const changed = [];

  for (const m of matches) {
    next[String(m.id)] = matchScoreKey(m);
    const old = prev[String(m.id)];
    if (old && old !== next[String(m.id)] && (m.homeScore != null || m.status === 'finished')) {
      changed.push(m);
    }
  }

  await setStoredMatchScores(next);
  if (!changed.length) return '';

  const last = changed[changed.length - 1];
  const line = `${last.home} ${last.homeScore ?? '-'}-${last.awayScore ?? '-'} ${last.away}`;
  if (changed.length === 1) return `⚽ อัปเดตสกอร์: ${line}`;
  return `⚽ อัปเดตสกอร์ ${changed.length} นัด — ${line}`;
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'DATA_UPDATED', message }));
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    if (await isMobileNoUpdateNotif()) return;

    let payload = {
      title: 'World Cup 2026 — แจ้งเตือนจากแอดมิน',
      body: 'ตรวจสอบผลล่าสุดในแอป',
      tag: 'wc-broadcast-push',
      url: './'
    };
    try {
      if (event.data) payload = { ...payload, ...event.data.json() };
    } catch {
      // keep defaults
    }

    await closeAllNotifications();
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: iconUrl(),
      badge: iconUrl(),
      tag: NOTIFICATION_TAG,
      renotify: true,
      data: { url: payload.url || './' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      const base = self.registration?.scope || self.location.href.replace(/sw\.js.*$/, '');
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL(targetUrl, base).href);
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'DISABLE_MOBILE_UPDATE_NOTIF') {
    event.waitUntil(setMobileNoUpdateNotif(true));
  }
  if (event.data?.type === 'ENABLE_MOBILE_UPDATE_NOTIF') {
    event.waitUntil(setMobileNoUpdateNotif(false));
  }
});