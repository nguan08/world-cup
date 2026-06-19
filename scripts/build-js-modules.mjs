/**
 * Splits monolithic app.js into ES modules under js/
 * Run: node scripts/build-js-modules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'app.js');
const OUT = path.join(ROOT, 'js');

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const slice = (start, end) => lines.slice(start - 1, end).join('\n');

function exportify(code) {
  return code
    .replace(/^const /gm, 'export const ')
    .replace(/^function /gm, 'export function ');
}

fs.mkdirSync(OUT, { recursive: true });

// ── constants.js (lines 3–2258) ──
fs.writeFileSync(
  path.join(OUT, 'constants.js'),
  `// Team data, initial seed, formatting helpers\n${exportify(slice(3, 2258))}\n`
);

// ── state.js ──
fs.writeFileSync(
  path.join(OUT, 'state.js'),
  `// Shared mutable application state
export const ADMIN_PASSWORD = '123456';

export let matches = [];
export let players = [];
export let isAdmin = false;
export let isSyncEnabled = false;

export let simulationScores = {};

export let lastDataRefreshTime = null;
export let autoRefreshTimer = null;
export const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

export let teamPoints = {};
export let processedPlayers = [];
export let manualEliminatedTeams = new Set();
export let lastHighlightPlayer = '';
export let teamMatchesPlayedCounts = {};

export let _playerDrawerSavedScrollY = 0;
export let _playerDrawerScrollLocked = false;

export let chartHoverPlayer = '';
export let chartPulseAnimPlayer = '';

export let statsSortState = { key: 'points', dir: 'desc' };
export let statsSortHandlersReady = false;

export let _rankSpeechVoice = null;
export let _maxPopularityCache = null;
`
);

// ── utils.js ──
fs.writeFileSync(
  path.join(OUT, 'utils.js'),
  `import { elCache } from './state-internal.js';

${exportify(slice(2260, 2268))}

export function getCachedEl(id) {
  if (!elCache[id]) elCache[id] = document.getElementById(id);
  return elCache[id];
}

export function debounce(fn, delay = 120) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
`
);

// elCache is used by getCachedEl - put in state-internal or state.js
// Fix: add elCache to state.js
const stateContent = fs.readFileSync(path.join(OUT, 'state.js'), 'utf8');
fs.writeFileSync(
  path.join(OUT, 'state.js'),
  stateContent.replace(
    'export let teamMatchesPlayedCounts = {};\n',
    'export let teamMatchesPlayedCounts = {};\nexport const elCache = {};\n'
  )
);

fs.writeFileSync(
  path.join(OUT, 'state-internal.js'),
  `// Re-export elCache for utils without circular imports
export { elCache } from './state.js';
`
);

// Fix utils to import from state.js directly
fs.writeFileSync(
  path.join(OUT, 'utils.js'),
  `import { elCache } from './state.js';

${exportify(slice(2260, 2268))}

export function getCachedEl(id) {
  if (!elCache[id]) elCache[id] = document.getElementById(id);
  return elCache[id];
}

export function debounce(fn, delay = 120) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
`
);
fs.unlinkSync(path.join(OUT, 'state-internal.js'));

// ── scoring.js ──
fs.writeFileSync(
  path.join(OUT, 'scoring.js'),
  `import { TEAMS, INITIAL_MATCHES } from './constants.js';
import {
  matches, players, manualEliminatedTeams, isSyncEnabled,
  teamPoints, processedPlayers, teamMatchesPlayedCounts
} from './state.js';

${exportify(slice(2561, 2655))}

${exportify(slice(2657, 2686))}

${exportify(slice(2688, 2878))}

${exportify(slice(2904, 2909))}

${exportify(slice(2911, 2915))}

${exportify(slice(2917, 2923))}

${exportify(slice(2932, 2931))}

${exportify(slice(2940, 2953))}

${exportify(slice(2961, 2966))}
`
);

// Append saveEliminatedTeams
const scoringFix = fs.readFileSync(path.join(OUT, 'scoring.js'), 'utf8');
fs.writeFileSync(
  path.join(OUT, 'scoring.js'),
  scoringFix.replace(
    'export function recalculateAll',
    `${exportify(slice(2932, 2938))}\n\nexport function recalculateAll`
  )
);

// ── admin.js ──
fs.writeFileSync(
  path.join(OUT, 'admin.js'),
  `import { isAdmin } from './state.js';
import { getCachedEl } from './utils.js';

${exportify(slice(2286, 2338))}
`
);

// ── sync.js (will be patched with notifications after creation) ──
const syncBody = `${exportify(slice(2341, 2350))}

${exportify(slice(2352, 2526))}

${exportify(slice(2528, 2559))}

let _refreshPage = () => {};
export function registerRefreshPage(fn) {
  _refreshPage = typeof fn === 'function' ? fn : () => {};
}

${exportify(slice(2982, 2985))}

${exportify(slice(2987, 3005))}

${exportify(slice(3007, 3073))}
`;

fs.writeFileSync(
  path.join(OUT, 'sync.js'),
  `import {
  matches, players, isSyncEnabled, manualEliminatedTeams,
  lastDataRefreshTime, autoRefreshTimer, AUTO_REFRESH_INTERVAL_MS
} from './state.js';
import { INITIAL_MATCHES, INITIAL_PLAYERS } from './constants.js';
import { recalculateAll } from './scoring.js';
import { notifyDataUpdate } from './notifications.js';

${syncBody}

export function refreshActivePage() {
  _refreshPage();
}

${slice(3075, 3092)
  .replace('async function pollServerData', 'export async function pollServerData')
  .replace('refreshActivePage();', '_refreshPage();')
  .replace(
    "updateDataSyncStatus('updated', 'มีข้อมูลใหม่');",
    `updateDataSyncStatus('updated', 'มีข้อมูลใหม่');
      notifyDataUpdate({ type: 'data' });`
  )}

${exportify(slice(3094, 3102))}
`
);

// ── bundle.js: everything else ──
const EXCLUDE_RANGES = [
  [2260, 2268],   // escapeHtml -> utils
  [2270, 2284],   // state
  [2286, 2338],   // admin
  [2341, 2559],   // sync start + initData + saveToServer
  [2561, 2966],   // scoring + recalculate
  [2887, 2903],   // state + getCachedEl/debounce (duplicate)
  [2968, 3102],   // refresh + sync
];

function isExcluded(lineNum) {
  return EXCLUDE_RANGES.some(([a, b]) => lineNum >= a && lineNum <= b);
}

const bundleLines = [];
for (let i = 2260; i <= lines.length; i++) {
  if (!isExcluded(i)) bundleLines.push(lines[i - 1]);
}

const bundleImports = `// UI, rendering, events, player drawer, team popup
import {
  TEAMS, INITIAL_MATCHES, INITIAL_PLAYERS,
  getTeamWcGroup, formatWcGroupLabel, formatZoneDisplayLabel,
  getZoneBadgeClass, getWcGroupBadgeHtml, getTeamFlagHtml
} from './constants.js';
import {
  ADMIN_PASSWORD, matches, players, isAdmin, isSyncEnabled,
  simulationScores, lastDataRefreshTime, teamPoints, processedPlayers,
  manualEliminatedTeams, lastHighlightPlayer, teamMatchesPlayedCounts,
  _playerDrawerSavedScrollY, _playerDrawerScrollLocked,
  chartHoverPlayer, chartPulseAnimPlayer,
  statsSortState, statsSortHandlersReady,
  _rankSpeechVoice, _maxPopularityCache
} from './state.js';
import { escapeHtml, getCachedEl, debounce } from './utils.js';
import {
  calculateTeamPoints, calculatePredictionPoints, processPlayers,
  recalculateAll, updateTeamMatchesPlayedCounts, getPlayerTotalMatchesPlayed,
  loadEliminatedTeams, saveEliminatedTeams, isTeamEliminated
} from './scoring.js';
import {
  initData, saveToServer, clearCachedData,
  setupAutoRefresh, updateDataSyncStatus, registerRefreshPage
} from './sync.js';
import { initAdminState, updateAdminUI } from './admin.js';
import { initPWA } from './pwa.js';
import { initNotifications, notifyDataUpdate } from './notifications.js';

`;

let bundleCode = bundleImports + bundleLines.join('\n');

// Export functions needed on window
bundleCode += `

export {
  handleSimulationScoreChange,
  refreshActivePage,
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
`;

// refreshActivePage is in sync.js - bundle defines the real one
// Replace: bundle has refreshActivePage function, register it
bundleCode = bundleCode.replace(
  'export {\n  handleSimulationScoreChange,\n  refreshActivePage,',
  'export {\n  handleSimulationScoreChange,'
);

// Add refreshActivePage implementation registration at end of bootstrap
bundleCode = bundleCode.replace(
  'document.addEventListener(\'DOMContentLoaded\', async () => {',
  `export function refreshActivePage() {
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
  initNotifications();`
);

// Remove duplicate refreshActivePage if still in bundle from original
bundleCode = bundleCode.replace(
  /export function refreshActivePage\(\) \{[\s\S]*?else if \(id === 'payout'\) renderPayout\(\);\n\}\n\nexport function refreshActivePage/,
  'export function refreshActivePage'
);

fs.writeFileSync(path.join(OUT, 'bundle.js'), bundleCode);

console.log('Built js/ modules from app.js');
console.log('  constants.js, state.js, utils.js, scoring.js, admin.js, sync.js, bundle.js');