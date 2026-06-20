const CACHE_NAME = 'wc2026-v18';
const META_CACHE = 'wc-meta-v1';
const BROADCAST_META_KEY = '/__last_broadcast_id__';
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

function iconUrl() {
  const base = self.registration?.scope || self.location.href.replace(/sw\.js.*$/, '');
  return new URL('icons/icon-192.png', base).href;
}

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
  if (url.pathname.endsWith('/data.json') || url.pathname.includes('/api/')) {
    event.respondWith(networkFirstData(event.request));
    return;
  }
  if (event.request.method !== 'GET') return;

  if (url.pathname.includes('/js/')) {
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
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    if (response.ok && request.url.includes('data.json')) {
      const clone = response.clone();
      const text = await clone.text();
      const hash = simpleHash(text);
      if (lastDataHash && hash !== lastDataHash) {
        let message = 'มีการอัปเดตสกอร์หรือข้อมูลใหม่';
        let isBroadcast = false;
        try {
          const data = JSON.parse(text);
          const bc = data.broadcast;
          if (bc?.id) {
            const lastBroadcastId = await getStoredBroadcastId();
            if (bc.id > lastBroadcastId) {
              await setStoredBroadcastId(bc.id);
              message = bc.message || 'มีการแจ้งเตือนจากแอดมิน — ตรวจสอบผลล่าสุดในแอป';
              isBroadcast = true;
            }
          }
          if (!isBroadcast) {
            const scoreMsg = await getScoreUpdateMessage(data.matches);
            if (scoreMsg) message = scoreMsg;
          }
        } catch {
          // keep default message
        }
        const msgType = isBroadcast ? 'BROADCAST' : 'DATA_UPDATED';
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const payload = {
          type: msgType,
          message: isBroadcast ? `📢 ${message}` : message
        };
        if (isBroadcast) {
          try {
            const data = JSON.parse(text);
            if (data.broadcast) payload.broadcast = data.broadcast;
          } catch { /* ignore */ }
        }
        clients.forEach((client) => client.postMessage(payload));
        try {
          await self.registration.showNotification(
            isBroadcast ? 'World Cup 2026 — แจ้งเตือนจากแอดมิน' : 'World Cup 2026 — อัปเดตข้อมูล',
            {
              body: message,
              icon: iconUrl(),
              badge: iconUrl(),
              tag: isBroadcast ? 'wc-broadcast' : 'wc-data-update',
              renotify: true
            }
          );
        } catch {
          // permission not granted
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
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: iconUrl(),
      badge: iconUrl(),
      tag: payload.tag || 'wc-broadcast-push',
      data: { url: payload.url || './' }
    })
  );
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
});