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

const localData = readJson(DATA_PATH);
const before = Array.isArray(localData.matches) ? localData.matches.length : 0;
const finishedBefore = (localData.matches || []).filter((m) => m.status === 'finished').length;

localData.matches = remoteData.matches;

writeJson(DATA_PATH, localData);

const finishedAfter = remoteData.matches.filter((m) => m.status === 'finished').length;
console.log(`[pull-matches] Updated matches only in data.json`);
console.log(`  local before: ${before} matches (${finishedBefore} finished)`);
console.log(`  from Git:     ${remoteData.matches.length} matches (${finishedAfter} finished)`);
console.log(`  kept: players (${(localData.players || []).length}), eliminatedTeams (${(localData.eliminatedTeams || []).length})`);