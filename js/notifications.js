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
const PENDING_NOTIF_KEY = 'worldcup_pendingNotification';
const NOTIFIED_SCORES_KEY = 'worldcup_notifiedMatchScores';
const NOTIFICATION_TAG = 'wc-latest';
const BROADCAST_STALE_MS = 24 * 60 * 60 * 1000;
const BROADCAST_TOAST_MS = 6000;
const SCORE_TOAST_MS = 6000;
const DEFAULT_TOAST_MS = 8000;
const AUTO_PROMPT_KEY = 'worldcup_notifAutoPrompted';
const AUTO_PROMPT_DELAY_MS = 1200;

let userGestureReady = false;

function initVibrateGestureGate() {
  if (userGestureReady || typeof window === 'undefined') return;
  const markReady = () => {
    userGestureReady = true;
  };
  window.addEventListener('pointerdown', markReady, { capture: true, once: true });
  window.addEventListener('keydown', markReady, { capture: true, once: true });
}

function safeVibrate(pattern) {
  if (!userGestureReady || !isMobileDevice() || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Chrome blocks vibrate until user gesture — ignore silently
  }
}

function allowUpdateNotifications() {
  return !isMobileDevice();
}

function syncMobileNotificationPref() {
  if (!('serviceWorker' in navigator)) return;
  const type = isMobileDevice() ? 'DISABLE_MOBILE_UPDATE_NOTIF' : 'ENABLE_MOBILE_UPDATE_NOTIF';
  void navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type });
  });
}

function clearPendingNotificationsSilently() {
  migrateLegacyPendingNotifications();
  const raw = localStorage.getItem(PENDING_NOTIF_KEY);
  localStorage.removeItem(PENDING_NOTIF_KEY);
  if (!raw) return;
  try {
    const pending = JSON.parse(raw);
    if (pending.type === 'score' && pending.changes?.length) {
      const changes = filterUnnotifiedScoreChanges(pending.changes);
      if (changes.length) markScoresNotified(changes);
    }
  } catch { /* ignore */ }
}

export function initNotifications() {
  initVibrateGestureGate();

  if (!localStorage.getItem(SHOWN_BROADCAST_KEY) && localStorage.getItem('worldcup_lastBroadcastId')) {
    localStorage.setItem(SHOWN_BROADCAST_KEY, localStorage.getItem('worldcup_lastBroadcastId'));
  }

  injectToastStyles();
  ensureToastElement();
  renderNotificationControls();
  document.getElementById('ios-push-hint-bar')?.remove();
  document.getElementById('ios-push-hint-styles')?.remove();
  document.documentElement.classList.remove('has-ios-push-hint');
  syncMobileNotificationPref();
  if (isMobileDevice()) {
    clearPendingNotificationsSilently();
    void closeExistingNotifications();
  } else {
    flushPendingNotification();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, message } = event.data || {};
      if (type === 'SCORE_UPDATED' && message && allowUpdateNotifications()) {
        showUpdateToast(message, { durationMs: SCORE_TOAST_MS });
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && allowUpdateNotifications()) flushPendingNotification();
  });
  window.addEventListener('pageshow', () => {
    if (allowUpdateNotifications()) flushPendingNotification();
  });
  window.addEventListener('focus', () => {
    if (allowUpdateNotifications()) flushPendingNotification();
  });

  setTimeout(() => void autoPromptNotificationsOnEntry(), AUTO_PROMPT_DELAY_MS);
}

/** ขอสิทธิแจ้งเตือนอัตโนมัติเมื่อเข้าเว็บ (ครั้งละ 1 ต่อ session) */
export async function autoPromptNotificationsOnEntry() {
  if (isMobileDevice()) return;
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
  localStorage.removeItem(PENDING_NOTIF_KEY);
  currentBannerId = 0;
}

function queuePendingNotification(payload) {
  localStorage.setItem(PENDING_NOTIF_KEY, JSON.stringify({
    ...payload,
    queuedAt: Date.now()
  }));
  localStorage.removeItem(PENDING_BROADCAST_KEY);
  localStorage.removeItem(PENDING_SCORE_KEY);
}

function migrateLegacyPendingNotifications() {
  const bcRaw = localStorage.getItem(PENDING_BROADCAST_KEY);
  const scoreRaw = localStorage.getItem(PENDING_SCORE_KEY);
  if (!bcRaw && !scoreRaw) return;

  let latest = null;
  if (bcRaw) {
    try {
      const bc = JSON.parse(bcRaw);
      latest = {
        type: 'broadcast',
        broadcast: bc,
        message: `📢 ${getBroadcastMessage(bc)}`,
        queuedAt: Date.parse(bc.sentAt) || 0
      };
    } catch { /* ignore */ }
  }
  if (scoreRaw) {
    try {
      const payload = JSON.parse(scoreRaw);
      const item = {
        type: 'score',
        changes: payload.changes,
        message: payload.message,
        queuedAt: Date.now()
      };
      if (!latest || item.queuedAt >= latest.queuedAt) latest = item;
    } catch { /* ignore */ }
  }

  localStorage.removeItem(PENDING_BROADCAST_KEY);
  localStorage.removeItem(PENDING_SCORE_KEY);
  if (latest) queuePendingNotification(latest);
}

export function flushPendingNotification() {
  if (!allowUpdateNotifications()) {
    clearPendingNotificationsSilently();
    return;
  }
  if (document.hidden) return;
  migrateLegacyPendingNotifications();

  const raw = localStorage.getItem(PENDING_NOTIF_KEY);
  if (!raw) return;

  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    localStorage.removeItem(PENDING_NOTIF_KEY);
    return;
  }
  localStorage.removeItem(PENDING_NOTIF_KEY);

  if (pending.type === 'score' && pending.changes?.length) {
    const changes = filterUnnotifiedScoreChanges(pending.changes);
    if (!changes.length) return;
    displayScoreUpdateMessage(
      pending.message || formatScoreUpdateMessage(changes),
      { changes, autoDismiss: true }
    );
    return;
  }

}

export function flushPendingBroadcast() {
  flushPendingNotification();
}

export function flushPendingScoreUpdate() {
  flushPendingNotification();
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
  safeVibrate([80, 40, 80]);
}

export function processScoreUpdates(changes, { onInit = false } = {}) {
  const fresh = filterUnnotifiedScoreChanges(changes || []);
  if (!fresh.length) return false;

  if (!allowUpdateNotifications()) {
    markScoresNotified(fresh);
    return true;
  }

  const message = formatScoreUpdateMessage(fresh);

  if (document.hidden) {
    queuePendingNotification({ type: 'score', changes: fresh, message });
    showBrowserNotification(message);
    return true;
  }

  displayScoreUpdateMessage(message, { changes: fresh, autoDismiss: true });
  return true;
}

export function processBroadcast(serverData, { onInit = false } = {}) {
  const bc = serverData?.broadcast;
  if (!bc?.id) {
    hideBroadcastBanner();
    return false;
  }

  const shownId = Number(localStorage.getItem(SHOWN_BROADCAST_KEY) || 0);
  if (bc.id <= shownId) {
    hideBroadcastBanner();
    return false;
  }

  updateBroadcastBanner(bc);

  if (onInit && shownId === 0 && bc.sentAt) {
    const age = Date.now() - Date.parse(bc.sentAt);
    if (Number.isFinite(age) && age > BROADCAST_STALE_MS) {
      markBroadcastShown(bc.id);
      return false;
    }
  }

  const text = `📢 ${getBroadcastMessage(bc)}`;
  displayBroadcastMessage(text, {
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

  safeVibrate([120, 60, 120]);

  if (document.hidden) {
    showBrowserNotification(text, browserType);
  }

  if (markShown && broadcastId) {
    markBroadcastShown(broadcastId);
    showingBroadcastToastId = 0;
  }
}

export function notifyDataUpdate({ type = 'data', message, forceBrowserNotify = false } = {}) {
  if (!allowUpdateNotifications()) return;

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

async function closeExistingNotifications() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const notifications = await reg?.getNotifications?.() || [];
    notifications.forEach((n) => n.close());
  } catch {
    // ignore
  }
}

async function showBrowserNotification(text) {
  if (!allowUpdateNotifications()) return;
  if (!canUseWebNotifications() || Notification.permission !== 'granted') return;

  const title = 'World Cup 2026 — อัปเดตสกอร์';
  const options = {
    body: text.replace(/^📢\s*/, ''),
    icon: resolveAppPath('icons/icon-192.png'),
    badge: resolveAppPath('icons/icon-192.png'),
    tag: NOTIFICATION_TAG,
    renotify: true
  };

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await closeExistingNotifications();
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

let toastDismissHandler = null;

export function showUpdateToast(message, { durationMs = DEFAULT_TOAST_MS, onDismiss } = {}) {
  if (!allowUpdateNotifications()) {
    onDismiss?.();
    return;
  }

  const toast = ensureToastElement();
  const textEl = toast.querySelector('.update-toast__text');
  clearTimeout(toastTimer);
  toastDismissHandler?.();
  toastDismissHandler = onDismiss || null;
  textEl.textContent = message;
  toast.classList.remove('update-toast--visible');
  void toast.offsetWidth;
  toast.classList.add('update-toast--visible');
  toastTimer = setTimeout(() => {
    toast.classList.remove('update-toast--visible');
    toastDismissHandler?.();
    toastDismissHandler = null;
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
    toastDismissHandler?.();
    toastDismissHandler = null;
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
      btn.disabled = true;
      btn.textContent = 'เปิดแจ้งเตือนนอกแอปแล้ว';
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
          type: 'data',
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
      notifyDataUpdate({ type: 'data', message: 'ลงทะเบียน Push นอกแอปสำเร็จ' });
      return;
    }

    if (push.reason === 'ios-need-pwa' || push.reason === 'ios-use-safari' || push.reason === 'ios-need-update') {
      if (push.reason === 'ios-use-safari') {
        window.open('https://nguan08.github.io/world-cup/', '_blank', 'noopener');
      } else {
        import('./pwa.js').then((m) => m.showManualInstallHelp?.({ preferRedirect: false }));
      }
      notifyDataUpdate({
        type: 'data',
        message: push.reason === 'ios-need-update'
          ? 'อัปเดต iOS เป็น 16.4+ แล้วเปิดจากไอคอนแอปอีกครั้ง'
          : 'iPhone: ติดตั้งจาก Safari แล้วเปิดจากไอคอน จึงจะได้ Push นอกแอป'
      });
      return;
    }

    notifyDataUpdate({
      type: 'data',
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

    }
  `;
  document.head.appendChild(style);
}