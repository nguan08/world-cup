import { app } from './state.js';
import { getGitHubWriteToken } from './admin.js';
import { isLocalDevHost, resolveAppPath } from './app-path.js';
import { escapeHtml } from './utils.js';
import {
  GITHUB_BRANCH,
  GITHUB_REPO_FULL,
  assertWorldCupFileMeta,
  assertWorldCupRepo,
  githubContentsUrl,
  githubRepoApiUrl
} from './github-config.js';
import {
  DEFAULT_ROOM_ID,
  buildRoomRecord,
  generateRoomSlug,
  isValidRoomSlug,
  normalizeRoomSettings,
  normalizeRoomSlug,
  roomFilePath,
  roomsIndexPath
} from './room.js';

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function githubAuthHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function isShaConflict(status, message = '') {
  return status === 409 || /does not match/i.test(message);
}

async function fetchGitHubJson(path, token) {
  const url = `${githubContentsUrl(path)}?ref=${GITHUB_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: githubAuthHeaders(token)
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `อ่าน ${path} ล้มเหลว (${res.status})`);
  }
  const meta = await res.json();
  assertWorldCupFileMeta(meta);
  const decoded = atob(String(meta.content || '').replace(/\n/g, ''));
  return { data: JSON.parse(decoded), sha: meta.sha };
}

async function putGitHubJson(path, data, token, sha, message) {
  const content = encodeBase64Utf8(`${JSON.stringify(data, null, 2)}\n`);
  const body = {
    message,
    content,
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  const res = await fetch(githubContentsUrl(path), {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      ...githubAuthHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.message || `บันทึก ${path} ล้มเหลว (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const saved = await res.json();
  assertWorldCupFileMeta(saved.content);
  return saved;
}

async function verifyRepo(token) {
  const res = await fetch(githubRepoApiUrl(), { headers: githubAuthHeaders(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `ไม่มีสิทธิ์เข้าถึง ${GITHUB_REPO_FULL}`);
  }
  assertWorldCupRepo(await res.json());
}

export async function fetchRoomFromNetwork(slug) {
  const path = roomFilePath(slug);
  try {
    const res = await fetch(`${resolveAppPath(path)}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (e) {
    console.warn(`[Room] Failed to fetch ${path}:`, e.message);
    return null;
  }
}

export async function fetchRoomsIndex() {
  try {
    const res = await fetch(`${resolveAppPath(roomsIndexPath())}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { rooms: [] };
    const data = await res.json();
    return Array.isArray(data?.rooms) ? data : { rooms: [] };
  } catch {
    return { rooms: [] };
  }
}

function pickUniqueSlug(requested, taken) {
  const base = normalizeRoomSlug(requested) || generateRoomSlug();
  if (!taken.has(base) && isValidRoomSlug(base)) return base;
  for (let i = 0; i < 20; i += 1) {
    const candidate = `${base.slice(0, 24)}-${generateRoomSlug().slice(0, 4)}`;
    if (!taken.has(candidate) && isValidRoomSlug(candidate)) return candidate;
  }
  return generateRoomSlug();
}

async function createRoomLocal(record) {
  if (!isLocalDevHost()) return false;
  try {
    const res = await fetch(resolveAppPath('api/rooms'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `สร้างห้องล้มเหลว (${res.status})`);
    }
    return true;
  } catch (e) {
    console.warn('[Room] Local create failed:', e.message);
    return false;
  }
}

async function createRoomGitHub(record, token) {
  await verifyRepo(token);
  const path = roomFilePath(record.id);
  const indexPath = roomsIndexPath();

  let indexSha = null;
  let index = { rooms: [] };
  try {
    const existing = await fetchGitHubJson(indexPath, token);
    if (existing) {
      index = existing.data;
      indexSha = existing.sha;
    }
  } catch {
    // index may not exist yet
  }

  const rooms = Array.isArray(index.rooms) ? [...index.rooms] : [];
  if (rooms.some((r) => r.id === record.id)) {
    throw new Error('มีห้องนี้อยู่แล้ว');
  }
  rooms.push({
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    playerCount: record.players.length
  });
  index.rooms = rooms;

  await putGitHubJson(path, record, token, null, `Create room ${record.id}`);
  await putGitHubJson(indexPath, index, token, indexSha, `Register room ${record.id}`);
  return true;
}

export async function createRoom({ name, slug: requestedSlug } = {}) {
  const displayName = String(name || '').trim();
  if (!displayName) throw new Error('กรุณาตั้งชื่อห้อง');

  const index = await fetchRoomsIndex();
  const taken = new Set((index.rooms || []).map((r) => r.id));
  const id = pickUniqueSlug(requestedSlug || displayName, taken);
  if (!isValidRoomSlug(id)) throw new Error('รหัสห้องไม่ถูกต้อง');

  const record = buildRoomRecord({ id, name: displayName, players: [] });

  const localOk = await createRoomLocal(record);
  if (localOk) return record;

  const token = getGitHubWriteToken({ allowRoomCreate: true });
  if (!token) {
    throw new Error('ไม่สามารถสร้างห้องบนเซิร์ฟเวอร์ได้ — ลองรัน local server หรือเข้าสู่ระบบแอดมิน');
  }

  await createRoomGitHub(record, token);
  return record;
}

export async function saveRoomToServer({ quiet = false } = {}) {
  if (!app.roomId) return false;

  const record = {
    id: app.roomId,
    name: app.roomName || app.roomId,
    createdAt: app.roomCreatedAt || new Date().toISOString(),
    players: app.players || [],
    settings: normalizeRoomSettings(app.roomSettings)
  };

  if (isLocalDevHost()) {
    try {
      const res = await fetch(resolveAppPath(`api/rooms/${encodeURIComponent(app.roomId)}/save`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: app.ADMIN_PASSWORD,
          ...record
        })
      });
      if (res.ok) {
        if (!quiet) console.log(`[Room] Saved room ${app.roomId} locally`);
        return true;
      }
    } catch {
      // fall through to GitHub
    }
  }

  const token = getGitHubWriteToken();
  if (!token) return false;

  try {
    await verifyRepo(token);
    const path = roomFilePath(app.roomId);
    let sha = null;
    try {
      const existing = await fetchGitHubJson(path, token);
      if (existing) sha = existing.sha;
    } catch {
      // new file
    }

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await putGitHubJson(path, record, token, sha, `Update room ${app.roomId}`);
        if (app.roomId === DEFAULT_ROOM_ID) {
          // keep index player count fresh
          try {
            const indexPath = roomsIndexPath();
            const indexWrap = await fetchGitHubJson(indexPath, token);
            if (indexWrap?.data?.rooms) {
              const rooms = indexWrap.data.rooms.map((r) =>
                r.id === app.roomId
                  ? { ...r, name: record.name, playerCount: record.players.length }
                  : r
              );
              await putGitHubJson(indexPath, { rooms }, token, indexWrap.sha, `Update room index ${app.roomId}`);
            }
          } catch {
            // non-fatal
          }
        }
        return true;
      } catch (e) {
        if (isShaConflict(e.status, e.message) && attempt < maxAttempts) {
          const latest = await fetchGitHubJson(path, token);
          sha = latest?.sha || null;
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    console.error('[Room] GitHub save failed:', e);
    if (!quiet) throw e;
  }

  return false;
}