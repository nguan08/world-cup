// In-app toast + browser notifications for data updates

import { resolveAppPath } from './app-path.js';

let permissionRequested = false;
let toastTimer = null;

const BROADCAST_STORAGE_KEY = 'worldcup_lastBroadcastId';
const BROADCAST_STALE_MS = 2 * 60 * 60 * 1000;

export function initNotifications() {
  injectToastStyles();
  ensureToastElement();
  renderNotificationControls();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, message } = event.data || {};
      if (type === 'DATA_UPDATED' || type === 'BROADCAST') {
        showUpdateToast(message || 'มีการอัปเดตข้อมูลใหม่');
        if (type === 'BROADCAST') {
          showBrowserNotification(message, 'broadcast');
        }
      }
    });
  }
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  permissionRequested = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function processBroadcast(serverData, { onInit = false } = {}) {
  const bc = serverData?.broadcast;
  if (!bc?.id) return false;

  const lastId = Number(localStorage.getItem(BROADCAST_STORAGE_KEY) || 0);
  if (bc.id <= lastId) return false;

  if (onInit && lastId === 0 && bc.sentAt) {
    const age = Date.now() - Date.parse(bc.sentAt);
    if (Number.isFinite(age) && age > BROADCAST_STALE_MS) {
      localStorage.setItem(BROADCAST_STORAGE_KEY, String(bc.id));
      return false;
    }
  }

  localStorage.setItem(BROADCAST_STORAGE_KEY, String(bc.id));
  const text = bc.message || 'มีการแจ้งเตือนจากแอดมิน — ตรวจสอบผลล่าสุดในแอป';
  notifyDataUpdate({
    type: 'broadcast',
    message: `📢 ${text}`,
    forceBrowserNotify: true
  });
  return true;
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

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: type === 'broadcast' ? 'BROADCAST' : 'DATA_UPDATED',
      message: text
    });
  }
}

function showBrowserNotification(text, type = 'data') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const title = type === 'broadcast'
      ? 'World Cup 2026 — แจ้งเตือนจากแอดมิน'
      : 'World Cup 2026 — อัปเดตข้อมูล';
    const n = new Notification(title, {
      body: text.replace(/^📢\s*/, ''),
      icon: resolveAppPath('icons/icon-192.png'),
      badge: resolveAppPath('icons/icon-192.png'),
      tag: type === 'broadcast' ? 'wc-broadcast' : 'wc-data-update',
      renotify: true
    });
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
  toast.querySelector('.update-toast__text').textContent = message;
  toast.classList.add('update-toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('update-toast--visible'), 8000);
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
  document.body.appendChild(toast);
  return toast;
}

function renderNotificationControls() {
  const box = document.getElementById('notification-settings');
  if (!box || box.dataset.ready) return;
  box.dataset.ready = '1';

  const perm = getNotificationPermission();
  const statusEl = box.querySelector('[data-notif-status]');
  const btn = box.querySelector('[data-notif-enable]');

  const labels = {
    granted: 'เปิดแจ้งเตือนแล้ว',
    denied: 'ถูกปฏิเสธ — เปิดในเบราว์เซอร์',
    default: 'ยังไม่ได้เปิด',
    unsupported: 'เบราว์เซอร์ไม่รองรับ'
  };
  if (statusEl) statusEl.textContent = labels[perm] || labels.default;

  if (!btn) return;
  if (perm === 'unsupported') {
    btn.disabled = true;
    btn.textContent = 'ไม่รองรับ';
    return;
  }
  if (perm === 'granted') {
    btn.textContent = 'เปิดแจ้งเตือนแล้ว ✓';
    btn.disabled = true;
    return;
  }
  btn.addEventListener('click', async () => {
    const result = await requestNotificationPermission();
    if (statusEl) statusEl.textContent = labels[result] || labels.default;
    if (result === 'granted') {
      btn.textContent = 'เปิดแจ้งเตือนแล้ว ✓';
      btn.disabled = true;
      notifyDataUpdate({ type: 'test', message: 'เปิดการแจ้งเตือนเรียบร้อย' });
    }
  });
}

function injectToastStyles() {
  if (document.getElementById('update-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'update-toast-styles';
  style.textContent = `
    .update-toast {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(120%);
      z-index: 10001; display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; border-radius: 12px; max-width: min(92vw, 420px);
      background: linear-gradient(135deg, rgba(30,41,59,0.98), rgba(15,23,42,0.98));
      border: 1px solid rgba(99,102,241,0.4); box-shadow: 0 8px 32px rgba(0,0,0,0.45);
      color: #fff; font-size: 13px; font-weight: 600;
      transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s;
      opacity: 0; pointer-events: none;
    }
    .update-toast--visible { transform: translateX(-50%) translateY(0); opacity: 1; pointer-events: auto; }
    .update-toast__close { background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 0 4px; }
  `;
  document.head.appendChild(style);
}