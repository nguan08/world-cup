import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = path.join(ROOT, 'js');

const STATE_KEYS = [
  'ADMIN_PASSWORD', 'matches', 'players', 'isAdmin', 'isSyncEnabled', 'simulationScores',
  'lastDataRefreshTime', 'autoRefreshTimer', 'AUTO_REFRESH_INTERVAL_MS',
  'teamPoints', 'processedPlayers', 'manualEliminatedTeams', 'lastHighlightPlayer',
  'teamMatchesPlayedCounts', 'elCache', '_playerDrawerSavedScrollY', '_playerDrawerScrollLocked',
  'chartHoverPlayer', 'chartPulseAnimPlayer', 'statsSortState', 'statsSortHandlersReady',
  '_rankSpeechVoice', '_maxPopularityCache'
];

const SKIP_WORDS = new Set([
  'renderMatches', 'getMatchRoundLabel', 'buildLiveMatchCard', 'renderRecentMatches',
  'setupLiveMatchesCarousel', 'deleteMatch', 'getMatchGamePointsForTeam', 'getMatchResultForTeam',
  'openMatchForm', 'closeMatchForm', 'handleMatchFormSubmit', 'exportMatchesImage',
  'INITIAL_MATCHES', 'storedMatches', 'serverMatches', 'localMatches', 'deletedMatches',
  'manuallyEditedMatches', 'newMatch', 'finalMatch', 'targetMatches', 'teamMatches',
  'matchId', 'match-card', 'match-body', 'match-score', 'match-team', 'match-form',
  'matchId', 'ptsMatch', 'sm', 'lm', 'm', 'match'
]);

function migrateContent(code, filename) {
  if (filename === 'state.js') return code;

  // Replace named state imports with app
  code = code.replace(
    /import\s*\{[^}]+\}\s*from\s*['"]\.\/state\.js['"];?\s*\n/g,
    (block) => {
      if (!block.includes('state.js')) return block;
      return "import { app } from './state.js';\n";
    }
  );

  // persist.js special: ADMIN_PASSWORD, matches, etc.
  for (const key of STATE_KEYS) {
    const re = new RegExp(`(?<![.\\w])${key}(?![\\w])`, 'g');
    code = code.replace(re, (match, offset) => {
      const before = code.slice(Math.max(0, offset - 30), offset);
      if (before.endsWith('app.') || before.endsWith('export const app')) return match;
      if (key === 'matches' && /renderMatches|INITIAL_MATCHES|storedMatches|serverMatches|localMatches|deletedMatches|manuallyEditedMatches|exportMatches|MatchForm|deleteMatch|getMatch/.test(before + code.slice(offset, offset + 40))) {
        return match;
      }
      return `app.${key}`;
    });
  }

  // Fix double app.app.
  code = code.replace(/app\.app\./g, 'app.');

  // Fix utils elCache import
  code = code.replace(/import \{ app \} from '\.\/state\.js';\nimport \{ app \}/g, "import { app }");

  return code;
}

for (const file of fs.readdirSync(JS_DIR)) {
  if (!file.endsWith('.js')) continue;
  const fp = path.join(JS_DIR, file);
  let code = fs.readFileSync(fp, 'utf8');
  if (!code.includes("from './state.js'") && !code.includes('app.matches') && file !== 'utils.js') {
    if (file === 'utils.js') {
      code = code.replace("import { elCache } from './state.js';", "import { app } from './state.js';");
      code = code.replace(/elCache/g, 'app.elCache');
      fs.writeFileSync(fp, code);
    }
    continue;
  }
  code = migrateContent(code, file);
  fs.writeFileSync(fp, code);
  console.log('migrated', file);
}

console.log('done');