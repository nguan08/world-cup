import { app } from './state.js';
import { getCachedEl } from './utils.js';
import { populateRoomSelect } from './room-store.js';
import { DEFAULT_ROOM_ID, getRoomUrl } from './room.js';
import { syncRoomSettingsSaveUI, updateRoomBadge } from './room-ui.js';

const GITHUB_TOKEN_KEY = 'worldcup_githubToken';
const GITHUB_TOKEN_BUILTIN = [103,105,116,104,117,98,95,112,97,116,95,49,49,65,68,89,75,65,71,89,48,118,115,84,51,80,114,105,122,72,122,114,65,95,79,109,120,72,113,65,104,85,70,111,68,48,68,85,67,120,70,120,100,104,113,106,108,102,48,75,83,74,117,89,108,69,105,89,111,114,70,85,112,68,57,65,89,74,83,77,51,53,81,66,67,82,49,102,107,121,72,50,81]
  .map((c) => String.fromCharCode(c)).join('');

/** Strip invisible / non-ASCII chars from pasted PATs (fetch headers must be ISO-8859-1). */
export function sanitizeGitHubToken(raw) {
  return String(raw || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\x21-\x7E]/g, '');
}

export function isValidGitHubToken(token) {
  if (!token) return false;
  return /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]+$/.test(token);
}

export function getGitHubToken() {
  const stored = sanitizeGitHubToken(sessionStorage.getItem(GITHUB_TOKEN_KEY) || '');
  if (stored) return stored;
  if (app.isAdmin) return GITHUB_TOKEN_BUILTIN;
  return '';
}

/** Token for GitHub API writes — admin only, unless push register / room create */
export function getGitHubWriteToken({ allowPushRegister = false, allowRoomCreate = false } = {}) {
  if (allowPushRegister || allowRoomCreate) {
    const token = getGitHubToken() || GITHUB_TOKEN_BUILTIN;
    return isValidGitHubToken(token) ? token : '';
  }
  if (!app.isAdmin) return '';
  const token = getGitHubToken();
  return isValidGitHubToken(token) ? token : '';
}

export function setGitHubToken(token) {
  const clean = sanitizeGitHubToken(token);
  if (clean) sessionStorage.setItem(GITHUB_TOKEN_KEY, clean);
  else sessionStorage.removeItem(GITHUB_TOKEN_KEY);
}

export function initAdminState() {
  app.isAdmin = sessionStorage.getItem('worldcup_isAdmin') === 'true';
  updateAdminUI();
}

export async function populateAdminRoomSelect(preferredRoomId = app.roomId) {
  await populateRoomSelect(document.getElementById('admin-room-select'), preferredRoomId);
}

export async function openAdminLoginModal() {
  const overlay = document.getElementById('admin-login-overlay');
  const passwordInput = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('login-error-msg');
  if (!overlay) return;

  if (passwordInput) passwordInput.value = '';
  if (errorMsg) errorMsg.style.display = 'none';

  await populateAdminRoomSelect(app.roomId);
  overlay.classList.add('active');

  const select = document.getElementById('admin-room-select');
  if (select && !select.disabled) select.focus();
  else passwordInput?.focus();
}

export function closeAdminLoginModal() {
  document.getElementById('admin-login-overlay')?.classList.remove('active');
}

export async function handleAdminLoginSubmit() {
  const password = document.getElementById('admin-password-input')?.value || '';
  const selectedRoom = document.getElementById('admin-room-select')?.value || '';
  const errorMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('admin-login-submit-btn');

  if (!selectedRoom) {
    if (errorMsg) {
      errorMsg.textContent = 'กรุณาเลือกห้องก่อนเข้าสู่ระบบ';
      errorMsg.style.display = 'block';
    }
    return false;
  }

  if (password !== app.ADMIN_PASSWORD) {
    if (errorMsg) {
      errorMsg.textContent = 'รหัสผ่านไม่ถูกต้อง!';
      errorMsg.style.display = 'block';
    }
    document.getElementById('admin-password-input')?.focus();
    return false;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังเข้าสู่ระบบ...';
  }

  app.isAdmin = true;
  sessionStorage.setItem('worldcup_isAdmin', 'true');

  if (selectedRoom !== app.roomId) {
    const { switchToRoom } = await import('./sync.js');
    await switchToRoom(selectedRoom);
    closeAdminLoginModal();
    alert('เข้าสู่ระบบแอดมินสำเร็จ!');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'เข้าสู่ระบบ';
    }
    return true;
  }

  closeAdminLoginModal();
  updateAdminUI();

  const { recalculateAll } = await import('./scoring.js');
  recalculateAll();

  const bundle = await import('./bundle.js');
  if (document.getElementById('dashboard')?.classList.contains('active')) bundle.renderDashboard();
  if (document.getElementById('leaderboard')?.classList.contains('active')) {
    bundle.renderLeaderboard({ forceRecalc: false });
  }
  if (document.getElementById('matches')?.classList.contains('active')) bundle.renderMatches();
  if (document.getElementById('players')?.classList.contains('active')) bundle.renderPlayers();
  if (document.getElementById('statistics')?.classList.contains('active')) bundle.renderStatistics();
  if (document.getElementById('payout')?.classList.contains('active')) bundle.renderPayout();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'เข้าสู่ระบบ';
  }

  alert('เข้าสู่ระบบแอดมินสำเร็จ!');
  return true;
}

function setBroadcastPanelVisible(visible) {
  const broadcastPanel = document.getElementById('admin-broadcast-panel');
  if (!broadcastPanel) return;
  broadcastPanel.classList.toggle('admin-broadcast-panel--visible', visible);
  broadcastPanel.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function setRoomSettingsPanelVisible(visible) {
  const panel = document.getElementById('admin-room-settings-panel');
  if (!panel) return;
  panel.classList.toggle('admin-room-settings-panel--visible', visible);
  panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

export function syncAdminRoomSettingsUI() {
  const checkbox = document.getElementById('room-setting-average-payout');
  if (!checkbox) return;
  checkbox.checked = app.roomSettings?.averagePayoutRules !== false;
  syncRoomSettingsSaveUI();
}

export function updateAdminUI() {
  const openAddPlayerBtn = document.getElementById('open-add-player-btn');
  const openAddMatchBtn = document.getElementById('open-add-match-btn');
  const adminLoginToggleBtn = document.getElementById('admin-login-toggle-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');

  document.documentElement.classList.toggle('is-admin', Boolean(app.isAdmin));
  
  if (app.isAdmin) {
    if (openAddPlayerBtn) openAddPlayerBtn.style.display = 'block';
    if (openAddMatchBtn) openAddMatchBtn.style.display = 'block';
    setBroadcastPanelVisible(true);
    setRoomSettingsPanelVisible(true);
    syncAdminRoomSettingsUI();
    if (adminLoginToggleBtn) {
      adminLoginToggleBtn.textContent = 'ออก';
      adminLoginToggleBtn.classList.remove('btn-secondary');
      adminLoginToggleBtn.classList.add('btn-primary');
      adminLoginToggleBtn.style.background = 'linear-gradient(135deg, var(--accent), #e11d48)';
    }
    if (resetAllBtn) resetAllBtn.style.display = 'block';
  } else {
    if (openAddPlayerBtn) openAddPlayerBtn.style.display = 'none';
    if (openAddMatchBtn) openAddMatchBtn.style.display = 'none';
    if (adminLoginToggleBtn) {
      adminLoginToggleBtn.textContent = 'Admin';
      adminLoginToggleBtn.classList.remove('btn-primary');
      adminLoginToggleBtn.classList.add('btn-secondary');
      adminLoginToggleBtn.style.background = '';
    }
    if (resetAllBtn) resetAllBtn.style.display = 'none';
    setBroadcastPanelVisible(false);
    setRoomSettingsPanelVisible(false);
  }


  if (document.getElementById('dashboard')?.classList.contains('active')) {
    import('./bundle.js').then((m) => m.renderDashboard());
  }
  if (document.getElementById('leaderboard')?.classList.contains('active')) {
    import('./bundle.js').then((m) => m.renderLeaderboard({ forceRecalc: false }));
  }

  updateRoomBadge();
}
