import { resolveAppPath } from './app-path.js';

export const DEFAULT_ROOM_ID = 'default';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{3,32}$/;

export function normalizeRoomSlug(raw) {
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return slug;
}

export function isValidRoomSlug(slug) {
  if (!slug || slug === DEFAULT_ROOM_ID) return slug === DEFAULT_ROOM_ID;
  return SLUG_RE.test(slug);
}

export function generateRoomSlug() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < 8; i += 1) {
    slug += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return slug;
}

export function parseRoomFromUrl(search = location.search) {
  const params = new URLSearchParams(search);
  const raw = params.get('room');
  if (!raw) return DEFAULT_ROOM_ID;
  const slug = normalizeRoomSlug(raw);
  return slug || DEFAULT_ROOM_ID;
}

export function roomFilePath(slug) {
  return `rooms/${slug}.json`;
}

export function roomsIndexPath() {
  return 'rooms/index.json';
}

export function getRoomUrl(slug = DEFAULT_ROOM_ID) {
  const base = resolveAppPath('');
  const url = new URL(base, location.origin);
  if (slug && slug !== DEFAULT_ROOM_ID) {
    url.searchParams.set('room', slug);
  } else {
    url.searchParams.delete('room');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function roomStorageKey(suffix, roomId = null) {
  const id = roomId || (typeof window !== 'undefined' && window.__wcRoomId) || DEFAULT_ROOM_ID;
  return `worldcup:${id}:${suffix}`;
}

export const DEFAULT_ROOM_SETTINGS = {
  averagePayoutRules: true
};

export function normalizeRoomSettings(raw) {
  const settings = raw && typeof raw === 'object' ? raw : {};
  return {
    averagePayoutRules: settings.averagePayoutRules !== false
  };
}

export function buildRoomRecord({ id, name, players = [], settings = null }) {
  return {
    id,
    name: String(name || id).trim() || id,
    createdAt: new Date().toISOString(),
    players: Array.isArray(players) ? players : [],
    settings: normalizeRoomSettings(settings ?? DEFAULT_ROOM_SETTINGS)
  };
}