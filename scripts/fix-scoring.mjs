import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n');

let body = lines.slice(2560, 2884).join('\n')
  + '\n' + lines.slice(2904, 2966).join('\n')
  .replace(/^function /gm, 'export function ')
  .replace(/^async function /gm, 'export async function ');

body = body.replace(
  "if (typeof resetTeamPopularityCache === 'function') resetTeamPopularityCache();",
  'if (_recalcHook) _recalcHook();'
);

const header = `import { TEAMS } from './constants.js';
import {
  matches, players, simulationScores, isSyncEnabled,
  manualEliminatedTeams, teamPoints, processedPlayers, teamMatchesPlayedCounts
} from './state.js';
import { saveToServer } from './persist.js';

let _recalcHook = null;
export function setRecalcHook(fn) { _recalcHook = typeof fn === 'function' ? fn : null; }

`;

fs.writeFileSync(path.join(ROOT, 'js', 'scoring.js'), header + body);
console.log('scoring.js fixed');