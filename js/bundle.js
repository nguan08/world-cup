// UI, rendering, events, player drawer, team popup
import {
  TEAMS, TEAM_WC_GROUP_MEMBERS, INITIAL_MATCHES, INITIAL_PLAYERS,
  getTeamWcGroup, formatWcGroupLabel, formatZoneDisplayLabel,
  getZoneBadgeClass, getWcGroupBadgeHtml, getTeamFlagHtml, getTeamFlagUrl
} from './constants.js';
import { app } from './state.js';
import { escapeHtml, getCachedEl, debounce, toFieldSlug } from './utils.js';
import {
  calculateTeamPoints, calculatePredictionPoints, processPlayers,
  recalculateAll, updateTeamMatchesPlayedCounts, getPlayerTotalMatchesPlayed,
  loadEliminatedTeams, saveEliminatedTeams, isTeamEliminated, setRecalcHook
} from './scoring.js';
import {
  initData, clearCachedData,
  setupAutoRefresh, updateDataSyncStatus, registerRefreshPage
} from './sync.js';
import { saveToServer, sendBroadcastNotification } from './persist.js';
import { initAdminState, updateAdminUI } from './admin.js';
import { initPWA } from './pwa.js';
import { initNotifications, notifyDataUpdate } from './notifications.js';

// Drawer fill scheduling & iOS/Safari spam guards (ported + hardened)
let _playerDetailsFillToken = 0;
let _playerDetailsFillRaf1 = 0;
let _playerDetailsFillRaf2 = 0;
let _playerDetailsGridRaf = 0;
let _playerDetailsFillDebounceTimer = null;
let _playerDetailsFillInProgress = false;
let _pendingDrawerFillName = '';
let _drawerDisplayedPlayer = '';
let _finishedMatchesByTeamCache = null;
let _finishedMatchesCacheKey = '';
let _rankSoundTimerId = null;
let _rankSpeechTimerId = null;
let _lastRankSoundAt = 0;
const RANK_SOUND_COOLDOWN_MS = 2000;
const MOBILE_DRAWER_FILL_DEBOUNCE_MS = 220;
const IOS_DRAWER_FILL_DEBOUNCE_MS = 420;
const IOS_MIN_OPEN_GAP_MS = 260;
let _lastIosDrawerOpenAttempt = 0;
let _lastOpenPlayerName = '';
let _lastOpenPlayerAt = 0;

function lockScrollForPlayerDrawer() {
  if (app._playerDrawerScrollLocked) return;
  app._playerDrawerScrollLocked = true;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  app._playerDrawerSavedScrollY = y;
  document.documentElement.classList.add('player-drawer-open');
  document.body.classList.add('player-drawer-open');
  document.body.style.overflow = '';
  if (document.body.style.top !== `-${y}px`) {
    document.body.style.top = `-${y}px`;
  }
}

function unlockScrollForPlayerDrawer() {
  if (!app._playerDrawerScrollLocked) return;
  app._playerDrawerScrollLocked = false;
  document.documentElement.classList.remove('player-drawer-open');
  document.body.classList.remove('player-drawer-open');
  document.body.style.top = '';
  const y = app._playerDrawerSavedScrollY || 0;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => { window.scrollTo(0, y); });
  } else {
    window.scrollTo(0, y);
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
  }
}

function showPlayerDetailsDrawer() {
  const overlay = document.getElementById('player-details-drawer-overlay');
  if (!overlay) return false;
  if (!overlay.classList.contains('active')) {
    overlay.classList.add('active');
    lockScrollForPlayerDrawer();
  } else if (!app._playerDrawerScrollLocked) {
    lockScrollForPlayerDrawer();
  }
  return true;
}

function hidePlayerDetailsDrawer() {
  const overlay = document.getElementById('player-details-drawer-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  overlay.classList.remove('active');
  unlockScrollForPlayerDrawer();
}

// Prevent touch scroll from chaining to the page when drawer content hits top/bottom (iOS)
function attachPlayerDrawerScrollGuard() {
  const scrollEl = document.querySelector('.player-details-drawer__scroll');
  if (!scrollEl || scrollEl._scrollGuardBound) return;
  scrollEl._scrollGuardBound = true;

  let touchStartY = 0;
  scrollEl.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  scrollEl.addEventListener('touchmove', (e) => {
    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    const touchY = e.touches[0].clientY;
    const deltaY = touchStartY - touchY;
    touchStartY = touchY;

    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

    if ((atTop && deltaY < 0) || (atBottom && deltaY > 0)) {
      e.preventDefault();
    }
  }, { passive: false });
}

// Helper to close player stats drawer (used on mobile + when switching views / tapping elsewhere)
function closePlayerDetailsIfOpen() {
  hidePlayerDetailsDrawer();
}

// This function is kept for compatibility but its old aggressive handlers have been replaced
// by safer protected listeners directly in the initialization code below.
// We intentionally do nothing harmful here now.
function attachOutsideCloseForPlayerDrawer() {
  // No-op: safe outside-close logic is attached directly after DOMContentLoaded
  // to properly protect clicks that are meant to open the player details.
}

// === Robust delegated handlers for opening player details drawer ===
// We attach to the three stable <tbody> elements + a document-level fallback.
// This is the most reliable across desktop + mobile, survives re-renders (innerHTML on tbody),
// and cannot be blocked by per-row stopPropagation or timing issues.
function attachPlayerRowOpenHandlers() {
  // 1) Direct delegation on the tbodies (preferred, contained)
  const tbodies = [
    document.getElementById('top-leaders-tbody'),
    document.getElementById('leaderboard-tbody'),
    document.getElementById('players-tbody')
  ];
  tbodies.forEach(tbody => {
    if (!tbody || tbody._playerOpenBound) return;
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr.hoverable[data-player-name]');
      if (!row) return;
      const overlay = document.getElementById('player-details-drawer-overlay');
      const name = row.dataset.playerName || '';
      const drawerOpen = !!(overlay && overlay.classList.contains('active'));
      if (drawerOpen) {
        // iOS: allow switching to different player, but block spam on current
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)) {
          if (name.trim() === _drawerDisplayedPlayer) { e.stopPropagation(); return; }
        } else {
          return;
        }
      }
      e.stopPropagation();
      if (name) openPlayerDetails(name);
    }, { passive: true });
    tbody._playerOpenBound = true;
  });

  // 2) Document-level fallback (bubbling phase, very last resort)
  //    This catches clicks even if the tbody delegation somehow didn't see it
  //    (e.g. very deep nesting, shadow DOM in future, or browser quirks on mobile).
  if (!document._playerRowDocOpenBound) {
    document.addEventListener('click', (e) => {
      const row = e.target.closest('tr.hoverable[data-player-name]');
      if (!row) return;

      const overlay = document.getElementById('player-details-drawer-overlay');
      const name = row.dataset.playerName || '';
      const drawerOpen = !!(overlay && overlay.classList.contains('active'));
      if (drawerOpen) {
        const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
        if (ios && name.trim() === _drawerDisplayedPlayer) { return; }
        if (!ios) return;
      }

      const name2 = row.dataset.playerName;
      if (name2) openPlayerDetails(name2);
    }, false); // bubbling, not capture
    document._playerRowDocOpenBound = true;
  }
}

// Delegated opener for stats final-guess player chips (survives bar re-renders)
function attachStatsFinalGuessPlayerHandlers() {
  if (document._statsGuessPlayerOpenBound) return;
  document._statsGuessPlayerOpenBound = true;

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.stats-final-guess-player[data-player]');
    if (!chip) return;
    e.stopPropagation();
    e.preventDefault();
    const name = chip.getAttribute('data-player');
    if (name) openPlayerDetails(name);
  }, false);
}

// NAVIGATION
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // === IMPORTANT for mobile UX ===
      // When user taps any top menu item (or switches page), immediately close the player statistics drawer.
      closePlayerDetailsIfOpen();

      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      const tab = item.getAttribute('data-tab');
      document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
      });
      document.getElementById(tab).classList.add('active');
      
      // Close mobile sidebar if active
      document.getElementById('sidebar').classList.remove('active');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
      
      // Specific page triggers
      if (tab === 'dashboard') renderDashboard();
      if (tab === 'leaderboard') renderLeaderboard({forceRecalc: false});
      if (tab === 'matches') renderMatches();
      if (tab === 'statistics') renderStatistics();
      if (tab === 'players') renderPlayers();
      if (tab === 'teams') renderTeamsMatrix();
      if (tab === 'tools') renderTools();
      if (tab === 'payout') renderPayout();
    });
  });

  // === Top-left brand logo (icon + text) acts as "Home" button ===
  // Clicking the logo in sidebar (desktop) or mobile header goes back to Dashboard (main page)
  const brandLogos = document.querySelectorAll('.brand-logo');
  brandLogos.forEach(logo => {
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => {
      // Close player stats drawer if open (same behavior as top nav)
      closePlayerDetailsIfOpen();

      // Update nav active states
      navItems.forEach(nav => nav.classList.remove('active'));
      const dashboardNav = document.querySelector('.nav-item[data-tab="dashboard"]');
      if (dashboardNav) dashboardNav.classList.add('active');

      // Switch to dashboard page
      document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
      const dashboardPage = document.getElementById('dashboard');
      if (dashboardPage) dashboardPage.classList.add('active');

      // Close mobile sidebar if it was open
      const sidebar = document.getElementById('sidebar');
      const sidebarBackdrop = document.getElementById('sidebar-backdrop');
      if (sidebar) sidebar.classList.remove('active');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      document.body.style.overflow = '';

      // Render the main dashboard
      renderDashboard();
    });
  });
  
  // Section "View All" links (SPORT2 style)
  document.querySelectorAll('[data-nav-tab]').forEach(link => {
    link.addEventListener('click', () => {
      const tab = link.getAttribute('data-nav-tab');
      const targetNav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
      if (targetNav) targetNav.click();
    });
  });

  // Mobile Hamburger menu
  const menuBtn = document.getElementById('menu-toggle-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  
  function closeMobileSidebar() {
    sidebar.classList.remove('active');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
  
  function openMobileSidebar() {
    sidebar.classList.add('active');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('active')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }
  
  // Close sidebar when clicking backdrop
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      closeMobileSidebar();
    });
  }
  
  // Close sidebar clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 992 && sidebar.classList.contains('active') && !sidebar.contains(e.target)) {
      closeMobileSidebar();
    }
  });
}

function handleSimulationScoreChange(matchId, isHome, val) {
  const score = val === '' ? null : parseInt(val);
  if (!app.simulationScores[matchId]) {
    const m = app.matches.find(x => x.id == matchId);
    app.simulationScores[matchId] = {
      homeScore: m.homeScore,
      awayScore: m.awayScore
    };
  }
  if (isHome) app.simulationScores[matchId].homeScore = score;
  else app.simulationScores[matchId].awayScore = score;

  // If both scores are null, remove simulation for this match
  if (app.simulationScores[matchId].homeScore === null && app.simulationScores[matchId].awayScore === null) {
    delete app.simulationScores[matchId];
  }

  if (window._simTimeout) clearTimeout(window._simTimeout);
  window._simTimeout = setTimeout(() => {
    if (document.getElementById('dashboard')?.classList.contains('active')) renderDashboard();
    else if (document.getElementById('tools')?.classList.contains('active')) renderTools();
    else recalculateAll();
  }, 300);
}

// RENDERING - DASHBOARD
const LIVE_MATCH_COLOR_VARIANTS = ['live-match-card--blue', 'live-match-card--neutral', 'live-match-card--red'];

function getMatchRoundLabel(m) {
  if (m.isFinal) return '🏆 นัดชิงชนะเลิศ';
  if (m.isKnockout) return 'รอบน็อคเอาท์';
  return 'รอบแบ่งกลุ่ม';
}

function buildLiveMatchCard(m, index, options = {}) {
  const mode = options.mode || 'dashboard';
  const todayStr = options.todayStr || new Date().toISOString().split('T')[0];
  const card = document.createElement('div');
  card.className = `match-card dashboard-match-card live-match-card ${LIVE_MATCH_COLOR_VARIANTS[index % LIVE_MATCH_COLOR_VARIANTS.length]}`;
  if (mode === 'matches' || mode === 'live') card.classList.add('matches-page-card');
  card.dataset.matchId = String(m.id);

  const isSimulated = app.simulationScores[m.id];
  const isFinished = m.status === 'finished';
  const hTeamObj = TEAMS.find(t => t.name === m.home);
  const aTeamObj = TEAMS.find(t => t.name === m.away);
  const hZone = hTeamObj ? hTeamObj.zone : 'blue';
  const aZone = aTeamObj ? aTeamObj.zone : 'blue';
  const hMult = hTeamObj ? hTeamObj.multiplier : 1;
  const aMult = aTeamObj ? aTeamObj.multiplier : 1;

  let metaLeft;
  let statusLabel;
  let statusChipClass;
  let scoreCenterHtml;
  let hPts = null;
  let aPts = null;
  let matchesExtras = '';

  if (mode === 'matches') {
    const dateLabel = m.date ? formatThaiDate(m.date) : 'ไม่ระบุวัน';
    metaLeft = `${dateLabel} · แมตช์ที่ ${m.id} · ${getMatchRoundLabel(m)}`;
    statusLabel = isFinished ? 'จบแล้ว' : 'รอแข่ง';
    statusChipClass = isFinished ? 'finished' : 'pending';

    const homeScoreVal = m.homeScore !== null && m.homeScore !== undefined ? m.homeScore : '';
    const awayScoreVal = m.awayScore !== null && m.awayScore !== undefined ? m.awayScore : '';
    const adminAttr = app.isAdmin ? '' : 'disabled';

    scoreCenterHtml = `
      <div class="match-score-row">
        <input type="number" id="score-home-${m.id}" name="score-home-${m.id}" class="score-input home-score-input score-sim-input" data-match-id="${m.id}" value="${homeScoreVal}" min="0" placeholder="-" ${adminAttr}>
        <span class="score-divider">:</span>
        <input type="number" id="score-away-${m.id}" name="score-away-${m.id}" class="score-input away-score-input score-sim-input" data-match-id="${m.id}" value="${awayScoreVal}" min="0" placeholder="-" ${adminAttr}>
      </div>
    `;

    if (isFinished && m.homeScore !== null && m.awayScore !== null) {
      hPts = getMatchGamePointsForTeam(m, m.home, hMult).toFixed(1);
      aPts = getMatchGamePointsForTeam(m, m.away, aMult).toFixed(1);
    }

    if (m.isKnockout) {
      const showPenalty = m.homeScore !== null && m.awayScore !== null && m.homeScore === m.awayScore;
      matchesExtras += `
        <div class="penalty-ui" style="display: ${showPenalty ? 'flex' : 'none'}; flex-direction: column; gap: 8px; margin-top: 12px; width: 100%; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
          <label style="font-size: 11px; color: var(--text-secondary);">ผู้ชนะการยิงจุดโทษ (Penalty Winner):</label>
          <select class="penalty-select" data-match-id="${m.id}" ${app.isAdmin ? '' : 'disabled'} style="width:100%; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background-color:var(--bg-primary); color:#fff; font-family:inherit; font-size:12px;">
            <option value="">-- เลือกผู้ชนะจุดโทษ --</option>
            <option value="home" ${m.penaltyWinner === 'home' ? 'selected' : ''}>${m.home}</option>
            <option value="away" ${m.penaltyWinner === 'away' ? 'selected' : ''}>${m.away}</option>
          </select>
        </div>
      `;
    }

    matchesExtras += `
      <div class="match-card-admin-footer">
        <div style="display:${app.isAdmin ? 'flex' : 'none'}; gap:8px; flex-wrap:wrap; margin-top: 12px;">
          <button class="btn btn-secondary save-match-btn" data-match-id="${m.id}" style="padding: 6px 12px; font-size:12px; flex:1;">บันทึกผล</button>
          <button class="btn btn-secondary clear-match-btn" data-match-id="${m.id}" style="padding: 6px 12px; font-size:12px; flex:1; background-color: rgba(244,63,94,0.05); color: var(--accent); border-color: rgba(244,63,94,0.1)">ล้างผล</button>
        </div>
      </div>
    `;
  } else {
    if (mode === 'live') {
      const dateLabel = m.date ? formatThaiDate(m.date) : 'ไม่ระบุวัน';
      metaLeft = `${dateLabel} · แมตช์ที่ ${m.id} · ${getMatchRoundLabel(m)}`;
    } else {
      const isToday = m.date === todayStr;
      const dateLabel = isToday ? 'วันนี้' : 'พรุ่งนี้';
      metaLeft = `${dateLabel} · ${m.date}`;
    }
    statusLabel = isFinished ? 'จบแล้ว' : (isSimulated ? 'จำลองผล' : 'รอแข่ง');
    statusChipClass = isFinished ? 'finished' : (isSimulated ? 'simulated' : 'pending');

    let hScore;
    let aScore;
    if (isFinished) {
      hScore = m.homeScore;
      aScore = m.awayScore;
    } else {
      hScore = isSimulated ? isSimulated.homeScore : null;
      aScore = isSimulated ? isSimulated.awayScore : null;
    }

    if (isFinished || isSimulated) {
      const ptsMatch = isSimulated ? { ...m, ...isSimulated, status: 'finished' } : m;
      hPts = getMatchGamePointsForTeam(ptsMatch, m.home, hMult).toFixed(1);
      aPts = getMatchGamePointsForTeam(ptsMatch, m.away, aMult).toFixed(1);
    }

    scoreCenterHtml = isFinished ? `
      <div class="match-score-row live-match-score-desktop">
        <span class="score-num">${m.homeScore}</span>
        <span class="score-divider">:</span>
        <span class="score-num">${m.awayScore}</span>
      </div>
    ` : `
      <div class="match-score-row">
        <input type="number" id="sim-home-${m.id}" name="sim-home-${m.id}" placeholder="-" value="${hScore !== null ? hScore : ''}" oninput="handleSimulationScoreChange(${m.id}, true, this.value)" class="score-sim-input">
        <span class="score-divider">:</span>
        <input type="number" id="sim-away-${m.id}" name="sim-away-${m.id}" placeholder="-" value="${aScore !== null ? aScore : ''}" oninput="handleSimulationScoreChange(${m.id}, false, this.value)" class="score-sim-input">
      </div>
    `;
  }

  const ptsRowHtml = hPts !== null ? `
    <div class="match-pts-row">
      <span class="pts-label">${Number(hPts) > 0 ? '+' : ''}${hPts}</span>
      <div style="width: 10px;"></div>
      <span class="pts-label">${Number(aPts) > 0 ? '+' : ''}${aPts}</span>
    </div>
  ` : '';

  card.innerHTML = `
    <div class="live-match-meta">
      <span class="live-match-meta-label">${metaLeft}</span>
      <span class="live-match-status ${statusChipClass}">${statusLabel}</span>
    </div>

    <div class="live-match-teams">
      ${getTeamFlagHtml(m.home)}
      <span class="live-match-vs">VS</span>
      ${getTeamFlagHtml(m.away)}
    </div>

    <div class="match-body-grid">
      <div class="match-team-col">
        <div class="team-badge team-${hZone}" data-team="${escapeHtml(m.home)}" style="--pop-percent: ${getTeamPopularityPercent(m.home)}%;" title="ดูผู้เลือกทีมนี้">${m.home}</div>
        <div class="team-mult-label">x${hMult}</div>
        <div class="team-group-label">${formatWcGroupLabel(getTeamWcGroup(m.home))}</div>
      </div>
      <div class="match-center-col">
        ${scoreCenterHtml}
        ${ptsRowHtml}
      </div>
      <div class="match-team-col align-right">
        <div class="team-badge team-${aZone}" data-team="${escapeHtml(m.away)}" style="--pop-percent: ${getTeamPopularityPercent(m.away)}%;" title="ดูผู้เลือกทีมนี้">${m.away}</div>
        <div class="team-mult-label">x${aMult}</div>
        <div class="team-group-label">${formatWcGroupLabel(getTeamWcGroup(m.away))}</div>
      </div>
    </div>
    ${matchesExtras}
  `;
  return card;
}

function renderRecentMatches() {
  const container = getCachedEl('recent-matches-container');
  if (!container) return;
  container.innerHTML = '';

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const recent = app.matches.filter(m => m.date === todayStr || m.date === tomorrowStr);

  if (recent.length === 0) {
    container.className = 'live-matches-container';
    container.innerHTML = '<div class="live-matches-empty" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px; background: rgba(0,0,0,0.1); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.05);">ไม่มีการแข่งขันวันนี้และพรุ่งนี้</div>';
    setupLiveMatchesCarousel();
    return;
  }

  recent.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id - b.id;
  });

  container.className = 'live-matches-container dashboard-matches-grid';
  recent.forEach((m, i) => container.appendChild(buildLiveMatchCard(m, i, { mode: 'live' })));
  setupLiveMatchesCarousel();
}

function refreshMatchCardViews() {
  recalculateAll();
  if (document.getElementById('matches')?.classList.contains('active')) renderMatches();
  if (document.getElementById('dashboard')?.classList.contains('active')) renderDashboard();
}

function setupLiveMatchesCarousel() {
  const carousel = document.getElementById('live-matches-carousel');
  const wrapper = getCachedEl('recent-matches-container');
  const prevBtn = document.getElementById('live-matches-prev');
  const nextBtn = document.getElementById('live-matches-next');
  const pagination = document.getElementById('live-matches-pagination');
  if (!carousel || !wrapper || !prevBtn || !nextBtn) return;

  const scrollContainer = wrapper.classList.contains('dashboard-matches-grid')
    ? wrapper
    : wrapper.querySelector('.dashboard-matches-grid');

  const hideCarouselChrome = () => {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    if (pagination) {
      pagination.innerHTML = '';
      pagination.classList.add('is-hidden');
    }
  };

  if (!scrollContainer) {
    if (carousel._lm) carousel._lm.cleanup();
    hideCarouselChrome();
    return;
  }

  if (!carousel._lm) {
    carousel._lm = {
      scrollContainer: null,
      prevBtn: null,
      nextBtn: null,
      pagination: null,
      carousel: carousel,
      currentIndex: 0,
      autoplayTimer: null,
      resumeTimer: null,
      programmaticTimer: null,
      scrollSettleTimer: null,
      scrollRaf: null,
      hoverPaused: false,
      userPausedUntil: 0,
      isProgrammaticScroll: false,
      isDragging: false,
      didDrag: false,
      startX: 0,
      startY: 0,
      scrollStart: 0,
      dragAxis: null,
      activePointerId: null,
      AUTOPLAY_INTERVAL_MS: 4500,
      USER_PAUSE_MS: 8000,

      isMobile() {
        return window.matchMedia('(max-width: 768px)').matches;
      },

      getCards() {
        return this.scrollContainer
          ? [...this.scrollContainer.querySelectorAll('.live-match-card')]
          : [];
      },

      getScrollLeftForIndex(index) {
        const cards = this.getCards();
        const card = cards[index];
        if (!card || !this.scrollContainer) return 0;

        const sc = this.scrollContainer;
        const maxScroll = Math.max(0, sc.scrollWidth - sc.clientWidth);
        const padLeft = parseFloat(getComputedStyle(sc).paddingLeft) || 0;

        if (index === 0) return 0;
        return Math.min(maxScroll, Math.max(0, card.offsetLeft - padLeft));
      },

      getNearestIndexFromScroll() {
        const cards = this.getCards();
        if (!cards.length || !this.scrollContainer) return 0;

        const scrollLeft = this.scrollContainer.scrollLeft;
        let closest = 0;
        let minDist = Infinity;

        cards.forEach((card, i) => {
          const dist = Math.abs(scrollLeft - this.getScrollLeftForIndex(i));
          if (dist < minDist) {
            minDist = dist;
            closest = i;
          }
        });
        if (this.isMobile() && closest % 2 === 1) {
          closest = Math.max(0, closest - 1);
        }
        return closest;
      },

      getScrollStep() {
        return this.isMobile() ? 2 : 3;
      },

      isCarouselActive() {
        return this.isMobile();
      },

      resolveTargetAfterDrag() {
        const cards = this.getCards();
        if (!cards.length || !this.scrollContainer) return this.currentIndex;

        const step = this.getScrollStep();
        const delta = this.scrollContainer.scrollLeft - (this.scrollStart || 0);
        const card = cards[0];
        const threshold = card ? Math.min(56, card.offsetWidth * 0.2) : 40;

        if (delta > threshold) {
          return Math.min(this.currentIndex + step, cards.length - 1);
        }
        if (delta < -threshold) {
          return Math.max(this.currentIndex - step, 0);
        }
        return this.getNearestIndexFromScroll();
      },

      clearScrollSettle() {
        if (this.scrollSettleTimer) {
          clearTimeout(this.scrollSettleTimer);
          this.scrollSettleTimer = null;
        }
      },

      snapToNearestSmooth() {
        if (this.isProgrammaticScroll || this.isDragging) return;

        const target = this.getNearestIndexFromScroll();
        const targetScroll = this.getScrollLeftForIndex(target);
        const drift = Math.abs(this.scrollContainer.scrollLeft - targetScroll);
        if (drift > 2 || target !== this.currentIndex) {
          this.goToSlide(target, true);
        }
      },

      navigatePrev() {
        const cards = this.getCards();
        if (!cards.length || this.currentIndex <= 0) return;

        this.clearScrollSettle();
        this.pauseAutoplayForUser();
        this.goToSlide(this.currentIndex - this.getScrollStep(), true);
      },

      navigateNext() {
        const cards = this.getCards();
        if (!cards.length || this.currentIndex >= cards.length - 1) return;

        this.clearScrollSettle();
        this.pauseAutoplayForUser();
        this.goToSlide(this.currentIndex + this.getScrollStep(), true);
      },

      syncCurrentIndex() {
        const cards = this.getCards();
        if (!cards.length) {
          this.currentIndex = 0;
          return;
        }
        this.currentIndex = Math.max(0, Math.min(this.currentIndex, cards.length - 1));
        this.carousel.dataset.slideIndex = String(this.currentIndex);
      },

      goToSlide(index, smooth = true) {
        const cards = this.getCards();
        if (!cards.length || !this.scrollContainer) return;

        if (!this.isCarouselActive()) {
          this.scrollContainer.scrollLeft = 0;
          this.updateNav();
          return;
        }

        const clamped = Math.max(0, Math.min(index, cards.length - 1));
        this.currentIndex = clamped;
        this.carousel.dataset.slideIndex = String(this.currentIndex);

        this.clearScrollSettle();
        this.isProgrammaticScroll = true;
        if (this.programmaticTimer) clearTimeout(this.programmaticTimer);
        this.scrollContainer.scrollTo({
          left: this.getScrollLeftForIndex(clamped),
          behavior: smooth ? 'smooth' : 'auto'
        });
        this.programmaticTimer = setTimeout(() => {
          this.isProgrammaticScroll = false;
          this.programmaticTimer = null;
        }, smooth ? 900 : 80);
        this.updateNav();
      },

      stopAutoplay() {
        if (this.autoplayTimer) {
          clearInterval(this.autoplayTimer);
          this.autoplayTimer = null;
        }
      },

      startAutoplay() {
        this.stopAutoplay();
        if (!this.isCarouselActive()) return;

        const cards = this.getCards();
        if (cards.length <= 1 || document.hidden || this.hoverPaused || Date.now() < this.userPausedUntil) return;

        this.autoplayTimer = setInterval(() => {
          if (document.hidden || this.hoverPaused || Date.now() < this.userPausedUntil) return;
          const cardsNow = this.getCards();
          if (cardsNow.length <= 1) return;

          const step = this.getScrollStep();
          let next = this.currentIndex + step;
          if (next >= cardsNow.length) next = 0;
          this.goToSlide(next, true);
        }, this.AUTOPLAY_INTERVAL_MS);
      },

      pauseAutoplayForUser(ms) {
        const pauseMs = ms || this.USER_PAUSE_MS;
        this.userPausedUntil = Date.now() + pauseMs;
        this.stopAutoplay();
        if (this.resumeTimer) clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
          if (!this.hoverPaused && !document.hidden) this.startAutoplay();
        }, pauseMs);
      },

      buildPagination() {
        if (!this.pagination) return;
        const cards = this.getCards();
        this.pagination.innerHTML = '';

        if (!this.isCarouselActive() || cards.length <= 1) {
          this.pagination.classList.add('is-hidden');
          return;
        }

        this.pagination.classList.remove('is-hidden');
        const lm = this;
        const pageCount = this.isMobile() ? Math.ceil(cards.length / 2) : cards.length;
        for (let page = 0; page < pageCount; page++) {
          const cardIndex = this.isMobile() ? page * 2 : page;
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'carousel-dot';
          dot.setAttribute('role', 'tab');
          dot.setAttribute('aria-label', this.isMobile()
            ? `หน้าการแข่งขัน ${page + 1}`
            : `การแข่งขันที่ ${cardIndex + 1}`);
          dot.addEventListener('click', () => {
            lm.pauseAutoplayForUser();
            lm.goToSlide(cardIndex, true);
          });
          this.pagination.appendChild(dot);
        }
      },

      updatePagination() {
        if (!this.isCarouselActive() || !this.pagination || this.pagination.classList.contains('is-hidden')) return;
        const dots = this.pagination.querySelectorAll('.carousel-dot');
        const activePage = this.isMobile() ? Math.floor(this.currentIndex / 2) : this.currentIndex;
        dots.forEach((dot, i) => {
          const isActive = i === activePage;
          dot.classList.toggle('active', isActive);
          dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      },

      updateNav() {
        this.syncCurrentIndex();
        const cards = this.getCards();

        this.prevBtn.style.display = 'none';
        this.nextBtn.style.display = 'none';

        this.updatePagination();
      },

      endDrag(pointerId) {
        if (!this.isDragging) return;
        if (pointerId != null && this.activePointerId != null && pointerId !== this.activePointerId) return;

        this.isDragging = false;
        this.dragAxis = null;
        this.activePointerId = null;
        if (this.scrollContainer) this.scrollContainer.classList.remove('is-dragging');

        if (this.didDrag) {
          this.pauseAutoplayForUser();
          this.goToSlide(this.resolveTargetAfterDrag(), true);
        }
        this.didDrag = false;
      },

      cleanup() {
        this.stopAutoplay();
        if (this.resumeTimer) {
          clearTimeout(this.resumeTimer);
          this.resumeTimer = null;
        }
        if (this.programmaticTimer) {
          clearTimeout(this.programmaticTimer);
          this.programmaticTimer = null;
        }
        this.clearScrollSettle();
        if (this.scrollRaf) {
          cancelAnimationFrame(this.scrollRaf);
          this.scrollRaf = null;
        }
        this.hoverPaused = false;
        this.userPausedUntil = 0;
        this.isProgrammaticScroll = false;
        this.endDrag(null);
      }
    };

    const lm = carousel._lm;

    prevBtn.addEventListener('click', () => lm.navigatePrev());
    nextBtn.addEventListener('click', () => lm.navigateNext());

    const onScroll = () => {
      if (lm.scrollRaf) return;
      lm.scrollRaf = requestAnimationFrame(() => {
        lm.scrollRaf = null;
        lm.updateNav();
      });

      lm.clearScrollSettle();
      lm.scrollSettleTimer = setTimeout(() => {
        lm.scrollSettleTimer = null;
        if (!lm.scrollContainer) return;
        if (lm.isProgrammaticScroll || lm.scrollContainer.classList.contains('is-dragging')) return;

        if (!lm.isCarouselActive()) {
          lm.updateNav();
          return;
        }

        const nearest = lm.getNearestIndexFromScroll();
        const targetScroll = lm.getScrollLeftForIndex(nearest);
        const drift = Math.abs(lm.scrollContainer.scrollLeft - targetScroll);

        if (drift > 2 || nearest !== lm.currentIndex) {
          lm.pauseAutoplayForUser();
          lm.goToSlide(nearest, true);
        } else {
          lm.currentIndex = nearest;
          lm.carousel.dataset.slideIndex = String(nearest);
          lm.updateNav();
        }
      }, 220);
    };

    const onResize = () => {
      lm.buildPagination();
      if (lm.isCarouselActive()) {
        lm.goToSlide(lm.currentIndex, false);
        lm.startAutoplay();
      } else {
        if (lm.scrollContainer) lm.scrollContainer.scrollLeft = 0;
        lm.stopAutoplay();
        lm.updateNav();
      }
    };

    carousel.addEventListener('mouseenter', () => {
      lm.hoverPaused = true;
      lm.stopAutoplay();
    });
    carousel.addEventListener('mouseleave', () => {
      lm.hoverPaused = false;
      lm.startAutoplay();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) lm.stopAutoplay();
      else lm.startAutoplay();
    });

    const isInteractiveTarget = (target) => target.closest(
      'input, button, select, textarea, .team-badge, .team-clickable, #team-selection-popup'
    );

    const onPointerDown = (e) => {
      if (!lm.isCarouselActive()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;

      lm.isDragging = true;
      lm.didDrag = false;
      lm.dragAxis = null;
      lm.activePointerId = e.pointerId;
      lm.startX = e.clientX;
      lm.startY = e.clientY;
      lm.scrollStart = lm.scrollContainer.scrollLeft;
      lm.scrollContainer.classList.add('is-dragging');
      lm.pauseAutoplayForUser();

      if (lm.scrollContainer.setPointerCapture) {
        try { lm.scrollContainer.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    };

    const onPointerMove = (e) => {
      if (!lm.isDragging || e.pointerId !== lm.activePointerId) return;

      const dx = e.clientX - lm.startX;
      const dy = e.clientY - lm.startY;

      if (!lm.dragAxis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        lm.dragAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (lm.dragAxis !== 'x') {
          lm.endDrag(e.pointerId);
          return;
        }
      }

      if (lm.dragAxis !== 'x') return;

      lm.didDrag = true;
      e.preventDefault();
      lm.scrollContainer.scrollLeft = lm.scrollStart - dx;
    };

    const onPointerUp = (e) => lm.endDrag(e.pointerId);

    lm._onScroll = onScroll;
    lm._onResize = onResize;
    lm._onPointerDown = onPointerDown;
    lm._onPointerMove = onPointerMove;
    lm._onPointerUp = onPointerUp;
    lm._onWheel = () => {
      if (lm.isCarouselActive()) lm.pauseAutoplayForUser();
    };

    carousel.dataset.bound = 'true';
  }

  const lm = carousel._lm;
  if (lm._onScroll && lm.scrollContainer && lm.scrollContainer !== scrollContainer) {
    lm.scrollContainer.removeEventListener('scroll', lm._onScroll);
    lm.scrollContainer.removeEventListener('pointerdown', lm._onPointerDown);
    lm.scrollContainer.removeEventListener('pointermove', lm._onPointerMove);
    lm.scrollContainer.removeEventListener('pointerup', lm._onPointerUp);
    lm.scrollContainer.removeEventListener('pointercancel', lm._onPointerUp);
    lm.scrollContainer.removeEventListener('wheel', lm._onWheel);
  }

  lm.cleanup();
  lm.scrollContainer = scrollContainer;
  lm.prevBtn = prevBtn;
  lm.nextBtn = nextBtn;
  lm.pagination = pagination;
  lm.currentIndex = Math.max(0, parseInt(carousel.dataset.slideIndex || '0', 10) || 0);

  if (!scrollContainer.dataset.listenersBound) {
    scrollContainer.addEventListener('scroll', lm._onScroll, { passive: true });
    scrollContainer.addEventListener('pointerdown', lm._onPointerDown);
    scrollContainer.addEventListener('pointermove', lm._onPointerMove, { passive: false });
    scrollContainer.addEventListener('pointerup', lm._onPointerUp);
    scrollContainer.addEventListener('pointercancel', lm._onPointerUp);
    window.addEventListener('resize', lm._onResize);
    scrollContainer.dataset.listenersBound = 'true';
  } else {
    scrollContainer.removeEventListener('wheel', lm._onWheel);
  }
  scrollContainer.addEventListener('wheel', lm._onWheel, { passive: false });

  lm.syncCurrentIndex();
  lm.buildPagination();
  requestAnimationFrame(() => {
    if (lm.isCarouselActive()) {
      lm.goToSlide(lm.currentIndex, false);
      lm.startAutoplay();
    } else if (lm.scrollContainer) {
      lm.scrollContainer.scrollLeft = 0;
      lm.stopAutoplay();
    }
    lm.updateNav();
  });
}

function renderDashboard() {
  recalculateAll();
  
  const totalEl = getCachedEl('stat-total-players');
  if (totalEl) totalEl.textContent = app.processedPlayers.length;
  
  const leader = app.processedPlayers[0];
  const leaderEl = getCachedEl('stat-leader-score');
  if (leaderEl) leaderEl.textContent = leader ? leader.totalScore.toFixed(1) : '0.0';
  
  const playedCount = app.matches.filter(m => m.status === 'finished').length;
  const playedEl = getCachedEl('stat-played-matches');
  if (playedEl) playedEl.textContent = `${playedCount} / ${app.matches.length}`;

  // ── Score Distribution Line Chart ──────────────────────────
  renderScoreChart();

  // ── Recent Matches (Yesterday & Today) ──────────────────────
  renderRecentMatches();

  // ── Top 10 Leaders table ───────────────────────────────────
  const tbody = getCachedEl('top-leaders-tbody');
  if (tbody) {
  tbody.innerHTML = '';

  const fragment = document.createDocumentFragment();
  const topPlayers = app.processedPlayers.slice(0, 10);
  topPlayers.forEach(p => {
    const tr = document.createElement('tr');
    tr.classList.add('hoverable');
    tr.dataset.playerName = p.name;
    tr.style.cursor = 'pointer';

    if (p.rank === 1) {
      tr.classList.add('leader-first-row');
    } else if (p.rank === 2) {
      tr.classList.add('leader-second-row');
    } else if (p.zone === 'blue') {
      tr.classList.add('zone-blue-row');
    } else if (p.zone === 'green') {
      tr.classList.add('zone-green-row');
    } else if (p.zone === 'red') {
      tr.classList.add('zone-red-row');
    }

    // === Direct onclick fallback (bulletproof) ===
    // This guarantees the drawer opens even if delegated listeners have any timing/ordering issues.
    // We still keep the delegated ones for cleanliness.
    tr.onclick = (e) => {
      e.stopPropagation();
      openPlayerDetails(p.name);
    };

    const totalMatchesPlayed = getPlayerTotalMatchesPlayed(p.teams);

    // Rank cell (safe static HTML for crowns) - always center
    const rankTd = document.createElement('td');
    rankTd.setAttribute('data-label', 'อันดับ');
    rankTd.style.textAlign = 'center';
    if (p.rank === 1) {
      rankTd.innerHTML = `<span class="leader-rank leader-rank-first">${p.rank}</span>`;
    } else if (p.rank === 2) {
      rankTd.innerHTML = `<span class="leader-rank leader-rank-second">${p.rank}</span>`;
    } else {
      rankTd.innerHTML = `<strong>${p.rank}</strong>`;
    }

    // Name cell - SAFE: use textContent (no innerHTML with user data)
    const nameTd = document.createElement('td');
    nameTd.setAttribute('data-label', 'ชื่อผู้เล่น');
    if (p.rank === 1) {
      const span = document.createElement('span');
      span.className = 'leader-name-first';
      const crown = document.createElement('span');
      crown.className = 'leader-crown king-crown';
      crown.textContent = '👑';
      span.appendChild(crown);
      const nameText = document.createTextNode(p.name);
      span.appendChild(nameText);
      nameTd.appendChild(span);
    } else if (p.rank === 2) {
      const span = document.createElement('span');
      span.className = 'leader-name-second';
      const crown = document.createElement('span');
      crown.className = 'leader-crown queen-crown';
      crown.textContent = '👸';
      span.appendChild(crown);
      const nameText = document.createTextNode(p.name);
      span.appendChild(nameText);
      nameTd.appendChild(span);
    } else {
      nameTd.textContent = p.name;
    }

    const teamsTd = document.createElement('td');
    teamsTd.setAttribute('data-label', 'จำนวนนัดที่ทีมเตะรวม');
    teamsTd.className = 'table-matches-cell';
    teamsTd.textContent = totalMatchesPlayed;

    const guessTd = document.createElement('td');
    guessTd.setAttribute('data-label', 'ทายชิง (xx)');
    guessTd.className = 'table-guess-cell';
    const guessText = (p.guess != null && p.guess !== undefined) ? p.guess : '-';
    guessTd.textContent = guessText;

    const scoreTd = document.createElement('td');
    scoreTd.setAttribute('data-label', 'คะแนนรวม');
    scoreTd.className = 'table-score-cell';
    scoreTd.textContent = p.totalScore.toFixed(1);

    // Zone badge (same as leaderboard) - centered
    const zoneTd = document.createElement('td');
    zoneTd.setAttribute('data-label', 'โซน');
    zoneTd.style.textAlign = 'center';
    if (p.zone === 'blue') {
      zoneTd.innerHTML = '<span class="badge badge-blue">Blue Zone</span>';
    } else if (p.zone === 'green') {
      zoneTd.innerHTML = '<span class="badge badge-green">Green Zone</span>';
    } else {
      zoneTd.innerHTML = '<span class="badge badge-red">Red Zone</span>';
    }

    // Payout - pure number, centered, single line, small font (match leaderboard)
    const payoutTd = document.createElement('td');
    payoutTd.setAttribute('data-label', 'ค่าใช้จ่ายสังสรรค์ (บาท)');
    const payoutVal = p.payout || 0;
    payoutTd.className = `table-payout-cell ${payoutVal > 0 ? 'table-payout-cell--due' : 'table-payout-cell--free'}`;
    payoutTd.textContent = payoutVal;

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(teamsTd);
    tr.appendChild(guessTd);
    tr.appendChild(scoreTd);
    tr.appendChild(zoneTd);
    tr.appendChild(payoutTd);

    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  }

  renderTeamSelections(sortStatsArray(buildStatsArray()), 'compact');
}

// RENDERING - LEADERBOARD (full table + average footer)
// Helper to group teams by zone and build filter menu HTML
function buildTeamFilterHTML(prefix = 'filter') {
  const teamsByZone = {};
  TEAMS.forEach(t => {
    if (!teamsByZone[t.zone]) teamsByZone[t.zone] = [];
    teamsByZone[t.zone].push(t);
  });

  const zoneLabels = {
    blue: 'Blue Zone (x1.0 - x1.3)',
    green: 'Green Zone (x1.4 - x1.7)',
    yellow: 'Yellow Zone (x1.8 - x2.1)',
    'grey': 'Grey (x2.2 - x2.6)',
    'red-orange': 'Red (x2.7 - x3.0)'
  };

  let html = '';
  Object.keys(zoneLabels).forEach(zoneKey => {
    const zoneTeams = teamsByZone[zoneKey] || [];
    if (zoneTeams.length === 0) return;

    html += `
      <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: var(--zone-${zoneKey}); text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--zone-${zoneKey});"></span>
          ${zoneLabels[zoneKey]}
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px;">
    `;

    const sortedZoneTeams = [...zoneTeams].sort((a, b) => a.name.localeCompare(b.name, 'th'));
    sortedZoneTeams.forEach((t, idx) => {
      const fieldId = `${prefix}-team-filter-${zoneKey}-${toFieldSlug(t.name, String(idx))}`;
      html += `
        <label for="${fieldId}" style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); cursor: pointer; padding: 2px 0; user-select: none;">
          <input type="checkbox" id="${fieldId}" name="${prefix}-team-filter" class="team-filter-checkbox" value="${escapeHtml(t.name)}" style="width: 14px; height: 14px; accent-color: var(--primary); cursor: pointer;">
          <span class="team-badge ${getTeamZoneClass(t.zone)} team-badge--filter" data-team="${escapeHtml(t.name)}" style="${getTeamPopStyleAttr(t.name)} text-overflow: ellipsis; white-space: nowrap; overflow: hidden; padding: 2px 6px; font-size: 11px;">${escapeHtml(t.name)} · ${formatWcGroupLabel(t.wcGroup)} · x${t.multiplier}</span>
        </label>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });
  return html;
}

// Global initialization of team filters for any page
function initTeamFilter(config) {
  const { containerId, btnId, menuId, checkboxesContainerId, clearBtnId, onFilterChange, prefix = 'filter' } = config;
  const container = document.getElementById(containerId);
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  const checkboxesContainer = document.getElementById(checkboxesContainerId);
  const clearBtn = document.getElementById(clearBtnId);

  if (btn && menu && checkboxesContainer) {
    checkboxesContainer.innerHTML = buildTeamFilterHTML(prefix);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = menu.style.display === 'none';
      menu.style.display = isHidden ? 'block' : 'none';
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
      if (container && !container.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    checkboxesContainer.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('team-filter-checkbox')) {
        onFilterChange();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        checkboxesContainer.querySelectorAll('.team-filter-checkbox').forEach(cb => { cb.checked = false; });
        onFilterChange();
      });
    }
  }
}

function setPlayersFilterEmptyState(isEmpty) {
  const table = document.getElementById('players-table');
  const container = table?.closest('.players-table-container');
  const tableWrap = table?.closest('.players-card__table-wrap');
  if (!table || !container || !tableWrap) return;

  table.closest('.players-card')?.classList.toggle('players-card--empty', isEmpty);
  tableWrap.classList.toggle('players-card__table-wrap--empty', isEmpty);
  container.classList.toggle('players-table-container--empty', isEmpty);

  tableWrap.querySelector('.players-filter-empty-panel')?.remove();

  let panel = container.querySelector('.players-filter-empty-panel');
  if (isEmpty) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'players-filter-empty-panel';
      panel.setAttribute('role', 'status');
      panel.innerHTML = '<p class="players-filter-empty-message">ไม่พบผู้เล่นที่ตรงกับตัวกรอง</p>';
      container.appendChild(panel);
    }
    panel.hidden = false;
    table.hidden = true;
    container.hidden = false;
  } else {
    if (panel) panel.hidden = true;
    container.hidden = false;
    table.hidden = false;
  }
}

function setLeaderboardFilterEmptyState(isEmpty) {
  const table = document.getElementById('leaderboard-table');
  const container = table?.closest('.leaderboard-table-container');
  const tableWrap = table?.closest('.leaderboard-card__table-wrap');
  if (!table || !container || !tableWrap) return;

  table.closest('.leaderboard-card')?.classList.toggle('leaderboard-card--empty', isEmpty);
  tableWrap.classList.toggle('leaderboard-card__table-wrap--empty', isEmpty);
  container.classList.toggle('leaderboard-table-container--empty', isEmpty);

  tableWrap.querySelector('.leaderboard-filter-empty-panel')?.remove();

  let panel = container.querySelector('.leaderboard-filter-empty-panel');
  if (isEmpty) {
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'leaderboard-filter-empty-panel';
      panel.setAttribute('role', 'status');
      panel.innerHTML = '<p class="leaderboard-filter-empty-message">ไม่พบผู้เล่นที่ตรงกับตัวกรอง</p>';
      container.appendChild(panel);
    }
    panel.hidden = false;
    table.hidden = true;
    container.hidden = false;
  } else {
    if (panel) panel.hidden = true;
    container.hidden = false;
    table.hidden = false;
  }
}

function renderLeaderboard(options = {}) {
  const { forceRecalc = true } = options;
  if (forceRecalc) recalculateAll();

  const searchEl = getCachedEl('leaderboard-search');
  const searchInput = (searchEl ? searchEl.value : '').toLowerCase().trim();

  // Get selected teams from filter
  const selectedTeams = [];
  document.querySelectorAll('#team-filter-checkboxes-container .team-filter-checkbox').forEach(cb => {
    if (cb.checked) selectedTeams.push(cb.value);
  });

  let filtered = app.processedPlayers || [];

  let teamFiltered = filtered;
  if (selectedTeams.length > 0) {
    teamFiltered = teamFiltered.filter(p => p.teams && selectedTeams.every(t => p.teams.includes(t)));
  }

  if (searchInput) {
    filtered = teamFiltered.filter(p => p.name.toLowerCase().includes(searchInput));
  } else {
    filtered = teamFiltered;
  }

  const btnText = document.getElementById('team-filter-btn-text');
  if (btnText) {
    btnText.textContent = selectedTeams.length > 0 
      ? `🔍 กรองทีม: ${selectedTeams.length} ทีม` 
      : '🔍 กรองตามทีมที่เลือก (ทั้งหมด)';
  }

  const tbody = getCachedEl('leaderboard-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isTeamFilterEmpty = selectedTeams.length > 0 && teamFiltered.length === 0;

  setLeaderboardFilterEmptyState(isTeamFilterEmpty);
  if (filtered.length === 0) {
    if (isTeamFilterEmpty) {
      const avgNoteEl = getCachedEl('leaderboard-avg-note');
      if (avgNoteEl) avgNoteEl.innerHTML = '';
    }
    return;
  }

  const fragment = document.createDocumentFragment();

  const allRanks = [...new Set((app.processedPlayers || []).map(pl => pl.rank))].sort((a, b) => a - b);
  const maxRank = allRanks.length ? allRanks[allRanks.length - 1] : 0;
  const secondLastRank = allRanks.length >= 2 ? allRanks[allRanks.length - 2] : 0;
  const isSadLastRank = (rank) => maxRank > 2 && rank === maxRank;
  const isSadSecondLastRank = (rank) => secondLastRank > 2 && rank === secondLastRank && rank !== maxRank;

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.classList.add('hoverable');
    tr.dataset.playerName = p.name;
    tr.style.cursor = 'pointer';

    if (p.rank === 1) {
      tr.classList.add('leader-first-row');
    } else if (p.rank === 2) {
      tr.classList.add('leader-second-row');
    } else if (isSadLastRank(p.rank)) {
      tr.classList.add('leader-last-row');
    } else if (isSadSecondLastRank(p.rank)) {
      tr.classList.add('leader-second-last-row');
    } else if (p.zone === 'blue') {
      tr.classList.add('zone-blue-row');
    } else if (p.zone === 'green') {
      tr.classList.add('zone-green-row');
    } else if (p.zone === 'red') {
      tr.classList.add('zone-red-row');
    }

    // === Direct onclick fallback (bulletproof) ===
    tr.onclick = (e) => {
      e.stopPropagation();
      openPlayerDetails(p.name);
    };

    const totalMatchesPlayed = getPlayerTotalMatchesPlayed(p.teams);
    const guessText = (p.guess != null && p.guess !== undefined) ? p.guess : '-';

    // Rank with special styling for 1st/2nd (like target site) - always center
    const rankTd = document.createElement('td');
    rankTd.setAttribute('data-label', 'อันดับ');
    rankTd.style.textAlign = 'center';
    if (p.rank === 1) {
      rankTd.innerHTML = `<span class="leader-rank leader-rank-first">${p.rank}</span>`;
    } else if (p.rank === 2) {
      rankTd.innerHTML = `<span class="leader-rank leader-rank-second">${p.rank}</span>`;
    } else if (isSadLastRank(p.rank)) {
      rankTd.innerHTML = `<span class="leader-rank leader-rank-last">${p.rank}</span>`;
    } else if (isSadSecondLastRank(p.rank)) {
      rankTd.innerHTML = `<span class="leader-rank leader-rank-second-last">${p.rank}</span>`;
    } else {
      rankTd.textContent = p.rank;
    }

    // Name with crown for top 2 (like target site)
    const nameTd = document.createElement('td');
    nameTd.setAttribute('data-label', 'ผู้เล่น');
    if (p.rank === 1) {
      const span = document.createElement('span');
      span.className = 'leader-name-first';
      const crown = document.createElement('span');
      crown.className = 'leader-crown king-crown';
      crown.textContent = '👑';
      span.appendChild(crown);
      span.appendChild(document.createTextNode(p.name));
      nameTd.appendChild(span);
    } else if (p.rank === 2) {
      const span = document.createElement('span');
      span.className = 'leader-name-second';
      const crown = document.createElement('span');
      crown.className = 'leader-crown queen-crown';
      crown.textContent = '👸';
      span.appendChild(crown);
      span.appendChild(document.createTextNode(p.name));
      nameTd.appendChild(span);
    } else if (isSadLastRank(p.rank)) {
      const span = document.createElement('span');
      span.className = 'leader-name-last';
      const icon = document.createElement('span');
      icon.className = 'leader-sad-icon';
      icon.textContent = '😢';
      span.appendChild(icon);
      span.appendChild(document.createTextNode(p.name));
      nameTd.appendChild(span);
    } else if (isSadSecondLastRank(p.rank)) {
      const span = document.createElement('span');
      span.className = 'leader-name-second-last';
      const icon = document.createElement('span');
      icon.className = 'leader-sad-icon';
      icon.textContent = '😔';
      span.appendChild(icon);
      span.appendChild(document.createTextNode(p.name));
      nameTd.appendChild(span);
    } else {
      nameTd.textContent = p.name;
    }

    // Total matches played by selected teams
    const teamsTd = document.createElement('td');
    teamsTd.setAttribute('data-label', 'จำนวนนัดที่ทีมเตะรวม');
    teamsTd.className = 'table-matches-cell';
    teamsTd.textContent = totalMatchesPlayed;

    // Guess
    const guessTd = document.createElement('td');
    guessTd.setAttribute('data-label', 'ทายชิง (xx)');
    guessTd.className = 'table-guess-cell';
    guessTd.textContent = guessText;

    // Score
    const scoreTd = document.createElement('td');
    scoreTd.setAttribute('data-label', 'คะแนนรวม');
    scoreTd.className = 'table-score-cell';
    scoreTd.textContent = p.totalScore.toFixed(1);

    // Zone (badge like target site) - centered
    const zoneTd = document.createElement('td');
    zoneTd.setAttribute('data-label', 'โซน');
    zoneTd.style.textAlign = 'center';
    if (p.zone === 'blue') {
      zoneTd.innerHTML = '<span class="badge badge-blue">Blue Zone</span>';
    } else if (p.zone === 'green') {
      zoneTd.innerHTML = '<span class="badge badge-green">Green Zone</span>';
    } else {
      zoneTd.innerHTML = '<span class="badge badge-red">Red Zone</span>';
    }

    // Payout - pure number only (0 or 1000 etc.), smaller font, single line, centered
    const payoutTd = document.createElement('td');
    payoutTd.setAttribute('data-label', 'ค่าใช้จ่ายสังสรรค์ (บาท)');
    const payoutVal = p.payout || 0;
    payoutTd.className = `table-payout-cell ${payoutVal > 0 ? 'table-payout-cell--due' : 'table-payout-cell--free'}`;
    payoutTd.textContent = payoutVal;

    // Extra safeguard: mark every cell to never wrap (search/filter safety)
    rankTd.style.whiteSpace = 'nowrap';
    nameTd.style.whiteSpace = 'nowrap';
    teamsTd.style.whiteSpace = 'nowrap';
    guessTd.style.whiteSpace = 'nowrap';
    scoreTd.style.whiteSpace = 'nowrap';
    zoneTd.style.whiteSpace = 'nowrap';
    payoutTd.style.whiteSpace = 'nowrap';

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(teamsTd);
    tr.appendChild(guessTd);
    tr.appendChild(scoreTd);
    tr.appendChild(zoneTd);
    tr.appendChild(payoutTd);

    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);

  // === Global average summary moved OUTSIDE the table (below it), slightly larger ===
  const fullPlayers = app.processedPlayers || [];
  const avgNoteEl = getCachedEl('leaderboard-avg-note');
  if (avgNoteEl) avgNoteEl.innerHTML = ''; // clear previous

  if (fullPlayers.length > 0 && avgNoteEl) {
    const overallAvg = fullPlayers.reduce((sum, p) => sum + p.totalScore, 0) / fullPlayers.length;
    const greenPlayers = fullPlayers.filter(p => p.zone === 'green');
    const greenAvg = greenPlayers.length ? (greenPlayers.reduce((sum, p) => sum + p.totalScore, 0) / greenPlayers.length) : 0;
    const redPlayers = fullPlayers.filter(p => p.zone === 'red');
    const redAvg = redPlayers.length ? (redPlayers.reduce((sum, p) => sum + p.totalScore, 0) / redPlayers.length) : 0;

    avgNoteEl.innerHTML = `
      <span style="color:#64748b; white-space:normal; display:block; width:100%; max-width:100%; box-sizing:border-box;">
        หมายเหตุ: 
        <span style="color:#f43f5e">ค่าเฉลี่ยทั้งหมด (ต้องจ่าย) ${overallAvg.toFixed(1)}</span> • 
        <span style="color:#f43f5e">Green Zone (ต้องจ่าย) ${greenAvg.toFixed(1)}</span> • 
        <span style="color:#34d399">Red Zone (ไม่ต้องจ่าย) ${redAvg.toFixed(1)}</span>
      </span>
    `;
  }
}

// RENDERING - SCORE DISTRIBUTION CHART (historical rank trend by match day)
function buildChartDaySteps(finishedMatches) {
  const dayMap = new Map();
  const undated = [];
  finishedMatches.forEach(m => {
    if (m.date) {
      if (!dayMap.has(m.date)) dayMap.set(m.date, []);
      dayMap.get(m.date).push(m);
    } else {
      undated.push(m);
    }
  });
  const steps = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayMatches]) => ({
      date,
      matches: dayMatches.sort((a, b) => a.id - b.id)
    }));
  if (undated.length) {
    steps.push({ date: null, matches: undated.sort((a, b) => a.id - b.id) });
  }
  return steps;
}

function applyFinishedMatchToTeamScores(match, teamScores) {
  const h = match.homeScore;
  const a = match.awayScore;
  let homeResPoints = 0;
  let awayResPoints = 0;

  if (h > a) {
    homeResPoints = 3;
    awayResPoints = 1;
  } else if (h < a) {
    homeResPoints = 1;
    awayResPoints = 3;
  } else if (match.isKnockout && match.penaltyWinner) {
    if (match.penaltyWinner === 'home') {
      homeResPoints = 3;
      awayResPoints = 1;
    } else {
      homeResPoints = 1;
      awayResPoints = 3;
    }
  } else {
    homeResPoints = 2;
    awayResPoints = 2;
  }

  const hTeam = TEAMS.find(t => t.name === match.home);
  const aTeam = TEAMS.find(t => t.name === match.away);
  if (hTeam) teamScores[match.home] += (homeResPoints + h) * hTeam.multiplier;
  if (aTeam) teamScores[match.away] += (awayResPoints + a) * aTeam.multiplier;
}

function renderScoreChart() {
  const svgEl = getCachedEl('score-chart-svg');
  if (!svgEl || !app.processedPlayers.length) return;

  clearChartPulseLayer(svgEl);
  app.chartHoverPlayer = '';

  // 1. Get finished matches sorted chronologically, then group by day
  const finishedMatches = app.matches
    .filter(m => m.status === 'finished')
    .sort((a, b) => a.id - b.id);
  const chartDaySteps = buildChartDaySteps(finishedMatches);
  const stepsCount = chartDaySteps.length;

  // 2. Cache historical rank and score for all app.players
  const playerRankHistory = app.players.map(p => {
    const curr = app.processedPlayers.find(pl => pl.name === p.name) || { zone: 'red', rank: 99 };
    return {
      name: p.name,
      zone: curr.zone,
      ranks: [1], // start all players tied at rank 1 before any finished app.matches
      scores: [0]
    };
  });

  // Calculate scores step-by-step and derive ranks
  const teamScores = {};
  TEAMS.forEach(team => {
    teamScores[team.name] = 0;
  });

  let processedMatchCount = 0;
  for (let step = 1; step <= stepsCount; step++) {
    chartDaySteps[step - 1].matches.forEach(match => {
      applyFinishedMatchToTeamScores(match, teamScores);
    });
    processedMatchCount += chartDaySteps[step - 1].matches.length;

    const scoreBoard = playerRankHistory.map(ph => {
      const playerObj = app.players.find(p => p.name === ph.name);
      let teamsScore = 0;
      playerObj.teams.forEach(teamName => {
        teamsScore += teamScores[teamName] || 0;
      });
      const finalMatch = finishedMatches.slice(0, processedMatchCount).find(m => m.isFinal);
      const predictionScore = calculatePredictionPoints(playerObj, finalMatch);
      return {
        name: ph.name,
        score: parseFloat((teamsScore + predictionScore).toFixed(2))
      };
    });

    scoreBoard.sort((a, b) => b.score - a.score);
    let currentRank = 1;
    const rankMap = new Map();
    scoreBoard.forEach((entry, idx) => {
      if (idx > 0 && entry.score < scoreBoard[idx - 1].score) {
        currentRank = idx + 1;
      }
      rankMap.set(entry.name, currentRank);
    });

    playerRankHistory.forEach(ph => {
      ph.ranks.push(rankMap.get(ph.name));
      ph.scores.push(scoreBoard.find(entry => entry.name === ph.name).score);
    });
  }

  // 3. Setup Layout Dimensions dynamically for responsive scaling
  const container = document.getElementById('chart-svg-container');
  const containerW = (() => {
    if (!container) return 0;
    const cs = getComputedStyle(container);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const innerW = Math.floor(container.getBoundingClientRect().width - padX);
    return innerW > 0 ? innerW : container.clientWidth || 0;
  })();

  const isMobile = window.innerWidth <= 768;
  if (isMobile && container && containerW === 0) {
    requestAnimationFrame(() => renderScoreChart());
    return;
  }
  const W = containerW || (isMobile
    ? Math.max(280, window.innerWidth - 16)
    : Math.max(800, 150 + (stepsCount + 1) * 110));
  const padL = isMobile ? 16 : 60;
  const padR = isMobile ? 16 : 140;
  const padT = isMobile ? 26 : 40;
  const axisLabelX = isMobile ? 12 : padL - 8;
  const axisLineX = isMobile ? padL : padL - 4;
  const yRankFontSize = isMobile ? '7' : '10';
  const chartW = W - padL - padR;
  const minPixelPerStep = chartW / Math.max(1, stepsCount);
  const rotateWhenNarrow = isMobile ? 36 : 48;
  const rotateAngle = minPixelPerStep < rotateWhenNarrow ? -45 : 0;
  const padB = isMobile ? (rotateAngle !== 0 ? 52 : 34) : 60;
  const mobileEdgeGuard = isMobile ? 14 : 0;
  const chartH = isMobile
    ? Math.max(155, Math.round(chartW * 0.62))
    : (380 - padT - padB);
  const H = isMobile ? padT + chartH + padB + mobileEdgeGuard : 380;
  const xLabelY = padT + chartH + (isMobile ? 12 : 18);

  const maxRank = app.processedPlayers.length || 1;

  // Scale functions (rank 1 at top, maxRank at bottom)
  const plotRightX = padL + chartW;
  const xOf = i => stepsCount > 0 ? padL + (i / stepsCount) * chartW : padL;
  const yOf = r => {
    if (maxRank === 1) return padT + chartH / 2;
    return padT + ((r - 1) / (maxRank - 1)) * chartH;
  };

  // Colors
  const getPlayerColor = zone => {
    if (zone === 'blue') return '#60a5fa';
    if (zone === 'green') return '#34d399';
    return '#f43f5e';
  };

  // 4. Render Y-axis grid lines and values
  const yTicks = 5; // slightly fewer ticks on mobile
  let yGridLines = '';
  for (let i = 0; i <= yTicks; i++) {
    const rankValue = 1 + (i / yTicks) * (maxRank - 1);
    const displayRank = Math.round(rankValue);
    const y = yOf(rankValue);
    yGridLines += `<line x1="${axisLineX}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
    const rankLabelY = isMobile && i === yTicks ? y - 1 : y + 3;
    yGridLines += `<text x="${axisLabelX}" y="${rankLabelY}" text-anchor="end" font-size="${yRankFontSize}" fill="rgba(255,255,255,0.4)" font-family="Inter,Sarabun,sans-serif">${displayRank}</text>`;
  }

  // 4.1 Render Zone Separators (Rank Thresholds)
  let zoneSeparators = '';
  if (maxRank > 1) {
    const blueLine = Math.ceil(maxRank * 0.2);
    const greenLine = Math.ceil(maxRank * 0.6);
    
    // Line for Blue/Green boundary
    const yBlue = yOf(blueLine + 0.5); 
    zoneSeparators += `
      <line x1="${padL}" x2="${W - padR}" y1="${yBlue}" y2="${yBlue}" stroke="#60a5fa" stroke-width="1.5" stroke-dasharray="8,5" stroke-opacity="0.4"/>
      ${isMobile ? '' : `<text x="${W - padR + 4}" y="${yBlue + 3}" font-size="9" fill="#60a5fa" fill-opacity="0.6" font-family="Inter,Sarabun,sans-serif" font-weight="700">BLUE | GREEN</text>`}
    `;

    // Line for Green/Red boundary
    const yGreen = yOf(greenLine + 0.5);
    zoneSeparators += `
      <line x1="${padL}" x2="${W - padR}" y1="${yGreen}" y2="${yGreen}" stroke="#34d399" stroke-width="1.5" stroke-dasharray="8,5" stroke-opacity="0.4"/>
      ${isMobile ? '' : `<text x="${W - padR + 4}" y="${yGreen + 3}" font-size="9" fill="#34d399" fill-opacity="0.6" font-family="Inter,Sarabun,sans-serif" font-weight="700">GREEN | RED</text>`}
    `;
  }

  // 5. Render X-axis labels (dynamic interval, rotation when crowded, mobile-shortened)
  let xLabels = '';
  const desiredLabels = isMobile ? 5 : 8; // target number of labels to show
  const interval = Math.max(1, Math.ceil((stepsCount + 1) / desiredLabels));
  const labelFontSize = isMobile ? '8' : '10';

  for (let i = 0; i <= stepsCount; i++) {
    const x = xOf(i);
    const showLabel = (i === 0) || (i % interval === 0);

    let label = '';
    if (i === 0) {
      label = isMobile ? 'เริ่ม' : 'เริ่มต้น';
    } else if (showLabel) {
      const dateStr = chartDaySteps[i - 1].date;
      if (!dateStr) {
        label = '—';
      } else {
        const d = new Date(dateStr + 'T00:00:00');
        // mobile: show day only to save space, desktop: show dd/mm
        label = isMobile ? `${d.getDate()}` : `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    const xLabelX = isMobile && i === stepsCount ? Math.min(x, W - 6) : x;
    const xAnchor = i === 0 ? 'start' : (i === stepsCount ? 'end' : 'middle');

    if (rotateAngle !== 0 && showLabel) {
      xLabels += `
      <line x1="${x}" x2="${x}" y1="${padT}" y2="${padT + chartH + 4}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${xLabelX}" y="${xLabelY}" transform="rotate(${rotateAngle} ${xLabelX} ${xLabelY})" text-anchor="${xAnchor}" font-size="${labelFontSize}" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif" font-weight="600">${label}</text>
    `;
    } else {
      xLabels += `
      <line x1="${x}" x2="${x}" y1="${padT}" y2="${padT + chartH + 4}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      ${showLabel ? `<text x="${xLabelX}" y="${xLabelY}" text-anchor="${xAnchor}" font-size="${labelFontSize}" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif" font-weight="600">${label}</text>` : ''}
    `;
    }
  }

  // 6. Draw lines, dots, and labels
  let linesGroup = '';
  let dotsGroup = '';
  let labelsGroup = '';
  let hoverHelpers = '';

  playerRankHistory.forEach(ph => {
    let pathPoints = [];
    for (let i = 0; i <= stepsCount; i++) {
      const x = xOf(i);
      const y = yOf(ph.ranks[i]);
      pathPoints.push(`${x},${y}`);
    }
    const pathD = `M ${pathPoints.join(' L ')}`;
    const color = getPlayerColor(ph.zone);

    // Rank line path
    linesGroup += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.22" class="trend-line" data-player="${ph.name}" data-zone="${ph.zone}" style="cursor:pointer; transition: stroke-width 0.2s, stroke-opacity 0.2s;"/>`;

    // Invisible thick path to make hover easier
    hoverHelpers += `<path d="${pathD}" fill="none" stroke="transparent" stroke-width="8" class="trend-line-hover-helper" data-player="${ph.name}" style="cursor:pointer;"/>`;

    // Trend dots
    for (let i = 0; i <= stepsCount; i++) {
      const x = xOf(i);
      const y = yOf(ph.ranks[i]);
      dotsGroup += `<circle cx="${x}" cy="${y}" r="3.2" fill="${color}" fill-opacity="0.6" class="trend-dot" data-player="${ph.name}" data-step="${i}" data-score="${ph.scores[i]}" data-rank="${ph.ranks[i]}" style="cursor:pointer; transition: r 0.2s, fill-opacity 0.2s;"/>`;
    }

    // Label at the end of the line
    const lastX = xOf(stepsCount);
    const lastY = yOf(ph.ranks[stepsCount]);
    const lastRank = ph.ranks[stepsCount] || 99;
    const isTop5 = lastRank <= 5;
    // On mobile, hide all end labels by default (will be toggled on hover/highlight)
    const labelDisplay = (!isMobile && isTop5) ? 'block' : 'none';
    
    // On mobile, position label inside the chart to the left to avoid right edge clipping
    const labelX = isMobile ? lastX - 8 : lastX + 8;
    const labelAnchor = isMobile ? 'end' : 'start';

    labelsGroup += `<text x="${labelX}" y="${lastY + 3}" text-anchor="${labelAnchor}" font-size="9" fill="${color}" fill-opacity="0.85" class="trend-end-label" data-player="${ph.name}" style="display: ${labelDisplay}; font-family: Inter,Sarabun,sans-serif; pointer-events: none; transition: fill-opacity 0.2s;">${ph.name} (อันดับ ${lastRank})</text>`;
  });

  let legendMarkup = '';
  if (isMobile) {
    const legendY = 8;
    const legendItems = [
      { color: '#60a5fa', label: 'Blue' },
      { color: '#34d399', label: 'Green' },
      { color: '#f43f5e', label: 'Red' }
    ];
    const slotW = W / legendItems.length;
    legendItems.forEach((item, idx) => {
      const lx = idx * slotW + 4;
      legendMarkup += `
        <rect x="${lx}" y="${legendY}" width="8" height="8" rx="2" fill="${item.color}"/>
        <text x="${lx + 12}" y="${legendY + 7}" font-size="8" fill="rgba(255,255,255,0.65)" font-family="Inter,Sarabun,sans-serif">${item.label}</text>
      `;
    });
  } else {
    legendMarkup = `
      <rect x="${padL}" y="${padT - 26}" width="10" height="10" rx="2" fill="#60a5fa"/>
      <text x="${padL + 14}" y="${padT - 17}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif">Blue Zone</text>
      <rect x="${padL + 80}" y="${padT - 26}" width="10" height="10" rx="2" fill="#34d399"/>
      <text x="${padL + 94}" y="${padT - 17}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif">Green Zone</text>
      <rect x="${padL + 170}" y="${padT - 26}" width="10" height="10" rx="2" fill="#f43f5e"/>
      <text x="${padL + 184}" y="${padT - 17}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif">Red Zone</text>
    `;
  }

  // Setup SVG dimensions — width tracks chart-card container, height follows viewBox ratio
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('preserveAspectRatio', isMobile ? 'none' : 'xMidYMid meet');
  svgEl.setAttribute('width', '100%');
  svgEl.style.minWidth = '0';
  svgEl.style.maxWidth = '100%';
  svgEl.style.width = '100%';
  svgEl.style.display = 'block';
  svgEl.style.overflow = isMobile ? 'visible' : 'hidden';
  svgEl.dataset.chartW = String(W);
  svgEl.dataset.chartH = String(H);
  svgEl.dataset.chartPlotRightX = String(plotRightX);

  if (isMobile) {
    svgEl.setAttribute('height', H);
    svgEl.style.height = H + 'px';
    svgEl.style.aspectRatio = '';
  } else {
    svgEl.setAttribute('height', H);
    svgEl.style.height = H + 'px';
    svgEl.style.aspectRatio = '';
  }

  const plotBg = isMobile
    ? `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(15,23,42,0.5)"/>`
    : '';

  const gridCell = isMobile ? 12 : 16;

  svgEl.innerHTML = `
    <defs>
      <clipPath id="chart-plot-clip">
        <rect x="${padL}" y="${padT}" width="${chartW}" height="${chartH}"/>
      </clipPath>
      <pattern id="chart-ecg-grid" width="${gridCell}" height="${gridCell}" patternUnits="userSpaceOnUse" x="${padL}" y="${padT}">
        <path d="M ${gridCell} 0 L 0 0 0 ${gridCell}" fill="none" stroke="rgba(0,255,102,0.1)" stroke-width="0.5"/>
      </pattern>
    </defs>
    ${plotBg || `<rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`}
    <g class="chart-monitor-overlay" clip-path="url(#chart-plot-clip)">
      <rect class="chart-monitor-tint" x="${padL}" y="${padT}" width="${chartW}" height="${chartH}" rx="3"/>
      <rect class="chart-monitor-grid" x="${padL}" y="${padT}" width="${chartW}" height="${chartH}" rx="3" fill="url(#chart-ecg-grid)"/>
    </g>
    ${yGridLines}
    <line x1="${axisLineX}" x2="${axisLineX}" y1="${padT}" y2="${padT + chartH}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    <line x1="${axisLineX}" x2="${W - padR}" y1="${padT + chartH}" y2="${padT + chartH}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    ${xLabels}
    ${zoneSeparators}
    
    <g class="lines-container">${linesGroup}</g>
    <g class="helpers-container">${hoverHelpers}</g>
    <g class="dots-container">${dotsGroup}</g>
    <g class="labels-container">${labelsGroup}</g>
    ${legendMarkup}
  `;

  app.chartPulseAnimPlayer = '';
  app.chartHoverPlayer = '';

  if (container) {
    container.style.overflow = isMobile ? 'visible' : 'hidden';
    container.style.paddingBottom = isMobile ? '0' : '8px';
    container.style.width = '100%';
    container.style.maxWidth = '100%';
    container.style.boxSizing = 'border-box';
    container.style.aspectRatio = '';
    container.style.minHeight = isMobile ? H + 'px' : H + 'px';
    container.style.height = 'auto';
  }

  if (container) {
    requestAnimationFrame(() => {
      const cs = getComputedStyle(container);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const measuredW = Math.floor(container.getBoundingClientRect().width - padX);
      const renderedW = Number(svgEl.dataset.chartW || 0);
      if (measuredW > 0 && Math.abs(measuredW - renderedW) > 1 && !svgEl.dataset.chartRecalc) {
        svgEl.dataset.chartRecalc = '1';
        renderScoreChart();
        return;
      }
      delete svgEl.dataset.chartRecalc;
    });
  }

  // 7. Populate Highlight Dropdown
  const highlightSelect = document.getElementById('chart-highlight-select');
  if (highlightSelect) {
    const currentVal = highlightSelect.value || app.lastHighlightPlayer;
    highlightSelect.innerHTML = '<option value="">-- แสดงทั้งหมด --</option>';
    
    const sortedForSelect = [...app.processedPlayers].sort((a, b) => (a.rank || 999) - (b.rank || 999));
    sortedForSelect.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.name} (อันดับ ${p.rank})`;
      if (p.name === currentVal) opt.selected = true;
      highlightSelect.appendChild(opt);
    });
  }

  bindChartHoverInteractions();

  // Trigger initial highlight if there was a selected player
  const initialHl = highlightSelect ? highlightSelect.value : app.lastHighlightPlayer;
  if (initialHl) {
    highlightPlayerInChart(initialHl);
  }
}

const CHART_ZONE_PULSE = {
  blue: {
    phosphor: '#00d4ff',
    core: '#b8f4ff',
    baseline: '#0891b2',
    tint: 'rgba(0, 20, 36, 0.62)'
  },
  green: {
    phosphor: '#00ff66',
    core: '#ccffdd',
    baseline: '#00b347',
    tint: 'rgba(0, 14, 6, 0.62)'
  },
  red: {
    phosphor: '#ff4d6d',
    core: '#ffd6e0',
    baseline: '#c9184a',
    tint: 'rgba(24, 4, 10, 0.62)'
  }
};

// let app.chartHoverPlayer / app.chartPulseAnimPlayer are provided via state.js named exports in bundle

function chartFindPlayerEl(svgEl, selector, playerName) {
  return [...svgEl.querySelectorAll(selector)].find(el => el.getAttribute('data-player') === playerName) || null;
}

function getChartZonePulseStyle(zone) {
  return CHART_ZONE_PULSE[zone] || CHART_ZONE_PULSE.red;
}

function clearChartPulseLayer(svgEl) {
  const layer = svgEl && svgEl.querySelector('.chart-pulse-layer');
  if (layer) layer.remove();
  app.chartPulseAnimPlayer = '';
}

function extendChartPulsePathToPlotEnd(pathD, svgEl) {
  const plotRight = Number(svgEl.dataset.chartPlotRightX || 0);
  if (!plotRight || !pathD) return pathD;

  const segments = pathD.replace(/^M\s*/, '').split(/\s+L\s+/);
  const lastSeg = segments[segments.length - 1];
  if (!lastSeg) return pathD;

  const [lastX, lastY] = lastSeg.split(',').map(Number);
  if (!Number.isFinite(lastX) || !Number.isFinite(lastY)) return pathD;
  if (lastX >= plotRight - 0.5) return pathD;

  return `${pathD} L ${plotRight} ${lastY}`;
}

function buildChartPulseLayer(svgEl, playerName, pathD, zone) {
  const zoneStyle = getChartZonePulseStyle(zone);
  clearChartPulseLayer(svgEl);
  const pulsePathD = extendChartPulsePathToPlotEnd(pathD, svgEl);

  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('class', 'chart-pulse-layer');
  layer.setAttribute('data-zone', zone);
  layer.setAttribute('data-player', playerName);
  layer.setAttribute('clip-path', 'url(#chart-plot-clip)');

  const mkPath = (cls, stroke, width, opacity) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', pulsePathD);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', String(width));
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('opacity', String(opacity));
    return p;
  };

  layer.appendChild(mkPath('chart-ecg-baseline', zoneStyle.phosphor, 2, 0.42));
  layer.appendChild(mkPath('chart-ecg-glow', zoneStyle.phosphor, 7, 0.32));
  layer.appendChild(mkPath('chart-ecg-core', zoneStyle.phosphor, 2.5, 1));
  svgEl.appendChild(layer);

  const sourceLine = chartFindPlayerEl(svgEl, '.trend-line', playerName);
  if (sourceLine) {
    sourceLine.setAttribute('stroke-width', '1');
    sourceLine.setAttribute('stroke-opacity', '0.05');
  }

  const glow = layer.querySelector('.chart-ecg-glow');
  const pathLen = glow.getTotalLength();
  const cometLen = Math.min(Math.max(pathLen * 0.18, 48), 110);
  const dashGap = pathLen + cometLen;
  const duration = Math.max(0.9, Math.min(1.6, pathLen / 220));

  layer.style.setProperty('--ecg-comet', String(cometLen));
  layer.style.setProperty('--ecg-gap', String(dashGap));
  layer.style.setProperty('--ecg-offset', String(-dashGap));
  layer.style.setProperty('--ecg-dur', duration + 's');

  layer.querySelectorAll('.chart-ecg-glow, .chart-ecg-core').forEach(path => {
    path.setAttribute('stroke-dasharray', `${cometLen} ${pathLen}`);
    path.setAttribute('stroke-dashoffset', '0');
  });

  requestAnimationFrame(() => {
    layer.classList.add('chart-pulse-running');
  });

  app.chartPulseAnimPlayer = playerName;
}

function resolveChartHoverTarget(node, stopAt) {
  let el = node;
  while (el && el !== stopAt && el !== document) {
    if (el.getAttribute && el.classList) {
      if (
        el.classList.contains('trend-line') ||
        el.classList.contains('trend-line-hover-helper') ||
        el.classList.contains('trend-dot')
      ) {
        return el;
      }
    }
    el = el.parentNode;
  }
  return null;
}

function setChartMonitorOverlay(svgEl, zone) {
  if (!svgEl) return;
  const tint = svgEl.querySelector('.chart-monitor-tint');

  if (!zone) {
    svgEl.classList.remove('chart-ecg-active');
    svgEl.removeAttribute('data-ecg-zone');
    return;
  }

  const zoneStyle = getChartZonePulseStyle(zone);
  svgEl.classList.add('chart-ecg-active');
  svgEl.setAttribute('data-ecg-zone', zone);
  if (tint) tint.setAttribute('fill', zoneStyle.tint);
}

function bindChartHoverInteractions() {
  const container = document.getElementById('chart-svg-container');
  if (!container || container.dataset.hoverBound === '1') return;
  container.dataset.hoverBound = '1';

  let moveRaf = 0;

  container.addEventListener('mousemove', (e) => {
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      const svgEl = document.getElementById('score-chart-svg');
      if (!svgEl) return;

      const target = resolveChartHoverTarget(e.target, container);
      if (!target) return;

      const playerName = target.getAttribute('data-player');
      if (!playerName || playerName === app.chartHoverPlayer) return;

      app.chartHoverPlayer = playerName;
      highlightPlayerInChart(playerName);
    });
  });

  container.addEventListener('mouseleave', () => {
    app.chartHoverPlayer = '';
    const hlSelect = document.getElementById('chart-highlight-select');
    highlightPlayerInChart(hlSelect ? hlSelect.value : '');
  });
}

function setChartLinePulse(playerName) {
  const svgEl = document.getElementById('score-chart-svg');
  if (!svgEl) return;

  if (!playerName) {
    clearChartPulseLayer(svgEl);
    setChartMonitorOverlay(svgEl, null);
    return;
  }

  if (app.chartPulseAnimPlayer === playerName && svgEl.querySelector('.chart-pulse-layer')) {
    return;
  }

  const lineEl = chartFindPlayerEl(svgEl, '.trend-line', playerName);
  if (!lineEl) return;

  const pathD = lineEl.getAttribute('d');
  const zone = lineEl.getAttribute('data-zone') || 'red';
  setChartMonitorOverlay(svgEl, zone);
  buildChartPulseLayer(svgEl, playerName, pathD, zone);
}

// Global highlight controller (full version from github)
function highlightPlayerInChart(playerName) {
  const svgEl = document.getElementById('score-chart-svg');
  if (!svgEl) return;

  const highlightSelect = document.getElementById('chart-highlight-select');
  if (highlightSelect && highlightSelect.value !== playerName && playerName !== undefined) {
    highlightSelect.value = playerName;
  }
  
  app.lastHighlightPlayer = playerName || "";

  if (!playerName) {
    // Revert to default
    svgEl.querySelectorAll('.trend-line').forEach(line => {
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-opacity', '0.22');
    });
    setChartLinePulse(null);
    svgEl.querySelectorAll('.trend-dot').forEach(dot => {
      dot.setAttribute('r', '3.2');
      dot.setAttribute('fill-opacity', '0.6');
    });
    svgEl.querySelectorAll('.trend-end-label').forEach(label => {
      const pName = label.getAttribute('data-player');
      const pObj = app.processedPlayers.find(p => p.name === pName);
      const isMobileLabel = label.getAttribute('text-anchor') === 'end';
      const lastR = pObj ? pObj.rank : 99;
      if (pObj && lastR <= 5 && !isMobileLabel) {
        label.style.display = 'block';
        label.setAttribute('fill-opacity', '0.85');
        label.removeAttribute('font-weight');
        label.setAttribute('font-size', '9');
      } else {
        label.style.display = 'none';
      }
    });
    // Remove dot value labels
    svgEl.querySelectorAll('.temp-dot-label').forEach(el => el.remove());
    return;
  }

  // Dim and highlight
  svgEl.querySelectorAll('.trend-line').forEach(line => {
    const pName = line.getAttribute('data-player');
    if (pName === playerName) {
      line.setAttribute('stroke-width', '4.5');
      line.setAttribute('stroke-opacity', '1');
      line.parentElement.appendChild(line); // bring to front
    } else {
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-opacity', '0.04');
    }
  });

  // Keep hover helpers functional and bring current to front
  svgEl.querySelectorAll('.trend-line-hover-helper').forEach(helper => {
    const pName = helper.getAttribute('data-player');
    if (pName === playerName) {
      helper.parentElement.appendChild(helper);
    }
  });

  // Update dots
  svgEl.querySelectorAll('.trend-dot').forEach(dot => {
    const pName = dot.getAttribute('data-player');
    if (pName === playerName) {
      dot.setAttribute('r', '5.5');
      dot.setAttribute('fill-opacity', '1');
      dot.parentElement.appendChild(dot); // bring to front
    } else {
      dot.setAttribute('r', '2');
      dot.setAttribute('fill-opacity', '0.05');
    }
  });

  // Update end labels
  svgEl.querySelectorAll('.trend-end-label').forEach(label => {
    const pName = label.getAttribute('data-player');
    if (pName === playerName) {
      label.style.display = 'block';
      label.setAttribute('fill-opacity', '1');
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-size', '11');
      label.parentElement.appendChild(label); // bring to front
    } else {
      label.style.display = 'none';
    }
  });

  // Clean old dot value labels
  svgEl.querySelectorAll('.temp-dot-label').forEach(el => el.remove());

  // Add temp dot labels for the highlighted player
  const dotsOfPlayer = svgEl.querySelectorAll(`.trend-dot[data-player="${playerName}"]`);
  dotsOfPlayer.forEach(dot => {
    const cx = parseFloat(dot.getAttribute('cx'));
    const cy = parseFloat(dot.getAttribute('cy'));
    const rank = parseInt(dot.getAttribute('data-rank'));

    const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textLabel.setAttribute('x', cx);
    textLabel.setAttribute('y', cy - 10);
    textLabel.setAttribute('text-anchor', 'middle');
    textLabel.setAttribute('font-size', '9.5');
    textLabel.setAttribute('font-weight', '600');
    textLabel.setAttribute('fill', '#fff');
    textLabel.setAttribute('class', 'temp-dot-label');
    textLabel.setAttribute('style', 'pointer-events: none; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.85)); font-family: Inter,sans-serif;');
    textLabel.textContent = rank;
    
    dot.parentElement.appendChild(textLabel);
  });

  setChartLinePulse(playerName);
}

// Format date to Thai display
function formatThaiDate(dateStr) {
  if (!dateStr) return 'ไม่ระบุวัน';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  return `วัน${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}
// Custom confirmation modal helper (eliminates native confirm dialog issues)
function showCustomConfirm(message, onConfirm) {
  const overlay = document.getElementById('confirm-modal-overlay');
  const msgEl = document.getElementById('confirm-modal-message');
  const okBtn = document.getElementById('confirm-modal-ok-btn');
  const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
  const closeBtn = document.getElementById('close-confirm-modal-btn');
  
  if (!overlay || !msgEl || !okBtn) {
    if (confirm(message)) {
      onConfirm();
    }
    return;
  }
  
  msgEl.textContent = message;
  
  const closeModal = () => {
    overlay.classList.remove('active');
  };
  
  okBtn.onclick = () => {
    closeModal();
    onConfirm();
  };
  
  cancelBtn.onclick = closeModal;
  closeBtn.onclick = closeModal;
  
  overlay.classList.add('active');
}

// Delete a match (admin only)
function deleteMatch(matchId) {
  showCustomConfirm('คุณต้องการลบคู่แข่งขันนี้ใช่หรือไม่?', async () => {
    app.matches = app.matches.filter(m => m.id != matchId);
    
    // Track deleted matches to persist on page loads with safety try-catch
    let deletedMatches = [];
    try {
      deletedMatches = JSON.parse(localStorage.getItem('worldcup_deleted_matches') || '[]');
      if (!Array.isArray(deletedMatches)) deletedMatches = [];
    } catch (e) {
      console.error(e);
    }
    
    if (!deletedMatches.some(id => id == matchId)) {
      deletedMatches.push(matchId);
      localStorage.setItem('worldcup_deleted_matches', JSON.stringify(deletedMatches));
    }
    
    localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
    await saveToServer();
    recalculateAll();
    renderMatches();
    renderDashboard();
  });
}

// Helper: calculate the game points a specific team earned from ONE match
// Uses the exact formula from the Rules page:
//   คะแนน = (ผลการแข่งขัน + ประตูที่ยิงได้) × ตัวคูณของทีมนั้น
//   ผลการแข่งขัน: ชนะ=3, เสมอ=2, แพ้=1
// For knockout decided by penalties: result becomes 3/1, but we use the stored score (90+ET goals only — penalty goals are never counted)
function getMatchGamePointsForTeam(match, teamName, multiplier) {
  if (!match || match.status !== 'finished' || match.homeScore == null || match.awayScore == null) return 0;
  if (!teamName) return 0;

  const isHome = match.home === teamName;
  const goals = isHome ? match.homeScore : match.awayScore;

  const h = match.homeScore;
  const a = match.awayScore;

  let resultPoints = 1; // default = loss

  if (h > a) {
    resultPoints = isHome ? 3 : 1;
  } else if (h < a) {
    resultPoints = isHome ? 1 : 3;
  } else {
    // Draw after 90 or 120 minutes
    if (match.isKnockout && match.penaltyWinner) {
      // Penalty shootout decides winner/loser (3/1). Goals from PK are NOT added.
      resultPoints = (match.penaltyWinner === (isHome ? 'home' : 'away')) ? 3 : 1;
    } else {
      resultPoints = 2;
    }
  }

  return (resultPoints + goals) * (multiplier || 1);
}

// Helper: determine result category for a team in a finished match
// Returns 'win' | 'draw' | 'loss'  (used for color coding the points)
function getMatchResultForTeam(match, teamName) {
  if (!match || match.status !== 'finished' || match.homeScore == null || match.awayScore == null) return 'loss';
  const isHome = match.home === teamName;
  const hs = match.homeScore;
  const as = match.awayScore;

  if (hs > as) return isHome ? 'win' : 'loss';
  if (hs < as) return isHome ? 'loss' : 'win';

  // Draw (normal time or after extra time)
  if (match.isKnockout && match.penaltyWinner) {
    return (match.penaltyWinner === (isHome ? 'home' : 'away')) ? 'win' : 'loss';
  }
  return 'draw';
}

// RENDERING - MATCHES
function renderMatches() {
  const grid = document.getElementById('matches-grid');
  grid.innerHTML = '';
  
  // Sort matches by date then by id
  const sortedMatches = [...app.matches].sort((a, b) => {
    const dateA = a.date || '9999-12-31';
    const dateB = b.date || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.id - b.id;
  });
  
  // Group by date
  const dateGroups = new Map();
  sortedMatches.forEach(m => {
    const key = m.date || 'no-date';
    if (!dateGroups.has(key)) dateGroups.set(key, []);
    dateGroups.get(key).push(m);
  });
  
  let cardIndex = 0;

  // Render each date group
  dateGroups.forEach((groupMatches, dateKey) => {
    // Date section header
    const dateHeader = document.createElement('div');
    dateHeader.className = 'matches-date-header';
    const dateLabel = dateKey !== 'no-date' ? formatThaiDate(dateKey) : 'ไม่ระบุวัน';
    const finishedInGroup = groupMatches.filter(m => m.status === 'finished').length;
    dateHeader.innerHTML = `
      <div class="date-divider">
        <span class="date-label">📅 ${dateLabel}</span>
        <span class="date-count">${groupMatches.length} คู่ · เล่นแล้ว ${finishedInGroup}</span>
      </div>
    `;
    grid.appendChild(dateHeader);

    groupMatches.forEach(match => {
      grid.appendChild(buildLiveMatchCard(match, cardIndex++, { mode: 'matches' }));
    });
  });
  
  setupMatchCardListeners();
}

function setupMatchCardListeners() {
  document.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const matchId = parseInt(e.target.getAttribute('data-match-id'));
      const match = app.matches.find(m => m.id == matchId);
      if (match && match.isKnockout) {
        const card = e.target.closest('.match-card');
        const homeInput = card.querySelector('.home-score-input');
        const awayInput = card.querySelector('.away-score-input');
        const penaltyUi = card.querySelector('.penalty-ui');
        
        const hVal = parseInt(homeInput.value);
        const aVal = parseInt(awayInput.value);
        
        if (!isNaN(hVal) && !isNaN(aVal) && hVal === aVal) {
          penaltyUi.style.display = 'flex';
        } else {
          penaltyUi.style.display = 'none';
        }
      }
    });
  });
  
  document.querySelectorAll('.save-match-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      const card = btn.closest('.match-card');
      const hVal = card.querySelector('.home-score-input').value;
      const aVal = card.querySelector('.away-score-input').value;
      
      if (hVal === '' || aVal === '') {
        alert('กรุณากรอกคะแนนผลการแข่งขันทั้งสองฝั่ง!');
        return;
      }
      
      const homeScore = parseInt(hVal);
      const awayScore = parseInt(aVal);
      
      const match = app.matches.find(m => m.id == matchId);
      if (match) {
        match.homeScore = homeScore;
        match.awayScore = awayScore;
        match.status = 'finished';
        
        if (match.isKnockout) {
          if (homeScore === awayScore) {
            const penSelect = card.querySelector('.penalty-select');
            if (penSelect.value === '') {
              alert('นัดเสมอรอบ Knockout ต้องเลือกผู้ชนะจุดโทษ!');
              return;
            }
            match.penaltyWinner = penSelect.value;
          } else {
            match.penaltyWinner = null;
          }
        }
        
        // Track manual scores edits with safety try-catch
        let manuallyEditedMatches = [];
        try {
          manuallyEditedMatches = JSON.parse(localStorage.getItem('worldcup_manually_edited_matches') || '[]');
          if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
        } catch (e) {
          console.error(e);
        }
        
        if (!manuallyEditedMatches.some(id => id == matchId)) {
          manuallyEditedMatches.push(matchId);
          localStorage.setItem('worldcup_manually_edited_matches', JSON.stringify(manuallyEditedMatches));
        }
        
        localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
        await saveToServer();
        alert('บันทึกสกอร์การแข่งขันเรียบร้อย!');
        refreshMatchCardViews();
      }
    });
  });
  
  document.querySelectorAll('.clear-match-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      const match = app.matches.find(m => m.id == matchId);
      if (match) {
        match.homeScore = null;
        match.awayScore = null;
        match.status = 'pending';
        match.penaltyWinner = null;
        
        // Track manual score clear with safety try-catch
        let manuallyEditedMatches = [];
        try {
          manuallyEditedMatches = JSON.parse(localStorage.getItem('worldcup_manually_edited_matches') || '[]');
          if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
        } catch (e) {
          console.error(e);
        }
        
        if (!manuallyEditedMatches.some(id => id == matchId)) {
          manuallyEditedMatches.push(matchId);
          localStorage.setItem('worldcup_manually_edited_matches', JSON.stringify(manuallyEditedMatches));
        }
        
        localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
        await saveToServer();
        alert('ล้างข้อมูลสกอร์เรียบร้อย!');
        refreshMatchCardViews();
      }
    });
  });
  
  document.querySelectorAll('.delete-match-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      deleteMatch(matchId);
    });
  });
}

// RENDERING - PLAYERS
function renderPlayers() {
  recalculateAll();
  const searchInput = document.getElementById('players-search').value.toLowerCase().trim();
  
  // Get selected teams from filter
  const selectedTeams = [];
  document.querySelectorAll('#players-team-filter-checkboxes-container .team-filter-checkbox').forEach(cb => {
    if (cb.checked) selectedTeams.push(cb.value);
  });

  // Update filter button text
  const btnText = document.getElementById('players-team-filter-btn-text');
  if (btnText) {
    if (selectedTeams.length === 0) {
      btnText.textContent = '🔍 กรองตามทีมที่เลือก (ทั้งหมด)';
    } else {
      btnText.textContent = `🔍 กรองอยู่ (${selectedTeams.length} ทีม)`;
    }
  }

  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = '';

  let filtered = app.processedPlayers || [];

  // Filter by teams first (empty panel only when no player has all selected teams)
  let teamFiltered = filtered;
  if (selectedTeams.length > 0) {
    teamFiltered = teamFiltered.filter(p => p.teams && selectedTeams.every(t => p.teams.includes(t)));
  }

  // Filter by name
  if (searchInput) {
    filtered = teamFiltered.filter(p => p.name.toLowerCase().includes(searchInput));
  } else {
    filtered = teamFiltered;
  }

  const selectedTeamsSet = new Set(selectedTeams);
  const isTeamFilterEmpty = selectedTeams.length > 0 && teamFiltered.length === 0;

  setPlayersFilterEmptyState(isTeamFilterEmpty);
  if (filtered.length === 0) return;

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.classList.add('hoverable');
    tr.dataset.playerName = p.name;
    tr.style.cursor = 'pointer';

    tr.onclick = (e) => {
      if (e.target.closest('[data-team]')) return;
      e.stopPropagation();
      openPlayerDetails(p.name);
    };

    const nameTd = document.createElement('td');
    nameTd.className = 'players-name-cell';
    nameTd.textContent = p.name;

    const teamsTd = document.createElement('td');
    teamsTd.className = 'players-teams-cell';

    const badgesWrapper = document.createElement('div');
    badgesWrapper.className = 'players-teams-grid';

    p.teamBreakdown.forEach(tb => {
      const badge = document.createElement('span');
      const isFilterMatch = selectedTeamsSet.has(tb.name);
      badge.className = `team-badge team-${tb.zone} players-team-badge${isFilterMatch ? ' players-team-badge--filter-match' : ''}`;
      badge.dataset.team = tb.name;
      badge.title = `${tb.name} · ${formatWcGroupLabel(getTeamWcGroup(tb.name))} · x${tb.multiplier || 1} · ${tb.points.toFixed(1)} คะแนน`;
      applyTeamPopularity(badge, tb.name);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'players-team-badge__name';
      nameSpan.textContent = tb.name;

      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'players-team-badge__pts';
      ptsSpan.textContent = tb.points.toFixed(1);

      badge.appendChild(nameSpan);
      badge.appendChild(ptsSpan);
      badgesWrapper.appendChild(badge);
    });
    teamsTd.appendChild(badgesWrapper);

    const scoreTd = document.createElement('td');
    scoreTd.className = 'players-score-cell table-score-cell';
    scoreTd.textContent = p.totalScore.toFixed(1);

    tr.appendChild(nameTd);
    tr.appendChild(teamsTd);
    tr.appendChild(scoreTd);

    tbody.appendChild(tr);
  });
}

// statsSort* provided via state.js named exports in bundle

const STATS_ZONE_ORDER = { blue: 0, green: 1, yellow: 2, grey: 3, 'red-orange': 4 };
const STATS_ZONE_META = [
  { key: 'blue', label: 'Blue Zone', thLabel: 'โซนน้ำเงิน', mult: 'x1.0 – 1.3', teamClass: 'team-blue', panelClass: 'stats-zone-panel--blue' },
  { key: 'green', label: 'Green Zone', thLabel: 'โซนเขียว', mult: 'x1.4 – 1.7', teamClass: 'team-green', panelClass: 'stats-zone-panel--green' },
  { key: 'yellow', label: 'Yellow Zone', thLabel: 'โซนเหลือง', mult: 'x1.8 – 2.1', teamClass: 'team-yellow', panelClass: 'stats-zone-panel--yellow' },
  { key: 'grey', label: 'Grey Zone', thLabel: 'โซนเทา', mult: 'x2.2 – 2.6', teamClass: 'team-grey', panelClass: 'stats-zone-panel--grey' },
  { key: 'red-orange', label: 'Red Zone', thLabel: 'โซนแดง', mult: 'x2.7 – 3.0', teamClass: 'team-red-orange', panelClass: 'stats-zone-panel--red-orange' }
];

function renderStatsGrandPills(el, total, avg) {
  if (!el) return;
  el.innerHTML = `
    <span class="stats-grand-pill">รวม <strong>${total.toFixed(1)}</strong></span>
    <span class="stats-grand-pill stats-grand-pill--avg">เฉลี่ย <strong>${avg.toFixed(1)}</strong></span>
  `;
}

function buildStatsGroupTeamRows(teams) {
  return teams
    .sort((a, b) => b.points - a.points)
    .map(t => {
      const popCount = getTeamPopularity(t.name);
      return `
      <li class="stats-group-team-row ${getTeamZoneClass(t.zone)}" data-team="${escapeHtml(t.name)}" style="${getTeamPopStyleAttr(t.name)}" title="ดูผู้เลือก: ${escapeHtml(t.name)}${popCount ? ` (${popCount} คน)` : ''}">
        <span class="stats-group-team-dot stats-group-team-dot--${t.zone}"></span>
        <span class="stats-group-team-name">${escapeHtml(t.name)}</span>
        <span class="stats-group-team-pts">${t.points.toFixed(1)}</span>
      </li>
    `;
    })
    .join('');
}

function buildStatsZoneTeamGrid(teams) {
  return teams
    .sort((a, b) => b.points - a.points)
    .map(t => {
      const popCount = getTeamPopularity(t.name);
      return `
      <div class="stats-zone-team-chip ${getTeamZoneClass(t.zone)}" data-team="${escapeHtml(t.name)}" style="${getTeamPopStyleAttr(t.name)}" title="ดูผู้เลือก: ${escapeHtml(t.name)}${popCount ? ` (${popCount} คน)` : ''}">
        <span class="stats-zone-team-name">${escapeHtml(t.name)}</span>
        <span class="stats-zone-team-pts">${t.points.toFixed(1)}</span>
      </div>
    `;
    })
    .join('');
}

function buildStatsArray() {
  const teamScores = calculateTeamPoints();
  return TEAMS.map(t => {
    const s = teamScores[t.name] || { points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0 };
    return {
      name: t.name,
      zone: t.zone,
      wcGroup: getTeamWcGroup(t.name),
      multiplier: t.multiplier,
      ...s
    };
  });
}

function compareStatsRows(a, b, key, dir) {
  const mult = dir === 'asc' ? 1 : -1;
  let cmp = 0;

  switch (key) {
    case 'name':
      cmp = a.name.localeCompare(b.name, 'th');
      break;
    case 'wcGroup':
      cmp = (a.wcGroup || '').localeCompare(b.wcGroup || '');
      if (cmp === 0) cmp = a.name.localeCompare(b.name, 'th');
      break;
    case 'zone':
      cmp = (STATS_ZONE_ORDER[a.zone] ?? 99) - (STATS_ZONE_ORDER[b.zone] ?? 99);
      if (cmp === 0) cmp = b.points - a.points;
      break;
    case 'multiplier':
      cmp = a.multiplier - b.multiplier;
      break;
    default:
      cmp = (a[key] ?? 0) - (b[key] ?? 0);
      if (key === 'points' && cmp === 0) cmp = b.goalsFor - a.goalsFor;
      break;
  }

  return cmp * mult;
}

function sortStatsArray(statsArray, sortState = app.statsSortState) {
  return [...statsArray].sort((a, b) => compareStatsRows(a, b, sortState.key, sortState.dir));
}

function computeTeamSelections(statsArray) {
  const teamsByZone = {};
  statsArray.forEach(s => {
    if (!teamsByZone[s.zone]) teamsByZone[s.zone] = [];
    teamsByZone[s.zone].push(s);
  });

  let bestSelection = [];
  let bestCandidates = [];
  Object.keys(teamsByZone).forEach(z => {
    const sorted = [...teamsByZone[z]].sort((a, b) => b.points - a.points);
    if (sorted.length > 0) {
      bestSelection.push(sorted[0]);
      for (let i = 1; i < Math.min(sorted.length, 4); i++) {
        bestCandidates.push(sorted[i]);
      }
    }
  });
  bestCandidates.sort((a, b) => b.points - a.points);
  bestSelection = bestSelection.concat(bestCandidates.slice(0, 10));
  bestSelection.sort((a, b) => b.points - a.points);
  const bestTotal = bestSelection.reduce((sum, s) => sum + s.points, 0);

  let worstSelection = [];
  let worstCandidates = [];
  Object.keys(teamsByZone).forEach(z => {
    const sorted = [...teamsByZone[z]].sort((a, b) => a.points - b.points);
    if (sorted.length > 0) {
      worstSelection.push(sorted[0]);
      for (let i = 1; i < Math.min(sorted.length, 4); i++) {
        worstCandidates.push(sorted[i]);
      }
    }
  });
  worstCandidates.sort((a, b) => a.points - b.points);
  worstSelection = worstSelection.concat(worstCandidates.slice(0, 10));
  worstSelection.sort((a, b) => a.points - b.points);
  const worstTotal = worstSelection.reduce((sum, s) => sum + s.points, 0);

  return { bestSelection, bestTotal, worstSelection, worstTotal };
}

function renderSelectionBadges(container, selection, options = {}) {
  if (!container) return;

  const {
    compact = false,
    badgeClass = 'stats-selection-badge'
  } = options;

  container.innerHTML = '';

  selection.forEach(s => {
    const badge = document.createElement('span');
    badge.className = `team-badge team-${s.zone} ${badgeClass}`;
    badge.dataset.team = s.name;
    badge.title = `ดูผู้เลือกทีมนี้ — ${s.points.toFixed(1)} คะแนน`;
    applyTeamPopularity(badge, s.name);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'selection-badge-name';
    nameSpan.textContent = compact ? s.name : `${s.name} [${getTeamWcGroup(s.name) || '-'}]`;

    const ptsSpan = document.createElement('span');
    ptsSpan.className = 'selection-badge-pts';
    ptsSpan.textContent = s.points.toFixed(1);

    badge.appendChild(nameSpan);
    badge.appendChild(ptsSpan);
    container.appendChild(badge);
  });
}

function renderTeamSelections(statsArray, mode = 'both') {
  const { bestSelection, bestTotal, worstSelection, worstTotal } = computeTeamSelections(statsArray);

  if (mode === 'full' || mode === 'both') {
    renderSelectionBadges(
      document.getElementById('best-selection-container'),
      bestSelection,
      { compact: false, badgeClass: 'stats-selection-badge' }
    );
    renderSelectionBadges(
      document.getElementById('worst-selection-container'),
      worstSelection,
      { compact: false, badgeClass: 'stats-selection-badge' }
    );
    const bestPts = document.getElementById('best-total-points');
    const worstPts = document.getElementById('worst-total-points');
    if (bestPts) bestPts.textContent = bestTotal.toFixed(1);
    if (worstPts) worstPts.textContent = worstTotal.toFixed(1);
  }

  if (mode === 'compact' || mode === 'both') {
    renderSelectionBadges(
      document.getElementById('dashboard-best-selection-container'),
      bestSelection,
      { compact: true, badgeClass: 'dashboard-selection-badge' }
    );
    renderSelectionBadges(
      document.getElementById('dashboard-worst-selection-container'),
      worstSelection,
      { compact: true, badgeClass: 'dashboard-selection-badge' }
    );
    const dashBestPts = document.getElementById('dashboard-best-total-points');
    const dashWorstPts = document.getElementById('dashboard-worst-total-points');
    if (dashBestPts) dashBestPts.textContent = bestTotal.toFixed(1);
    if (dashWorstPts) dashWorstPts.textContent = worstTotal.toFixed(1);
  }
}

function updateStatsSortUI() {
  document.querySelectorAll('#statistics-table .stats-sort-btn').forEach(btn => {
    const isActive = btn.dataset.sort === app.statsSortState.key;
    btn.classList.toggle('is-active', isActive);
    const arrow = btn.querySelector('.stats-sort-arrow');
    if (arrow) {
      arrow.textContent = isActive
        ? (app.statsSortState.dir === 'asc' ? '↑' : '↓')
        : '⇅';
    }
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function setupStatsSortHandlers() {
  if (app.statsSortHandlersReady) return;
  app.statsSortHandlersReady = true;

  const table = document.getElementById('statistics-table');
  if (table) {
    table.addEventListener('click', (e) => {
      const btn = e.target.closest('.stats-sort-btn');
      if (!btn) return;
      e.preventDefault();
      const key = btn.dataset.sort;
      if (!key) return;
      if (app.statsSortState.key === key) {
        app.statsSortState.dir = app.statsSortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        const numericKeys = new Set(['played', 'wins', 'draws', 'losses', 'goalsFor', 'multiplier', 'points']);
        app.statsSortState = {
          key,
          dir: numericKeys.has(key) ? 'desc' : 'asc'
        };
      }
      renderStatistics();
    });
  }

}

function renderStatsGroupBreakdown(statsArray) {
  const container = document.getElementById('stats-group-breakdown');
  const grandEl = document.getElementById('stats-group-grand-total');
  if (!container) return;

  const groups = Object.keys(TEAM_WC_GROUP_MEMBERS).sort();
  const groupStats = groups.map(group => {
    const memberNames = TEAM_WC_GROUP_MEMBERS[group] || [];
    const teams = statsArray.filter(s => memberNames.includes(s.name));
    const total = teams.reduce((sum, t) => sum + t.points, 0);
    const count = teams.length || memberNames.length;
    const avg = count ? total / count : 0;
    return { group, teams, total, count, avg };
  });

  const allTotal = groupStats.reduce((sum, g) => sum + g.total, 0);
  const allCount = groupStats.reduce((sum, g) => sum + g.count, 0);
  const maxTotal = Math.max(...groupStats.map(g => g.total), 1);
  const sortedForRank = [...groupStats].sort((a, b) => b.total - a.total);
  const rankMap = new Map(sortedForRank.map((g, i) => [g.group, i + 1]));

  const displayOrder = [...groupStats].sort((a, b) => b.total - a.total || a.group.localeCompare(b.group));

  container.innerHTML = displayOrder.map(({ group, teams, total, count, avg }) => {
    const rank = rankMap.get(group) || 0;
    const rankClass = rank <= 3 ? `stats-group-card--top${rank}` : '';
    const barPct = Math.max(8, (total / maxTotal) * 100);

    return `
      <div class="stats-group-card ${rankClass}" title="อันดับกลุ่ม #${rank}">
        <div class="stats-group-card-top">
          <span class="stats-group-letter">${group}</span>
          <div class="stats-group-score-inline">
            <span class="stats-group-score-main">${total.toFixed(1)}</span>
            <span class="stats-group-score-sub">เฉลี่ย ${avg.toFixed(1)}</span>
          </div>
        </div>
        <div class="stats-group-bar-wrap" title="สัดส่วนคะแนนรวมเทียบกลุ่มสูงสุด">
          <div class="stats-group-bar" style="width:${barPct.toFixed(1)}%"></div>
        </div>
        <ul class="stats-group-team-list stats-group-team-list--grid">${buildStatsGroupTeamRows(teams)}</ul>
      </div>
    `;
  }).join('');

  renderStatsGrandPills(grandEl, allTotal, allCount ? allTotal / allCount : 0);
}

function renderStatsZoneBreakdown(statsArray) {
  const container = document.getElementById('stats-zone-breakdown');
  const grandEl = document.getElementById('stats-zone-grand-total');
  if (!container) return;

  const zoneStats = STATS_ZONE_META.map(meta => {
    const teams = statsArray.filter(s => s.zone === meta.key);
    const total = teams.reduce((sum, t) => sum + t.points, 0);
    const count = teams.length;
    const avg = count ? total / count : 0;
    return { meta, teams, total, count, avg };
  });

  const allTotal = zoneStats.reduce((sum, z) => sum + z.total, 0);
  const allCount = zoneStats.reduce((sum, z) => sum + z.count, 0);
  const maxTotal = Math.max(...zoneStats.map(z => z.total), 1);

  container.innerHTML = zoneStats.map(({ meta, teams, total, count, avg }) => {
    const barPct = Math.max(6, (total / maxTotal) * 100);

    return `
      <div class="stats-zone-panel ${meta.panelClass}">
        <div class="stats-zone-panel-header stats-zone-panel-header--compact">
          <span class="team-badge ${meta.teamClass} stats-zone-badge">${meta.thLabel}</span>
          <span class="stats-zone-mult-chip">${meta.mult}</span>
          <div class="stats-zone-inline-stats">
            <span class="stats-zone-inline-stat"><strong>${total.toFixed(1)}</strong> รวม</span>
            <span class="stats-zone-inline-stat"><strong>${avg.toFixed(1)}</strong> เฉลี่ย</span>
            <span class="stats-zone-inline-stat"><strong>${count}</strong> ทีม</span>
          </div>
        </div>
        <div class="stats-zone-bar-wrap stats-zone-bar-wrap--compact" title="${barPct.toFixed(0)}% ของโซนสูงสุด">
          <div class="stats-zone-bar" style="width:${barPct.toFixed(1)}%"></div>
        </div>
        <div class="stats-zone-team-grid stats-zone-team-grid--compact">${buildStatsZoneTeamGrid(teams)}</div>
      </div>
    `;
  }).join('');

  renderStatsGrandPills(grandEl, allTotal, allCount ? allTotal / allCount : 0);
}

function getFinalGuessBuckets() {
  const buckets = Array.from({ length: 10 }, (_, guess) => ({ guess, players: [] }));
  const noGuess = [];

  app.players.forEach(player => {
    const raw = player.guess;
    if (raw == null || raw === '') {
      noGuess.push(player);
      return;
    }
    const guess = Number(raw);
    if (!Number.isInteger(guess) || guess < 0 || guess > 9) {
      noGuess.push(player);
      return;
    }
    buckets[guess].players.push(player);
  });

  const byName = (a, b) => a.name.localeCompare(b.name, 'th');
  buckets.forEach(bucket => bucket.players.sort(byName));
  noGuess.sort(byName);
  return { buckets, noGuess };
}

function buildStatsFinalGuessPlayerChip(playerName) {
  return `<button type="button" class="stats-final-guess-player" data-player="${escapeHtml(playerName)}">${escapeHtml(playerName)}</button>`;
}

function renderStatsFinalGuess() {
  const container = document.getElementById('stats-final-guess-bars');
  const summaryEl = document.getElementById('stats-final-guess-summary');
  const metaEl = document.getElementById('stats-final-guess-meta');
  if (!container) return;

  const finalMatch = app.matches.find(m => m.isFinal) || INITIAL_MATCHES.find(m => m.isFinal);
  const { buckets, noGuess } = getFinalGuessBuckets();
  const activeBuckets = buckets.filter(b => b.players.length > 0);
  const guessedCount = app.players.length - noGuess.length;
  const topBucket = [...activeBuckets].sort((a, b) => b.players.length - a.players.length)[0];
  const actualTotal = finalMatch?.status === 'finished'
    && finalMatch.homeScore != null
    && finalMatch.awayScore != null
    ? finalMatch.homeScore + finalMatch.awayScore
    : null;

  if (summaryEl) {
    const noGuessNote = noGuess.length ? ` · ยังไม่ทาย ${noGuess.length}` : '';
    summaryEl.textContent = `ทายแล้ว ${guessedCount}/${app.players.length} คน${noGuessNote}`;
  }

  if (metaEl) {
    if (!finalMatch) {
      metaEl.textContent = 'ยังไม่มีนัดชิงในระบบ';
    } else {
      const dateLabel = finalMatch.date
        ? new Date(finalMatch.date + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      const matchLine = `${finalMatch.home} vs ${finalMatch.away}${dateLabel ? ` · ${dateLabel}` : ''}`;
      if (actualTotal != null) {
        const winners = buckets[actualTotal]?.players.length || 0;
        metaEl.textContent = `${matchLine} · ผลจริงรวม ${actualTotal} ลูก · ทายถูก ${winners} คน`;
      } else {
        const popular = topBucket
          ? ` · เลขยอดนิยม ${topBucket.guess} ลูก (${topBucket.players.length} คน)`
          : '';
        metaEl.textContent = `${matchLine} · รอผลนัดชิง${popular}`;
      }
    }
  }

  if (!activeBuckets.length) {
    container.innerHTML = '<div class="stats-final-guess-empty">ยังไม่มีผู้ทายเลขใดเลย</div>';
    return;
  }

  const maxCount = Math.max(...activeBuckets.map(b => b.players.length), 1);
  const activeGuess = renderStatsFinalGuess._activeGuess ?? null;

  container.innerHTML = activeBuckets
    .sort((a, b) => a.guess - b.guess)
    .map(({ guess, players: guessPlayers }) => {
      const pct = Math.round((guessPlayers.length / maxCount) * 100);
      const isWinner = actualTotal === guess;
      const isOpen = activeGuess === guess;
      const playerHtml = guessPlayers.map(p => buildStatsFinalGuessPlayerChip(p.name)).join('');
      return `
        <div class="stats-final-guess-bar-item${isWinner ? ' stats-final-guess-bar-item--winner' : ''}${isOpen ? ' is-open' : ''}">
          <button type="button" class="stats-final-guess-bar-row" data-guess="${guess}" title="กดดูรายชื่อ">
            <span class="stats-final-guess-bar-num">${guess}</span>
            <span class="stats-final-guess-bar-wrap" aria-hidden="true">
              <span class="stats-final-guess-bar-fill" style="width:${pct}%"></span>
            </span>
            <span class="stats-final-guess-bar-count">${guessPlayers.length}</span>
          </button>
          <div class="stats-final-guess-bar-players">${playerHtml}</div>
        </div>`;
    }).join('');

  if (!container._finalGuessBound) {
    container._finalGuessBound = true;
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.stats-final-guess-player[data-player]');
      if (chip) {
        e.stopPropagation();
        e.preventDefault();
        openPlayerDetails(chip.getAttribute('data-player'));
        return;
      }
      const row = e.target.closest('.stats-final-guess-bar-row[data-guess]');
      if (!row || !container.contains(row)) return;
      e.stopPropagation();
      const guess = Number(row.getAttribute('data-guess'));
      renderStatsFinalGuess._activeGuess = renderStatsFinalGuess._activeGuess === guess ? null : guess;
      renderStatsFinalGuess();
    });
  }
}

function renderStatistics() {
  setupStatsSortHandlers();

  const tbody = document.getElementById('statistics-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const statsArray = sortStatsArray(buildStatsArray());
  renderStatsGroupBreakdown(statsArray);
  renderStatsZoneBreakdown(statsArray);
  renderStatsFinalGuess();
  updateStatsSortUI();

  statsArray.forEach((s, idx) => {
    const tr = document.createElement('tr');

    // Rank
    const rankTd = document.createElement('td');
    rankTd.className = 'stats-rank-cell';
    rankTd.textContent = String(idx + 1);

    // Team Name
    const nameTd = document.createElement('td');
    nameTd.className = 'stats-name-cell';
    const badge = document.createElement('span');
    badge.className = `team-badge team-${s.zone} stats-table-team-badge`;
    badge.dataset.team = s.name;
    badge.title = 'ดูผู้เลือกทีมนี้';
    applyTeamPopularity(badge, s.name);
    badge.textContent = s.name;
    nameTd.appendChild(badge);

    // Zone
    const zoneTd = document.createElement('td');
    zoneTd.className = 'stats-zone-cell';
    const zoneClass = getZoneBadgeClass(s.zone);
    zoneTd.innerHTML = `<span class="badge badge-${zoneClass} stats-zone-badge-compact">${formatZoneDisplayLabel(s.zone)}</span>`;

    const groupTd = document.createElement('td');
    groupTd.className = 'stats-group-cell';
    groupTd.innerHTML = getWcGroupBadgeHtml(getTeamWcGroup(s.name));

    // Played
    const playedTd = document.createElement('td');
    playedTd.className = 'stats-stat-cell';
    playedTd.textContent = s.played;

    // Won
    const wonTd = document.createElement('td');
    wonTd.className = 'stats-stat-cell stats-stat-cell--win';
    wonTd.textContent = s.wins;

    // Drawn
    const drawnTd = document.createElement('td');
    drawnTd.className = 'stats-stat-cell stats-stat-cell--draw';
    drawnTd.textContent = s.draws;

    // Lost
    const lostTd = document.createElement('td');
    lostTd.className = 'stats-stat-cell stats-stat-cell--loss';
    lostTd.textContent = s.losses;

    // Goals
    const goalsTd = document.createElement('td');
    goalsTd.className = 'stats-stat-cell';
    goalsTd.textContent = s.goalsFor;

    // Multiplier
    const multTd = document.createElement('td');
    multTd.className = 'stats-mult-cell';
    multTd.textContent = 'x' + s.multiplier.toFixed(1);

    // Points
    const pointsTd = document.createElement('td');
    pointsTd.className = 'stats-points-cell';
    pointsTd.textContent = s.points.toFixed(1);

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(groupTd);
    tr.appendChild(zoneTd);
    tr.appendChild(playedTd);
    tr.appendChild(wonTd);
    tr.appendChild(drawnTd);
    tr.appendChild(lostTd);
    tr.appendChild(goalsTd);
    tr.appendChild(multTd);
    tr.appendChild(pointsTd);

    tbody.appendChild(tr);
  });

  renderTeamSelections(statsArray, 'full');
}

function getProcessedPlayersWithoutSimulation() {
  const saved = JSON.parse(JSON.stringify(app.simulationScores));
  app.simulationScores = {};
  const baseline = processPlayers(calculateTeamPoints());
  app.simulationScores = saved;
  return baseline;
}

function renderTools() {
  recalculateAll();
  renderToolsCompare();
  renderToolsSimulator();
}

function getPayoutTierClass(amount) {
  if (amount >= 1500) return 'payout-tier--plum';
  if (amount >= 1200) return 'payout-tier--orange';
  if (amount >= 1000) return 'payout-tier--amber';
  return 'payout-tier--free';
}

function renderPayoutAmountChip(amount) {
  if (!amount) {
    return '<span class="payout-amount-chip payout-amount-chip--free">—</span>';
  }
  const tier = getPayoutTierClass(amount);
  return `<span class="payout-amount-chip payout-amount-chip--due ${tier}">฿${amount.toLocaleString('th-TH')}</span>`;
}

function getPayoutShortLabel(p) {
  if (!p.payout) return 'ไม่ต้องจ่าย';
  if (p.payout >= 1500) return 'บ๊วย';
  if (p.payout >= 1200) return 'รองบ๊วย';
  if (p.payoutLabel.includes('ยกเว้น')) return 'ยกเว้น Red';
  if (p.payoutLabel.includes('Green')) return 'Green avg';
  if (p.payoutLabel.includes('ทั้งหมด')) return 'avg รวม';
  if (p.payoutLabel.includes('สิทธิ์')) return 'Blue Zone';
  return 'Red Zone';
}

function renderPayoutRing(percent, colorClass, size = 54) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const half = size / 2;
  return `<svg class="payout-stat-ring ${colorClass}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="payout-stat-ring__track" cx="${half}" cy="${half}" r="${r}" />
    <circle class="payout-stat-ring__fill" cx="${half}" cy="${half}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${offset}" />
    <text class="payout-stat-ring__text" x="${half}" y="${half}" dy="0.35em">${Math.round(pct)}%</text>
  </svg>`;
}

function renderPayoutStatCard(value, label, sub, ringPct, ringClass, cardClass) {
  return `
    <div class="card payout-stat-card ${cardClass}">
      <div class="payout-stat-card__body">
        <div class="payout-stat-card__value">${value}</div>
        <div class="payout-stat-card__label">${label}</div>
        ${sub ? `<div class="payout-stat-card__sub">${sub}</div>` : ''}
      </div>
      ${renderPayoutRing(ringPct, ringClass)}
    </div>
  `;
}

function renderPayoutTxItem(p) {
  const tier = getPayoutTierClass(p.payout);
  const shortLabel = getPayoutShortLabel(p);
  return `
    <div class="payout-tx-item payout-tx-item--due ${tier}" role="listitem" title="${escapeHtml(p.payoutLabel || '')}">
      <div class="payout-tx-item__rank">#${p.rank}</div>
      <div class="payout-tx-item__info">
        <div class="payout-tx-item__name">${escapeHtml(p.name)}</div>
        <div class="payout-tx-item__meta">${escapeHtml(shortLabel)} · ${formatZoneDisplayLabel(p.zone)} · ${p.totalScore.toFixed(1)} คะแนน</div>
      </div>
      <div class="payout-tx-item__amount ${tier}">+฿${p.payout.toLocaleString('th-TH')}</div>
    </div>
  `;
}

function renderPayoutRosterItem(p) {
  const zoneCls = getZoneBadgeClass(p.zone);
  const tier = p.payout > 0 ? getPayoutTierClass(p.payout) : 'payout-tier--free';
  const shortLabel = getPayoutShortLabel(p);
  const amountHtml = p.payout > 0
    ? `<span class="payout-roster-item__amount payout-roster-item__amount--due ${tier}">+฿${p.payout.toLocaleString('th-TH')}</span>`
    : `<span class="payout-roster-item__amount payout-roster-item__amount--free">ฟรี</span>`;
  return `
    <div class="payout-roster-item payout-roster-item--zone-${zoneCls} ${p.payout > 0 ? 'payout-roster-item--due' : 'payout-roster-item--free'}" role="listitem" title="${escapeHtml(p.payoutLabel || '')}">
      <div class="payout-roster-item__rank-badge payout-roster-item__rank-badge--${zoneCls}">
        <span class="payout-roster-item__rank-label">#</span>
        <span class="payout-roster-item__rank-num">${p.rank}</span>
      </div>
      <div class="payout-roster-item__content">
        <div class="payout-roster-item__name">${escapeHtml(p.name)}</div>
        <div class="payout-roster-item__meta">${formatZoneDisplayLabel(p.zone)} · ${p.totalScore.toFixed(1)} คะแนน · ${escapeHtml(shortLabel)}</div>
      </div>
      <div class="payout-roster-item__aside">
        <span class="badge badge-${zoneCls}">${formatZoneDisplayLabel(p.zone)}</span>
        ${amountHtml}
      </div>
    </div>
  `;
}

function renderPayout() {
  recalculateAll();
  const summaryEl = document.getElementById('payout-summary');
  const dueListEl = document.getElementById('payout-due-list');
  const rosterListEl = document.getElementById('payout-roster-list');
  const dueBadgeEl = document.getElementById('payout-due-badge');
  const dueFooterEl = document.getElementById('payout-due-footer');
  if (!summaryEl || !dueListEl || !rosterListEl) return;

  const paying = app.processedPlayers.filter(p => p.payout > 0);
  const totalCollected = paying.reduce((sum, p) => sum + p.payout, 0);
  const count1000 = paying.filter(p => p.payout === 1000).length;
  const count1200 = paying.filter(p => p.payout === 1200).length;
  const count1500 = paying.filter(p => p.payout === 1500).length;
  const totalPlayers = app.processedPlayers.length || 1;
  const pctDue = (paying.length / totalPlayers) * 100;
  const pct1000 = paying.length ? (count1000 / paying.length) * 100 : 0;
  const pct1200 = paying.length ? (count1200 / paying.length) * 100 : 0;
  const pct1500 = paying.length ? (count1500 / paying.length) * 100 : 0;
  const pctTotal = totalCollected > 0 ? Math.min(100, (totalCollected / (paying.length * 1500)) * 100) : 0;

  summaryEl.innerHTML = [
    renderPayoutStatCard(
      `฿${totalCollected.toLocaleString('th-TH')}`,
      'ยอดรวมที่ต้องเก็บ',
      `จากผู้เล่น ${paying.length} คน`,
      pctTotal,
      'payout-stat-ring--purple',
      'payout-stat-card--total'
    ),
    renderPayoutStatCard(
      String(paying.length),
      'ผู้ที่ต้องจ่าย',
      `จากทั้งหมด ${app.processedPlayers.length} คน`,
      pctDue,
      'payout-stat-ring--green',
      'payout-stat-card--count'
    ),
    renderPayoutStatCard(
      String(count1000),
      'ระดับ ฿1,000',
      'Red Zone / Blue Zone',
      pct1000,
      'payout-stat-ring--amber',
      'payout-stat-card--tier1000'
    ),
    renderPayoutStatCard(
      String(count1200),
      'ระดับ ฿1,200',
      'Green Zone avg',
      pct1200,
      'payout-stat-ring--orange',
      'payout-stat-card--tier1200'
    ),
    renderPayoutStatCard(
      String(count1500),
      'ระดับ ฿1,500',
      'บ๊วย / รองบ๊วย',
      pct1500,
      'payout-stat-ring--plum',
      'payout-stat-card--tier1500'
    )
  ].join('');

  if (dueBadgeEl) {
    dueBadgeEl.textContent = `${paying.length} รายการ`;
  }

  if (dueFooterEl) {
    dueFooterEl.innerHTML = paying.length
      ? `รวมที่ต้องเก็บ: <strong>฿${totalCollected.toLocaleString('th-TH')}</strong>`
      : '';
  }

  dueListEl.innerHTML = paying.length
    ? paying.map(renderPayoutTxItem).join('')
    : '<p class="payout-empty-hint">ไม่มีผู้เล่นที่ต้องจ่ายในขณะนี้</p>';

  rosterListEl.innerHTML = app.processedPlayers.map(renderPayoutRosterItem).join('');
}

function populateCompareSelects() {
  const selA = document.getElementById('compare-player-a');
  const selB = document.getElementById('compare-player-b');
  if (!selA || !selB) return;

  const prevA = selA.value;
  const prevB = selB.value;
  const options = app.processedPlayers.map(p =>
    `<option value="${escapeHtml(p.name)}">#${p.rank} ${escapeHtml(p.name)} (${p.totalScore.toFixed(1)})</option>`
  ).join('');

  selA.innerHTML = '<option value="">— เลือกผู้เล่น —</option>' + options;
  selB.innerHTML = '<option value="">— เลือกผู้เล่น —</option>' + options;
  if (prevA && app.processedPlayers.some(p => p.name === prevA)) selA.value = prevA;
  if (prevB && app.processedPlayers.some(p => p.name === prevB)) selB.value = prevB;
}

function renderToolsCompare() {
  populateCompareSelects();
  const selA = document.getElementById('compare-player-a');
  const selB = document.getElementById('compare-player-b');
  const container = document.getElementById('tools-compare-result');
  if (!selA || !selB || !container) return;

  if (!selA._compareBound) {
    selA._compareBound = true;
    selA.addEventListener('change', () => renderToolsCompareResult());
    selB.addEventListener('change', () => renderToolsCompareResult());
  }

  renderToolsCompareResult();
}

function getPlayerRemainingTeamCount(teams) {
  if (!teams?.length) return 0;
  return teams.filter(t => !isTeamEliminated(t)).length;
}

function escapeTeamAttr(teamName) {
  return escapeHtml(teamName).replace(/"/g, '&quot;');
}

function getCompareTeamFlagHtml(teamName) {
  const url = getTeamFlagUrl(teamName);
  const attr = escapeTeamAttr(teamName);
  const initials = escapeHtml(teamName.slice(0, 2));
  if (url) {
    return `<span class="tools-compare-team-flag-wrap" data-team="${attr}" title="${attr}"><img src="${url}" alt="${attr}" class="tools-compare-team-flag" loading="lazy" width="24" height="24" onerror="this.style.display='none';this.nextElementSibling?.classList.add('is-visible')"><span class="tools-compare-team-flag-fallback">${initials}</span></span>`;
  }
  return `<span class="tools-compare-team-flag-wrap" data-team="${attr}" title="${attr}"><span class="tools-compare-team-flag-fallback is-visible">${initials}</span></span>`;
}

function updateCompareBenchHeaders(playerA, playerB) {
  const nameElA = document.getElementById('compare-name-a');
  const nameElB = document.getElementById('compare-name-b');
  const rankElA = document.getElementById('compare-rank-a');
  const rankElB = document.getElementById('compare-rank-b');
  if (nameElA) nameElA.textContent = playerA ? playerA.name : 'เลือกผู้เล่นฝั่งซ้าย';
  if (nameElB) nameElB.textContent = playerB ? playerB.name : 'เลือกผู้เล่นฝั่งขวา';
  if (rankElA) rankElA.textContent = playerA ? `#${playerA.rank}` : '—';
  if (rankElB) rankElB.textContent = playerB ? `#${playerB.rank}` : '—';
}

const COMPARE_ZONE_ORDER = { blue: 0, green: 1, yellow: 2, grey: 3, 'red-orange': 4 };

function getCompareNumericWinner(a, b, higherBetter = true) {
  if (a === b) return 'tie';
  if (higherBetter) return a > b ? 'left' : 'right';
  return a < b ? 'left' : 'right';
}

function getCompareZoneWinner(zoneA, zoneB) {
  const orderA = COMPARE_ZONE_ORDER[zoneA] ?? 99;
  const orderB = COMPARE_ZONE_ORDER[zoneB] ?? 99;
  if (orderA === orderB) return 'tie';
  return orderA < orderB ? 'left' : 'right';
}

function compareBenchCellClass(side, winner) {
  if (winner === 'tie') return '';
  return winner === side ? 'is-winner' : 'is-loser';
}

function renderCompareBenchRow(label, leftHtml, rightHtml, winner, highlight = false) {
  const rowCls = highlight ? 'compare-bench-row compare-bench-row--highlight' : 'compare-bench-row';
  return `
    <div class="${rowCls}">
      <div class="compare-bench-cell compare-bench-cell--left ${compareBenchCellClass('left', winner)}">${leftHtml}</div>
      <div class="compare-bench-cell compare-bench-cell--label">${label}</div>
      <div class="compare-bench-cell compare-bench-cell--right ${compareBenchCellClass('right', winner)}">${rightHtml}</div>
    </div>`;
}

function getCompareTeamPoints(player, teamName) {
  const tb = (player.teamBreakdown || []).find(x => x.name === teamName);
  return tb ? tb.points : 0;
}

function sortCompareTeams(teamNames, player) {
  return [...teamNames].sort((a, b) => {
    const diff = getCompareTeamPoints(player, b) - getCompareTeamPoints(player, a);
    return diff !== 0 ? diff : a.localeCompare(b, 'th');
  });
}

function renderCompareTeamList(teamNames, player, side) {
  if (!teamNames.length) {
    return '<li class="compare-bench-team-empty">ไม่มี</li>';
  }
  const rowCls = side === 'right'
    ? 'compare-bench-team-row compare-bench-team-row--right'
    : 'compare-bench-team-row compare-bench-team-row--left';
  return teamNames.map(teamName => {
    const pts = getCompareTeamPoints(player, teamName).toFixed(1);
    const attr = escapeTeamAttr(teamName);
    const nameHtml = `<span class="compare-bench-team-name" data-team="${attr}">${escapeHtml(teamName)}</span>`;
    const ptsHtml = `<span class="compare-bench-team-pts">${pts}</span>`;
    const flagHtml = getCompareTeamFlagHtml(teamName);
    const inner = side === 'right'
      ? `${ptsHtml}${nameHtml}${flagHtml}`
      : `${flagHtml}${nameHtml}${ptsHtml}`;
    return `<li class="${rowCls}">${inner}</li>`;
  }).join('');
}

function renderCompareSharedTeamList(teamNames) {
  if (!teamNames.length) {
    return '<li class="compare-bench-team-empty">ไม่มี</li>';
  }
  return teamNames.map(teamName =>
    `<li class="compare-bench-team-row compare-bench-team-row--shared">${getCompareTeamFlagHtml(teamName)}</li>`
  ).join('');
}

function formatCompareFinalGuess(player) {
  const guess = player.guess;
  const guessHtml = (guess != null && guess !== undefined && guess !== '')
    ? `<span class="compare-bench-guess-goals">${guess} ลูก</span>`
    : '—';
  return `${guessHtml} · ${player.predictionScore.toFixed(1)}`;
}

function renderCompareZoneBadge(zone) {
  const cls = getZoneBadgeClass(zone);
  return `<span class="badge badge-${cls}">${formatZoneDisplayLabel(zone)}</span>`;
}

function renderToolsCompareResult() {
  const container = document.getElementById('tools-compare-result');
  const nameA = document.getElementById('compare-player-a')?.value;
  const nameB = document.getElementById('compare-player-b')?.value;
  if (!container) return;

  if (!nameA || !nameB) {
    updateCompareBenchHeaders(null, null);
    container.innerHTML = '<p class="compare-bench-empty">เลือกผู้เล่น 2 คนเพื่อเปรียบเทียบ</p>';
    return;
  }
  if (nameA === nameB) {
    const player = app.processedPlayers.find(p => p.name === nameA);
    updateCompareBenchHeaders(player || null, null);
    container.innerHTML = '<p class="compare-bench-empty">กรุณาเลือกผู้เล่นคนละคน</p>';
    return;
  }

  const playerA = app.processedPlayers.find(p => p.name === nameA);
  const playerB = app.processedPlayers.find(p => p.name === nameB);
  if (!playerA || !playerB) return;

  updateCompareBenchHeaders(playerA, playerB);

  const teamsA = new Set(playerA.teams || []);
  const teamsB = new Set(playerB.teams || []);
  const shared = sortCompareTeams([...teamsA].filter(t => teamsB.has(t)), playerA);
  const onlyA = sortCompareTeams([...teamsA].filter(t => !teamsB.has(t)), playerA);
  const onlyB = sortCompareTeams([...teamsB].filter(t => !teamsA.has(t)), playerB);
  const scoreDiff = playerA.totalScore - playerB.totalScore;
  const rankDiff = playerB.rank - playerA.rank;
  const scoreTotal = playerA.totalScore + playerB.totalScore;
  const leftBarPct = scoreTotal > 0 ? (playerA.totalScore / scoreTotal) * 100 : 50;
  const rightBarPct = 100 - leftBarPct;
  const verdictCls = scoreDiff > 0
    ? 'compare-bench-verdict compare-bench-verdict--left'
    : scoreDiff < 0
      ? 'compare-bench-verdict compare-bench-verdict--right'
      : 'compare-bench-verdict';
  const matchesA = getPlayerTotalMatchesPlayed(playerA.teams);
  const matchesB = getPlayerTotalMatchesPlayed(playerB.teams);
  const remainingA = getPlayerRemainingTeamCount(playerA.teams);
  const remainingB = getPlayerRemainingTeamCount(playerB.teams);

  const tableRows = [
    renderCompareBenchRow(
      'คะแนนรวม',
      `<strong>${playerA.totalScore.toFixed(1)}</strong>`,
      `<strong>${playerB.totalScore.toFixed(1)}</strong>`,
      getCompareNumericWinner(playerA.totalScore, playerB.totalScore),
      true
    ),
    renderCompareBenchRow(
      'อันดับ',
      `#${playerA.rank}`,
      `#${playerB.rank}`,
      getCompareNumericWinner(playerA.rank, playerB.rank, false)
    ),
    renderCompareBenchRow(
      'โซน',
      renderCompareZoneBadge(playerA.zone),
      renderCompareZoneBadge(playerB.zone),
      getCompareZoneWinner(playerA.zone, playerB.zone)
    ),
    renderCompareBenchRow(
      'คะแนนทีม',
      playerA.teamsScore.toFixed(1),
      playerB.teamsScore.toFixed(1),
      getCompareNumericWinner(playerA.teamsScore, playerB.teamsScore)
    ),
    renderCompareBenchRow(
      'แข่ง',
      `${matchesA} นัด`,
      `${matchesB} นัด`,
      getCompareNumericWinner(matchesA, matchesB)
    ),
    renderCompareBenchRow(
      'ทีมที่เหลือ',
      `${remainingA} ทีม`,
      `${remainingB} ทีม`,
      getCompareNumericWinner(remainingA, remainingB)
    ),
    renderCompareBenchRow(
      'ทายนัดชิง',
      formatCompareFinalGuess(playerA),
      formatCompareFinalGuess(playerB),
      getCompareNumericWinner(playerA.predictionScore, playerB.predictionScore)
    )
  ].join('');

  container.innerHTML = `
    <div class="${verdictCls}">
      <div class="compare-bench-bar">
        <div class="compare-bench-bar-seg compare-bench-bar-seg--left" style="width:${leftBarPct.toFixed(1)}%">
          <span>${playerA.totalScore.toFixed(1)}</span>
        </div>
        <div class="compare-bench-bar-seg compare-bench-bar-seg--right" style="width:${rightBarPct.toFixed(1)}%">
          <span>${playerB.totalScore.toFixed(1)}</span>
        </div>
      </div>
      <div class="compare-bench-verdict-meta">
        <span class="compare-bench-verdict-diff">ต่างคะแนน ${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(1)}</span>
        <span class="compare-bench-verdict-diff">ต่างอันดับ ${rankDiff > 0 ? '+' : ''}${rankDiff}</span>
      </div>
    </div>
    <div class="compare-bench-table">${tableRows}</div>
    <div class="compare-bench-teams">
      <div class="compare-bench-teams-col compare-bench-teams-col--left">
        <div class="compare-bench-teams-title">เฉพาะ <span>${escapeHtml(playerA.name)}</span> (${onlyA.length})</div>
        <ul class="compare-bench-teams-list">${renderCompareTeamList(onlyA, playerA, 'left')}</ul>
      </div>
      <div class="compare-bench-teams-col compare-bench-teams-col--mid">
        <div class="compare-bench-teams-title">ทีมร่วม (${shared.length})</div>
        <ul class="compare-bench-teams-list compare-bench-teams-list--mid">${renderCompareSharedTeamList(shared)}</ul>
      </div>
      <div class="compare-bench-teams-col compare-bench-teams-col--right">
        <div class="compare-bench-teams-title">เฉพาะ <span>${escapeHtml(playerB.name)}</span> (${onlyB.length})</div>
        <ul class="compare-bench-teams-list">${renderCompareTeamList(onlyB, playerB, 'right')}</ul>
      </div>
    </div>
  `;
}

function updateToolsSimChrome(simCount) {
  const clearBtn = document.getElementById('tools-clear-sim-btn');
  const badge = document.getElementById('tools-sim-count-badge');
  if (clearBtn) clearBtn.disabled = simCount === 0;
  if (badge) {
    if (simCount > 0) {
      badge.hidden = false;
      badge.textContent = `${simCount} นัด`;
    } else {
      badge.hidden = true;
    }
  }
}

function renderToolsSimulator() {
  const matchesEl = document.getElementById('tools-sim-matches');
  const deltaWrap = document.getElementById('tools-sim-delta-wrap');
  const deltaTbody = document.getElementById('tools-sim-delta-tbody');
  const clearBtn = document.getElementById('tools-clear-sim-btn');
  if (!matchesEl) return;

  if (clearBtn && !clearBtn._simBound) {
    clearBtn._simBound = true;
    clearBtn.addEventListener('click', () => {
      app.simulationScores = {};
      recalculateAll();
      renderTools();
    });
  }

  const pending = app.matches.filter(m => m.status !== 'finished').sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return a.id - b.id;
  });

  matchesEl.innerHTML = '';
  if (pending.length === 0) {
    matchesEl.innerHTML = '<p class="tools-sim-empty">ไม่มีนัดที่รอแข่ง — จำลองผลไม่ได้ในขณะนี้</p>';
    updateToolsSimChrome(0);
    if (deltaWrap) deltaWrap.style.display = 'none';
    return;
  }

  pending.forEach(m => {
    const sim = app.simulationScores[m.id];
    const hVal = sim ? (sim.homeScore !== null ? sim.homeScore : '') : '';
    const aVal = sim ? (sim.awayScore !== null ? sim.awayScore : '') : '';
    const hZone = getTeamZoneByName(m.home);
    const aZone = getTeamZoneByName(m.away);
    const dateLabel = m.date ? formatThaiDate(m.date) : 'ไม่ระบุวัน';
    const row = document.createElement('div');
    row.className = 'tools-sim-match' + (sim ? ' tools-sim-match--active' : '');
    row.innerHTML = `
      <div class="tools-sim-match-meta">
        <span>${dateLabel} · แมตช์ #${m.id}</span>
        <span class="tools-sim-match-round">${getMatchRoundLabel(m)}</span>
      </div>
      <div class="tools-sim-match-body">
        <div class="tools-sim-team">${buildTeamBadgeHtml(m.home, hZone, { compact: true })}</div>
        <div class="tools-sim-scores">
          <div class="tools-sim-score-row">
            <input type="number" id="tools-sim-home-${m.id}" name="tools-sim-home-${m.id}" class="score-sim-input tools-sim-input" min="0" placeholder="-" value="${hVal}" oninput="handleSimulationScoreChange(${m.id}, true, this.value)">
            <span class="score-divider">:</span>
            <input type="number" id="tools-sim-away-${m.id}" name="tools-sim-away-${m.id}" class="score-sim-input tools-sim-input" min="0" placeholder="-" value="${aVal}" oninput="handleSimulationScoreChange(${m.id}, false, this.value)">
          </div>
        </div>
        <div class="tools-sim-team">${buildTeamBadgeHtml(m.away, aZone, { compact: true })}</div>
      </div>
    `;
    matchesEl.appendChild(row);
  });

  const simCount = Object.keys(app.simulationScores).length;
  updateToolsSimChrome(simCount);
  const hasSim = simCount > 0;
  if (!deltaWrap || !deltaTbody) return;
  if (!hasSim) {
    deltaWrap.style.display = 'none';
    return;
  }

  deltaWrap.style.display = 'block';
  const baseline = getProcessedPlayersWithoutSimulation();
  const baselineRank = {};
  baseline.forEach(p => { baselineRank[p.name] = p.rank; });

  const movers = app.processedPlayers
    .map(p => ({
      name: p.name,
      actual: baselineRank[p.name],
      simulated: p.rank,
      delta: baselineRank[p.name] - p.rank
    }))
    .filter(x => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  deltaTbody.innerHTML = '';
  if (movers.length === 0) {
    deltaTbody.innerHTML = '<tr><td colspan="4" class="tools-empty-hint" style="text-align:center;padding:16px;">อันดับไม่เปลี่ยนแปลงจากจำลองปัจจุบัน</td></tr>';
    return;
  }

  movers.forEach(m => {
    const tr = document.createElement('tr');
    const deltaClass = m.delta > 0 ? 'tools-sim-delta--up' : 'tools-sim-delta--down';
    const deltaLabel = m.delta > 0 ? `▲ ${m.delta}` : `▼ ${Math.abs(m.delta)}`;
    tr.innerHTML = `
      <td data-label="ผู้เล่น">${escapeHtml(m.name)}</td>
      <td data-label="อันดับจริง" style="text-align:center">${m.actual}</td>
      <td data-label="อันดับจำลอง" style="text-align:center">${m.simulated}</td>
      <td data-label="เปลี่ยนแปลง" class="${deltaClass}" style="text-align:center;font-weight:700">${deltaLabel}</td>
    `;
    deltaTbody.appendChild(tr);
  });
}

function renderTeamsMatrix() {
  const container = document.getElementById('teams-matrix-container');
  container.innerHTML = '';
  
  const zones = [
    { key: 'blue', name: 'Blue Zone (ตัวคูณ 1.0 - 1.3)', class: 'team-blue' },
    { key: 'green', name: 'Green Zone (ตัวคูณ 1.4 - 1.7)', class: 'team-green' },
    { key: 'yellow', name: 'Yellow Zone (ตัวคูณ 1.8 - 2.1)', class: 'team-yellow' },
    { key: 'grey', name: 'Grey Zone (ตัวคูณ 2.2 - 2.6)', class: 'team-grey' },
    { key: 'red-orange', name: 'Red Zone (ตัวคูณ 2.7 - 3.0)', class: 'team-red-orange' }
  ];
  
  const teamScores = calculateTeamPoints();
  
  zones.forEach(zone => {
    const card = document.createElement('div');
    card.classList.add('card');
    
    const zoneTeams = TEAMS.filter(t => t.zone === zone.key);
    
    let matrixHTML = `<div class="card-title"><span class="team-badge ${zone.class}">${zone.name}</span></div>`;
    matrixHTML += `<div class="teams-matrix">`;
    
    zoneTeams.forEach(t => {
      const stats = teamScores[t.name] || { points: 0, played: 0 };
      matrixHTML += `
        <div class="team-card-small" style="background-color:rgba(15, 23, 42, 0.3); border:1px solid rgba(255,255,255,0.03); border-left:3px solid var(--zone-${zone.key})">
          <div>
            ${buildTeamBadgeHtml(t.name, t.zone, { tag: 'span', extraStyle: 'font-size:12px;' })}
            <div style="font-size:10px; color:var(--text-secondary);">${formatWcGroupLabel(t.wcGroup)} · ตัวคูณ: ${t.multiplier}</div>
          </div>
          <div style="text-align:right;">
            <strong style="color:var(--primary);">${stats.points.toFixed(1)}</strong>
            <div style="font-size:9px; color:var(--text-muted);">${stats.played} นัด</div>
          </div>
        </div>
      `;
    });
    
    matrixHTML += `</div>`;
    card.innerHTML = matrixHTML;
    container.appendChild(card);
  });
}

function getPlayerMatchResultMeta(match, teamName) {
  let resultPoints = 0;
  let goals = 0;
  const isHome = match.home === teamName;

  if (isHome) {
    goals = match.homeScore;
    if (match.homeScore > match.awayScore) resultPoints = 3;
    else if (match.homeScore < match.awayScore) resultPoints = 1;
    else if (match.isKnockout && match.penaltyWinner) {
      resultPoints = match.penaltyWinner === 'home' ? 3 : 1;
    } else {
      resultPoints = 2;
    }
  } else {
    goals = match.awayScore;
    if (match.awayScore > match.homeScore) resultPoints = 3;
    else if (match.awayScore < match.homeScore) resultPoints = 1;
    else if (match.isKnockout && match.penaltyWinner) {
      resultPoints = match.penaltyWinner === 'away' ? 3 : 1;
    } else {
      resultPoints = 2;
    }
  }

  const resultKey = resultPoints === 3 ? 'win' : (resultPoints === 2 ? 'draw' : 'loss');
  const resultLabel = resultPoints === 3 ? 'ชนะ' : (resultPoints === 2 ? 'เสมอ' : 'แพ้');
  return { isHome, resultPoints, goals, resultKey, resultLabel };
}

function buildPlayerTeamMatchHistoryHtml(tb, teamMatches) {
  if (!teamMatches.length) {
    return '<div class="player-team-matches player-team-matches--empty">ยังไม่มีการแข่งขัน</div>';
  }

  let html = '<div class="player-team-matches">';
  teamMatches.forEach((m) => {
    const meta = getPlayerMatchResultMeta(m, tb.name);
    const oppName = meta.isHome ? m.away : m.home;
    const myScore = meta.isHome ? m.homeScore : m.awayScore;
    const oppScore = meta.isHome ? m.awayScore : m.homeScore;
    const matchPts = (meta.resultPoints + meta.goals) * (tb.multiplier || 1);

    html += `
      <div class="player-match-row">
        <span class="player-match-id">#${m.id}</span>
        <span class="player-match-scoreline" title="${escapeHtml(m.home)} ${m.homeScore}-${m.awayScore} ${escapeHtml(m.away)}">
          <span class="player-match-us">${escapeHtml(tb.name)}</span>
          <span class="player-match-score">${myScore}-${oppScore}</span>
          <span class="player-match-opp">${escapeHtml(oppName)}</span>
        </span>
        <span class="player-match-result player-match-result--${meta.resultKey}">${meta.resultLabel}</span>
        <span class="player-match-pts">+${matchPts.toFixed(1)}</span>
      </div>
    `;
  });
  html += '</div>';
  return html;
}

function buildPlayerTeamItemHtml(tb, options = {}) {
  const { elimBadge = '', elimToggleBtn = '', matchHistoryHTML = '' } = options;
  const wcLabel = formatWcGroupLabel(getTeamWcGroup(tb.name));

  return `
    <div class="player-team-item__head">
      <div class="player-team-item__identity">
        ${buildTeamBadgeHtml(tb.name, tb.zone, { extraClass: 'player-team-item__badge' })}
        <span class="player-team-item__meta">${escapeHtml(wcLabel)} · x${tb.multiplier || 1}</span>
      </div>
      <div class="player-team-item__tail">
        ${elimBadge}
        ${elimToggleBtn}
        <strong class="player-team-item__pts">${(tb.points || 0).toFixed(1)}</strong>
      </div>
    </div>
    ${matchHistoryHTML}
  `;
}

// ── Rank sound effects (playful TTS + silly tones) ───────────────────────
// _rankSpeechVoice provided via state.js named exports in bundle

function initRankSoundVoices() {
  if (!('speechSynthesis' in window)) return;
  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    app._rankSpeechVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('th'))
      || voices.find(v => /th/i.test(v.lang || ''))
      || voices[0]
      || null;
  };
  pickVoice();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }
}

function createRankAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function scheduleRankNoise(ctx, { start, duration, peak = 0.05, frequency = 320 }) {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 0.7;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function scheduleRankTone(ctx, { start, duration, freq, type = 'triangle', peak = 0.1, slideTo = null }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 40), start + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playWinnerFanfare() {
  try {
    const ctx = createRankAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const fanfare = [
      { freq: 523.25, at: 0, dur: 0.22 },
      { freq: 659.25, at: 0.14, dur: 0.22 },
      { freq: 783.99, at: 0.28, dur: 0.24 },
      { freq: 1046.5, at: 0.44, dur: 0.42 }
    ];
    fanfare.forEach((note) => {
      scheduleRankTone(ctx, {
        start: now + note.at,
        duration: note.dur,
        freq: note.freq,
        type: 'triangle',
        peak: 0.13
      });
    });
    scheduleRankTone(ctx, {
      start: now + 0.58,
      duration: 0.55,
      freq: 1318.5,
      type: 'square',
      peak: 0.045
    });
    setTimeout(() => ctx.close(), 1300);
  } catch (_) {
    /* ignore audio errors */
  }
}

function playLoserFailSound() {
  try {
    const ctx = createRankAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Game-show "wrong answer" double buzzer
    scheduleRankTone(ctx, {
      start: now,
      duration: 0.42,
      freq: 196,
      type: 'square',
      peak: 0.11
    });
    scheduleRankTone(ctx, {
      start: now + 0.46,
      duration: 0.62,
      freq: 147,
      type: 'square',
      peak: 0.11,
      slideTo: 98
    });

    // Short crowd boo
    scheduleRankNoise(ctx, { start: now + 0.35, duration: 0.55, peak: 0.055, frequency: 280 });
    scheduleRankNoise(ctx, { start: now + 1.05, duration: 0.45, peak: 0.045, frequency: 240 });

    // Classic sad trombone "wah wah"
    scheduleRankTone(ctx, {
      start: now + 1.15,
      duration: 0.42,
      freq: 233,
      type: 'triangle',
      peak: 0.1,
      slideTo: 130
    });
    scheduleRankTone(ctx, {
      start: now + 1.62,
      duration: 0.48,
      freq: 185,
      type: 'triangle',
      peak: 0.095,
      slideTo: 88
    });

    // Deflating tail
    scheduleRankTone(ctx, {
      start: now + 2.15,
      duration: 0.7,
      freq: 320,
      type: 'sawtooth',
      peak: 0.06,
      slideTo: 55
    });

    setTimeout(() => ctx.close(), 3200);
  } catch (_) {
    /* ignore audio errors */
  }
}

function speakRankPhrase(type, options = {}) {
  if (!('speechSynthesis' in window)) return;

  const { repeat = 1, delayMs = 0 } = options;
  const phrases = {
    winner: ['โคตรเทพเลยพี่!', 'แชมป์เปี้ยนสุดยอด!'],
    loser: ['แพ้แล้วจ้า...', 'อันดับท้ายสุดเลยนะ...', 'เสียใจด้วยครับ...']
  };
  window.speechSynthesis.cancel();

  const speakOnce = (index = 0) => {
    const pool = phrases[type] || phrases.loser;
    const phrase = pool[index % pool.length];
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.lang = 'th-TH';
    if (app._rankSpeechVoice) utter.voice = app._rankSpeechVoice;

    if (type === 'winner') {
      utter.rate = 0.92 + Math.random() * 0.08;
      utter.pitch = 1.08 + Math.random() * 0.12;
      utter.volume = 1;
    } else if (type === 'loser') {
      utter.rate = 0.72 + Math.random() * 0.08;
      utter.pitch = 0.52 + Math.random() * 0.1;
      utter.volume = 0.95;
    } else {
      utter.rate = 0.62 + Math.random() * 0.08;
      utter.pitch = 0.48 + Math.random() * 0.1;
      utter.volume = 0.92;
    }

    utter.onend = () => {
      if (index + 1 < repeat) {
        setTimeout(() => speakOnce(index + 1), delayMs || 520);
      }
    };

    window.speechSynthesis.speak(utter);
  };

  speakOnce();
}

function cancelRankSoundEffects() {
  if (_rankSoundTimerId) { clearTimeout(_rankSoundTimerId); _rankSoundTimerId = null; }
  if (_rankSpeechTimerId) { clearTimeout(_rankSpeechTimerId); _rankSpeechTimerId = null; }
  if (!isIOSDeviceForDrawer() && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
}

function isIOSDeviceForDrawer() {
  // local helper (device.js may not be in scope in all slices)
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function scheduleRankSoundEffect(player, token) {
  if (!player || typeof player.rank !== 'number') return;
  if (isIOSDeviceForDrawer()) return;
  const isSpecialRank = player.rank === 1 || player.rank === 2 || player.rank === 61 || player.rank === 62;
  if (!isSpecialRank) return;
  const onMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const isLoserRank = player.rank === 61 || player.rank === 62;
  if (onMobile && isLoserRank) return;
  cancelRankSoundEffects();
  const delayMs = onMobile ? 500 : 220;
  _rankSoundTimerId = setTimeout(() => {
    _rankSoundTimerId = null;
    if (token !== _playerDetailsFillToken) return;
    const now = Date.now();
    if (now - _lastRankSoundAt < RANK_SOUND_COOLDOWN_MS) return;
    _lastRankSoundAt = now;
    // call legacy player sound (safe)
    if (typeof playRankSoundEffect === 'function') {
      try { playRankSoundEffect(player); } catch(_) {}
    }
  }, delayMs);
}

function playRankSoundEffect(player) {
  if (!player || typeof player.rank !== 'number') return;
  if (isIOSDeviceForDrawer()) return; // never on iOS
  if (player.rank === 1 || player.rank === 2) {
    if (typeof playWinnerFanfare === 'function') playWinnerFanfare();
    if (typeof speakRankPhrase === 'function') speakRankPhrase('winner');
    return;
  }
  if (player.rank === 61 || player.rank === 62) {
    if (typeof playLoserFailSound === 'function') playLoserFailSound();
    if (typeof speakRankPhrase === 'function') setTimeout(() => speakRankPhrase('loser'), 900);
  }
}

function getFinishedMatchesByTeam() {
  let finishedCount = 0;
  for (const m of app.matches) { if (m.status === 'finished') finishedCount++; }
  const cacheKey = `${app.matches.length}:${finishedCount}`;
  if (_finishedMatchesByTeamCache && _finishedMatchesCacheKey === cacheKey) {
    return _finishedMatchesByTeamCache;
  }
  const map = new Map();
  for (const m of app.matches) {
    if (m.status !== 'finished') continue;
    if (!map.has(m.home)) map.set(m.home, []);
    if (!map.has(m.away)) map.set(m.away, []);
    map.get(m.home).push(m);
    map.get(m.away).push(m);
  }
  _finishedMatchesByTeamCache = map;
  _finishedMatchesCacheKey = cacheKey;
  return map;
}

function cancelPlayerDetailsFillSchedule() {
  if (_playerDetailsFillRaf1) { cancelAnimationFrame(_playerDetailsFillRaf1); _playerDetailsFillRaf1 = 0; }
  if (_playerDetailsFillRaf2) { cancelAnimationFrame(_playerDetailsFillRaf2); _playerDetailsFillRaf2 = 0; }
  if (_playerDetailsGridRaf) { cancelAnimationFrame(_playerDetailsGridRaf); _playerDetailsGridRaf = 0; }
  if (_playerDetailsFillDebounceTimer) { clearTimeout(_playerDetailsFillDebounceTimer); _playerDetailsFillDebounceTimer = null; }
}

function shouldSkipDrawerMatchHistory() {
  return isIOSDeviceForDrawer();
}

function appendPlayerTeamGridChunk(grid, tbList, matchesByTeam, token, startIdx, onDone) {
  if (token !== _playerDetailsFillToken) return;
  const ios = isIOSDeviceForDrawer();
  const ipad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let batchSize;
  if (ios) batchSize = ipad ? 3 : 1;
  else batchSize = (typeof isMobileDevice === 'function' && isMobileDevice()) ? 2 : tbList.length;
  const end = Math.min(startIdx + batchSize, tbList.length);
  const skipMatchHistory = shouldSkipDrawerMatchHistory();

  for (let ti = startIdx; ti < end; ti++) {
    if (token !== _playerDetailsFillToken) return;
    const tb = tbList[ti];
    const item = document.createElement('div');
    const eliminated = (typeof isTeamEliminated === 'function') ? isTeamEliminated(tb.name) : false;
    const elimBadge = eliminated
      ? '<span class="player-team-status player-team-status--out">ตกรอบ</span>'
      : '<span class="player-team-status player-team-status--in">อยู่</span>';
    const elimToggleBtn = (typeof app.isAdmin !== 'undefined' && app.isAdmin)
      ? `<button type="button" class="btn btn-secondary player-team-elim-btn toggle-elim-btn" data-elim-team="${escapeHtml(tb.name)}">${eliminated ? '↩' : '✕'}</button>`
      : '';
    const teamMatches = matchesByTeam.get(tb.name) || [];
    const matchHistoryHTML = skipMatchHistory ? '' : (typeof buildPlayerTeamMatchHistoryHtml === 'function' ? buildPlayerTeamMatchHistoryHtml(tb, teamMatches) : '');
    item.className = `player-team-item player-team-item--${tb.zone}`;
    item.innerHTML = (typeof buildPlayerTeamItemHtml === 'function')
      ? buildPlayerTeamItemHtml(tb, { elimBadge, elimToggleBtn, matchHistoryHTML })
      : `<div>${tb.name}</div>`;
    grid.appendChild(item);
  }

  if (end < tbList.length) {
    _playerDetailsGridRaf = requestAnimationFrame(() => {
      _playerDetailsGridRaf = 0;
      appendPlayerTeamGridChunk(grid, tbList, matchesByTeam, token, end, onDone);
    });
    return;
  }
  if (typeof onDone === 'function') onDone();
}

// PLAYER DETAILS MODAL
function openPlayerDetails(name) {
  const lookupName = (name || '').trim();
  if (!lookupName) return;

  const now = Date.now();
  const onMobile = (typeof isMobileDevice === 'function') ? isMobileDevice() : /Mobi|Android/i.test(navigator.userAgent);
  const ios = isIOSDeviceForDrawer();
  const overlay = document.getElementById('player-details-drawer-overlay');
  const drawerOpen = !!(overlay && overlay.classList.contains('active'));

  if (ios && drawerOpen && lookupName === _drawerDisplayedPlayer) {
    return;
  }
  if (ios && lookupName === _pendingDrawerFillName && (_playerDetailsFillDebounceTimer || _playerDetailsFillInProgress || _drawerDisplayedPlayer === lookupName)) {
    return;
  }
  if (ios && now - _lastIosDrawerOpenAttempt < IOS_MIN_OPEN_GAP_MS) {
    return;
  }

  const dedupeMs = ios ? 320 : (onMobile ? 140 : 80);
  if (lookupName === _lastOpenPlayerName && now - _lastOpenPlayerAt < dedupeMs) return;
  _lastOpenPlayerName = lookupName;
  _lastOpenPlayerAt = now;
  window._playerDetailsLastOpenAt = now;
  if (ios) _lastIosDrawerOpenAttempt = now;

  cancelRankSoundEffects();
  cancelPlayerDetailsFillSchedule();
  _playerDetailsFillToken++;
  _pendingDrawerFillName = lookupName;

  if (!showPlayerDetailsDrawer()) {
    console.error('[openPlayerDetails] overlay element not found in DOM');
    return;
  }

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val != null ? val : '');
  };

  setText('detail-player-name', lookupName);

  const switchingPlayer = drawerOpen && lookupName !== _drawerDisplayedPlayer;
  const showLoading = !ios || switchingPlayer || !_drawerDisplayedPlayer;

  if (showLoading) {
    setText('detail-teams-score', '—');
    setText('detail-prediction-score', '—');
    setText('detail-prediction-guess', '—');
    setText('detail-total-score', '—');

    const statsContainer = document.getElementById('detail-team-stats-container');
    const grid = document.getElementById('detail-teams-grid');
    if (statsContainer && switchingPlayer) statsContainer.innerHTML = '';
    if (grid && switchingPlayer) {
      grid.innerHTML = '<div class="player-drawer-loading" aria-busy="true">กำลังโหลด...</div>';
    } else if (grid && showLoading && !grid.querySelector('.player-drawer-loading')) {
      grid.innerHTML = '<div class="player-drawer-loading" aria-busy="true">กำลังโหลด...</div>';
    }
  }

  const token = _playerDetailsFillToken;
  const runFill = () => {
    _playerDetailsFillRaf2 = 0;
    if (token !== _playerDetailsFillToken) return;
    fillPlayerDetailsDrawer(_pendingDrawerFillName || lookupName, token);
  };

  const debounceMs = ios ? IOS_DRAWER_FILL_DEBOUNCE_MS : (onMobile ? MOBILE_DRAWER_FILL_DEBOUNCE_MS : 0);

  if (debounceMs > 0) {
    _playerDetailsFillDebounceTimer = setTimeout(() => {
      _playerDetailsFillDebounceTimer = null;
      if (typeof requestAnimationFrame === 'function') {
        _playerDetailsFillRaf1 = requestAnimationFrame(runFill);
      } else {
        runFill();
      }
    }, debounceMs);
    return;
  }

  if (typeof requestAnimationFrame === 'function') {
    _playerDetailsFillRaf1 = requestAnimationFrame(() => {
      _playerDetailsFillRaf1 = 0;
      _playerDetailsFillRaf2 = requestAnimationFrame(runFill);
    });
  } else {
    setTimeout(runFill, 32);
  }
}

function fillPlayerDetailsDrawer(name, token) {
  if (token !== _playerDetailsFillToken) return;
  _playerDetailsFillInProgress = true;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val != null ? val : '');
  };

  const onMobile = (typeof isMobileDevice === 'function') ? isMobileDevice() : /Mobi|Android/i.test(navigator.userAgent);
  const ios = isIOSDeviceForDrawer();

  try {
    const canUseCached = (ios || onMobile) && (typeof app.processedPlayers !== 'undefined') && app.processedPlayers && app.processedPlayers.length;
    if (!canUseCached) {
      if (typeof recalculateAll === 'function') recalculateAll();
    }
    if (token !== _playerDetailsFillToken) return;

    const lookupName = (name || '').trim();
    let player = (typeof app.processedPlayers !== 'undefined') ? app.processedPlayers.find(p => p.name === lookupName) : null;
    if (!player && typeof app.processedPlayers !== 'undefined') {
      player = app.processedPlayers.find(p => (p.name || '').trim().toLowerCase() === lookupName.toLowerCase());
    }

    if (!player) {
      console.warn('[openPlayerDetails] player not found for name:', name);
      setText('detail-player-name', lookupName || 'ไม่พบผู้เล่น');
      setText('detail-teams-score', '0.00');
      setText('detail-prediction-score', '0.00');
      setText('detail-prediction-guess', '-');
      setText('detail-total-score', '0.00');
      const ng = document.getElementById('detail-teams-grid');
      if (ng) ng.innerHTML = '<div style="padding:20px; color:#f43f5e; font-weight:600;">ไม่พบข้อมูลผู้เล่นนี้ในระบบ</div>';
      return;
    }

    if (token !== _playerDetailsFillToken) return;

    setText('detail-player-name', player.name);
    setText('detail-teams-score', (player.teamsScore || 0).toFixed(2));
    setText('detail-prediction-score', (player.predictionScore || 0).toFixed(2));
    setText('detail-prediction-guess', player.guess);
    setText('detail-total-score', (player.totalScore || 0).toFixed(2));

    const matchesByTeam = getFinishedMatchesByTeam();
    if (token !== _playerDetailsFillToken) return;

    const finishDrawerFill = () => {
      if (token !== _playerDetailsFillToken) return;
      _playerDetailsFillInProgress = false;
      _drawerDisplayedPlayer = player.name;
      if (typeof bindPlayerDrawerAdminButtons === 'function') bindPlayerDrawerAdminButtons(player, name);
      scheduleRankSoundEffect(player, token);
    };

    try {
      const statsContainer = document.getElementById('detail-team-stats-container');
      if (statsContainer) {
        statsContainer.innerHTML = `
          <button type="button" class="team-stats-toggle" id="toggle-team-stats-btn">
            <span class="team-stats-toggle__label">📊 สถิติทีม (ตาราง)</span>
            <span class="team-stats-toggle__arrow" id="toggle-stats-arrow">▼</span>
          </button>
          <div id="team-stats-table-wrapper" class="player-detail-stats-table-wrap" style="display:none;"></div>
        `;
        const toggleBtn = document.getElementById('toggle-team-stats-btn');
        const tableWrapper = document.getElementById('team-stats-table-wrapper');
        const arrow = document.getElementById('toggle-stats-arrow');
        if (toggleBtn && tableWrapper) {
          toggleBtn.addEventListener('click', () => {
            const isHidden = tableWrapper.style.display === 'none';
            if (isHidden && !tableWrapper.dataset.loaded && typeof buildPlayerStatsTableHtml === 'function') {
              tableWrapper.innerHTML = buildPlayerStatsTableHtml(player, matchesByTeam);
              tableWrapper.dataset.loaded = '1';
            }
            tableWrapper.style.display = isHidden ? 'block' : 'none';
            if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
          });
          if (!onMobile && typeof buildPlayerStatsTableHtml === 'function') {
            tableWrapper.innerHTML = buildPlayerStatsTableHtml(player, matchesByTeam);
            tableWrapper.dataset.loaded = '1';
          }
        }
      }

      const grid = document.getElementById('detail-teams-grid');
      if (grid) {
        grid.innerHTML = '';
        let tbList = Array.isArray(player.teamBreakdown) ? [...player.teamBreakdown] : [];
        const teamEarliestDate = {};
        tbList.forEach(tb => {
          const teamMatches = matchesByTeam.get(tb.name) || [];
          if (teamMatches.length > 0) {
            const dates = teamMatches.map(m => m.date ? new Date(m.date).getTime() : Infinity).filter(d => isFinite(d));
            teamEarliestDate[tb.name] = dates.length ? Math.min(...dates) : Infinity;
          } else {
            teamEarliestDate[tb.name] = Infinity;
          }
        });
        tbList.sort((a, b) => {
          const da = teamEarliestDate[a.name] ?? Infinity;
          const db = teamEarliestDate[b.name] ?? Infinity;
          return da - db;
        });
        appendPlayerTeamGridChunk(grid, tbList, matchesByTeam, token, 0, () => {
          if (token !== _playerDetailsFillToken) return;
          if (typeof bindPlayerDrawerElimButtons === 'function') bindPlayerDrawerElimButtons(grid, name);
          finishDrawerFill();
        });
        return;
      }
      finishDrawerFill();
    } catch (inner) {
      console.error('[openPlayerDetails] inner error:', inner);
      finishDrawerFill();
    }
  } catch (err) {
    console.error('Error in fillPlayerDetailsDrawer:', err);
  } finally {
    if (token === _playerDetailsFillToken) _playerDetailsFillInProgress = false;
  }
}

// PLAYER ADD / EDIT FORM
function openPlayerForm(player = null) {
  const overlay = document.getElementById('player-form-drawer-overlay');
  const title = document.getElementById('form-title');
  const nameInput = document.getElementById('form-player-name');
  const guessInput = document.getElementById('form-player-guess');
  const idInput = document.getElementById('form-player-id');
  
  nameInput.value = player ? player.name : '';
  guessInput.value = player ? player.guess : '';
  idInput.value = player ? player.name : ''; // use name as ID for now
  title.textContent = player ? 'แก้ไขการเลือกทีมผู้เล่น' : 'เพิ่มผู้เล่นใหม่';
  
  nameInput.readOnly = false; // Always allow name editing for admins
  
  // Build Team Selector UI
  const selector = document.getElementById('form-team-selector');
  selector.innerHTML = '';
  
  const zones = [
    { key: 'blue', name: 'Blue Zone (สูงสุด 4 ทีม)', class: 'team-blue' },
    { key: 'green', name: 'Green Zone (สูงสุด 4 ทีม)', class: 'team-green' },
    { key: 'yellow', name: 'Yellow Zone (สูงสุด 4 ทีม)', class: 'team-yellow' },
    { key: 'grey', name: 'Grey Zone (สูงสุด 4 ทีม)', class: 'team-grey' },
    { key: 'red-orange', name: 'Red Zone (สูงสุด 4 ทีม)', class: 'team-red-orange' }
  ];
  
  const selectedTeamsSet = player ? new Set(player.teams) : new Set();
  
  zones.forEach(zone => {
    const zoneHeader = document.createElement('div');
    zoneHeader.style.cssText = 'font-weight: 700; font-size: 13px; margin: 16px 0 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px;';
    zoneHeader.innerHTML = `<span class="team-badge ${zone.class}">${zone.name}</span>`;
    selector.appendChild(zoneHeader);
    
    const zoneGrid = document.createElement('div');
    zoneGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px;';
    
    const zoneTeams = TEAMS.filter(t => t.zone === zone.key);
    
    zoneTeams.forEach(t => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:center; gap:8px; background-color:rgba(15,23,42,0.2); padding:10px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;';
      
      const isChecked = selectedTeamsSet.has(t.name) ? 'checked' : '';
      // Unique id + explicit for= to satisfy a11y (no "label not associated" warning)
      const safeId = `form-team-${t.zone}-${t.name.replace(/[^a-z0-9]/gi, '-')}`.toLowerCase();
      label.innerHTML = `
        <input type="checkbox" id="${safeId}" name="form-teams" class="form-team-checkbox" data-zone="${t.zone}" value="${escapeHtml(t.name)}" ${isChecked} style="cursor:pointer; width:16px; height:16px;">
        <span class="team-badge ${getTeamZoneClass(t.zone)} team-badge--form" data-team="${escapeHtml(t.name)}" style="${getTeamPopStyleAttr(t.name)} padding: 3px 8px; font-size: 11px; flex: 1;">${escapeHtml(t.name)}</span>
      `;
      label.setAttribute('for', safeId);
      zoneGrid.appendChild(label);
    });
    
    selector.appendChild(zoneGrid);
  });
  
  // Set Form Change event listener to update selection count and validate
  setTimeout(() => {
    updateFormValidation();
  }, 100);
  
  overlay.classList.add('active');
}

function updateFormValidation() {
  const checkboxes = document.querySelectorAll('.form-team-checkbox');
  const counter = document.getElementById('form-selection-counter');
  const warning = document.getElementById('form-validation-warning');
  const saveBtn = document.getElementById('save-player-btn');
  
  let checkedCount = 0;
  const zoneCounts = { blue: 0, green: 0, yellow: 0, 'grey': 0, 'red-orange': 0 };
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      checkedCount++;
      const zone = cb.getAttribute('data-zone');
      zoneCounts[zone]++;
    }
  });
  
  counter.textContent = `${checkedCount} / 15 ทีม`;
  
  // Validations
  let errors = [];
  
  if (checkedCount !== 15) {
    errors.push(`ต้องเลือกทีมทั้งหมด 15 ทีม พอดี (ปัจจุบันเลือก ${checkedCount} ทีม)`);
  }
  
  // Max 4 per zone
  for (const zone in zoneCounts) {
    if (zoneCounts[zone] > 4) {
      errors.push(`เลือกทีมโซน ${zone.toUpperCase()} เกินกำหนดสูงสุด 4 ทีม (เลือกอยู่ ${zoneCounts[zone]} ทีม)`);
    }
  }
  
  // Min 1 per zone (must come from all 5 zones)
  for (const zone in zoneCounts) {
    if (zoneCounts[zone] === 0) {
      errors.push(`จำเป็นต้องมีอย่างน้อย 1 ทีมจากโซน ${zone.toUpperCase()}`);
    }
  }
  
  // Show / Hide Warnings
  if (errors.length > 0) {
    warning.style.display = 'block';
    warning.innerHTML = errors.map(e => `• ${e}`).join('<br>');
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
  } else {
    warning.style.display = 'none';
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
  }
}

// MATCH ADD FORM (ADMIN)
function openMatchForm() {
  const overlay = document.getElementById('match-form-drawer-overlay');
  const homeSelect = document.getElementById('form-match-home');
  const awaySelect = document.getElementById('form-match-away');
  
  // Populate dropdowns with TEAMS
  homeSelect.innerHTML = '';
  awaySelect.innerHTML = '';
  
  // Sort teams alphabetically for convenience
  const sortedTeams = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  sortedTeams.forEach(t => {
    const optHome = document.createElement('option');
    optHome.value = t.name;
    optHome.textContent = `${t.name} (x${t.multiplier})`;
    homeSelect.appendChild(optHome);
    
    const optAway = document.createElement('option');
    optAway.value = t.name;
    optAway.textContent = `${t.name} (x${t.multiplier})`;
    awaySelect.appendChild(optAway);
  });
  
  // Reset fields
  document.getElementById('form-match-id').value = '';
  document.getElementById('form-match-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('form-match-knockout').checked = false;
  document.getElementById('form-match-final').checked = false;
  
  overlay.classList.add('active');
}

function closeMatchForm() {
  document.getElementById('match-form-drawer-overlay').classList.remove('active');
}

async function handleMatchFormSubmit() {
  const home = document.getElementById('form-match-home').value;
  const away = document.getElementById('form-match-away').value;
  const matchDate = document.getElementById('form-match-date').value;
  const isKnockout = document.getElementById('form-match-knockout').checked;
  const isFinal = document.getElementById('form-match-final').checked;
  
  if (home === away) {
    alert('ทีมเหย้าและทีมเยือนไม่สามารถเป็นทีมเดียวกันได้!');
    return;
  }
  
  // Calculate next ID
  let nextId = 1;
  if (isFinal) {
    nextId = 100;
  } else {
    const ids = app.matches.filter(m => m.id < 100).map(m => m.id);
    nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }
  
  // Verify ID is unique
  if (app.matches.some(m => m.id == nextId)) {
    const allIds = app.matches.filter(m => m.id < 100).map(m => m.id);
    nextId = allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
  }
  
  const newMatch = {
    id: nextId,
    home: home,
    away: away,
    homeScore: null,
    awayScore: null,
    status: 'pending',
    isKnockout: isKnockout || isFinal,
    isFinal: isFinal,
    date: matchDate
  };
  
  app.matches.push(newMatch);
  localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
  await saveToServer();
  
  closeMatchForm();
  alert('เพิ่มคู่ตารางการแข่งขันสำเร็จ!');
  
  recalculateAll();
  renderMatches();
  renderDashboard();
}

// SETUP EVENTS & DOM CONTENT LOADED
export function refreshActivePage() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const id = activePage.id;
  if (id === 'dashboard') renderDashboard();
  else if (id === 'leaderboard') renderLeaderboard({ forceRecalc: false });
  else if (id === 'matches') renderMatches();
  else if (id === 'statistics') renderStatistics();
  else if (id === 'players') renderPlayers();
  else if (id === 'teams') renderTeamsMatrix();
  else if (id === 'tools') renderTools();
  else if (id === 'payout') renderPayout();
}

document.addEventListener('DOMContentLoaded', async () => {
  registerRefreshPage(refreshActivePage);
  initPWA();
  initNotifications();
  setRecalcHook(resetTeamPopularityCache);
  await initData();
  updateDataSyncStatus();
  setupAutoRefresh();
  initRankSoundVoices();
  attachTeamNameClickHandlers();
  setupNavigation();
  attachOutsideCloseForPlayerDrawer();  // Mobile: close player stats drawer when tapping outside / top menu / main content
  attachPlayerRowOpenHandlers();        // NEW: robust tbody-delegated opener for player details drawer (top-10, leaderboard, players table)
  attachStatsFinalGuessPlayerHandlers(); // Stats final-guess bar player chips
  
  // Initialize admin status
  initAdminState();
  
  // Toggle Admin Login / Logout
  const adminToggleBtn = document.getElementById('admin-login-toggle-btn');
  if (adminToggleBtn) {
    adminToggleBtn.addEventListener('click', () => {
      if (app.isAdmin) {
        // Logout
        showCustomConfirm('คุณต้องการออกจากระบบแอดมินใช่หรือไม่?', () => {
          app.isAdmin = false;
          sessionStorage.setItem('worldcup_isAdmin', 'false');
          updateAdminUI();
          recalculateAll();
          // rerender current active view
          if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
          if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard({forceRecalc: false});
          if (document.getElementById('matches').classList.contains('active')) renderMatches();
          if (document.getElementById('players').classList.contains('active')) renderPlayers();
        if (document.getElementById('statistics') && document.getElementById('statistics').classList.contains('active')) renderStatistics();
          alert('ออกจากระบบแอดมินเรียบร้อย');
        });
      } else {
        // Show login modal
        document.getElementById('admin-password-input').value = '';
        document.getElementById('login-error-msg').style.display = 'none';
        document.getElementById('admin-login-overlay').classList.add('active');
      }
    });
  }
  

  // Export leaderboard image button
  const exportBtn = document.getElementById('export-leaderboard-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const originalLabel = exportBtn.textContent;
      exportBtn.disabled = true;
      exportBtn.textContent = '⏳ กำลังสร้างภาพ...';
      try {
        await exportLeaderboardImage();
      } catch (err) {
        console.error('Export failed', err);
        alert('การส่งออกภาพล้มเหลว');
      } finally {
        exportBtn.disabled = false;
        exportBtn.textContent = originalLabel;
      }
    });
  }

  // Export matches results to JPG (for finished matches summary)
  const exportMatchesBtn = document.getElementById('export-matches-btn');
  if (exportMatchesBtn) {
    exportMatchesBtn.addEventListener('click', async () => {
      try {
        await exportMatchesImage();
      } catch (err) {
        console.error('Export matches failed', err);
        alert('การส่งออกภาพล้มเหลว');
      }
    });
  }

  const exportStatisticsBtn = document.getElementById('export-statistics-btn');
  if (exportStatisticsBtn) {
    exportStatisticsBtn.addEventListener('click', async () => {
      const originalLabel = exportStatisticsBtn.textContent;
      exportStatisticsBtn.disabled = true;
      exportStatisticsBtn.textContent = '⏳ กำลังสร้างภาพ...';
      try {
        await exportStatisticsImage();
      } catch (err) {
        console.error('Export statistics failed', err);
        alert('การส่งออกภาพล้มเหลว');
      } finally {
        exportStatisticsBtn.disabled = false;
        exportStatisticsBtn.textContent = originalLabel;
      }
    });
  }
  // Close login modal

function downloadCanvasAsJpeg(canvas, fileName) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('สร้างภาพล้มเหลว');
        return resolve(false);
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
      const clickResult = a.dispatchEvent(clickEvent);

      if (!clickResult || !a.href) {
        window.open(url, '_blank');
      }

      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      resolve(true);
    }, 'image/jpeg', 0.92);
  });
}

const PAGE_EXPORT_BG = '#07070a';
const PAGE_EXPORT_CARD_BG = '#16161d';
const PAGE_EXPORT_BRAND = 'YEC-BR World Cup 2026 Challenge';

function buildPageExportHeaderBanner(title, subtitle, eyebrow = PAGE_EXPORT_BRAND) {
  const banner = document.createElement('div');
  banner.className = 'page-export-header-banner';

  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dateStr = formatThaiDate(dateKey);

  banner.innerHTML = `
    <div class="page-export-header-top">
      <span class="page-export-header-eyebrow">🏆 ${escapeHtml(eyebrow)}</span>
      <span class="page-export-header-date">อัปเดต ${escapeHtml(dateStr)}</span>
    </div>
    <h1 class="page-export-header-title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="page-export-header-desc">${escapeHtml(subtitle)}</p>` : ''}
  `;
  return banner;
}

function replacePageHeaderWithExportBanner(sectionClone) {
  const header = sectionClone.querySelector('header');
  if (!header) return;

  const title = header.querySelector('h1')?.textContent?.trim() || 'ส่งออกข้อมูล';
  const subtitle = header.querySelector('.page-description')?.textContent?.trim() || '';
  header.replaceWith(buildPageExportHeaderBanner(title, subtitle));
}

function beautifyPageExportContent(root) {
  if (!root) return;

  root.querySelectorAll('.stats-sort-arrow').forEach((el) => el.remove());
  root.querySelectorAll('.stats-sort-btn').forEach((btn) => {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-pressed', 'false');
  });
  root.querySelectorAll('.stats-breakdown-title, .stats-selection-title').forEach((el) => {
    el.classList.add('page-export-subtitle');
  });
  root.querySelectorAll('h1').forEach((h1) => {
    if (!h1.classList.contains('page-export-header-title')) {
      h1.classList.add('page-export-fallback-title');
    }
  });
}

function createPageExportRoot(className, sectionWidth) {
  const exportRoot = document.createElement('div');
  exportRoot.className = `${className} page-export-capture`;
  exportRoot.setAttribute('aria-hidden', 'true');
  exportRoot.style.width = `${Math.ceil(sectionWidth)}px`;
  exportRoot.style.backgroundColor = PAGE_EXPORT_BG;
  exportRoot.style.backgroundImage = 'none';
  exportRoot.style.color = getComputedStyle(document.body).color;
  exportRoot.style.position = 'fixed';
  exportRoot.style.left = '0';
  exportRoot.style.top = '0';
  exportRoot.style.transform = 'translateX(-200vw)';
  exportRoot.style.zIndex = '2147483646';
  exportRoot.style.pointerEvents = 'none';
  exportRoot.style.overflow = 'visible';
  exportRoot.style.boxSizing = 'border-box';
  exportRoot.style.isolation = 'isolate';
  exportRoot.style.padding = '18px 22px 26px';
  return exportRoot;
}

function preparePageExportClone(sectionClone, sectionClassName) {
  sectionClone.style.display = 'block';
  sectionClone.style.width = '100%';
  sectionClone.style.maxWidth = '100%';
  sectionClone.style.overflow = 'visible';
  sectionClone.style.opacity = '1';
  sectionClone.style.animation = 'none';
  sectionClone.style.filter = 'none';
  sectionClone.style.transform = 'none';
  if (sectionClassName) sectionClone.classList.add(sectionClassName);

  sectionClone.querySelectorAll('.card, .stats-breakdown-card, .stats-selection-card, .stats-table-card, .stats-group-card').forEach((el) => {
    el.style.backdropFilter = 'none';
    el.style.webkitBackdropFilter = 'none';
    el.style.background = PAGE_EXPORT_CARD_BG;
    el.style.backgroundColor = PAGE_EXPORT_CARD_BG;
    el.style.opacity = '1';
    el.style.filter = 'none';
    el.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.25)';
    el.style.transform = 'none';
  });

  sectionClone.querySelectorAll('.table-container, table, tbody, thead, tr, .stats-breakdown-split, .stats-selection-row').forEach((el) => {
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
    el.style.opacity = '1';
    if (el.classList.contains('table-container')) {
      el.style.width = '100%';
    }
  });
}

function stripExportGradients(root) {
  if (!root) return;
  root.style.backgroundImage = 'none';
  root.style.backgroundColor = PAGE_EXPORT_BG;

  root.querySelectorAll('*').forEach((el) => {
    el.style.backgroundImage = 'none';
    if (el.style.webkitBackgroundClip === 'text' || el.classList.contains('leader-name-first') || el.classList.contains('leader-name-second')) {
      el.style.background = 'none';
      el.style.webkitBackgroundClip = 'border-box';
      el.style.backgroundClip = 'border-box';
    }
    if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3') {
      el.style.webkitTextFillColor = '';
      el.style.background = 'none';
    }
  });
}

function applyPageExportCloneFixes(root) {
  if (!root) return;
  root.classList.add('page-export-capture');
  root.style.overflow = 'visible';
  root.style.opacity = '1';
  root.style.filter = 'none';
  root.style.backgroundImage = 'none';
  root.style.backgroundColor = PAGE_EXPORT_BG;
  beautifyPageExportContent(root);
  stripExportGradients(root);
  root.querySelectorAll('*').forEach((el) => {
    el.style.animation = 'none';
  });
  root.querySelectorAll('.page, .stats-export-section, .leaderboard-export-section').forEach((el) => {
    el.style.opacity = '1';
    el.style.filter = 'none';
    el.style.transform = 'none';
  });
  root.querySelectorAll('.card, .stats-breakdown-card, .stats-selection-card, .stats-table-card, .stats-group-card').forEach((el) => {
    el.style.setProperty('backdrop-filter', 'none', 'important');
    el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    el.style.backgroundColor = PAGE_EXPORT_CARD_BG;
    el.style.opacity = '1';
    el.style.filter = 'none';
    el.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.25)';
    el.style.transform = 'none';
  });
  root.querySelectorAll('.stats-zone-panel').forEach((el) => {
    el.style.setProperty('backdrop-filter', 'none', 'important');
    el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    el.style.opacity = '1';
    el.style.filter = 'none';
  });
  root.querySelectorAll('.table-container, .card, table, .stats-breakdown-split, .stats-selection-row, .stats-breakdown-card').forEach((el) => {
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
  });
}

async function capturePageExportRoot(exportRoot, fileName) {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const captureWidth = Math.ceil(exportRoot.scrollWidth || exportRoot.offsetWidth);
  const captureHeight = Math.ceil(exportRoot.scrollHeight || exportRoot.offsetHeight);
  const scale = Math.min(2, window.devicePixelRatio > 1 ? 2 : 1.5);

  const canvas = await html2canvas(exportRoot, {
    backgroundColor: PAGE_EXPORT_BG,
    scale,
    useCORS: true,
    logging: false,
    foreignObjectRendering: false,
    width: captureWidth,
    height: captureHeight,
    windowWidth: captureWidth,
    windowHeight: captureHeight,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc) => {
      applyPageExportCloneFixes(clonedDoc.querySelector('.page-export-capture'));
    }
  });

  await downloadCanvasAsJpeg(canvas, fileName);
}

async function exportLeaderboardImage() {
  const section = document.getElementById('leaderboard');
  const liveCard = section?.querySelector('.card');
  const liveTable = section?.querySelector('.table-container table');
  if (!section || !liveCard || !liveTable) {
    return alert('ไม่พบตารางคะแนนเพื่อส่งออก');
  }

  if (typeof html2canvas !== 'function') {
    return alert('ระบบส่งออกภาพยังไม่พร้อม กรุณารีเฟรชหน้าเว็บ');
  }

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }

  const sectionWidth = Math.max(section.getBoundingClientRect().width, liveCard.getBoundingClientRect().width, 320);
  const exportRoot = createPageExportRoot('leaderboard-export-root', sectionWidth);

  const sectionClone = section.cloneNode(true);
  preparePageExportClone(sectionClone, 'leaderboard-export-section');
  sectionClone.querySelector('.search-bar')?.remove();
  replacePageHeaderWithExportBanner(sectionClone);
  beautifyPageExportContent(sectionClone);

  const clonedCard = sectionClone.querySelector('.card');
  if (clonedCard) {
    clonedCard.style.overflow = 'visible';
    clonedCard.style.maxHeight = 'none';
    clonedCard.style.width = '100%';
  }

  stripExportGradients(exportRoot);
  exportRoot.appendChild(sectionClone);
  document.body.appendChild(exportRoot);
  stripExportGradients(exportRoot);

  try {
    await capturePageExportRoot(exportRoot, 'leaderboard.jpg');
  } finally {
    exportRoot.remove();
  }
}

async function exportStatisticsImage() {
  const section = document.getElementById('statistics');
  if (!section) {
    return alert('ไม่พบหน้าสถิติทีมเพื่อส่งออก');
  }

  if (!section.classList.contains('active')) {
    return alert('กรุณาเปิดหน้าสถิติทีมก่อนบันทึกภาพ');
  }

  if (typeof html2canvas !== 'function') {
    return alert('ระบบส่งออกภาพยังไม่พร้อม กรุณารีเฟรชหน้าเว็บ');
  }

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }

  const sectionWidth = Math.max(section.getBoundingClientRect().width, 320);
  const exportRoot = createPageExportRoot('stats-export-root', sectionWidth);

  const sectionClone = section.cloneNode(true);
  preparePageExportClone(sectionClone, 'stats-export-section');
  sectionClone.querySelector('#export-statistics-btn')?.remove();
  replacePageHeaderWithExportBanner(sectionClone);
  beautifyPageExportContent(sectionClone);

  stripExportGradients(exportRoot);
  exportRoot.appendChild(sectionClone);
  document.body.appendChild(exportRoot);
  stripExportGradients(exportRoot);

  try {
    await capturePageExportRoot(exportRoot, 'team-stats.jpg');
  } finally {
    exportRoot.remove();
  }
}

async function exportMatchesImage() {
  // Get only finished matches that have scores
  const finishedMatches = app.matches
    .filter(m => m.status === 'finished' && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => {
      const da = a.date || '9999-12-31';
      const db = b.date || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return a.id - b.id;
    });

  if (!finishedMatches.length) {
    return alert('ยังไม่มีแมตช์ที่บันทึกผลการแข่งขัน');
  }

  // Ensure fonts are ready for clean export
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
  }

  const sectionWidth = Math.max(720, document.getElementById('matches')?.getBoundingClientRect().width || 720);
  const exportRoot = createPageExportRoot('matches-export-root', sectionWidth);
  const container = document.createElement('div');
  container.className = 'matches-export-section';
  container.style.width = '100%';
  container.appendChild(buildPageExportHeaderBanner(
    'ผลการแข่งขันที่บันทึกแล้ว',
    `รวม ${finishedMatches.length} แมตช์ที่บันทึกผลแล้ว`
  ));

  const tableCard = document.createElement('div');
  tableCard.className = 'card matches-export-table-card';

  const table = document.createElement('table');
  table.className = 'matches-export-table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>วันที่</th>
      <th style="width:60px;">แมตช์</th>
      <th>กลุ่ม</th>
      <th style="text-align:right;">ทีมเหย้า</th>
      <th class="matches-export-score-th">สกอร์</th>
      <th>ทีมเยือน</th>
      <th>กลุ่ม</th>
      <th>เกมส์คะแนน</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  finishedMatches.forEach(m => {
    const hTeam = TEAMS.find(t => t.name === m.home);
    const aTeam = TEAMS.find(t => t.name === m.away);
    const hMult = hTeam ? hTeam.multiplier : 1;
    const aMult = aTeam ? aTeam.multiplier : 1;
    const hZone = hTeam ? hTeam.zone : 'blue';
    const aZone = aTeam ? aTeam.zone : 'blue';

    const hPts = getMatchGamePointsForTeam(m, m.home, hMult);
    const aPts = getMatchGamePointsForTeam(m, m.away, aMult);

    // Result-based colors for the POINTS only (win/draw/loss)
    const hResult = getMatchResultForTeam(m, m.home);
    const aResult = getMatchResultForTeam(m, m.away);

    const hPtsColor = hResult === 'win' ? '#22c55e' : (hResult === 'draw' ? '#facc15' : '#f43f5e');
    const aPtsColor = aResult === 'win' ? '#22c55e' : (aResult === 'draw' ? '#facc15' : '#f43f5e');

    const dateStr = m.date ? formatThaiDate(m.date) : '-';

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

    tr.innerHTML = `
      <td style="padding:6px 10px; white-space:nowrap; font-size:12px; color:#94a3b8;">${dateStr}</td>
      <td style="padding:6px 10px; text-align:center; font-size:12px; color:#64748b;">${m.id}</td>
      <td style="padding:6px 10px; text-align:center; font-size:12px; color:#cbd5e1; font-weight:700;">${getTeamWcGroup(m.home) || '-'}</td>
      <td style="padding:6px 12px; text-align:right;">${buildTeamBadgeHtml(m.home, hZone, { extraStyle: 'font-size:11px; padding:2px 6px;' })}</td>
      <td style="padding:6px 14px; text-align:center; font-weight:800; font-size:15px; background:rgba(15,23,42,0.45);">
        ${m.homeScore} - ${m.awayScore}
      </td>
      <td style="padding:6px 12px;">${buildTeamBadgeHtml(m.away, aZone, { extraStyle: 'font-size:11px; padding:2px 6px;' })}</td>
      <td style="padding:6px 10px; text-align:center; font-size:12px; color:#cbd5e1; font-weight:700;">${getTeamWcGroup(m.away) || '-'}</td>
      <td style="padding:6px 10px; font-size:12px; line-height:1.3;">
        <div><span style="color:${hPtsColor}; font-weight:600;">${m.home} +${hPts.toFixed(1)}</span></div>
        <div><span style="color:${aPtsColor}; font-weight:600;">${m.away} +${aPts.toFixed(1)}</span></div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableCard.appendChild(table);
  container.appendChild(tableCard);
  stripExportGradients(exportRoot);
  exportRoot.appendChild(container);
  document.body.appendChild(exportRoot);
  stripExportGradients(exportRoot);

  try {
    await capturePageExportRoot(exportRoot, 'matches-results.jpg');
  } finally {
    exportRoot.remove();
  }
}
  const closeLoginBtn = document.getElementById('close-login-btn');
  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      document.getElementById('admin-login-overlay').classList.remove('active');
    });
  }
  
  // Handle admin login submission
  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const password = document.getElementById('admin-password-input').value;
      const errorMsg = document.getElementById('login-error-msg');
      
      if (password === app.ADMIN_PASSWORD) {
        app.isAdmin = true;
        sessionStorage.setItem('worldcup_isAdmin', 'true');
        updateAdminUI();
        errorMsg.style.display = 'none';
        document.getElementById('admin-login-overlay').classList.remove('active');
        
        recalculateAll();
        // rerender current active view
        if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
        if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard({forceRecalc: false});
        if (document.getElementById('matches').classList.contains('active')) renderMatches();
        if (document.getElementById('players').classList.contains('active')) renderPlayers();
        if (document.getElementById('statistics') && document.getElementById('statistics').classList.contains('active')) renderStatistics();
        
        alert('เข้าสู่ระบบแอดมินสำเร็จ!');
      } else {
        errorMsg.style.display = 'block';
        document.getElementById('admin-password-input').value = '';
        document.getElementById('admin-password-input').focus();
      }
    });
  }
  
  // Search listeners (debounced for leaderboard)
  const debouncedLeaderboardSearch = debounce(renderLeaderboard, 80);
  const leaderboardSearchEl = document.getElementById('leaderboard-search');
  if (leaderboardSearchEl) leaderboardSearchEl.addEventListener('input', debouncedLeaderboardSearch);
  document.getElementById('players-search').addEventListener('input', renderPlayers);
  
  // Populate leaderboard team filter dropdown (multi checkbox)
  
  // Initialize Team Filters
  initTeamFilter({
    prefix: 'leaderboard',
    containerId: 'team-filter-dropdown-container',
    btnId: 'team-filter-btn',
    menuId: 'team-filter-menu',
    checkboxesContainerId: 'team-filter-checkboxes-container',
    clearBtnId: 'clear-team-filter-btn',
    onFilterChange: () => renderLeaderboard({forceRecalc: false})
  });

  initTeamFilter({
    prefix: 'players',
    containerId: 'players-team-filter-dropdown-container',
    btnId: 'players-team-filter-btn',
    menuId: 'players-team-filter-menu',
    checkboxesContainerId: 'players-team-filter-checkboxes-container',
    clearBtnId: 'players-clear-team-filter-btn',
    onFilterChange: () => renderPlayers()
  });

  // Chart highlight dropdown listener
  const chartHighlightSelect = document.getElementById('chart-highlight-select');
  if (chartHighlightSelect) {
    chartHighlightSelect.addEventListener('change', (e) => {
      app.chartHoverPlayer = '';
      highlightPlayerInChart(e.target.value);
    });
  }
  
  // Close Modals buttons
  document.getElementById('close-detail-btn').addEventListener('click', hidePlayerDetailsDrawer);
  
  // Close player details drawer when clicking on the backdrop (outside the drawer)
  const playerDetailsOverlay = document.getElementById('player-details-drawer-overlay');
  if (playerDetailsOverlay) {
    playerDetailsOverlay.addEventListener('click', (e) => {
      if (e.target === playerDetailsOverlay) {
        hidePlayerDetailsDrawer();
      }
    });
  }

  attachPlayerDrawerScrollGuard();

  // Bottom close button inside player details (very easy to tap on mobile)
  const bottomCloseBtn = document.getElementById('player-detail-bottom-close-btn');
  if (bottomCloseBtn) {
    bottomCloseBtn.addEventListener('click', hidePlayerDetailsDrawer);
  }

  // === Safe outside-close for player stats drawer (mobile friendly) ===
  // We ONLY auto-close the player stats drawer in these explicit safe cases:
  // - Backdrop click (the dedicated listener below that checks e.target === overlay)
  // - Explicit close buttons (× in header + big red button at bottom)
  // - Top navigation clicks (setupNavigation calls closePlayerDetailsIfOpen)
  // - Mobile header taps (brand/hamburger)
  // - Main content clicks that are NOT coming from a player row (.hoverable)

  // Mobile header tap → close stats drawer (safe)
  const mobileHeader = document.getElementById('mobile-header');
  if (mobileHeader) {
    mobileHeader.addEventListener('click', () => {
      const overlay = document.getElementById('player-details-drawer-overlay');
      if (overlay && overlay.classList.contains('active')) {
        setTimeout(hidePlayerDetailsDrawer, 0);
      }
    });
  }

  // Main content clicks: close only if NOT on a player row.
  // Player rows (.hoverable) are the openers — we must never swallow their click here.
  const mainContentArea = document.getElementById('main-content');
  if (mainContentArea) {
    mainContentArea.addEventListener('click', (e) => {
      const overlay = document.getElementById('player-details-drawer-overlay');
      if (!overlay || !overlay.classList.contains('active')) return;

      // Ignore the same click that just opened the drawer
      if (Date.now() - (window._playerDetailsLastOpenAt || 0) < 120) return;

      // Do not close if the click originated from an opener control
      if (e.target.closest('.hoverable, .stats-final-guess-player, .stats-final-guess-bars, .team-players-list-item')) return;

      const drawer = overlay.querySelector('.drawer');
      if (drawer && !drawer.contains(e.target)) {
        setTimeout(() => {
          if (overlay.classList.contains('active')) hidePlayerDetailsDrawer();
        }, 0);
      }
    });
  }

  // We removed all previous blanket document capture listeners (click + touchstart with capture:true)
  // because they were firing before the row click handlers and closing the drawer immediately after (or before) it opened.
  // That was the root cause of "pop up ไม่เด้งขึ้นมา".
  
  document.getElementById('close-form-btn').addEventListener('click', () => {
    document.getElementById('player-form-drawer-overlay').classList.remove('active');
  });
  
  document.getElementById('open-add-player-btn').addEventListener('click', () => {
    openPlayerForm();
  });

  // Match Form DOM listeners
  const closeMatchFormBtn = document.getElementById('close-match-form-btn');
  if (closeMatchFormBtn) {
    closeMatchFormBtn.addEventListener('click', closeMatchForm);
  }
  const openAddMatchBtn = document.getElementById('open-add-match-btn');
  if (openAddMatchBtn) {
    openAddMatchBtn.addEventListener('click', openMatchForm);
  }
  const matchForm = document.getElementById('match-form');
  if (matchForm) {
    matchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleMatchFormSubmit();
    });
  }
  
  // Reset All Matches button
  const resetBtn = document.getElementById('reset-all-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      showCustomConfirm('คุณต้องการรีเซ็ตผลการแข่งขันทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่? (การแก้ไขสกอร์การแข่งทั้งหมดจะถูกล้าง)', async () => {
        localStorage.removeItem('worldcup_matches');
        localStorage.removeItem('worldcup_manually_edited_matches');
        localStorage.removeItem('worldcup_deleted_matches');
        await initData();
        await saveToServer();
        recalculateAll();
        if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
        if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard({forceRecalc: false});
        if (document.getElementById('matches').classList.contains('active')) renderMatches();
        if (document.getElementById('players').classList.contains('active')) renderPlayers();
        if (document.getElementById('statistics') && document.getElementById('statistics').classList.contains('active')) renderStatistics();
        alert('รีเซ็ตผลการแข่งขันทั้งหมดเรียบร้อยแล้ว!');
      });
    });
  }
  
  // Handle team selections checkbox changes dynamically
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('form-team-checkbox')) {
      updateFormValidation();
    }
  });
  
  // Player form submission
  document.getElementById('player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('form-player-id').value;
    const name = document.getElementById('form-player-name').value.trim();
    const guess = parseInt(document.getElementById('form-player-guess').value);
    
    const checkboxes = document.querySelectorAll('.form-team-checkbox');
    const selectedTeams = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        selectedTeams.push(cb.value);
      }
    });
    
    if (selectedTeams.length !== 15) {
      alert('กรุณาเลือกทีมให้ครบ 15 ทีม!');
      return;
    }
    
    if (id) {
      // Edit mode (find by name)
      if (id !== name && app.players.some(p => p.name === name)) {
        alert('ชื่อผู้เล่นใหม่นี้มีผู้ใช้งานอยู่แล้ว!');
        return;
      }
      const pIdx = app.players.findIndex(p => p.name === id);
      if (pIdx !== -1) {
        players[pIdx].name = name;
        players[pIdx].guess = guess;
        players[pIdx].teams = selectedTeams;
      }
    } else {
      // Add mode
      // Check duplicate name
      if (app.players.some(p => p.name === name)) {
        alert('ชื่อผู้เล่นนี้ถูกใช้งานแล้ว!');
        return;
      }
      app.players.push({
        name,
        teams: selectedTeams,
        guess
      });
    }
    
    localStorage.setItem('worldcup_players', JSON.stringify(app.players));
    if (app.isSyncEnabled) {
      await saveToServer();
    }
    document.getElementById('player-form-drawer-overlay').classList.remove('active');
    
    alert('บันทึกข้อมูลผู้เล่นเรียบร้อย!');
    recalculateAll();
    renderDashboard();
    renderLeaderboard();
    renderPlayers();
  });
  

  // Initial page renders
  bindChartHoverInteractions();
  renderDashboard();
});

// Handle window resize to update chart responsiveness (debounced + guarded)
const debouncedResize = debounce(() => {
  const dashboardPage = getCachedEl('dashboard');
  if (dashboardPage && dashboardPage.classList.contains('active')) {
    renderScoreChart();
  }
}, 160);
window.addEventListener('resize', debouncedResize);



// ==========================================
// Added Features: Popularity & Popup (Progress Bar version)
// ==========================================

function getTeamPopularity(teamName) {
  let count = 0;
  for (const p of app.players) {
    if (p.teams && p.teams.includes(teamName)) count++;
  }
  return count;
}

// _maxPopularityCache provided via state.js named exports in bundle
function getMaxPopularity() {
  if (app._maxPopularityCache !== null) return app._maxPopularityCache;
  let max = 1; // avoid div by zero
  TEAMS.forEach(t => {
    max = Math.max(max, getTeamPopularity(t.name));
  });
  app._maxPopularityCache = max;
  return max;
}

function getTeamPopularityPercent(teamName) {
  const count = getTeamPopularity(teamName);
  const max = getMaxPopularity();
  // Ensure a minimum 5% width so colors show up even for 1-vote teams if max is huge
  if (count === 0) return 0;
  const percent = (count / max) * 100;
  return Math.max(5, percent).toFixed(1);
}

function getTeamZoneClass(zone) {
  if (!zone) return 'team-grey';
  return `team-${zone}`;
}

function getTeamZoneByName(teamName) {
  const t = TEAMS.find(tm => tm.name === teamName);
  return t ? t.zone : 'grey';
}

function getTeamPopStyleAttr(teamName) {
  return `--pop-percent: ${getTeamPopularityPercent(teamName)}%;`;
}

function applyTeamPopularity(el, teamName) {
  if (!el || !teamName) return;
  el.style.setProperty('--pop-percent', `${getTeamPopularityPercent(teamName)}%`);
}

function buildTeamBadgeHtml(teamName, zone, options = {}) {
  const { extraClass = '', extraStyle = '', tag = 'span', compact = false, clickable = true } = options;
  const zc = getTeamZoneClass(zone || getTeamZoneByName(teamName));
  const compactClass = compact ? 'team-badge--compact' : '';
  const compactStyle = compact ? 'padding:1px 5px; font-size:10px; border-radius:3px;' : '';
  const popCount = getTeamPopularity(teamName);
  const title = popCount > 0 ? `ดูผู้เลือกทีมนี้ (${popCount} คน)` : 'ดูผู้เลือกทีมนี้';
  const dataTeamAttr = clickable ? ` data-team="${escapeHtml(teamName)}"` : '';
  return `<${tag} class="team-badge ${zc} ${compactClass} ${extraClass}"${dataTeamAttr} style="${getTeamPopStyleAttr(teamName)} ${compactStyle} ${extraStyle}" title="${title}">${escapeHtml(teamName)}</${tag}>`;
}

function resetTeamPopularityCache() {
  app._maxPopularityCache = null;
}

// Reset cache when players update
const originalRenderPlayers = renderPlayers;
renderPlayers = function() {
  resetTeamPopularityCache();
  if (typeof originalRenderPlayers === 'function') {
    originalRenderPlayers.apply(this, arguments);
  }
};

const originalRenderStatistics = renderStatistics;
renderStatistics = function() {
  resetTeamPopularityCache();
  if (typeof originalRenderStatistics === 'function') {
    originalRenderStatistics.apply(this, arguments);
  }
};

const originalRenderTeamsMatrix = renderTeamsMatrix;
renderTeamsMatrix = function() {
  resetTeamPopularityCache();
  if (typeof originalRenderTeamsMatrix === 'function') {
    originalRenderTeamsMatrix.apply(this, arguments);
  }
};

function buildTeamPlayersPopupItemHtml(playerName) {
  return `<li class="team-players-list-item" data-player="${escapeHtml(playerName)}" role="button" tabindex="0">${escapeHtml(playerName)}</li>`;
}

function closeTeamSelectionPopup() {
  const popup = document.getElementById('team-selection-popup');
  if (popup) popup.remove();
  if (window._teamPopupCloseHandler) {
    document.removeEventListener('click', window._teamPopupCloseHandler, true);
    document.removeEventListener('pointerdown', window._teamPopupCloseHandler, true);
    window._teamPopupCloseHandler = null;
  }
}

function attachTeamNameClickHandlers() {
  if (window._teamNameClickBound) return;
  window._teamNameClickBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('button, input, select, textarea, .toggle-elim-btn')) return;
    const el = e.target.closest('[data-team]');
    if (!el) return;
    const teamName = el.getAttribute('data-team');
    if (!teamName || !TEAMS.some(t => t.name === teamName)) return;
    showTeamSelectionPopup(teamName, e);
  });
}

window.showTeamSelectionPopup = function(teamName, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  if (window._teamPopupCloseHandler) {
    document.removeEventListener('click', window._teamPopupCloseHandler, true);
    document.removeEventListener('pointerdown', window._teamPopupCloseHandler, true);
    window._teamPopupCloseHandler = null;
  }

  const existing = document.getElementById('team-selection-popup');
  if (existing) existing.remove();

  const selectedBy = app.players.filter(p => p.teams && p.teams.includes(teamName))
    .map(p => p.name)
    .sort((a, b) => a.localeCompare(b, 'th'));
  const popup = document.createElement('div');
  popup.id = 'team-selection-popup';
  popup.className = 'selection-popup team-players-popup';

  const anchorX = event ? event.clientX : window.innerWidth / 2;
  const anchorY = event ? event.clientY : window.innerHeight / 2;

  const teamGroup = formatWcGroupLabel(getTeamWcGroup(teamName));
  const teamBadge = buildTeamBadgeHtml(teamName, getTeamZoneByName(teamName), {
    extraClass: 'team-players-popup__team',
    extraStyle: 'font-size:12px; padding:2px 6px;',
    clickable: false
  });
  let html = `<h4><span class="team-players-popup__label">ผู้เลือก</span> ${teamBadge}<span class="team-players-popup__meta"> · ${escapeHtml(teamGroup)} (${selectedBy.length} คน)</span></h4>`;
  if (selectedBy.length === 0) {
    html += '<div>ไม่มีผู้เลือก</div>';
  } else {
    html += '<ul class="team-players-list-small">' + selectedBy.map(buildTeamPlayersPopupItemHtml).join('') + '</ul>';
  }
  popup.innerHTML = html;
  document.body.appendChild(popup);

  popup.querySelectorAll('.team-players-list-item[data-player]').forEach((li) => {
    const openPlayer = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const playerName = li.getAttribute('data-player');
      if (!playerName) return;
      closeTeamSelectionPopup();
      openPlayerDetails(playerName);
    };
    li.addEventListener('click', openPlayer);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openPlayer(e);
    });
  });

  const margin = 10;
  let left = anchorX;
  let top = anchorY;
  const rect = popup.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
  if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
  if (left < margin) left = margin;
  if (top < margin) top = margin;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  window._teamPopupJustOpened = true;
  setTimeout(() => { window._teamPopupJustOpened = false; }, 400);

  const closeHandler = (e) => {
    if (window._teamPopupJustOpened) return;
    if (!document.getElementById('team-selection-popup')) return;
    if (popup.contains(e.target)) return;
    if (e.target.closest('.team-badge, .team-clickable, [data-team]')) return;
    closeTeamSelectionPopup();
  };

  window._teamPopupCloseHandler = closeHandler;
  requestAnimationFrame(() => {
    document.addEventListener('click', closeHandler, true);
    document.addEventListener('pointerdown', closeHandler, true);
  });
};

// Hover effect for badges
const badgeStyle = document.createElement('style');
badgeStyle.innerHTML = '.team-badge { cursor: pointer !important; transition: filter 0.2s; } .team-badge:hover { filter: brightness(1.2); }';
document.head.appendChild(badgeStyle);


export {
  handleSimulationScoreChange,
  renderDashboard,
  renderLeaderboard,
  renderMatches,
  renderPlayers,
  renderStatistics,
  renderTeamsMatrix,
  renderTools,
  renderPayout,
  openPlayerDetails,
  recalculateAll
};
