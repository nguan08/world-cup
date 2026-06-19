import webpush from 'web-push';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const VAPID_PUBLIC_KEY = 'BNOoMA5zepv6v9hgWjvvKLFlOwQ-HY2kZpIPQdeQoPWKaickGcv0TNoYbtJhNgMmGmlDk7uesXk_ioRSNWBhrDM';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBS_FILE = 'push-subscriptions.json';

if (!VAPID_PRIVATE_KEY) {
  console.error('Missing VAPID_PRIVATE_KEY secret');
  process.exit(1);
}

webpush.setVapidDetails(
  'mailto:nguan08@users.noreply.github.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

const data = loadJson('data.json', {});
const subsFile = loadJson(SUBS_FILE, { subscriptions: [], lastSentBroadcastId: 0 });
const subscriptions = Array.isArray(subsFile.subscriptions) ? subsFile.subscriptions : [];
const bc = data.broadcast;

if (!bc?.id || !bc?.message) {
  console.log('No broadcast to send');
  process.exit(0);
}

if (bc.id <= (subsFile.lastSentBroadcastId || 0) && process.env.FORCE_PUSH !== '1') {
  console.log(`Broadcast #${bc.id} already sent (last=${subsFile.lastSentBroadcastId})`);
  process.exit(0);
}

if (subscriptions.length === 0) {
  console.log('No push subscriptions registered');
  process.exit(0);
}

const payload = JSON.stringify({
  title: 'World Cup 2026 — แจ้งเตือนจากแอดมิน',
  body: String(bc.message).replace(/^\[ทดสอบ\]\s*/, ''),
  tag: `wc-broadcast-${bc.id}`,
  url: './'
});

const deadEndpoints = new Set();
let sent = 0;

await Promise.all(subscriptions.map(async (sub) => {
  if (!sub?.endpoint || !sub?.keys) return;
  try {
    await webpush.sendNotification(sub, payload);
    sent++;
  } catch (e) {
    const code = e.statusCode || 0;
    console.warn(`Push failed (${code}): ${sub.endpoint.slice(0, 48)}…`);
    if (code === 404 || code === 410) deadEndpoints.add(sub.endpoint);
  }
}));

let changed = false;
if (deadEndpoints.size > 0) {
  subsFile.subscriptions = subscriptions.filter((s) => !deadEndpoints.has(s.endpoint));
  changed = true;
  console.log(`Removed ${deadEndpoints.size} expired subscription(s)`);
}

if (sent > 0 || process.env.FORCE_PUSH === '1') {
  subsFile.lastSentBroadcastId = bc.id;
  changed = true;
}

if (changed) {
  writeFileSync(SUBS_FILE, `${JSON.stringify(subsFile, null, 2)}\n`);
}

console.log(`Sent ${sent}/${subscriptions.length} push notification(s) for broadcast #${bc.id}`);