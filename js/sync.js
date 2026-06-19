import { app } from './state.js';
import { INITIAL_MATCHES, INITIAL_PLAYERS } from './constants.js';
import { recalculateAll, loadEliminatedTeams } from './scoring.js';
import { notifyDataUpdate, processBroadcast, flushPendingBroadcast } from './notifications.js';
import { saveToServer } from './persist.js';
import { isLocalDevHost, resolveAppPath } from './app-path.js';

export { saveToServer };

export function clearCachedData() {
  const cachedKeys = [
    'worldcup_matches',
    'worldcup_players',
    'worldcup_eliminated_teams',
    'worldcup_manually_edited_matches',
    'worldcup_deleted_matches'
  ];
  cachedKeys.forEach(key => localStorage.removeItem(key));
}

export async function initData() {
  let serverData = { matches: [], players: [], eliminatedTeams: [] };
  
  // 1. Detect local Node sync API (skip on GitHub Pages — no /api/status endpoint)
  window.isSyncEnabled = false;
  if (isLocalDevHost()) {
    try {
      const statusRes = await fetch(resolveAppPath('api/status'));
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.sync) {
          app.isSyncEnabled = true;
          window.isSyncEnabled = true;
        }
      }
    } catch {
      console.log('[Sync] Local sync API unavailable');
    }
  }

  // 2. Fetch server data with cache busting to ensure the latest file is loaded
  try {
    const res = await fetch(`${resolveAppPath('data.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (e) {
    console.error('Failed to fetch data.json from server:', e);
  }

  const hasServerData = serverData.matches && serverData.matches.length > 0;
  // On GitHub Pages there is no /api/save — treat data.json as the shared source of truth
  if (!app.isSyncEnabled && hasServerData) {
    app.isSyncEnabled = true;
    window.isSyncEnabled = true;
  }
  if (hasServerData) {
    const localMatchesStr = localStorage.getItem('worldcup_matches');
    const serverMatchesStr = JSON.stringify(serverData.matches || []);
    if (localMatchesStr !== serverMatchesStr) {
      // Server data newer than cache — localStorage refreshed below
      clearCachedData();
    }
  }

  // 3. Load database state
  if (app.isSyncEnabled && serverData.matches && serverData.matches.length > 0) {

    app.matches = serverData.matches;
    app.players = serverData.players || [];
    app.manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
    
    // Fallback sync to localstorage so offline fallback is close to last saved state
    localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
    localStorage.setItem('worldcup_players', JSON.stringify(app.players));
    localStorage.setItem('worldcup_eliminated_teams', JSON.stringify(Array.from(app.manualEliminatedTeams)));
  } else {

    const storedMatches = localStorage.getItem('worldcup_matches');
    const storedPlayers = localStorage.getItem('worldcup_players');
    
    // Load override lists from localStorage with safety try-catch
    let manuallyEditedMatches = [];
    try {
      manuallyEditedMatches = JSON.parse(localStorage.getItem('worldcup_manually_edited_matches') || '[]');
      if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
    } catch (e) {
      console.error('Failed to parse manually edited app.matches:', e);
    }

    let deletedMatches = [];
    try {
      deletedMatches = JSON.parse(localStorage.getItem('worldcup_deleted_matches') || '[]');
      if (!Array.isArray(deletedMatches)) deletedMatches = [];
    } catch (e) {
      console.error('Failed to parse deleted app.matches:', e);
    }
    
    if (serverData.matches && serverData.matches.length > 0) {
      app.matches = serverData.matches.filter(m => !deletedMatches.some(id => id == m.id));

      // Preserve any locally manually edited app.matches on top of the latest server data
      if (storedMatches) {
        const localMatches = JSON.parse(storedMatches);
        localMatches.forEach(lm => {
          if (manuallyEditedMatches.some(id => id == lm.id)) {
            const idx = app.matches.findIndex(m => m.id == lm.id);
            if (idx !== -1) {
              app.matches[idx] = { ...app.matches[idx], ...lm };
            } else {
              app.matches.push(lm);
            }
          }
        });
      }

      // Migrate: add dates from INITIAL_MATCHES or server matches if missing
      app.matches.forEach(m => {
        if (!m.date) {
          const initialMatch = INITIAL_MATCHES.find(im => im.id == m.id) || (serverData.matches && serverData.matches.find(sm => sm.id == m.id));
          if (initialMatch && initialMatch.date) {
            m.date = initialMatch.date;
          }
        }
      });

      localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
    } else if (storedMatches) {
      app.matches = JSON.parse(storedMatches);
      
      // Auto-sync app.matches from server data (for automated scrapes)
      let updated = false;
      if (serverData.matches && serverData.matches.length > 0) {
        serverData.matches.forEach(sm => {
          // Skip syncing if match is deleted by user (using loose comparison for safety)
          if (deletedMatches.some(id => id == sm.id)) return;
          
          const lmIdx = app.matches.findIndex(m => m.id == sm.id);
          if (lmIdx !== -1) {
            const lm = app.matches[lmIdx];
            
            // Skip syncing if match was manually edited by user (using loose comparison for safety)
            if (manuallyEditedMatches.some(id => id == sm.id)) return;
            
            // If server match is finished but local match is pending, auto-update local match
            if (sm.status === 'finished' && lm.status === 'pending') {
              app.matches[lmIdx] = { ...lm, ...sm };
              updated = true;
            }
          } else {
            // If it's a new match from server not present in local app.matches, add it
            app.matches.push(sm);
            updated = true;
          }
        });
      }
      
      // Migrate: add dates from INITIAL_MATCHES or server matches if missing
      app.matches.forEach(m => {
        if (!m.date) {
          const initialMatch = INITIAL_MATCHES.find(im => im.id == m.id) || (serverData.matches && serverData.matches.find(sm => sm.id == m.id));
          if (initialMatch && initialMatch.date) {
            m.date = initialMatch.date;
            updated = true;
          }
        }
      });
      
      if (updated) localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
    } else {
      app.matches = [...INITIAL_MATCHES];
      // Filter out deleted matches if any exist (using loose comparison for safety)
      if (deletedMatches.length > 0) {
        app.matches = app.matches.filter(m => !deletedMatches.some(id => id == m.id));
      }
      localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
    }
    
    if (storedPlayers) {
      app.players = JSON.parse(storedPlayers);
      
      // Auto-sync app.players from server data if there are new ones
      let updated = false;
      if (serverData.players && serverData.players.length > 0) {
        serverData.players.forEach(sp => {
          if (!app.players.some(p => p.name === sp.name)) {
            app.players.push(sp);
            updated = true;
          }
        });
      }
      if (updated) localStorage.setItem('worldcup_players', JSON.stringify(app.players));
    } else {
      app.players = (serverData.players && serverData.players.length > 0) ? serverData.players : [...INITIAL_PLAYERS];
      localStorage.setItem('worldcup_players', JSON.stringify(app.players));
    }
  }

  if (serverData.broadcast) app.broadcast = serverData.broadcast;
  processBroadcast(serverData, { onInit: true });

  loadEliminatedTeams();
  app.lastDataRefreshTime = new Date();
}


let _refreshPage = () => {};
export function registerRefreshPage(fn) {
  _refreshPage = typeof fn === 'function' ? fn : () => {};
}

export function formatSyncTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function updateDataSyncStatus(status = 'idle', extra = '') {
  const el = document.getElementById('data-sync-status');
  if (!el) return;
  if (status === 'updating') {
    el.textContent = 'กำลังอัปเดตข้อมูล...';
    el.className = 'data-sync-status data-sync-status--updating';
    return;
  }
  if (status === 'updated') {
    el.textContent = `อัปเดตล่าสุด ${formatSyncTime(app.lastDataRefreshTime)}${extra ? ' · ' + extra : ''}`;
    el.className = 'data-sync-status data-sync-status--updated';
    return;
  }
  const syncLabel = app.isSyncEnabled ? 'ซิงค์อัตโนมัติ' : 'อัปเดตอัตโนมัติ';
  el.textContent = app.lastDataRefreshTime
    ? `อัปเดตล่าสุด ${formatSyncTime(app.lastDataRefreshTime)} · ${syncLabel} ทุก 1 นาที`
    : `${syncLabel} ทุก 1 นาที`;
  el.className = 'data-sync-status';
}

export function mergeServerDataIntoLocal(serverData) {
  if (!serverData || !serverData.matches) return false;

  let updated = false;

  if (app.isSyncEnabled && serverData.matches.length > 0) {
    const newMatchesStr = JSON.stringify(serverData.matches);
    const newPlayersStr = JSON.stringify(serverData.players || []);
    if (JSON.stringify(app.matches) !== newMatchesStr || JSON.stringify(app.players) !== newPlayersStr) {
      app.matches = serverData.matches;
      app.players = serverData.players || [];
      app.manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
      localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
      localStorage.setItem('worldcup_players', JSON.stringify(app.players));
      localStorage.setItem('worldcup_eliminated_teams', JSON.stringify(Array.from(app.manualEliminatedTeams)));
      updated = true;
    }
    return updated;
  }

  let manuallyEditedMatches = [];
  let deletedMatches = [];
  try {
    manuallyEditedMatches = JSON.parse(localStorage.getItem('worldcup_manually_edited_matches') || '[]');
    if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
    deletedMatches = JSON.parse(localStorage.getItem('worldcup_deleted_matches') || '[]');
    if (!Array.isArray(deletedMatches)) deletedMatches = [];
  } catch (e) {
    manuallyEditedMatches = [];
    deletedMatches = [];
  }

  serverData.matches.forEach(sm => {
    if (deletedMatches.some(id => id == sm.id)) return;
    const lmIdx = app.matches.findIndex(m => m.id == sm.id);
    if (lmIdx !== -1) {
      if (manuallyEditedMatches.some(id => id == sm.id)) return;
      const lm = app.matches[lmIdx];
      if (sm.status === 'finished' && lm.status === 'pending') {
        app.matches[lmIdx] = { ...lm, ...sm };
        updated = true;
      } else if (JSON.stringify(lm) !== JSON.stringify(sm) && sm.status === 'finished') {
        app.matches[lmIdx] = { ...lm, ...sm };
        updated = true;
      }
    } else {
      app.matches.push(sm);
      updated = true;
    }
  });

  if (serverData.players && serverData.players.length > 0) {
    serverData.players.forEach(sp => {
      if (!app.players.some(p => p.name === sp.name)) {
        app.players.push(sp);
        updated = true;
      }
    });
  }

  if (updated) {
    localStorage.setItem('worldcup_matches', JSON.stringify(app.matches));
    localStorage.setItem('worldcup_players', JSON.stringify(app.players));
  }

  return updated;
}


export function refreshActivePage() {
  _refreshPage();
}

const pollChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('worldcup-poll')
  : null;

export function requestPollNow() {
  void pollServerData();
  pollChannel?.postMessage({ type: 'POLL_NOW' });
}

function setupPollChannel() {
  pollChannel?.addEventListener('message', (event) => {
    if (event.data?.type === 'POLL_NOW') void pollServerData();
  });
}

export async function pollServerData() {
  try {
    const res = await fetch(`${resolveAppPath('data.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const serverData = await res.json();
    const changed = mergeServerDataIntoLocal(serverData);
    if (serverData.broadcast) app.broadcast = serverData.broadcast;
    const broadcasted = processBroadcast(serverData);
    if (changed || broadcasted) {
      app.lastDataRefreshTime = new Date();
      if (!document.hidden) {
        if (changed) {
          updateDataSyncStatus('updating');
          recalculateAll();
          _refreshPage();
          updateDataSyncStatus('updated', 'มีข้อมูลใหม่');
        }
        if (!broadcasted && changed) notifyDataUpdate({ type: 'data' });
      }
    }
  } catch (e) {
    // Offline — skip silently
  }
}

export function setupAutoRefresh() {
  setupPollChannel();
  if (app.autoRefreshTimer) clearInterval(app.autoRefreshTimer);
  app.lastDataRefreshTime = new Date();
  updateDataSyncStatus();
  app.autoRefreshTimer = setInterval(pollServerData, app.AUTO_REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      flushPendingBroadcast();
      pollServerData();
    }
  });
  window.addEventListener('pageshow', () => {
    flushPendingBroadcast();
    pollServerData();
  });
}
