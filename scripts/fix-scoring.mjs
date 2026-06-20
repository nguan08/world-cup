/**
 * Regenerates scoring.js from app.js with correct line ranges (1-indexed).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n');
const slice = (start, end) => lines.slice(start - 1, end).join('\n');

const sections = [
  [2558, 2651],
  [2654, 2682],
  [2685, 2881],
  [2901, 2907],
  [2908, 2911],
  [2914, 2926],
  [2929, 2934],
  [2937, 2956],
  [2958, 2963],
];

let body = sections.map(([s, e]) => slice(s, e)).join('\n\n');

body = body
  .replace(/^function /gm, 'export function ')
  .replace(/^async function /gm, 'export async function ')
  .replace(
    "if (typeof resetTeamPopularityCache === 'function') resetTeamPopularityCache();",
    'if (_recalcHook) _recalcHook();'
  );

const STATE_KEYS = [
  'matches', 'players', 'simulationScores', 'isSyncEnabled',
  'manualEliminatedTeams', 'teamPoints', 'processedPlayers', 'teamMatchesPlayedCounts'
];

for (const key of STATE_KEYS) {
  const re = new RegExp(`(?<![.\\w])${key}(?![\\w])`, 'g');
  body = body.replace(re, (match, offset) => {
    const before = body.slice(Math.max(0, offset - 30), offset);
    if (before.endsWith('app.')) return match;
    if (key === 'matches') {
      if (/=\s*$/.test(before)) return 'app.matches';
      if (/targetMatches|finalMatch/.test(before + body.slice(offset, offset + 40))) return match;
    }
    return `app.${key}`;
  });
}

const header = `import { TEAMS } from './constants.js';
import { app } from './state.js';
import { saveToServer } from './persist.js';

let _recalcHook = null;
export function setRecalcHook(fn) { _recalcHook = typeof fn === 'function' ? fn : null; }

`;

fs.writeFileSync(path.join(ROOT, 'js', 'scoring.js'), header + body);
console.log('scoring.js fixed');