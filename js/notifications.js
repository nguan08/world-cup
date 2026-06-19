// In-app toast + browser notifications for data updates

let permissionRequested = false;
let toastTimer = null;

export function initNotifications() {
  injectToastStyles();
  ensureToastElement();
  renderNotificationControls();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'DATA_UPDATED') {
        showUpdateToast(event.data.message || 'มีการอัปเดตข้อมูลใหม่');
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

export function notifyDataUpdate({ type = 'data', message } = {}) {
  const text = message || (type === 'data'
    ? 'มีการอัปเดตผลการแข่งขันหรือข้อมูลผู้เล่นใหม่'
    : 'มีการอัปเดตแอป');

  showUpdateToast(text);

  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      const n = new Notification('World Cup 2026 — อัปเดตข้อมูล', {
        body: text,
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        tag: 'wc-data-update',
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

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'DATA_UPDATED',
      message: text
    });
  }
}

function showUpdateToast(message) {
  const toast = ensureToastElement();
  toast.querySelector('.update-toast__text').textContent = message;
  toast.classList.add('update-toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('update-toast--visible'), 6000);
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
    .notification-settings { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
    .notification-settings__label { font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
    .notification-settings__status { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
    .notification-enable-btn { width: 100%; padding: 8px 12px !important; font-size: 12px !important; }
  `;
  document.head.appendChild(style);
}