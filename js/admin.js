import { app } from './state.js';
import { getCachedEl } from './utils.js';

export function initAdminState() {
  app.isAdmin = sessionStorage.getItem('worldcup_isAdmin') === 'true';
  updateAdminUI();
}

export function updateAdminUI() {
  const openAddPlayerBtn = document.getElementById('open-add-player-btn');
  const openAddMatchBtn = document.getElementById('open-add-match-btn');
  const adminLoginToggleBtn = document.getElementById('admin-login-toggle-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');
  
  if (app.isAdmin) {
    if (openAddPlayerBtn) openAddPlayerBtn.style.display = 'block';
    if (openAddMatchBtn) openAddMatchBtn.style.display = 'block';
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
  }


  if (document.getElementById('dashboard')?.classList.contains('active')) {
    import('./bundle.js').then((m) => m.renderDashboard());
  }
  if (document.getElementById('leaderboard')?.classList.contains('active')) {
    import('./bundle.js').then((m) => m.renderLeaderboard({ forceRecalc: false }));
  }
  // Always update the admin column header visibility even if not on those tabs

}
