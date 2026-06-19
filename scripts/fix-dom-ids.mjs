/**
 * Fix broken DOM ids/classes where state migration inserted app.matches / app.players
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fp = path.join(ROOT, 'js', 'bundle.js');
let code = fs.readFileSync(fp, 'utf8');

const REPLACEMENTS = [
  ['recent-app.matches-container', 'recent-matches-container'],
  ['live-app.matches-container', 'live-matches-container'],
  ['live-app.matches-empty', 'live-matches-empty'],
  ['dashboard-app.matches-grid', 'dashboard-matches-grid'],
  ['live-app.matches-carousel', 'live-matches-carousel'],
  ['live-app.matches-prev', 'live-matches-prev'],
  ['live-app.matches-next', 'live-matches-next'],
  ['live-app.matches-pagination', 'live-matches-pagination'],
  ['stat-total-app.players', 'stat-total-players'],
  ['stat-played-app.matches', 'stat-played-matches'],
  ['table-app.matches-cell', 'table-matches-cell'],
  ['tools-sim-app.matches', 'tools-sim-matches'],
  ['#app.players-team-filter-checkboxes-container', '#players-team-filter-checkboxes-container'],
  ['app.players-team-badge', 'players-team-badge'],
  ['player-team-app.matches--empty', 'player-team-matches--empty'],
  ['player-team-app.matches', 'player-team-matches'],
  ['app.matches-export-table-card', 'matches-export-table-card'],
  ['team-app.players-list-item', 'team-players-list-item'],
  ['team-app.players-popup__team', 'team-players-popup__team'],
  ['team-app.players-popup__label', 'team-players-popup__label'],
  ['team-app.players-popup__meta', 'team-players-popup__meta'],
  ['team-app.players-list-small', 'team-players-list-small'],
  ['team-app.players-popup', 'team-players-popup'],
];

for (const [from, to] of REPLACEMENTS) {
  code = code.split(from).join(to);
}

fs.writeFileSync(fp, code);
console.log('Fixed DOM ids/classes in bundle.js');