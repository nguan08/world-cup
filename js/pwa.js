// PWA: service worker registration + install prompt

let deferredInstallPrompt = null;

export function initPWA() {
  registerServiceWorker();
  setupInstallPrompt();
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
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideInstallButton();
  });
}

function showInstallButton() {
  const btn = document.getElementById('pwa-install-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.style.display = 'block';
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallButton();
  });
}

function hideInstallButton() {
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
}