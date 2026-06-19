// PWA: service worker registration + install prompt

let deferredInstallPrompt = null;
let lastInstallTap = 0;

export function initPWA() {
  registerServiceWorker();
  setupInstallPrompt();
  ensureInstallModal();
  refreshInstallButton();
  window.addEventListener('resize', refreshInstallButton);
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

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
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
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    refreshInstallButton();
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

  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
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

  if (!window.isSecureContext) {
    parts.push({
      type: 'warning',
      html: '⚠️ ต้องเปิดผ่าน <strong>HTTPS</strong> ถึงจะติดตั้งแอปได้'
    });
  }

  if (isAndroid() && !isIOS()) {
    parts.push({
      title: 'Android (Chrome)',
      steps: [
        'กด ⋮ มุมขวาบนของ Chrome',
        'เลือก "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก"',
        'กด "ติดตั้ง"'
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
      title: 'iPhone / iPad (Safari)',
      steps: [
        'กดปุ่ม แชร์ (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ด้านล่างหรือด้านบน',
        'เลื่อนลงแล้วเลือก "เพิ่มไปยังหน้าจอโฮม"',
        'กด "เพิ่ม" มุมขวาบน'
      ]
    });
  } else if (isMobileLayout()) {
    parts.push({
      title: 'มือถือ / แท็บเล็ต',
      steps: [
        'เปิดเมนูเบราว์เซอร์ (⋮ หรือ แชร์)',
        'เลือก "เพิ่มไปยังหน้าจอหลัก" หรือ "ติดตั้งแอป"'
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
    <div class="drawer" style="width: min(400px, 92vw); height: auto; max-height: 85vh; margin: auto; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); position: relative; transform: translateY(24px); transition: transform var(--transition-speed); box-shadow: 0 10px 25px rgba(0,0,0,0.5); padding: 24px; overflow-y: auto;">
      <div class="drawer-header" style="margin-bottom: 16px; border-bottom: none; padding-bottom: 0;">
        <h2 style="font-size: 20px; color: var(--text-primary); margin: 0;">วิธีติดตั้งแอป</h2>
        <button type="button" class="close-btn" data-pwa-install-close aria-label="ปิด">×</button>
      </div>
      <div data-pwa-install-body style="margin-bottom: 24px; color: var(--text-secondary); font-size: 14px; line-height: 1.6;"></div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button type="button" class="btn btn-primary" data-pwa-install-close style="padding: 10px 20px; font-size: 14px;">เข้าใจแล้ว</button>
      </div>
    </div>
  `;

  const close = () => overlay.classList.remove('active');
  overlay.querySelectorAll('[data-pwa-install-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
}

function showManualInstallHelp() {
  ensureInstallModal();
  const overlay = document.getElementById('pwa-install-modal-overlay');
  const body = overlay?.querySelector('[data-pwa-install-body]');
  if (!overlay || !body) return;

  const parts = getInstallSteps();
  body.innerHTML = parts.map((part) => {
    if (part.type === 'warning') {
      return `<p style="margin: 0 0 16px; padding: 12px; border-radius: 8px; background: rgba(251,191,36,0.15); color: #fbbf24;">${part.html}</p>`;
    }
    const stepsHtml = part.steps.map((step, i) =>
      `<li style="margin-bottom: 8px;"><span style="color: var(--accent-primary); font-weight: 700;">${i + 1}.</span> ${step}</li>`
    ).join('');
    return `<p style="margin: 0 0 8px; font-weight: 700; color: var(--text-primary);">${part.title}</p><ol style="margin: 0 0 16px; padding-left: 20px;">${stepsHtml}</ol>`;
  }).join('');

  overlay.classList.add('active');
}

function refreshInstallButton() {
  const btn = document.getElementById('pwa-install-btn');
  if (!btn) return;

  bindInstallButton(btn);

  if (isStandaloneMode()) {
    btn.hidden = true;
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