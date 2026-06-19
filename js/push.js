import { VAPID_PUBLIC_KEY } from './push-config.js';
import { GITHUB_PUSH_SUBS_FILE } from './github-config.js';
import { getGitHubWriteToken } from './admin.js';
import { app } from './state.js';
import { fetchGitHubJsonFile, putGitHubJsonFile, githubAuthHeaders } from './github-api.js';
import { isStandalonePWA, isIOS } from './device.js';
import { waitForServiceWorker } from './pwa.js';

const LOCAL_SUB_KEY = 'worldcup_push_endpoint';
const LOCAL_REGISTERED_KEY = 'worldcup_push_registered';

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

export function isPushRegisteredLocally() {
  return Boolean(localStorage.getItem(LOCAL_SUB_KEY) && localStorage.getItem(LOCAL_REGISTERED_KEY));
}

function isShaConflict(err) {
  const msg = String(err?.message || '');
  return err?.status === 409 || /does not match/i.test(msg);
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
    const reg = await waitForServiceWorker();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    try {
      await savePushSubscription(sub);
      localStorage.setItem(LOCAL_SUB_KEY, sub.endpoint);
      localStorage.setItem(LOCAL_REGISTERED_KEY, new Date().toISOString());
      return { ok: true };
    } catch (saveErr) {
      console.warn('[Push] save subscription failed', saveErr);
      return { ok: false, reason: 'save-failed', message: saveErr.message };
    }
  } catch (e) {
    console.warn('[Push] subscribe failed', e);
    return { ok: false, reason: e.message || 'subscribe-failed' };
  }
}

export async function savePushSubscription(subscription) {
  const token = getGitHubWriteToken({ allowPushRegister: true });
  if (!token) throw new Error('ไม่มีสิทธิ์ลงทะเบียน Push');

  const record = subscriptionToRecord(subscription);
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

    try {
      await putGitHubJsonFile(
        GITHUB_PUSH_SUBS_FILE,
        file,
        token,
        'Register Web Push subscription'
      );
      return;
    } catch (e) {
      if (isShaConflict(e) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw e;
    }
  }
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

export async function showLocalPushTestNotification() {
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await waitForServiceWorker();
    await reg.showNotification('World Cup 2026 — ทดสอบแจ้งเตือน', {
      body: 'ถ้าเห็นข้อความนี้บนหน้าจอ แจ้งเตือนนอกแอปทำงานแล้ว',
      tag: 'wc-push-test',
      renotify: true
    });
    return true;
  } catch {
    return false;
  }
}