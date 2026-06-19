export function isIPad() {
  if (/iPad/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || isIPad();
}

export function isIOSChrome() {
  return isIOS() && /CriOS/i.test(navigator.userAgent);
}

export function isIOSFirefox() {
  return isIOS() && /FxiOS/i.test(navigator.userAgent);
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isMobileLayout() {
  return window.matchMedia('(max-width: 992px)').matches;
}

export function isMobileDevice() {
  return isIOS() || isAndroid() || isMobileLayout();
}

export function isStandalonePWA() {
  if (navigator.standalone === true) return true;
  const modes = ['standalone', 'fullscreen', 'minimal-ui'];
  return modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

/** Why iOS cannot use push yet — null means ready */
export function getIOSPushBlockReason() {
  if (!isIOS()) return null;
  if (isIOSChrome() || isIOSFirefox()) return 'ios-use-safari';
  if (!isStandalonePWA()) return 'ios-need-pwa';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'ios-need-update';
  return null;
}

export function canUseWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const iosBlock = getIOSPushBlockReason();
  return !iosBlock;
}

export function canUseWebNotifications() {
  if (!('Notification' in window)) return false;
  if (!isIOS()) return true;
  return canUseWebPush();
}