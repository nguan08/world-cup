import { app } from './state.js';
import { getCachedEl } from './utils.js';

const GITHUB_TOKEN_KEY = 'worldcup_githubToken';

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
  return sanitizeGitHubToken(sessionStorage.getItem(GITHUB_TOKEN_KEY) || '');
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
