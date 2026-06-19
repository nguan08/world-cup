import { app } from './state.js';
import { getCachedEl } from './utils.js';

const GITHUB_TOKEN_KEY = 'worldcup_githubToken';

export function getGitHubToken() {
  return sessionStorage.getItem(GITHUB_TOKEN_KEY) || '';
}

export function setGitHubToken(token) {
  const trimmed = (token || '').trim();
  if (trimmed) sessionStorage.setItem(GITHUB_TOKEN_KEY, trimmed);
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
