// PWA: service worker registration + install prompt

let deferredInstallPrompt = null;

export function initPWA() {
  registerServiceWorker();
  setupInstallPrompt();
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

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isMobileLayout();
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
  btn.addEventListener('click', onInstallButtonClick);
}

async function onInstallButtonClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    refreshInstallButton();
    return;
  }
  showManualInstallHelp();
}

function showManualInstallHelp() {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isSecure = window.isSecureContext;

  let steps = '';
  if (!isSecure) {
    steps = '⚠️ ต้องเปิดผ่าน HTTPS (เช่น https://...) ถึงจะติดตั้งแอปได้\n\n';
  }
  if (isAndroid) {
    steps += 'Android (Chrome):\n'
      + '1. กด ⋮ มุมขวาบนของ Chrome\n'
      + '2. เลือก "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก"\n'
      + '3. กด "ติดตั้ง"';
  } else if (isIOS) {
    steps += 'iPhone / iPad (Safari):\n'
      + '1. กดปุ่ม แชร์ (สี่เหลี่ยมมีลูกศร)\n'
      + '2. เลือก "เพิ่มไปยังหน้าจอโฮม"\n'
      + '3. กด "เพิ่ม"';
  } else {
    steps += 'เดสก์ท็อป:\n'
      + '1. ดูไอคอน ⊕ หรือ "ติดตั้ง" ในแถบที่อยู่ของ Chrome\n'
      + '2. หรือเมนู ⋮ → "ติดตั้ง World Cup..."';
  }

  window.alert(steps);
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

  // Show manual-install entry on phones/tablets even when beforeinstallprompt never fires
  if (isMobileDevice()) {
    btn.textContent = 'ติดตั้งแอป / วิธีเพิ่มไปหน้าจอหลัก';
    btn.hidden = false;
    return;
  }

  btn.hidden = true;
}

