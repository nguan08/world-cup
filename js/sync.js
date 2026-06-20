import {
  matches, players, isSyncEnabled, manualEliminatedTeams,
  lastDataRefreshTime, autoRefreshTimer, AUTO_REFRESH_INTERVAL_MS
} from './state.js';
import { INITIAL_MATCHES, INITIAL_PLAYERS } from './constants.js';
import { recalculateAll } from './scoring.js';
import { notifyDataUpdate } from './notifications.js';

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

async function initData() {
  let serverData = { matches: [], players: [], eliminatedTeams: [] };
  
  // 1. Detect if synchronization backend is enabled
  window.isSyncEnabled = false;
  try {
    const statusRes = await fetch('/api/status');
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.sync) {
        isSyncEnabled = true;
        window.isSyncEnabled = true;
      }
    }
  } catch (e) {
    console.log('[Sync] Synchronization backend is disabled (static pages or offline)');
  }

  // 2. Fetch server data with cache busting to ensure the latest file is loaded
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (e) {
    console.error('Failed to fetch data.json from server:', e);
  }

  const hasServerData = serverData.matches && serverData.matches.length > 0;
  if (hasServerData) {
    const localMatchesStr = localStorage.getItem('worldcup_matches');
    const serverMatchesStr = JSON.stringify(serverData.matches || []);
    if (localMatchesStr !== serverMatchesStr) {
      // Server data newer than cache — localStorage refreshed below
      clearCachedData();
    }
  }

  // 3. Load database state
  if (isSyncEnabled && serverData.matches && serverData.matches.length > 0) {

    matches = serverData.matches;
    players = serverData.players || [];
    manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
    
    // Fallback sync to localstorage so offline fallback is close to last saved state
    localStorage.setItem('worldcup_matches', JSON.stringify(matches));
    localStorage.setItem('worldcup_players', JSON.stringify(players));
    localStorage.setItem('worldcup_eliminated_teams', JSON.stringify(Array.from(manualEliminatedTeams)));
  } else {

    const storedMatches = localStorage.getItem('worldcup_matches');
    const storedPlayers = localStorage.getItem('worldcup_players');
    
    // Load override lists from localStorage with safety try-catch
    let manuallyEditedMatches = [];
    try {
      manuallyEditedMatches = JSON.parse(localStorage.getItem('worldcup_manually_edited_matches') || '[]');
      if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
    } catch (e) {
      console.error('Failed to parse manually edited matches:', e);
    }

    let deletedMatches = [];
    try {
      deletedMatches = JSON.parse(localStorage.getItem('worldcup_deleted_matches') || '[]');
      if (!Array.isArray(deletedMatches)) deletedMatches = [];
    } catch (e) {
      console.error('Failed to parse deleted matches:', e);
    }
    
    if (serverData.matches && serverData.matches.length > 0) {
      matches = serverData.matches.filter(m => !deletedMatches.some(id => id == m.id));

      // Preserve any locally manually edited matches on top of the latest server data
      if (storedMatches) {
        const localMatches = JSON.parse(storedMatches);
        localMatches.forEach(lm => {
          if (manuallyEditedMatches.some(id => id == lm.id)) {
            const idx = matches.findIndex(m => m.id == lm.id);
            if (idx !== -1) {
              matches[idx] = { ...matches[idx], ...lm };
            } else {
              matches.push(lm);
            }
          }
        });
      }

      // Migrate: add dates from INITIAL_MATCHES or server matches if missing
      matches.forEach(m => {
        if (!m.date) {
          const initialMatch = INITIAL_MATCHES.find(im => im.id == m.id) || (serverData.matches && serverData.matches.find(sm => sm.id == m.id));
          if (initialMatch && initialMatch.date) {
            m.date = initialMatch.date;
          }
        }
      });

      localStorage.setItem('worldcup_matches', JSON.stringify(matches));
    } else if (storedMatches) {
      matches = JSON.parse(storedMatches);
      
      // Auto-sync matches from server data (for automated scrapes)
      let updated = false;
      if (serverData.matches && serverData.matches.length > 0) {
        serverData.matches.forEach(sm => {
          // Skip syncing if match is deleted by user (using loose comparison for safety)
          if (deletedMatches.some(id => id == sm.id)) return;
          
          const lmIdx = matches.findIndex(m => m.id == sm.id);
          if (lmIdx !== -1) {
            const lm = matches[lmIdx];
            
            // Skip syncing if match was manually edited by user (using loose comparison for safety)
            if (manuallyEditedMatches.some(id => id == sm.id)) return;
            
            // If server match is finished but local match is pending, auto-update local match
            if (sm.status === 'finished' && lm.status === 'pending') {
              matches[lmIdx] = { ...lm, ...sm };
              updated = true;
            }
          } else {
            // If it's a new match from server not present in local matches, add it
            matches.push(sm);
            updated = true;
          }
        });
      }
      
      // Migrate: add dates from INITIAL_MATCHES or server matches if missing
      matches.forEach(m => {
        if (!m.date) {
          const initialMatch = INITIAL_MATCHES.find(im => im.id == m.id) || (serverData.matches && serverData.matches.find(sm => sm.id == m.id));
          if (initialMatch && initialMatch.date) {
            m.date = initialMatch.date;
            updated = true;
          }
        }
      });
      
      if (updated) localStorage.setItem('worldcup_matches', JSON.stringify(matches));
    } else {
      matches = [...INITIAL_MATCHES];
      // Filter out deleted matches if any exist (using loose comparison for safety)
      if (deletedMatches.length > 0) {
        matches = matches.filter(m => !deletedMatches.some(id => id == m.id));
      }
      localStorage.setItem('worldcup_matches', JSON.stringify(matches));
    }
    
    if (storedPlayers) {
      players = JSON.parse(storedPlayers);
      
      // Auto-sync players from server data if there are new ones
      let updated = false;
      if (serverData.players && serverData.players.length > 0) {
        serverData.players.forEach(sp => {
          if (!players.some(p => p.name === sp.name)) {
            players.push(sp);
            updated = true;
          }
        });
      }
      if (updated) localStorage.setItem('worldcup_players', JSON.stringify(players));
    } else {
      players = (serverData.players && serverData.players.length > 0) ? serverData.players : [...INITIAL_PLAYERS];
      localStorage.setItem('worldcup_players', JSON.stringify(players));
    }
  }

  loadEliminatedTeams();
  lastDataRefreshTime = new Date();
}

let _refreshPage = () => {};
export function registerRefreshPage(fn) {
  _refreshPage = typeof fn === 'function' ? fn : () => {};
}

}

export function updateDataSyncStatus(status = 'idle', extra = '') {
  const el = document.getElementById('data-sync-status');

  if (status === 'updating') {
    el.textContent = 'กำลังอัปเดตข้อมูล...';
    el.className = 'data-sync-status data-sync-status--updating';
    return;
  }
  if (status === 'updated') {
    el.textContent = `อัปเดตล่าสุด ${formatSyncTime(lastDataRefreshTime)}${extra ? ' · ' + extra : ''}`;
    el.className = 'data-sync-status data-sync-status--updated';
    return;
  }
  const syncLabel = isSyncEnabled ? 'ซิงค์อัตโนมัติ' : 'อัปเดตอัตโนมัติ';
  el.textContent = lastDataRefreshTime
    ? `อัปเดตล่าสุด ${formatSyncTime(lastDataRefreshTime)} · ${syncLabel} ทุก 2 นาที`
    : `${syncLabel} ทุก 2 นาที`;
  el.className = 'data-sync-status';
}

export function mergeServerDataIntoLocal(serverData) {
  if (!serverData || !serverData.matches) return false;

  let updated = false;

  if (isSyncEnabled && serverData.matches.length > 0) {
    const newMatchesStr = JSON.stringify(serverData.matches);
    const newPlayersStr = JSON.stringify(serverData.players || []);
    if (JSON.stringify(matches) !== newMatchesStr || JSON.stringify(players) !== newPlayersStr) {
      matches = serverData.matches;
      players = serverData.players || [];
      manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
      localStorage.setItem('worldcup_matches', JSON.stringify(matches));
      localStorage.setItem('worldcup_players', JSON.stringify(players));
      localStorage.setItem('worldcup_eliminated_teams', JSON.stringify(Array.from(manualEliminatedTeams)));
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
    const lmIdx = matches.findIndex(m => m.id == sm.id);
    if (lmIdx !== -1) {
      if (manuallyEditedMatches.some(id => id == sm.id)) return;
      const lm = matches[lmIdx];
      if (sm.status === 'finished' && lm.status === 'pending') {
        matches[lmIdx] = { ...lm, ...sm };
        updated = true;
      } else if (JSON.stringify(lm) !== JSON.stringify(sm) && sm.status === 'finished') {
        matches[lmIdx] = { ...lm, ...sm };
        updated = true;
      }
    } else {
      matches.push(sm);
      updated = true;
    }
  });

  if (serverData.players && serverData.players.length > 0) {
    serverData.players.forEach(sp => {
      if (!players.some(p => p.name === sp.name)) {
        players.push(sp);
        updated = true;
      }
    });
  }

  if (updated) {
    localStorage.setItem('worldcup_matches', JSON.stringify(matches));
    localStorage.setItem('worldcup_players', JSON.stringify(players));
  }

  return updated;
}

async function pollServerData() {
  if (document.hidden) return;


export function refreshActivePage() {
  _refreshPage();
}

    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const serverData = await res.json();
    const changed = mergeServerDataIntoLocal(serverData);
    if (changed) {
      updateDataSyncStatus('updating');
      recalculateAll();
      _refreshPage();
      lastDataRefreshTime = new Date();
      updateDataSyncStatus('updated', 'มีข้อมูลใหม่');
      notifyDataUpdate({ type: 'data' });
    }
  } catch (e) {
    // Offline — skip silently
  }
}

function setupAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);

  updateDataSyncStatus();
  autoRefreshTimer = setInterval(pollServerData, AUTO_REFRESH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollServerData();
  });
}

// Lock background scroll while player stats drawer is open (prevents scroll chaining on mobile/desktop)
let _playerDrawerSavedScrollY = 0;
