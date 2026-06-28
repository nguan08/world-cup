/**
 * Splits monolithic app.js into ES modules under js/
 * Run: node scripts/build-js-modules.mjs
 *
 * Hand-maintained (not overwritten): state.js, admin.js, scoring.js, sync.js, utils.js, persist.js
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

// ── constants.js (lines 3–142): teams + helpers only; data lives in data.json ──
fs.writeFileSync(
  path.join(OUT, 'constants.js'),
  `// Team data and formatting helpers (match/player data: data.json)\n${exportify(slice(3, 142))}\n\nexport const INITIAL_MATCHES = [];\nexport const INITIAL_PLAYERS = [];\n`
);

// ── bundle.js: UI, rendering, events ──
// Exclude duplicated module code (utils/state/admin/scoring/sync/persist) still in app.js
const BUNDLE_SLICE_START = 148;
const BUNDLE_SLICE_MARKER = '// Lock background scroll while player stats drawer is open';
const bundleMarkerIdx = lines.findIndex(l => l.includes(BUNDLE_SLICE_MARKER));
if (bundleMarkerIdx < 0) {
  throw new Error(`build-js-modules: marker not found: ${BUNDLE_SLICE_MARKER}`);
}
const BUNDLE_SLICE_END = bundleMarkerIdx; // 1-based line before marker = bundleMarkerIdx (0-based index)

const bundleLines = lines.slice(BUNDLE_SLICE_END);

const bundleImports = `// UI, rendering, events, player drawer, team popup
import {
  TEAMS, TEAM_WC_GROUP_MEMBERS, INITIAL_MATCHES, INITIAL_PLAYERS,
  getTeamWcGroup, formatWcGroupLabel, formatZoneDisplayLabel,
  getZoneBadgeClass, getWcGroupBadgeHtml, getTeamFlagHtml, getTeamFlagUrl
} from './constants.js';
import { app } from './state.js';
import { escapeHtml, getCachedEl, debounce, toFieldSlug } from './utils.js';
import {
  calculateTeamPoints, calculatePredictionPoints, processPlayers, getTeamByName,
  recalculateAll, updateTeamMatchesPlayedCounts, getPlayerTotalMatchesPlayed,
  loadEliminatedTeams, saveEliminatedTeams, isTeamEliminated, getPlayerRemainingTeamCount, setRecalcHook
} from './scoring.js';
import {
  initData, clearCachedData,
  setupAutoRefresh, updateDataSyncStatus, registerRefreshPage
} from './sync.js';
import { saveToServer, saveEliminatedTeamsToServer, sendBroadcastNotification, saveAdminScoreUpdate } from './persist.js';
import { initAdminState, updateAdminUI, openAdminLoginModal } from './admin.js';
import { initPWA } from './pwa.js';
import { initNotifications, notifyDataUpdate } from './notifications.js';
import { initRoomUI } from './room-ui.js';

`;

let bundleBody = bundleLines.join('\n');

const STATE_KEYS = [
  'ADMIN_PASSWORD', 'matches', 'players', 'isAdmin', 'isSyncEnabled', 'simulationScores',
  'lastDataRefreshTime', 'autoRefreshTimer', 'teamPoints', 'processedPlayers',
  'manualEliminatedTeams', 'lastHighlightPlayer', 'lastChartRanks', 'lastChartPlayerRankHistory',
  '_chartRankHistoryCacheKey', '_chartRankHistoryCache', 'teamMatchesPlayedCounts',
  '_playerDrawerSavedScrollY', '_playerDrawerScrollLocked',
  'chartHoverPlayer', 'chartPulseAnimPlayer',
  'statsSortState', 'statsSortHandlersReady', '_rankSpeechVoice', '_maxPopularityCache'
];

const SKIP_WORDS = new Set([
  'renderMatches', 'getMatchRoundLabel', 'buildLiveMatchCard', 'renderRecentMatches',
  'setupLiveMatchesCarousel', 'deleteMatch', 'getMatchGamePointsForTeam', 'getMatchResultForTeam',
  'openMatchForm', 'closeMatchForm', 'handleMatchFormSubmit', 'exportMatchesImage',
  'INITIAL_MATCHES', 'storedMatches', 'serverMatches', 'localMatches', 'deletedMatches',
  'manuallyEditedMatches', 'newMatch', 'finalMatch', 'targetMatches', 'teamMatches',
  'renderPlayers', 'exportPlayers', 'openPlayerDetails', 'renderPlayer', 'attachPlayer',
  'players-tbody', 'players-page', 'players-table', 'matches-page', 'matches-container',
  'recent-matches', 'live-matches', 'match-card', 'match-body', 'match-score', 'match-team',
  'match-form', 'matchId', 'ptsMatch', 'data-tab'
]);

function migrateBundleState(code) {
  return code.replace(/'[^'\\]*'|"[^"\\]*"|`[^`\\]*`|\/\/[^\n]*|\b[A-Za-z_$][\w$]*\b/g, (token, offset, full) => {
    if (token.startsWith("'") || token.startsWith('"') || token.startsWith('`') || token.startsWith('//')) {
      return token;
    }
    if (!STATE_KEYS.includes(token)) return token;
    const rest = full.slice(offset + token.length);
    if (/^\s*:/.test(rest)) return token;
    const charBefore = offset > 0 ? full[offset - 1] : '';
    const charAfter = rest.length > 0 ? rest[0] : '';
    // Keep CSS class / slug fragments (player-team-matches, team-players-list-item)
    if (charBefore === '-' || charAfter === '-') return token;
    if (charBefore === '.') {
      const prefix = full.slice(Math.max(0, offset - 4), offset);
      if (prefix.endsWith('app.')) return token;
      if (!prefix.endsWith('...') && !prefix.endsWith('..')) return token;
    }
    if (SKIP_WORDS.has(token)) return token;
    const before = full.slice(Math.max(0, offset - 12), offset);
    if (token.startsWith('_') && /\b(let|const|var)\s+$/.test(before)) return token;
    return `app.${token}`;
  });
}

function fixBareStateCodeRefs(code) {
  const rules = [
    [/(?<![.\w$-])matches\.(filter|find|forEach|push|some|map|sort|length)/g, 'app.matches.$1'],
    [/(?<![.\w$-])matches\s*(?=[=;,\]\)\n])/g, 'app.matches'],
    [/(?<![.\w$-])\[\.\.\.matches\]/g, '[...app.matches]'],
    [/(?<![.\w$-])JSON\.stringify\(\s*matches\s*\)/g, 'JSON.stringify(app.matches)'],
    [/\bfor\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+matches\b/g, 'for (const $1 of app.matches'],
    [/(?<![.\w$-])players\.(filter|find|forEach|push|some|map|findIndex|sort|length)/g, 'app.players.$1'],
    [/(?<![.\w$-])players\s*\.(?=\s*(?:filter|map|find|some|forEach))/g, 'app.players.'],
    [/(?<![.\w$-])players\s*(?=[=;,\]\)\n])/g, 'app.players'],
    [/(?<![.\w$-])JSON\.stringify\(\s*players\s*\)/g, 'JSON.stringify(app.players)'],
    [/\bfor\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+players\b/g, 'for (const $1 of app.players'],
    [/(?<![.\w$-])processedPlayers(?!\.)(?!\s*:)/g, 'app.processedPlayers'],
    [/(?<![.\w$-])processedPlayers\./g, 'app.processedPlayers.'],
    [/(?<![.\w$-])simulationScores\b/g, 'app.simulationScores'],
    [/(?<![.\w$-])isAdmin\b/g, 'app.isAdmin'],
    [/(?<![.\w$-])isSyncEnabled\b/g, 'app.isSyncEnabled'],
    [/(?<![.\w$-])statsSortState\b/g, 'app.statsSortState'],
    [/(?<![.\w$-])teamPoints\b/g, 'app.teamPoints'],
    [/(?<![.\w$-])manualEliminatedTeams\b/g, 'app.manualEliminatedTeams'],
    [/(?<![.\w$-])lastHighlightPlayer\b/g, 'app.lastHighlightPlayer'],
    [/(?<![.\w$-])teamMatchesPlayedCounts\b/g, 'app.teamMatchesPlayedCounts'],
    [/(?<![.\w$-])chartHoverPlayer\b/g, 'app.chartHoverPlayer'],
    [/(?<![.\w$-])chartPulseAnimPlayer\b/g, 'app.chartPulseAnimPlayer'],
    [/(?<![.\w$-])statsSortHandlersReady\b/g, 'app.statsSortHandlersReady'],
    [/(?<![.\w$-])lastDataRefreshTime\b/g, 'app.lastDataRefreshTime'],
    [/(?<![.\w$-])autoRefreshTimer\b/g, 'app.autoRefreshTimer'],
    [/(?<![.\w$-])ADMIN_PASSWORD\b/g, 'app.ADMIN_PASSWORD'],
  ];
  for (const [re, repl] of rules) {
    code = code.replace(re, repl);
  }
  return code.replace(/app\.app\./g, 'app.');
}

function fixQuotedStateKeyCorruption(code) {
  const tabIds = ['matches', 'players', 'statistics', 'teams', 'tools', 'dashboard', 'leaderboard', 'payout'];
  for (const key of tabIds) {
    code = code.replace(new RegExp(`'app\\.${key}'`, 'g'), `'${key}'`);
    code = code.replace(new RegExp(`"app\\.${key}"`, 'g'), `"${key}"`);
  }
  return code;
}

function fixCorruptedClassNames(code) {
  return code
    .replace(/player-team-app\.matches/g, 'player-team-matches')
    .replace(/app\.matches-export/g, 'matches-export')
    .replace(/team-app\.players/g, 'team-players');
}

// Drop scoring helpers that are imported from scoring.js (avoid duplicate declarations in bundle)
const SCORING_EXPORTS_STRIPPED = ['getPlayerRemainingTeamCount'];
for (const fn of SCORING_EXPORTS_STRIPPED) {
  bundleBody = bundleBody.replace(
    new RegExp(`^function ${fn}\\([^)]*\\)\\s*\\{[^}]*\\}\\s*\\n`, 'm'),
    ''
  );
}

bundleBody = migrateBundleState(bundleBody);

function fixTemplateLiteralStateRefs(code) {
  for (const key of STATE_KEYS) {
    code = code.replace(new RegExp(`\\$\\{${key}\\.`, 'g'), `\${app.${key}.`);
    code = code.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), `\${app.${key}}`);
    code = code.replace(new RegExp(`\\$\\{${key} `, 'g'), `\${app.${key} `);
  }
  return code;
}

bundleBody = fixTemplateLiteralStateRefs(bundleBody);

function fixUnderscoreStateAssignments(code) {
  for (const key of STATE_KEYS) {
    if (!key.startsWith('_')) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // let _foo = 0 → app._foo = 0  (invalid: let app._foo)
    code = code.replace(
      new RegExp(`\\b(let|const|var)\\s+${escaped}\\s*=`, 'g'),
      `app.${key} =`
    );
    code = code.replace(
      new RegExp(`(^|[^a-zA-Z0-9_.])${escaped}(?=\\s*[=;,)])`, 'gm'),
      (match, prefix) => (prefix.endsWith('app.') ? match : `${prefix}app.${key}`)
    );
  }
  return code;
}

bundleBody = fixUnderscoreStateAssignments(bundleBody);
bundleBody = fixBareStateCodeRefs(bundleBody);
bundleBody = fixQuotedStateKeyCorruption(bundleBody);
bundleBody = fixCorruptedClassNames(bundleBody);

function fixInvalidLetAppAssignments(code) {
  return code.replace(/\b(let|const|var)\s+(app\.\w+)\s*=/g, '$2 =');
}

bundleBody = fixInvalidLetAppAssignments(bundleBody);

let bundleCode = bundleImports + bundleBody;

bundleCode += `

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
`;

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
  initRoomUI();
  initPWA();
  initNotifications();
  setRecalcHook(resetTeamPopularityCache);`
);

bundleCode = bundleCode.replace(
  /export function refreshActivePage\(\) \{[\s\S]*?else if \(id === 'payout'\) renderPayout\(\);\n\}\n\nexport function refreshActivePage/,
  'export function refreshActivePage'
);

// Remove duplicate refreshActivePage from original app.js slice
bundleCode = bundleCode.replace(
  /\nfunction refreshActivePage\(\) \{[\s\S]*?else if \(id === 'payout'\) renderPayout\(\);\n\}/,
  ''
);

fs.writeFileSync(path.join(OUT, 'bundle.js'), bundleCode);

console.log('Built js/ modules from app.js');
console.log('  constants.js, bundle.js (state/admin/scoring/sync/utils preserved)');