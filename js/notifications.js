// In-app toast + browser notifications for data updates

import { resolveAppPath } from './app-path.js';
import { canUseWebNotifications, isIOS, isMobileDevice, isStandalonePWA } from './device.js';
import {
  isPushRegisteredLocally,
  showLocalPushTestNotification,
  subscribeAndRegisterPush
} from './push.js';

let toastTimer = null;
let currentBannerId = 0;

const SHOWN_BROADCAST_KEY = 'worldcup_shownBroadcastId';
const PENDING_BROADCAST_KEY = 'worldcup_pendingBroadcast';
const BROADCAST_STALE_MS = 24 * 60 * 60 * 1000;

export function initNotifications() {
  if (!localStorage.getItem(SHOWN_BROADCAST_KEY) && localStorage.getItem('worldcup_lastBroadcastId')) {
    localStorage.setItem(SHOWN_BROADCAST_KEY, localStorage.getItem('worldcup_lastBroadcastId'));
  }

  injectToastStyles();
  ensureToastElement();
  bindBroadcastBannerClose();
  renderNotificationControls();
  flushPendingBroadcast();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, message, broadcast } = event.data || {};
      if (broadcast) updateBroadcastBanner(broadcast);
      if (type === 'DATA_UPDATED' || type === 'BROADCAST') {
        displayBroadcastMessage(message || 'มีการอัปเดตข้อมูลใหม่', {
          browserType: type === 'BROADCAST' ? 'broadcast' : 'data',
          markShown: false
        });
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) flushPendingBroadcast();
  });
  window.addEventListener('pageshow', flushPendingBroadcast);
  window.addEventListener('focus', flushPendingBroadcast);
}

export function getNotificationPermission() {
  if (!canUseWebNotifications()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!canUseWebNotifications()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function getBroadcastMessage(bc) {
  return bc?.message || 'มีการแจ้งเตือนจากแอดมิน — ตรวจสอบผลล่าสุดในแอป';
}

function markBroadcastShown(id) {
  localStorage.setItem(SHOWN_BROADCAST_KEY, String(id));
  localStorage.removeItem(PENDING_BROADCAST_KEY);
  hideBroadcastBanner();
}

function queuePendingBroadcast(bc) {
  localStorage.setItem(PENDING_BROADCAST_KEY, JSON.stringify(bc));
}

function bindBroadcastBannerClose() {
  const btn = document.getElementById('broadcast-alert-close');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    if (currentBannerId) markBroadcastShown(currentBannerId);
    else hideBroadcastBanner();
  });
}

export function updateBroadcastBanner(bc) {
  bindBroadcastBannerClose();
  const bar = document.getElementById('broadcast-alert-bar');
  const textEl = document.getElementById('broadcast-alert-text');
  if (!bar || !textEl || !bc?.id) {
    hideBroadcastBanner();
    return false;
  }

  const shownId = Number(localStorage.getItem(SHOWN_BROADCAST_KEY) || 0);
  if (bc.id <= shownId) {
    hideBroadcastBanner();
    return false;
  }

  currentBannerId = bc.id;
  textEl.textContent = getBroadcastMessage(bc);
  bar.hidden = false;
  requestAnimationFrame(() => {
    bar.classList.add('broadcast-alert-bar--visible');
    const h = bar.offsetHeight;
    document.documentElement.style.setProperty('--broadcast-banner-height', `${h}px`);
    document.documentElement.classList.add('has-broadcast-banner');
  });
  return true;
}

export function hideBroadcastBanner() {
  const bar = document.getElementById('broadcast-alert-bar');
  if (!bar) return;
  bar.classList.remove('broadcast-alert-bar--visible');
  document.documentElement.classList.remove('has-broadcast-banner');
  document.documentElement.style.removeProperty('--broadcast-banner-height');
  setTimeout(() => {
    if (!bar.classList.contains('broadcast-alert-bar--visible')) bar.hidden = true;
  }, 350);
  currentBannerId = 0;
}

export function flushPendingBroadcast() {
  if (document.hidden) return;
  const raw = localStorage.getItem(PENDING_BROADCAST_KEY);
  if (!raw) return;
  try {
    const bc = JSON.parse(raw);
    if (!bc?.id) return;
    updateBroadcastBanner(bc);
    const shownId = Number(localStorage.getItem(SHOWN_BROADCAST_KEY) || 0);
    if (bc.id <= shownId) {
      localStorage.removeItem(PENDING_BROADCAST_KEY);
      return;
    }
    displayBroadcastMessage(`📢 ${getBroadcastMessage(bc)}`, {
      browserType: 'broadcast',
      markShown: false,
      broadcastId: bc.id
    });
  } catch {
    localStorage.removeItem(PENDING_BROADCAST_KEY);
  }
}

export function processBroadcast(serverData, { onInit = false } = {}) {
  const bc = serverData?.broadcast;
  if (!bc?.id) {
    hideBroadcastBanner();
    return false;
  }

  const shownId = Number(localStorage.getItem(SHOWN_BROADCAST_KEY) || 0);
  const isUnread = bc.id > shownId;

  if (isUnread) {
    updateBroadcastBanner(bc);
  } else {
    hideBroadcastBanner();
    return false;
  }

  if (onInit && shownId === 0 && bc.sentAt) {
    const age = Date.now() - Date.parse(bc.sentAt);
    if (Number.isFinite(age) && age > BROADCAST_STALE_MS) {
      markBroadcastShown(bc.id);
      return false;
    }
  }

  if (document.hidden) {
    queuePendingBroadcast(bc);
    showBrowserNotification(`📢 ${getBroadcastMessage(bc)}`, 'broadcast');
    return true;
  }

  displayBroadcastMessage(`📢 ${getBroadcastMessage(bc)}`, {
    browserType: 'broadcast',
    markShown: false,
    broadcastId: bc.id
  });
  return true;
}

function displayBroadcastMessage(text, { browserType = 'data', markShown = false, broadcastId = null } = {}) {
  showUpdateToast(text);
  if (isMobileDevice() && navigator.vibrate) {
    try { navigator.vibrate([120, 60, 120]); } catch { /* ignore */ }
  }
  showBrowserNotification(text, browserType);

  if (markShown && broadcastId) {
    markBroadcastShown(broadcastId);
  }
}

export function notifyDataUpdate({ type = 'data', message, forceBrowserNotify = false } = {}) {
  const text = message || (type === 'data'
    ? 'มีการอัปเดตผลการแข่งขันหรือข้อมูลผู้เล่นใหม่'
    : 'มีการอัปเดตแอป');

  showUpdateToast(text);

  const shouldShowBrowser = forceBrowserNotify
    || type === 'broadcast'
    || document.hidden;

  if (shouldShowBrowser) {
    showBrowserNotification(text, type);
  }
}

async function showBrowserNotification(text, type = 'data') {
  if (!canUseWebNotifications() || Notification.permission !== 'granted') return;

  const title = type === 'broadcast'
    ? 'World Cup 2026 — แจ้งเตือนจากแอดมิน'
    : 'World Cup 2026 — อัปเดตข้อมูล';
  const options = {
    body: text.replace(/^📢\s*/, ''),
    icon: resolveAppPath('icons/icon-192.png'),
    badge: resolveAppPath('icons/icon-192.png'),
    tag: type === 'broadcast' ? 'wc-broadcast' : 'wc-data-update',
    renotify: true
  };

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // fallback below
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignore
  }
}

export function showUpdateToast(message) {
  const toast = ensureToastElement();
  const textEl = toast.querySelector('.update-toast__text');
  textEl.textContent = message;
  toast.classList.remove('update-toast--visible');
  void toast.offsetWidth;
  toast.classList.add('update-toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('update-toast--visible'), 12000);
}

function ensureToastElement() {
  let toast = document.getElementById('update-toast');
  if (toast) return toast;

  toast = document.createElement('div');
  toast.id = 'update-toast';
  toast.className = 'update-toast';
  toast.innerHTML = `
    <span class="update-toast__icon" aria-hidden="true">🔔</span>
    <span class="update-toast__text"></span>
    <button type="button" class="update-toast__close" aria-label="ปิด">×</button>
  `;
  toast.querySelector('.update-toast__close').addEventListener('click', () => {
    toast.classList.remove('update-toast--visible');
  });
  document.documentElement.appendChild(toast);
  return toast;
}

function pushStatusLabel(perm, pushResult = null) {
  if (perm === 'unsupported') {
    return isIOS() && !isStandalonePWA()
      ? 'iOS: ติดตั้งแอปก่อน แล้วกดเปิดแจ้งเตือน'
      : 'เบราว์เซอร์ไม่รองรับแจ้งเตือนนอกแอป';
  }
  if (perm === 'denied') return 'ถูกปฏิเสธ — เปิดในการตั้งค่าเบราว์เซอร์';
  if (perm !== 'granted') {
    return isMobileDevice() ? 'กดเปิดเพื่อรับแจ้งเตือนนอกแอป' : 'ยังไม่ได้เปิด';
  }
  if (pushResult?.reason === 'ios-need-pwa') {
    return 'อนุญาตแล้ว — ติดตั้งแอปก่อนเพื่อ Push นอกแอป';
  }
  if (pushResult?.reason === 'save-failed') {
    return `ลงทะเบียน Push ไม่สำเร็จ — ลองอีกครั้ง`;
  }
  if (isPushRegisteredLocally()) return 'เปิดแจ้งเตือนนอกแอปแล้ว ✓';
  return 'อนุญาตแล้ว — กดลงทะเบียน Push อีกครั้ง';
}

function renderNotificationControls() {
  const box = document.getElementById('notification-settings');
  if (!box || box.dataset.ready) return;
  box.dataset.ready = '1';

  const statusEl = box.querySelector('[data-notif-status]');
  const btn = box.querySelector('[data-notif-enable]');
  if (!btn) return;

  const refreshUi = (pushResult = null) => {
    const perm = getNotificationPermission();
    if (statusEl) statusEl.textContent = pushStatusLabel(perm, pushResult);

    if (perm === 'unsupported') {
      btn.disabled = false;
      btn.textContent = isIOS() && !isStandalonePWA() ? 'วิธีติดตั้งแอป' : 'ดูแถบแจ้งเตือนด้านบน';
      return;
    }
    if (perm === 'denied') {
      btn.disabled = true;
      btn.textContent = 'เปิดในการตั้งค่าเบราว์เซอร์';
      return;
    }
    if (perm === 'granted' && isPushRegisteredLocally()) {
      btn.disabled = false;
      btn.textContent = 'ทดสอบแจ้งเตือนนอกแอป';
      return;
    }
    btn.disabled = false;
    btn.textContent = perm === 'granted' ? 'ลงทะเบียน Push นอกแอป' : 'เปิดการแจ้งเตือน';
  };

  refreshUi();

  btn.addEventListener('click', async () => {
    const perm = getNotificationPermission();

    if (perm === 'unsupported') {
      if (isIOS() && !isStandalonePWA()) {
        import('./pwa.js').then((m) => m.showManualInstallHelp?.({ preferRedirect: false }));
      } else {
        notifyDataUpdate({ type: 'broadcast', message: '📢 แจ้งเตือนในแอปทำงาน — ดูแถบสีม่วงด้านบน' });
      }
      return;
    }

    if (perm === 'granted' && isPushRegisteredLocally()) {
      const ok = await showLocalPushTestNotification();
      notifyDataUpdate({
        type: 'test',
        message: ok
          ? 'ส่งทดสอบแล้ว — ดูที่ศูนย์แจ้งเตือนของมือถือ'
          : 'ทดสอบไม่สำเร็จ — ลองรีเฟรชแล้วกดอีกครั้ง'
      });
      return;
    }

    let result = perm;
    if (perm !== 'granted') {
      result = await requestNotificationPermission();
    }
    if (result !== 'granted') {
      refreshUi();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังลงทะเบียน…';
    const push = await subscribeAndRegisterPush();
    refreshUi(push);

    if (push.ok) {
      await showLocalPushTestNotification();
      notifyDataUpdate({ type: 'test', message: 'ลงทะเบียน Push นอกแอปสำเร็จ — ดูการแจ้งเตือนทดสอบบนหน้าจอ' });
      return;
    }

    if (push.reason === 'ios-need-pwa') {
      import('./pwa.js').then((m) => m.showManualInstallHelp?.({ preferRedirect: false }));
      notifyDataUpdate({ type: 'test', message: 'iPhone ต้องติดตั้งแอปก่อน จึงจะได้ Push นอกแอป' });
      return;
    }

    notifyDataUpdate({
      type: 'test',
      message: push.message
        ? `ลงทะเบียน Push ไม่สำเร็จ: ${push.message}`
        : 'ลงทะเบียน Push ไม่สำเร็จ — ลองรีเฟรชแล้วกดอีกครั้ง'
    });
  });
}

function injectToastStyles() {
  if (document.getElementById('update-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'update-toast-styles';
  style.textContent = `
    .update-toast {
      position: fixed;
      left: 50%;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-radius: 14px;
      max-width: min(94vw, 420px);
      background: linear-gradient(135deg, rgba(30,41,59,0.98), rgba(15,23,42,0.98));
      border: 1px solid rgba(99,102,241,0.5);
      box-shadow: 0 12px 40px rgba(0,0,0,0.55);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      opacity: 0;
      pointer-events: none;
      bottom: max(20px, env(safe-area-inset-bottom, 20px));
      transform: translateX(-50%) translateY(30px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .update-toast--visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    .update-toast__close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
      flex-shrink: 0;
    }
    @media (max-width: 992px) {
      .update-toast {
        top: max(72px, calc(env(safe-area-inset-top, 0px) + 64px));
        bottom: auto;
        transform: translateX(-50%) translateY(-20px);
        font-size: 15px;
        padding: 16px 18px;
      }
      html.has-broadcast-banner .update-toast {
        top: max(120px, calc(env(safe-area-inset-top, 0px) + 112px));
      }
    }
  `;
  document.head.appendChild(style);
}