import { VAPID_PUBLIC_KEY } from './push-config.js';
import { GITHUB_PUSH_SUBS_FILE } from './github-config.js';
import { getGitHubWriteToken } from './admin.js';
import { app } from './state.js';
import { fetchGitHubJsonFile, putGitHubJsonFile, githubAuthHeaders } from './github-api.js';
import { isStandalonePWA, isIOS } from './device.js';

const LOCAL_SUB_KEY = 'worldcup_push_endpoint';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function subscriptionToRecord(sub) {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint,
    keys: json.keys,
    updatedAt: new Date().toISOString()
  };
}

export async function subscribeAndRegisterPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (isIOS() && !isStandalonePWA()) {
    return { ok: false, reason: 'ios-need-pwa' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'no-permission' };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    await savePushSubscription(sub);
    localStorage.setItem(LOCAL_SUB_KEY, sub.endpoint);
    return { ok: true };
  } catch (e) {
    console.warn('[Push] subscribe failed', e);
    return { ok: false, reason: e.message || 'subscribe-failed' };
  }
}

export async function savePushSubscription(subscription) {
  const token = getGitHubWriteToken({ allowPushRegister: true });
  if (!token) throw new Error('ไม่มีสิทธิ์ลงทะเบียน Push');

  const record = subscriptionToRecord(subscription);
  let file = { subscriptions: [], lastSentBroadcastId: 0 };
  try {
    const { data } = await fetchGitHubJsonFile(GITHUB_PUSH_SUBS_FILE, token);
    if (data?.subscriptions) file = data;
  } catch {
    // new file
  }

  const idx = file.subscriptions.findIndex((s) => s.endpoint === record.endpoint);
  if (idx >= 0) file.subscriptions[idx] = record;
  else file.subscriptions.push(record);

  await putGitHubJsonFile(
    GITHUB_PUSH_SUBS_FILE,
    file,
    token,
    'Register Web Push subscription'
  );
}

export async function triggerPushWorkflow() {
  const token = getGitHubWriteToken({ allowPushRegister: false });
  if (!token || !app?.isAdmin) return false;
  try {
    const res = await fetch(
      'https://api.github.com/repos/nguan08/world-cup/actions/workflows/send-push.yml/dispatches',
      {
        method: 'POST',
        headers: {
          ...githubAuthHeaders(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}