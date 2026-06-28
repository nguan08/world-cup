import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

try {
  execSync('git fetch origin main', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.warn('[pull-matches] git fetch failed — using last fetched origin/main');
}

let remoteData;
try {
  const raw = execSync('git show origin/main:data.json', { cwd: ROOT, encoding: 'utf8' });
  remoteData = JSON.parse(raw);
} catch (e) {
  console.error('[pull-matches] Failed to read origin/main:data.json:', e.message);
  process.exit(1);
}

if (!Array.isArray(remoteData.matches)) {
  console.error('[pull-matches] Remote data.json has no matches array');
  process.exit(1);
}

function matchKey(home, away) {
  return `${home}|${away}`;
}

const localData = readJson(DATA_PATH);
const localMatches = Array.isArray(localData.matches) ? localData.matches : [];
const before = localMatches.length;
const finishedBefore = localMatches.filter((m) => m.status === 'finished').length;
const knockoutBefore = localMatches.filter((m) => m.isKnockout).length;

const remoteKeys = new Set(remoteData.matches.map((m) => matchKey(m.home, m.away)));
const preservedKnockout = localMatches.filter(
  (m) => m.isKnockout && !remoteKeys.has(matchKey(m.home, m.away))
);

localData.matches = [...remoteData.matches, ...preservedKnockout];

writeJson(DATA_PATH, localData);

const finishedAfter = localData.matches.filter((m) => m.status === 'finished').length;
const knockoutAfter = localData.matches.filter((m) => m.isKnockout).length;
console.log(`[pull-matches] Updated matches only in data.json`);
console.log(`  local before: ${before} matches (${finishedBefore} finished, ${knockoutBefore} knockout)`);
console.log(`  from Git:     ${remoteData.matches.length} matches`);
console.log(`  kept knockout: ${preservedKnockout.length} local fixture(s) not yet on Git`);
console.log(`  total now:    ${localData.matches.length} matches (${finishedAfter} finished, ${knockoutAfter} knockout)`);
console.log(`  kept: players (${(localData.players || []).length}), eliminatedTeams (${(localData.eliminatedTeams || []).length})`);