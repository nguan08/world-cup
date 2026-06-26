import { app } from './state.js';
import { getGitHubToken, isValidGitHubToken } from './admin.js';
import { formatScoreUpdateMessage, notifyDataUpdate } from './notifications.js';
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

function isShaConflict(status, message = '') {
  return status === 409 || /does not match/i.test(message);
}

async function fetchGitHubFileSha(token) {
  const url = `${githubContentsUrl(GITHUB_DATA_FILE)}?ref=${GITHUB_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: githubAuthHeaders(token)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `อ่าน ${GITHUB_DATA_FILE} จาก world-cup ล้มเหลว (${res.status})`);
  }
  const data = await res.json();
  assertWorldCupFileMeta(data);
  return data.sha;
}

async function putGitHubDataJson(payload, token, sha) {
  const content = encodeBase64Utf8(JSON.stringify(payload, null, 2));
  const res = await fetch(githubContentsUrl(GITHUB_DATA_FILE), {
    method: 'PUT',
    cache: 'no-store',
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
    const error = new Error(err.message || `บันทึก world-cup/data.json ล้มเหลว (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const saved = await res.json();
  assertWorldCupFileMeta(saved.content);
  return saved;
}

async function saveToGitHub(payload, token) {
  await verifyWorldCupRepoAccess(token);

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const sha = await fetchGitHubFileSha(token);
    try {
      return await putGitHubDataJson(payload, token, sha);
    } catch (e) {
      if (isShaConflict(e.status, e.message) && attempt < maxAttempts) {
        console.warn(`[Persist] data.json SHA conflict — retry ${attempt}/${maxAttempts - 1}`);
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      if (isShaConflict(e.status, e.message)) {
        throw new Error('ไฟล์ data.json ถูกอัปเดตพร้อมกัน — ลองบันทึกอีกครั้ง');
      }
      throw e;
    }
  }
}

let _githubSaveChain = Promise.resolve();

function enqueueGitHubSave(task) {
  const run = _githubSaveChain.then(task, task);
  _githubSaveChain = run.catch(() => {});
  return run;
}

function notifyAdminSave(message, isError = false) {
  if (!app.isAdmin) return;
  notifyDataUpdate({ type: 'data', message: isError ? `⚠️ ${message}` : `✅ ${message}` });
}

function buildScoreUpdateBroadcast(matches, { cleared = false } = {}) {
  const list = Array.isArray(matches) ? matches.filter(Boolean) : [];
  if (!list.length) return;
  const message = cleared
    ? `🔄 ล้างผล: ${list.map((m) => `${m.home} vs ${m.away}`).join(', ')}`
    : formatScoreUpdateMessage(list);
  app.broadcast = {
    id: Date.now(),
    message,
    sentAt: new Date().toISOString()
  };
}

async function dispatchScoreNotificationAfterSave() {
  if (!app.broadcast?.id) return;
  localStorage.setItem('worldcup_shownBroadcastId', String(app.broadcast.id));
  try {
    await import('./push.js').then((m) => m.triggerPushWorkflow());
  } catch {
    // Push is best-effort; data.json update still triggers the workflow on GitHub.
  }
  import('./sync.js').then((m) => m.requestPollNow());
}

/** Save match score changes to GitHub and notify all users (toast + push). */
export async function saveAdminScoreUpdate(matches, { cleared = false } = {}) {
  if (!app.isAdmin) return false;
  const list = Array.isArray(matches) ? matches.filter(Boolean) : [];
  if (!list.length) return false;

  buildScoreUpdateBroadcast(list, { cleared });
  const ok = await saveToServer({ quiet: true });
  if (ok) {
    await dispatchScoreNotificationAfterSave();
    notifyAdminSave(`แจ้งเตือนทุกคนแล้ว: ${app.broadcast.message}`);
    return true;
  }

  app.broadcast = null;
  notifyAdminSave('ซิงค์ GitHub ล้มเหลว — ไม่ได้ส่งแจ้งเตือน', true);
  return false;
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
    localStorage.setItem('worldcup_shownBroadcastId', String(app.broadcast.id));
    const pushTriggered = await import('./push.js').then((m) => m.triggerPushWorkflow());
    const pushHint = pushTriggered
      ? ' + ส่ง Push นอกแอปแล้ว'
      : ' (Push นอกแอปภายใน ~5 นาที)';
    notifyAdminSave(`ส่งถึงทุกคนแล้ว: "${text}" (เครื่องอื่นเห็นภายใน ~30 วินาที${pushHint})`);
    import('./sync.js').then((m) => m.requestPollNow());
  } else {
    notifyAdminSave('ส่งแจ้งเตือนล้มเหลว — ตรวจสอบสิทธิ์ repo world-cup', true);
  }
  return ok;
}

async function saveToLocalDevMirror(payload) {
  if (!isLocalDevHost() || !app.isAdmin) return false;
  try {
    const body = { ...payload, adminPassword: app.ADMIN_PASSWORD };
    const response = await fetch(resolveAppPath('api/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (response.ok) {
      console.log('[Persist] Mirrored data to local data.json');
      return true;
    }
    console.warn('[Persist] Local /api/save failed:', response.status, response.statusText);
  } catch {
    console.log('[Persist] Local /api/save unavailable');
  }
  return false;
}

async function postLocalEliminatedTeams(eliminatedTeams) {
  if (!isLocalDevHost() || !app.isAdmin) return false;
  try {
    const response = await fetch(resolveAppPath('api/eliminated-teams'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPassword: app.ADMIN_PASSWORD,
        eliminatedTeams
      })
    });
    if (response.ok) {
      console.log('[Persist] Saved eliminated teams to local data.json');
      return true;
    }
    console.warn('[Persist] Local /api/eliminated-teams failed:', response.status, response.statusText);
  } catch {
    console.log('[Persist] Local /api/eliminated-teams unavailable');
  }
  return false;
}

export async function saveEliminatedTeamsToServer({ quiet = false } = {}) {
  if (!app.isAdmin) return false;

  const eliminatedTeams = Array.from(app.manualEliminatedTeams);
  const localOk = await postLocalEliminatedTeams(eliminatedTeams);

  const token = getGitHubToken();
  if (isValidGitHubToken(token)) {
    const githubOk = await saveToServer({ quiet: true });
    if (githubOk) {
      if (!quiet) notifyAdminSave('บันทึกทีมที่ตกรอบแล้ว');
      return true;
    }
    if (localOk) {
      if (!quiet) notifyAdminSave('บันทึกทีมที่ตกรอบในเครื่องแล้ว (ซิงค์ GitHub ล้มเหลว)', true);
      return true;
    }
    if (!quiet) notifyAdminSave('ซิงค์ทีมที่ตกรอบล้มเหลว', true);
    return false;
  }

  if (localOk) {
    if (!quiet) notifyAdminSave('บันทึกทีมที่ตกรอบแล้ว');
    return true;
  }

  if (!quiet) notifyAdminSave('บันทึกทีมที่ตกรอบล้มเหลว', true);
  return false;
}

export async function saveToServer({ quiet = false } = {}) {
  const payload = buildPayload();

  if (!app.isAdmin) {
    return false;
  }

  // Keep local dev data.json in sync, but never treat it as the source of truth for GitHub Pages.
  await saveToLocalDevMirror(payload);

  const token = getGitHubToken();
  if (!token) {
    console.warn('[Persist] Admin save skipped: no GitHub token');
    if (!quiet) notifyAdminSave('ไม่มี GitHub Token — ซิงค์ GitHub ไม่ได้', true);
    return false;
  }
  if (!isValidGitHubToken(token)) {
    if (!quiet) notifyAdminSave('GitHub Token ไม่ถูกต้อง', true);
    return false;
  }

  try {
    await enqueueGitHubSave(() => saveToGitHub(payload, token));
    console.log(`Successfully synced to ${GITHUB_REPO_FULL}/${GITHUB_DATA_FILE}`);
    if (!quiet) notifyAdminSave(`ซิงค์ ${GITHUB_REPO_FULL} สำเร็จ`);
    return true;
  } catch (e) {
    console.error('[Persist] world-cup GitHub save failed:', e);
    if (!quiet) notifyAdminSave(`ซิงค์ GitHub ล้มเหลว: ${e.message}`, true);
    return false;
  }
}