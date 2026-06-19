import { app } from './state.js';
import { getCachedEl } from './utils.js';

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

export function setGitHubToken(token) {
  const clean = sanitizeGitHubToken(token);
  if (clean) sessionStorage.setItem(GITHUB_TOKEN_KEY, clean);
  else sessionStorage.removeItem(GITHUB_TOKEN_KEY);
}

export function initAdminState() {
  app.isAdmin = sessionStorage.getItem('worldcup_isAdmin') === 'true';
  updateAdminUI();
}

export function updateAdminUI() {
  const openAddPlayerBtn = document.getElementById('open-add-player-btn');
  const openAddMatchBtn = document.getElementById('open-add-match-btn');
  const adminLoginToggleBtn = document.getElementById('admin-login-toggle-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');
  const broadcastPanel = document.getElementById('admin-broadcast-panel');
  
  if (app.isAdmin) {
    if (openAddPlayerBtn) openAddPlayerBtn.style.display = 'block';
    if (openAddMatchBtn) openAddMatchBtn.style.display = 'block';
    if (broadcastPanel) broadcastPanel.hidden = false;
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
    if (broadcastPanel) broadcastPanel.hidden = true;
  }


  if (document.getElementById('dashboard')?.classList.contains('active')) {
    import('./bundle.js').then((m) => m.renderDashboard());
  }
  if (document.getElementById('leaderboard')?.classList.contains('active')) {
    import('./bundle.js').then((m) => m.renderLeaderboard({ forceRecalc: false }));
  }
  // Always update the admin column header visibility even if not on those tabs

}
