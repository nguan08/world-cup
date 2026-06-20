/**
 * Verify calculated scores using app.js scoring functions + live data.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const lines = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('\n');
const slice = (s, e) => lines.slice(s - 1, e).join('\n');

const code = [
  slice(3, 142),
  'const matches = data.matches;',
  'const players = data.players;',
  'const simulationScores = {};',
  'const isSyncEnabled = true;',
  'let teamPoints = {};',
  'let processedPlayers = [];',
  'let manualEliminatedTeams = new Set();',
  'let teamMatchesPlayedCounts = {};',
  slice(2546, 2878),
  slice(2898, 2960),
  'recalculateAll();',
  'return {',
  '  finished: matches.filter(m => m.status === "finished").length,',
  '  total: matches.length,',
  '  top: [...processedPlayers].sort((a,b) => b.totalScore - a.totalScore).slice(0, 5).map(p => ({ name: p.name, score: +p.totalScore.toFixed(1) }))',
  '};',
].join('\n');

const result = new Function('data', code)(data);
console.log(JSON.stringify(result, null, 2));