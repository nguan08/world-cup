import { app } from './state.js';
import { getGitHubToken, isValidGitHubToken } from './admin.js';
import { notifyDataUpdate } from './notifications.js';
import { isLocalDevHost, resolveAppPath } from './app-path.js';
import {
  GITHUB_BRANCH,
  GITHUB_DATA_FILE,
  GITHUB_REPO_FULL,
  assertWorldCupFileMeta,
  assertWorldCupRepo,
  githubContentsUrl,
  githubRepoApiUrl
} from './github-config.js';

function buildPayload() {
  const payload = {
    matches: app.matches,
    players: app.players,
    eliminatedTeams: Array.from(app.manualEliminatedTeams)
  };
  if (app.broadcast) payload.broadcast = app.broadcast;
  return payload;
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function githubAuthHeaders(token) {
  const auth = `Bearer ${token}`;
  if (!/^[\x00-\xFF]*$/.test(auth)) {
    throw new Error('GitHub Token มีอักขระไม่ถูกต้อง');
  }
  return {
    Accept: 'application/vnd.github+json',
    Authorization: auth,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function verifyWorldCupRepoAccess(token) {
  const res = await fetch(githubRepoApiUrl(), { headers: githubAuthHeaders(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `ไม่มีสิทธิ์เข้าถึง ${GITHUB_REPO_FULL} (${res.status})`);
  }
  const repo = await res.json();
  assertWorldCupRepo(repo);
}

async function fetchGitHubFileSha(token) {
  const url = `${githubContentsUrl(GITHUB_DATA_FILE)}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: githubAuthHeaders(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `อ่าน ${GITHUB_DATA_FILE} จาก world-cup ล้มเหลว (${res.status})`);
  }
  const data = await res.json();
  assertWorldCupFileMeta(data);
  return data.sha;
}

async function saveToGitHub(payload, token) {
  await verifyWorldCupRepoAccess(token);
  const sha = await fetchGitHubFileSha(token);
  const content = encodeBase64Utf8(JSON.stringify(payload, null, 2));
  const res = await fetch(githubContentsUrl(GITHUB_DATA_FILE), {
    method: 'PUT',
    headers: {
      ...githubAuthHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Update world-cup data.json via admin',
      content,
      sha,
      branch: GITHUB_BRANCH
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `บันทึก world-cup/data.json ล้มเหลว (${res.status})`);
  }
  const saved = await res.json();
  assertWorldCupFileMeta(saved.content);
  return saved;
}

function notifyAdminSave(message, isError = false) {
  if (!app.isAdmin) return;
  notifyDataUpdate({ type: 'data', message: isError ? `⚠️ ${message}` : `✅ ${message}` });
}

export async function sendBroadcastNotification(message) {
  if (!app.isAdmin) return false;

  const text = (message || '').trim()
    || 'มีการแจ้งเตือนจากแอดมิน — ตรวจสอบผลล่าสุดในแอป';
  app.broadcast = {
    id: Date.now(),
    message: text,
    sentAt: new Date().toISOString()
  };

  const ok = await saveToServer({ quiet: true });
  if (ok) {
    localStorage.setItem('worldcup_lastBroadcastId', String(app.broadcast.id));
    notifyAdminSave('ส่งแจ้งเตือนถึงผู้ใช้ที่เปิดการแจ้งเตือนแล้ว');
  } else {
    notifyAdminSave('ส่งแจ้งเตือนล้มเหลว — ตรวจสอบสิทธิ์ repo world-cup', true);
  }
  return ok;
}

export async function saveToServer({ quiet = false } = {}) {
  const payload = buildPayload();

  if (isLocalDevHost()) {
    try {
      const body = { ...payload };
      if (app.isAdmin) {
        body.adminPassword = app.ADMIN_PASSWORD;
      }
      const response = await fetch(resolveAppPath('api/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        console.log('Successfully synced data to server data.json');
        return true;
      }
      if (response.status === 401 || response.status === 403) {
        console.warn('Server refused save (admin auth required):', response.status);
      } else {
        console.warn('Server refused to save data:', response.statusText);
      }
    } catch {
      console.log('[Persist] Local /api/save unavailable — trying world-cup GitHub API');
    }
  }

  const token = getGitHubToken();
  if (!app.isAdmin || !token) {
    if (app.isAdmin && !token) {
      console.warn('[Persist] Admin save skipped: no GitHub token');
    }
    return false;
  }
  if (!isValidGitHubToken(token)) {
    if (!quiet) notifyAdminSave('GitHub Token ไม่ถูกต้อง', true);
    return false;
  }

  try {
    await saveToGitHub(payload, token);
    console.log(`Successfully synced to ${GITHUB_REPO_FULL}/${GITHUB_DATA_FILE}`);
    if (!quiet) notifyAdminSave(`ซิงค์ ${GITHUB_REPO_FULL} สำเร็จ`);
    return true;
  } catch (e) {
    console.error('[Persist] world-cup GitHub save failed:', e);
    if (!quiet) notifyAdminSave(`ซิงค์ world-cup ล้มเหลว: ${e.message}`, true);
    return false;
  }
}