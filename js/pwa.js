// PWA: service worker registration + install prompt

import { getAppBasePath, resolveAppPath } from './app-path.js';

const PWA_INSTALL_URL = 'https://nguan08.github.io/world-cup/';

let deferredInstallPrompt = null;
let lastInstallTap = 0;
let serviceWorkerReadyPromise = null;

export function initPWA() {
  registerServiceWorker();
  setupInstallPrompt();
  ensureInstallModal();
  applyStandaloneClass();
  refreshInstallButton();
  renderPwaModeStatus();
  window.addEventListener('resize', refreshInstallButton);
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    applyStandaloneClass();
    renderPwaModeStatus();
    refreshInstallButton();
  });
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;
}

function isMobileLayout() {
  const menuBtn = document.getElementById('menu-toggle-btn');
  if (menuBtn && window.getComputedStyle(menuBtn).display !== 'none') return true;
  return window.matchMedia('(max-width: 992px)').matches;
}

function isIPad() {
  if (/iPad/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || isIPad();
}

function isIOSChrome() {
  return isIOS() && /CriOS/i.test(navigator.userAgent);
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isMobileDevice() {
  return isIOS() || isAndroid() || isMobileLayout();
}

function isLocalOrLanHost() {
  const host = location.hostname;
  return host === 'localhost'
    || host === '127.0.0.1'
    || /^192\.168\./.test(host)
    || /^10\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function canInstallAsRealPwa() {
  return window.isSecureContext && location.protocol === 'https:';
}

function applyStandaloneClass() {
  document.documentElement.classList.toggle('pwa-standalone', isStandaloneMode());
}

export function waitForServiceWorker(timeoutMs = 15000) {
  if (!('serviceWorker' in navigator)) {
    return Promise.reject(new Error('ไม่รองรับ Service Worker'));
  }
  if (!serviceWorkerReadyPromise) {
    serviceWorkerReadyPromise = Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Service Worker โหลดช้า — ลองรีเฟรช')), timeoutMs);
      })
    ]);
  }
  return serviceWorkerReadyPromise;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(resolveAppPath('sw.js'), {
      scope: getAppBasePath()
    });
    serviceWorkerReadyPromise = Promise.resolve(reg);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          import('./notifications.js').then(({ notifyDataUpdate }) => {
            notifyDataUpdate({ type: 'app', message: 'มีเวอร์ชันแอปใหม่ — รีเฟรชเพื่ออัปเดต' });
          });
        }
      });
    });
  } catch (e) {
    console.warn('[PWA] Service worker registration failed', e);
  }
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    refreshInstallButton();
    renderPwaModeStatus();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    refreshInstallButton();
    renderPwaModeStatus();
  });
}

function bindInstallButton(btn) {
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';

  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    if (now - lastInstallTap < 500) return;
    lastInstallTap = now;

    void onInstallButtonClick();
  };

  btn.addEventListener('click', handler);
  btn.addEventListener('pointerup', handler);
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('active');
  if (backdrop) backdrop.classList.remove('active');
  document.body.style.overflow = '';
}

async function onInstallButtonClick() {
  closeMobileSidebar();

  if (!canInstallAsRealPwa()) {
    showManualInstallHelp({ preferRedirect: true });
    return;
  }

  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome !== 'accepted') {
        showManualInstallHelp();
      }
    } catch (e) {
      console.warn('[PWA] Install prompt failed', e);
      showManualInstallHelp();
    }
    deferredInstallPrompt = null;
    refreshInstallButton();
    return;
  }

  showManualInstallHelp();
}

function getInstallSteps() {
  const parts = [];

  if (isStandaloneMode()) {
    parts.push({
      type: 'success',
      html: '✅ เปิดจากแอปที่ติดตั้งแล้ว — ไม่มีแถบ URL ของ Chrome ด้านบน'
    });
    return parts;
  }

  if (!canInstallAsRealPwa()) {
    parts.push({
      type: 'warning',
      html: '⚠️ เปิดผ่าน <strong>HTTP</strong> (เช่น IP เครื่องเซิร์ฟเวอร์) จะได้แค่ <strong>ทางลัดเว็บ</strong> — หน้าตาเหมือนเดิม มีแถบ URL ของ Chrome'
    });
    parts.push({
      type: 'info',
      html: 'ติดตั้งแอปจริง (เต็มจอ ไม่มีแถบ URL) ต้องเปิดผ่าน <strong>HTTPS</strong> ก่อน:'
    });
    parts.push({
      type: 'link',
      url: PWA_INSTALL_URL,
      label: PWA_INSTALL_URL
    });
  }

  if (isAndroid() && !isIOS()) {
    parts.push({
      title: 'Android (Chrome) — ติดตั้งแอปจริง',
      steps: canInstallAsRealPwa()
        ? [
            'กด ⋮ มุมขวาบน → เลือก <strong>"ติดตั้งแอป"</strong> (ไม่ใช่แค่ "เพิ่มไปยังหน้าจอหลัก")',
            'กด "ติดตั้ง" แล้วเปิดจากไอคอน WC 2026 บนหน้าจอหลัก',
            'ถ้าติดตั้งสำเร็จ: ไม่มีแถบ URL, สลับแอปเห็นเป็นแอปแยก (ไม่ใช่แท็บ Chrome)'
          ]
        : [
            'เปิดลิงก์ HTTPS ด้านบนใน Chrome ก่อน',
            'จากนั้นกด ⋮ → <strong>"ติดตั้งแอป"</strong>',
            'อย่าใช้ "เพิ่มไปยังหน้าจอหลัก" จาก HTTP — จะได้แค่ทางลัดที่เปิดใน Chrome'
          ]
    });
  } else if (isIOSChrome()) {
    parts.push({
      title: 'iPhone / iPad (Chrome)',
      steps: [
        'กด ⋮ มุมขวาล่างของ Chrome',
        'เลือก "เพิ่มไปยังหน้าจอโฮม"',
        'หรือเปิดเว็บนี้ใน Safari แล้วกด แชร์ → "เพิ่มไปยังหน้าจอโฮม"'
      ]
    });
  } else if (isIOS()) {
    parts.push({
      title: 'iPhone / iPad — แจ้งเตือนนอกแอป (ต้องใช้ Safari)',
      steps: [
        'เปิดเว็บนี้ใน <strong>Safari</strong> (Chrome บน iPhone ไม่รองรับ Push)',
        'กดปุ่ม แชร์ → "เพิ่มไปยังหน้าจอโฮม"',
        'เปิดจากไอคอน WC 2026 บนหน้าจอหลัก (ไม่ใช่แท็บ Safari)',
        'ในแอป: เปิด sidebar → กด "เปิดการแจ้งเตือน"',
        'ต้องใช้ iOS 16.4 ขึ้นไป'
      ]
    });
  } else if (isMobileLayout()) {
    parts.push({
      title: 'มือถือ / แท็บเล็ต',
      steps: [
        'เปิดผ่าน HTTPS ก่อน',
        'เมนูเบราว์เซอร์ → "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก"'
      ]
    });
  } else {
    parts.push({
      title: 'เดสก์ท็อป (Chrome)',
      steps: [
        'ดูไอคอน ⊕ หรือ "ติดตั้ง" ในแถบที่อยู่',
        'หรือเมนู ⋮ → "ติดตั้ง World Cup..."'
      ]
    });
  }

  parts.push({
    type: 'check',
    title: 'วิธีเช็คว่าติดตั้งสำเร็จ',
    steps: [
      'เปิดจากไอคอนบนหน้าจอหลัก (ไม่ใช่จากแท็บ Chrome)',
      'ด้านบนไม่มีแถบ URL / ปุ่ม ⋮ ของ Chrome',
      'กดปุ่มสลับแอป เห็นเป็นแอปแยก ไม่ใช่แท็บใน Chrome'
    ]
  });

  return parts;
}

function ensureInstallModal() {
  if (document.getElementById('pwa-install-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pwa-install-modal-overlay';
  overlay.className = 'drawer-overlay';
  overlay.style.zIndex = '10001';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.innerHTML = `
    <div class="drawer pwa-install-modal" style="width: min(420px, 92vw); height: auto; max-height: 85vh; margin: auto; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); position: relative; transform: translateY(24px); transition: transform var(--transition-speed); box-shadow: 0 10px 25px rgba(0,0,0,0.5); padding: 24px; overflow-y: auto;">
      <div class="drawer-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
        <h2 style="font-size: 20px; color: var(--text-primary); margin: 0;">วิธีติดตั้งแอป</h2>
        <button type="button" class="close-btn" data-pwa-install-close aria-label="ปิด">×</button>
      </div>
      <div data-pwa-install-body style="margin-bottom: 20px; color: var(--text-secondary); font-size: 14px; line-height: 1.6;"></div>
      <div data-pwa-install-actions style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end;"></div>
    </div>
  `;

  const close = () => overlay.classList.remove('active');
  overlay.querySelector('[data-pwa-install-close]').addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
}

export function showManualInstallHelp({ preferRedirect = false } = {}) {
  ensureInstallModal();
  const overlay = document.getElementById('pwa-install-modal-overlay');
  const body = overlay?.querySelector('[data-pwa-install-body]');
  const actions = overlay?.querySelector('[data-pwa-install-actions]');
  if (!overlay || !body || !actions) return;

  const parts = getInstallSteps();
  body.innerHTML = parts.map((part) => {
    if (part.type === 'warning' || part.type === 'success' || part.type === 'info') {
      const bg = part.type === 'success'
        ? 'rgba(34,197,94,0.15)'
        : part.type === 'info'
          ? 'rgba(99,102,241,0.12)'
          : 'rgba(251,191,36,0.15)';
      const color = part.type === 'success' ? '#4ade80' : part.type === 'info' ? '#a5b4fc' : '#fbbf24';
      return `<p style="margin: 0 0 12px; padding: 12px; border-radius: 8px; background: ${bg}; color: ${color};">${part.html}</p>`;
    }
    if (part.type === 'link') {
      return `<p style="margin: 0 0 16px;"><a href="${part.url}" target="_blank" rel="noopener" style="color: #818cf8; word-break: break-all; font-weight: 600;">${part.label}</a></p>`;
    }
    const stepsHtml = part.steps.map((step, i) =>
      `<li style="margin-bottom: 8px;"><span style="color: var(--accent-primary); font-weight: 700;">${i + 1}.</span> ${step}</li>`
    ).join('');
    return `<p style="margin: 0 0 8px; font-weight: 700; color: var(--text-primary);">${part.title}</p><ol style="margin: 0 0 16px; padding-left: 20px;">${stepsHtml}</ol>`;
  }).join('');

  const showOpenHttps = !canInstallAsRealPwa() || preferRedirect;
  actions.innerHTML = `
    ${showOpenHttps ? `<a class="btn btn-primary" href="${PWA_INSTALL_URL}" target="_blank" rel="noopener" style="padding: 10px 16px; font-size: 14px; text-decoration: none;">เปิดเวอร์ชัน HTTPS</a>` : ''}
    <button type="button" class="btn btn-secondary" data-pwa-install-close style="padding: 10px 20px; font-size: 14px;">เข้าใจแล้ว</button>
  `;
  actions.querySelectorAll('[data-pwa-install-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.classList.remove('active');
    });
  });

  overlay.classList.add('active');
}

function renderPwaModeStatus() {
  let box = document.getElementById('pwa-mode-status');
  if (!box) {
    const btn = document.getElementById('pwa-install-btn');
    if (!btn) return;
    box = document.createElement('div');
    box.id = 'pwa-mode-status';
    box.className = 'pwa-mode-status';
    btn.parentElement?.insertBefore(box, btn);
  }

  if (isStandaloneMode()) {
    box.className = 'pwa-mode-status pwa-mode-status--app';
    box.innerHTML = '<span class="pwa-mode-status__dot" aria-hidden="true"></span> โหมดแอป (ติดตั้งแล้ว)';
    return;
  }

  if (!canInstallAsRealPwa() && isMobileDevice()) {
    box.className = 'pwa-mode-status pwa-mode-status--warn';
    box.innerHTML = '<span class="pwa-mode-status__dot" aria-hidden="true"></span> โหมดเว็บ — ติดตั้งจริงต้องใช้ HTTPS';
    return;
  }

  if (deferredInstallPrompt) {
    box.className = 'pwa-mode-status pwa-mode-status--ready';
    box.innerHTML = '<span class="pwa-mode-status__dot" aria-hidden="true"></span> พร้อมติดตั้งแอป';
    return;
  }

  box.className = 'pwa-mode-status pwa-mode-status--browser';
  box.innerHTML = '<span class="pwa-mode-status__dot" aria-hidden="true"></span> โหมดเบราว์เซอร์';
}

function refreshInstallButton() {
  const btn = document.getElementById('pwa-install-btn');
  if (!btn) return;

  bindInstallButton(btn);

  if (isStandaloneMode()) {
    btn.hidden = true;
    return;
  }

  if (!canInstallAsRealPwa() && isMobileDevice()) {
    btn.textContent = 'ติดตั้งแอป (เปิด HTTPS ก่อน)';
    btn.hidden = false;
    return;
  }

  if (deferredInstallPrompt) {
    btn.textContent = 'ติดตั้งแอป (PWA)';
    btn.hidden = false;
    return;
  }

  if (isMobileDevice()) {
    btn.textContent = 'ติดตั้งแอป / วิธีเพิ่มไปหน้าจอหลัก';
    btn.hidden = false;
    return;
  }

  btn.hidden = true;
}