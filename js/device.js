export function isIPad() {
  if (/iPad/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || isIPad();
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
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;
}

export function canUseWebNotifications() {
  if (!('Notification' in window)) return false;
  if (isIOS() && !isStandalonePWA()) return false;
  return true;
}