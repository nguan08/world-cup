// In-app toast + browser notifications for data updates

import { resolveAppPath } from './app-path.js';
import {
  canUseWebNotifications,
  getIOSPushBlockReason,
  isIOS,
  isIOSChrome,
  isMobileDevice,
  isStandalonePWA
} from './device.js';
import {
  isPushRegisteredLocally,
  showLocalPushTestNotification,
  subscribeAndRegisterPush
} from './push.js';
import { waitForServiceWorker } from './pwa.js';

let toastTimer = null;
let currentBannerId = 0;
let notifRefreshUi = null;
let showingBroadcastToastId = 0;

const SHOWN_BROADCAST_KEY = 'worldcup_shownBroadcastId';
const PENDING_BROADCAST_KEY = 'worldcup_pendingBroadcast';
const PENDING_SCORE_KEY = 'worldcup_pendingScoreUpdate';
const NOTIFIED_SCORES_KEY = 'worldcup_notifiedMatchScores';
const BROADCAST_STALE_MS = 24 * 60 * 60 * 1000;
const BROADCAST_TOAST_MS = 6000;
const SCORE_TOAST_MS = 6000;
const DEFAULT_TOAST_MS = 8000;
const AUTO_PROMPT_KEY = 'worldcup_notifAutoPrompted';
const AUTO_PROMPT_DELAY_MS = 1200;

export function initNotifications() {
  if (!localStorage.getItem(SHOWN_BROADCAST_KEY) && localStorage.getItem('worldcup_lastBroadcastId')) {
    localStorage.setItem(SHOWN_BROADCAST_KEY, localStorage.getItem('worldcup_lastBroadcastId'));
  }

  injectToastStyles();
  ensureToastElement();
  renderNotificationControls();
  setupIOSPushBanner();
  setupIOSPushListeners();
  flushPendingBroadcast();
  flushPendingScoreUpdate();

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
    if (!document.hidden) {
      flushPendingBroadcast();
      flushPendingScoreUpdate();
    }
  });
  window.addEventListener('pageshow', () => {
    flushPendingBroadcast();
    flushPendingScoreUpdate();
  });
  window.addEventListener('focus', () => {
    flushPendingBroadcast();
    flushPendingScoreUpdate();
  });

  setTimeout(() => void autoPromptNotificationsOnEntry(), AUTO_PROMPT_DELAY_MS);
}

/** ขอสิทธิแจ้งเตือนอัตโนมัติเมื่อเข้าเว็บ (ครั้งละ 1 ต่อ session) */
export async function autoPromptNotificationsOnEntry() {
  if (sessionStorage.getItem(AUTO_PROMPT_KEY)) return;
  if (getIOSPushBlockReason()) return;

  try {
    await waitForServiceWorker();
  } catch {
    // ยังลองขอ permission ต่อได้
  }

  if (!canUseWebNotifications()) return;

  if (Notification.permission === 'granted') {
    if (!isPushRegisteredLocally()) {
      await subscribeAndRegisterPush();
      notifRefreshUi?.();
    }
    return;
  }

  if (Notification.permission === 'denied') return;

  sessionStorage.setItem(AUTO_PROMPT_KEY, '1');
  const result = await requestNotificationPermission();
  notifRefreshUi?.();

  if (result === 'granted') {
    await subscribeAndRegisterPush();
    notifRefreshUi?.();
  }
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
  currentBannerId = 0;
}

function queuePendingBroadcast(bc) {
  localStorage.setItem(PENDING_BROADCAST_KEY, JSON.stringify(bc));
}

export function updateBroadcastBanner(bc) {
  if (!bc?.id) {
    currentBannerId = 0;
    return false;
  }
  const shownId = Number(localStorage.getItem(SHOWN_BROADCAST_KEY) || 0);
  if (bc.id <= shownId) {
    currentBannerId = 0;
    return false;
  }
  currentBannerId = bc.id;
  return true;
}

export function hideBroadcastBanner() {
  currentBannerId = 0;
}

function getMatchScoreKey(match) {
  if (!match) return '';
  return `${match.homeScore ?? 'n'}-${match.awayScore ?? 'n'}-${match.status || 'pending'}-${match.penaltyWinner || ''}`;
}

export function findScoreChanges(localMatches, serverMatches) {
  if (!Array.isArray(serverMatches) || !serverMatches.length) return [];
  if (!Array.isArray(localMatches) || !localMatches.length) return [];

  const changes = [];
  for (const sm of serverMatches) {
    const lm = localMatches.find((m) => m.id == sm.id);
    if (!lm) {
      if (sm.homeScore != null || sm.status === 'finished') changes.push(sm);
      continue;
    }
    const changed = getMatchScoreKey(lm) !== getMatchScoreKey(sm);
    if (changed && (sm.homeScore != null || sm.status === 'finished')) {
      changes.push(sm);
    }
  }
  return changes;
}

function filterUnnotifiedScoreChanges(changes) {
  let notified = {};
  try {
    notified = JSON.parse(localStorage.getItem(NOTIFIED_SCORES_KEY) || '{}');
  } catch {
    notified = {};
  }
  return changes.filter((m) => notified[String(m.id)] !== getMatchScoreKey(m));
}

function markScoresNotified(matches) {
  let notified = {};
  try {
    notified = JSON.parse(localStorage.getItem(NOTIFIED_SCORES_KEY) || '{}');
  } catch {
    notified = {};
  }
  for (const m of matches) {
    notified[String(m.id)] = getMatchScoreKey(m);
  }
  localStorage.setItem(NOTIFIED_SCORES_KEY, JSON.stringify(notified));
}

function formatMatchScoreLine(match) {
  const home = match.homeScore ?? '-';
  const away = match.awayScore ?? '-';
  let line = `${match.home} ${home}-${away} ${match.away}`;
  if (match.penaltyWinner) line += ` (จุดโทษ: ${match.penaltyWinner})`;
  return line;
}

export function formatScoreUpdateMessage(changes) {
  if (!changes?.length) return 'มีการอัปเดตสกอร์ใหม่';
  if (changes.length === 1) return `⚽ อัปเดตสกอร์: ${formatMatchScoreLine(changes[0])}`;
  const latest = changes[changes.length - 1];
  return `⚽ อัปเดตสกอร์ ${changes.length} นัด — ${formatMatchScoreLine(latest)}`;
}

function displayScoreUpdateMessage(message, { changes = [], autoDismiss = false } = {}) {
  showUpdateToast(message, {
    durationMs: autoDismiss ? SCORE_TOAST_MS : DEFAULT_TOAST_MS,
    onDismiss: () => {
      if (changes.length) markScoresNotified(changes);
    }
  });
  if (isMobileDevice() && navigator.vibrate) {
    try { navigator.vibrate([80, 40, 80]); } catch { /* ignore */ }
  }
}

function queuePendingScoreUpdate(changes, message) {
  localStorage.setItem(PENDING_SCORE_KEY, JSON.stringify({ changes, message }));
}

export function flushPendingScoreUpdate() {
  if (document.hidden) return;
  const raw = localStorage.getItem(PENDING_SCORE_KEY);
  if (!raw) return;
  try {
    const payload = JSON.parse(raw);
    localStorage.removeItem(PENDING_SCORE_KEY);
    const changes = filterUnnotifiedScoreChanges(payload?.changes || []);
    if (!changes.length) return;
    displayScoreUpdateMessage(
      payload?.message || formatScoreUpdateMessage(changes),
      { changes, autoDismiss: true }
    );
  } catch {
    localStorage.removeItem(PENDING_SCORE_KEY);
  }
}

export function processScoreUpdates(changes, { onInit = false } = {}) {
  const fresh = filterUnnotifiedScoreChanges(changes || []);
  if (!fresh.length) return false;

  const message = formatScoreUpdateMessage(fresh);

  if (document.hidden) {
    queuePendingScoreUpdate(fresh, message);
    showBrowserNotification(message, 'data');
    return true;
  }

  displayScoreUpdateMessage(message, { changes: fresh, autoDismiss: true });
  return true;
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
      broadcastId: bc.id,
      autoDismiss: true
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
    broadcastId: bc.id,
    autoDismiss: true
  });
  return true;
}

function displayBroadcastMessage(text, {
  browserType = 'data',
  markShown = false,
  broadcastId = null,
  autoDismiss = false
} = {}) {
  if (broadcastId) {
    const shownId = Number(localStorage.getItem(SHOWN_BROADCAST_KEY) || 0);
    if (broadcastId <= shownId) return;
    if (showingBroadcastToastId === broadcastId) return;
    showingBroadcastToastId = broadcastId;
  }

  const isBroadcast = browserType === 'broadcast';
  const durationMs = isBroadcast && autoDismiss ? BROADCAST_TOAST_MS : DEFAULT_TOAST_MS;

  showUpdateToast(text, {
    durationMs,
    onDismiss: () => {
      if (broadcastId && (autoDismiss || markShown)) {
        markBroadcastShown(broadcastId);
      }
      if (broadcastId && showingBroadcastToastId === broadcastId) {
        showingBroadcastToastId = 0;
      }
    }
  });

  if (isMobileDevice() && navigator.vibrate) {
    try { navigator.vibrate([120, 60, 120]); } catch { /* ignore */ }
  }

  if (document.hidden) {
    showBrowserNotification(text, browserType);
  }

  if (markShown && broadcastId) {
    markBroadcastShown(broadcastId);
    showingBroadcastToastId = 0;
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

export function showUpdateToast(message, { durationMs = DEFAULT_TOAST_MS, onDismiss } = {}) {
  const toast = ensureToastElement();
  const textEl = toast.querySelector('.update-toast__text');
  textEl.textContent = message;
  toast.classList.remove('update-toast--visible');
  void toast.offsetWidth;
  toast.classList.add('update-toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('update-toast--visible');
    onDismiss?.();
  }, durationMs);
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
    clearTimeout(toastTimer);
    toast.classList.remove('update-toast--visible');
    if (showingBroadcastToastId) {
      markBroadcastShown(showingBroadcastToastId);
      showingBroadcastToastId = 0;
    }
  });
  document.documentElement.appendChild(toast);
  return toast;
}

function iosPushStatusText() {
  const block = getIOSPushBlockReason();
  if (block === 'ios-use-safari') {
    return 'iPhone: เปิดใน Safari แล้วเพิ่มไปหน้าจอโฮม (Chrome ไม่รองรับ Push)';
  }
  if (block === 'ios-need-pwa') {
    return 'iPhone: ติดตั้งแอปก่อน แล้วเปิดจากไอคอนบนหน้าจอหลัก';
  }
  if (block === 'ios-need-update') {
    return 'iPhone: ต้องอัปเดต iOS เป็น 16.4 ขึ้นไป';
  }
  if (isIOS() && isStandalonePWA()) {
    return 'โหมดแอป iPhone — กดเปิดแจ้งเตือนด้านล่าง';
  }
  return '';
}

function pushStatusLabel(perm, pushResult = null) {
  const iosText = iosPushStatusText();
  if (perm === 'unsupported') {
    return iosText || 'เบราว์เซอร์ไม่รองรับแจ้งเตือนนอกแอป';
  }
  if (perm === 'denied') {
    return isIOS()
      ? 'ถูกปฏิเสธ — ไปที่ ตั้งค่า → แจ้งเตือน → WC 2026'
      : 'ถูกปฏิเสธ — เปิดในการตั้งค่าเบราว์เซอร์';
  }
  if (perm !== 'granted') {
    if (iosText) return iosText;
    return isMobileDevice() ? 'กดเปิดเพื่อรับแจ้งเตือนนอกแอป' : 'ยังไม่ได้เปิด';
  }
  if (pushResult?.reason === 'ios-need-pwa' || pushResult?.reason === 'ios-use-safari') {
    return iosPushStatusText() || 'ติดตั้งแอปก่อนเพื่อ Push นอกแอป';
  }
  if (pushResult?.reason === 'ios-need-update') {
    return 'ต้องอัปเดต iOS เป็น 16.4 ขึ้นไป';
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
      const block = getIOSPushBlockReason();
      if (block === 'ios-use-safari') btn.textContent = 'เปิดใน Safari';
      else if (block) btn.textContent = 'วิธีติดตั้งแอป (iPhone)';
      else btn.textContent = 'ดูแถบแจ้งเตือนด้านบน';
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

  notifRefreshUi = refreshUi;
  refreshUi();

  btn.addEventListener('click', async () => {
    const perm = getNotificationPermission();

    if (perm === 'unsupported') {
      const block = getIOSPushBlockReason();
      if (block === 'ios-use-safari') {
        window.open('https://nguan08.github.io/world-cup/', '_blank', 'noopener');
        notifyDataUpdate({
          type: 'test',
          message: 'เปิดลิงก์ใน Safari แล้วกด แชร์ → เพิ่มไปหน้าจอโฮม'
        });
      } else if (block) {
        import('./pwa.js').then((m) => m.showManualInstallHelp?.({ preferRedirect: false }));
      } else {
        notifyDataUpdate({ type: 'broadcast', message: '📢 แจ้งเตือนในแอปทำงาน — ดู toast ด้านบน' });
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

    if (push.reason === 'ios-need-pwa' || push.reason === 'ios-use-safari' || push.reason === 'ios-need-update') {
      if (push.reason === 'ios-use-safari') {
        window.open('https://nguan08.github.io/world-cup/', '_blank', 'noopener');
      } else {
        import('./pwa.js').then((m) => m.showManualInstallHelp?.({ preferRedirect: false }));
      }
      notifyDataUpdate({
        type: 'test',
        message: push.reason === 'ios-need-update'
          ? 'อัปเดต iOS เป็น 16.4+ แล้วเปิดจากไอคอนแอปอีกครั้ง'
          : 'iPhone: ติดตั้งจาก Safari แล้วเปิดจากไอคอน จึงจะได้ Push นอกแอป'
      });
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

function setupIOSPushListeners() {
  if (!isIOS()) return;
  const refresh = () => {
    renderIOSPushBanner();
    notifRefreshUi?.();
  };
  ['standalone', 'fullscreen', 'minimal-ui'].forEach((mode) => {
    window.matchMedia(`(display-mode: ${mode})`).addEventListener('change', refresh);
  });
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}

function renderIOSPushBanner() {
  if (!isIOS()) return;
  const block = getIOSPushBlockReason();
  let bar = document.getElementById('ios-push-hint-bar');
  if (!block) {
    if (bar) {
      bar.hidden = true;
      bar.classList.remove('ios-push-hint-bar--visible');
    }
    document.documentElement.classList.remove('has-ios-push-hint');
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ios-push-hint-bar';
    bar.className = 'ios-push-hint-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
      <div class="ios-push-hint-bar__inner">
        <span class="ios-push-hint-bar__icon" aria-hidden="true">📱</span>
        <p class="ios-push-hint-bar__text" id="ios-push-hint-text"></p>
        <button type="button" class="ios-push-hint-bar__btn" id="ios-push-hint-action">วิธีติดตั้ง</button>
      </div>
    `;
    document.body.prepend(bar);
    injectIOSPushStyles();
    bar.querySelector('#ios-push-hint-action')?.addEventListener('click', () => {
      if (getIOSPushBlockReason() === 'ios-use-safari') {
        window.open('https://nguan08.github.io/world-cup/', '_blank', 'noopener');
      } else {
        import('./pwa.js').then((m) => m.showManualInstallHelp?.({ preferRedirect: false }));
      }
    });
  }

  const textEl = bar.querySelector('#ios-push-hint-text');
  if (textEl) textEl.textContent = iosPushStatusText();
  const actionBtn = bar.querySelector('#ios-push-hint-action');
  if (actionBtn) {
    actionBtn.textContent = getIOSPushBlockReason() === 'ios-use-safari' ? 'เปิด Safari' : 'วิธีติดตั้ง';
  }
  bar.hidden = false;
  document.documentElement.classList.add('has-ios-push-hint');
  requestAnimationFrame(() => bar.classList.add('ios-push-hint-bar--visible'));
}

function setupIOSPushBanner() {
  renderIOSPushBanner();
}

function injectIOSPushStyles() {
  if (document.getElementById('ios-push-hint-styles')) return;
  const style = document.createElement('style');
  style.id = 'ios-push-hint-styles';
  style.textContent = `
    .ios-push-hint-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 99998;
      padding: max(10px, env(safe-area-inset-top, 10px)) 12px 10px;
      background: linear-gradient(135deg, rgba(30, 64, 175, 0.96), rgba(67, 56, 202, 0.96));
      border-bottom: 1px solid rgba(255,255,255,0.15);
      transform: translateY(-100%);
      transition: transform 0.3s ease;
    }
    .ios-push-hint-bar--visible { transform: translateY(0); }
    .ios-push-hint-bar__inner {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 640px;
      margin: 0 auto;
    }
    .ios-push-hint-bar__text {
      flex: 1;
      margin: 0;
      font-size: 12px;
      line-height: 1.35;
      color: #fff;
      font-weight: 600;
    }
    .ios-push-hint-bar__btn {
      flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.12);
      color: #fff;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
    }
    html.has-ios-push-hint { scroll-padding-top: 56px; }
    html.has-ios-push-hint .mobile-header { top: 52px; }

  `;
  document.head.appendChild(style);
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

    }
  `;
  document.head.appendChild(style);
}