import { app } from './state.js';
/** ASCII-safe slug for form field id/name (falls back to index when name has no latin chars) */
export function toFieldSlug(str, fallback = 'field') {
  const slug = String(str).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return slug || fallback;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getCachedEl(id) {
  if (!app.elCache[id]) app.elCache[id] = document.getElementById(id);
  return app.elCache[id];
}

export function debounce(fn, delay = 120) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
