import { app } from './state.js';
import { getGitHubToken } from './admin.js';
import { notifyDataUpdate } from './notifications.js';
import { isLocalDevHost, resolveAppPath } from './app-path.js';

const GITHUB_OWNER = 'nguan08';
const GITHUB_REPO = 'world-cup';
const GITHUB_PATH = 'data.json';
const GITHUB_BRANCH = 'main';

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

async function fetchGitHubFileSha(token) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub GET failed (${res.status})`);
  }
  const data = await res.json();
  return data.sha;
}

async function saveToGitHub(payload, token) {
  const sha = await fetchGitHubFileSha(token);
  const content = encodeBase64Utf8(JSON.stringify(payload, null, 2));
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      message: 'Update data.json via World Cup admin',
      content,
      sha,
      branch: GITHUB_BRANCH
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub PUT failed (${res.status})`);
  }
  return res.json();
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
    notifyAdminSave('ส่งแจ้งเตือนล้มเหลว — ตรวจสอบ GitHub Token', true);
  }
  return ok;
}

export async function saveToServer({ quiet = false } = {}) {
  const payload = buildPayload();
  let serverSaved = false;

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
      console.log('[Persist] Local /api/save unavailable — trying GitHub API fallback');
    }
  }

  const token = getGitHubToken();
  if (!app.isAdmin || !token) {
    if (app.isAdmin && !token && !serverSaved) {
      console.warn('[Persist] Admin save skipped: no GitHub token configured');
    }
    return false;
  }

  try {
    await saveToGitHub(payload, token);
    console.log('Successfully synced data to GitHub data.json');
    if (!quiet) notifyAdminSave('ซิงค์ข้อมูลลง GitHub สำเร็จ');
    return true;
  } catch (e) {
    console.error('[Persist] GitHub save failed:', e);
    if (!quiet) notifyAdminSave(`ซิงค์ GitHub ล้มเหลว: ${e.message}`, true);
    return false;
  }
}