import { app } from './state.js';
import { INITIAL_MATCHES, INITIAL_PLAYERS } from './constants.js';
import { recalculateAll, loadEliminatedTeams } from './scoring.js';
import { notifyDataUpdate, processBroadcast, flushPendingBroadcast, updateBroadcastBanner } from './notifications.js';
import { isMobileDevice } from './device.js';
import { saveToServer } from './persist.js';
import { isLocalDevHost, resolveAppPath } from './app-path.js';
import { DEFAULT_ROOM_ID, parseRoomFromUrl, roomStorageKey } from './room.js';
import { fetchRoomFromNetwork } from './room-store.js';

export { saveToServer };

function getRoomCacheKeys(roomId = app.roomId) {
  return {
    matches: roomStorageKey('matches', roomId),
    players: roomStorageKey('players', roomId),
    eliminated: roomStorageKey('eliminated_teams', roomId),
    edited: roomStorageKey('manually_edited_matches', roomId),
    deleted: roomStorageKey('deleted_matches', roomId)
  };
}

export function clearCachedData(roomId = app.roomId) {
  const keys = getRoomCacheKeys(roomId);
  Object.values(keys).forEach((key) => localStorage.removeItem(key));
  // legacy single-room keys
  [
    'worldcup_matches',
    'worldcup_players',
    'worldcup_eliminated_teams',
    'worldcup_manually_edited_matches',
    'worldcup_deleted_matches'
  ].forEach((key) => localStorage.removeItem(key));
}

function readStoredJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function applySeedFallback() {
  const cache = getRoomCacheKeys();
  if (!app.matches?.length && INITIAL_MATCHES.length) {
    app.matches = [...INITIAL_MATCHES];
    localStorage.setItem(cache.matches, JSON.stringify(app.matches));
  }
  if (!app.players?.length && INITIAL_PLAYERS.length && app.roomId === DEFAULT_ROOM_ID) {
    app.players = [...INITIAL_PLAYERS];
    localStorage.setItem(cache.players, JSON.stringify(app.players));
  }
}

async function loadRoomPlayers(serverData) {
  const cache = getRoomCacheKeys();
  const roomData = await fetchRoomFromNetwork(app.roomId);

  if (roomData) {
    app.roomName = roomData.name || app.roomId;
    app.roomCreatedAt = roomData.createdAt || null;
    app.players = Array.isArray(roomData.players) ? roomData.players : [];
    localStorage.setItem(cache.players, JSON.stringify(app.players));
    app.roomLoaded = true;
    return;
  }

  if (app.roomId !== DEFAULT_ROOM_ID) {
    app.roomName = app.roomId;
    app.players = [];
    app.roomLoaded = false;
    return;
  }

  const storedPlayers = readStoredJsonArray(cache.players)
    || readStoredJsonArray('worldcup_players');
  if (storedPlayers) {
    app.players = [...storedPlayers];
  } else if (Array.isArray(serverData.players) && serverData.players.length > 0) {
    app.players = serverData.players;
  } else {
    app.players = [...INITIAL_PLAYERS];
  }
  app.roomName = 'ห้องหลัก';
  app.roomLoaded = true;
  localStorage.setItem(cache.players, JSON.stringify(app.players));
}

export async function initData() {
  app.roomId = parseRoomFromUrl();
  window.__wcRoomId = app.roomId;

  let serverData = { matches: [], players: [], eliminatedTeams: [] };
  const cache = getRoomCacheKeys();
  
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
  let serverFetchOk = false;
  try {
    const res = await fetch(`${resolveAppPath('data.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      serverData = await res.json();
      serverFetchOk = true;
    }
  } catch (e) {
    console.error('Failed to fetch data.json from server:', e);
  }

  const serverMatches = Array.isArray(serverData.matches) ? serverData.matches : [];
  const serverPlayers = Array.isArray(serverData.players) ? serverData.players : [];
  const serverIsBlank = serverFetchOk && serverMatches.length === 0 && serverPlayers.length === 0;

  if (serverIsBlank) {
    clearCachedData();
    app.matches = [...INITIAL_MATCHES];
    app.manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
    localStorage.setItem(cache.matches, JSON.stringify(app.matches));
    localStorage.setItem(cache.eliminated, JSON.stringify(Array.from(app.manualEliminatedTeams)));
    await loadRoomPlayers(serverData);
    if (serverData.broadcast) {
      app.broadcast = serverData.broadcast;
      updateBroadcastBanner(serverData.broadcast);
    }
    processBroadcast(serverData, { onInit: true });
    loadEliminatedTeams();
    app.lastDataRefreshTime = new Date();
    return;
  }

  const hasServerData = serverMatches.length > 0;
  // On GitHub Pages there is no /api/save — treat data.json as the shared source of truth
  if (!app.isSyncEnabled && hasServerData) {
    app.isSyncEnabled = true;
    window.isSyncEnabled = true;
  }
  if (hasServerData) {
    const localMatchesStr = localStorage.getItem(cache.matches) || localStorage.getItem('worldcup_matches');
    const serverMatchesStr = JSON.stringify(serverData.matches || []);
    if (localMatchesStr !== serverMatchesStr) {
      clearCachedData(app.roomId);
    }
  }

  // 3. Load shared match data
  if (app.isSyncEnabled && serverData.matches && serverData.matches.length > 0) {

    app.matches = serverData.matches;
    app.manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
    localStorage.setItem(cache.matches, JSON.stringify(app.matches));
    localStorage.setItem(cache.eliminated, JSON.stringify(Array.from(app.manualEliminatedTeams)));
    await loadRoomPlayers(serverData);
  } else {

    const storedMatches = readStoredJsonArray(cache.matches) || readStoredJsonArray('worldcup_matches');
    
    // Load override lists from localStorage with safety try-catch
    let manuallyEditedMatches = [];
    try {
      manuallyEditedMatches = JSON.parse(localStorage.getItem(cache.edited) || localStorage.getItem('worldcup_manually_edited_matches') || '[]');
      if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
    } catch (e) {
      console.error('Failed to parse manually edited app.matches:', e);
    }

    let deletedMatches = [];
    try {
      deletedMatches = JSON.parse(localStorage.getItem(cache.deleted) || localStorage.getItem('worldcup_deleted_matches') || '[]');
      if (!Array.isArray(deletedMatches)) deletedMatches = [];
    } catch (e) {
      console.error('Failed to parse deleted app.matches:', e);
    }
    
    if (serverData.matches && serverData.matches.length > 0) {
      app.matches = serverData.matches.filter(m => !deletedMatches.some(id => id == m.id));

      // Preserve any locally manually edited app.matches on top of the latest server data
      if (storedMatches) {
        storedMatches.forEach(lm => {
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

      localStorage.setItem(cache.matches, JSON.stringify(app.matches));
    } else if (storedMatches) {
      app.matches = [...storedMatches];
      
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
      
      if (updated) localStorage.setItem(cache.matches, JSON.stringify(app.matches));
    } else {
      app.matches = [...INITIAL_MATCHES];
      if (deletedMatches.length > 0) {
        app.matches = app.matches.filter(m => !deletedMatches.some(id => id == m.id));
      }
      localStorage.setItem(cache.matches, JSON.stringify(app.matches));
    }

    if (serverData.eliminatedTeams) {
      app.manualEliminatedTeams = new Set(serverData.eliminatedTeams);
      localStorage.setItem(cache.eliminated, JSON.stringify(Array.from(app.manualEliminatedTeams)));
    }

    await loadRoomPlayers(serverData);
  }

  if (serverData.broadcast) {
    app.broadcast = serverData.broadcast;
    updateBroadcastBanner(serverData.broadcast);
  }
  processBroadcast(serverData, { onInit: true });

  loadEliminatedTeams();
  applySeedFallback();
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
    ? `อัปเดตล่าสุด ${formatSyncTime(app.lastDataRefreshTime)} · ${syncLabel} ทุก ${isMobileDevice() ? '30 วินาที' : '1 นาที'}`
    : `${syncLabel} ทุก ${isMobileDevice() ? '30 วินาที' : '1 นาที'}`;
  el.className = 'data-sync-status';
}

export async function mergeServerDataIntoLocal(serverData) {
  if (!serverData || !serverData.matches) return false;

  let updated = false;
  const cache = getRoomCacheKeys();

  if (app.isSyncEnabled && serverData.matches.length > 0) {
    const newMatchesStr = JSON.stringify(serverData.matches);
    const elimStr = JSON.stringify(serverData.eliminatedTeams || []);
    if (JSON.stringify(app.matches) !== newMatchesStr
      || JSON.stringify(Array.from(app.manualEliminatedTeams)) !== elimStr) {
      app.matches = serverData.matches;
      app.manualEliminatedTeams = new Set(serverData.eliminatedTeams || []);
      localStorage.setItem(cache.matches, JSON.stringify(app.matches));
      localStorage.setItem(cache.eliminated, JSON.stringify(Array.from(app.manualEliminatedTeams)));
      updated = true;
    }

    const roomData = await fetchRoomFromNetwork(app.roomId);
    if (roomData?.players) {
      const newPlayersStr = JSON.stringify(roomData.players);
      if (JSON.stringify(app.players) !== newPlayersStr) {
        app.players = roomData.players;
        app.roomName = roomData.name || app.roomName;
        localStorage.setItem(cache.players, JSON.stringify(app.players));
        updated = true;
      }
    }
    return updated;
  }

  let manuallyEditedMatches = [];
  let deletedMatches = [];
  try {
    manuallyEditedMatches = JSON.parse(localStorage.getItem(cache.edited) || localStorage.getItem('worldcup_manually_edited_matches') || '[]');
    if (!Array.isArray(manuallyEditedMatches)) manuallyEditedMatches = [];
    deletedMatches = JSON.parse(localStorage.getItem(cache.deleted) || localStorage.getItem('worldcup_deleted_matches') || '[]');
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

  const roomData = await fetchRoomFromNetwork(app.roomId);
  if (roomData?.players?.length) {
    const newPlayersStr = JSON.stringify(roomData.players);
    if (JSON.stringify(app.players) !== newPlayersStr) {
      app.players = roomData.players;
      localStorage.setItem(cache.players, JSON.stringify(app.players));
      updated = true;
    }
  }

  if (updated) {
    localStorage.setItem(cache.matches, JSON.stringify(app.matches));
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
  if (document.hidden) return;
  try {
    const res = await fetch(`${resolveAppPath('data.json')}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const serverData = await res.json();
    const changed = await mergeServerDataIntoLocal(serverData);
    if (serverData.broadcast) {
      app.broadcast = serverData.broadcast;
      updateBroadcastBanner(serverData.broadcast);
    }
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
      } else if (changed && !broadcasted) {
        notifyDataUpdate({ type: 'data', forceBrowserNotify: true });
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
  const intervalMs = isMobileDevice() ? 30 * 1000 : app.AUTO_REFRESH_INTERVAL_MS;
  app.autoRefreshTimer = setInterval(pollServerData, intervalMs);
  setTimeout(pollServerData, 3000);
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
