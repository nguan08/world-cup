/**
 * Force-sync match scores + players from origin/main (source of truth),
 * while preserving any local-only fixtures (e.g. 3rd place / final).
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'data.json');

function matchKey(m) {
  return `${m.home}|${m.away}`;
}

try {
  execSync('git fetch origin main', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.warn('[sync-scores] git fetch failed — using last fetched origin/main');
}

const remote = JSON.parse(
  execSync('git show origin/main:data.json', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
);
const local = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

if (!Array.isArray(remote.matches) || !Array.isArray(remote.players)) {
  console.error('[sync-scores] origin/main:data.json missing matches/players');
  process.exit(1);
}

// Prefer remote match scores as source of truth.
// Keep only true local-only fixtures (by id + team names not on remote).
const remoteIds = new Set(remote.matches.map((m) => m.id));
const remoteKeys = new Set(remote.matches.map(matchKey));
const localOnly = (local.matches || []).filter((m) => {
  if (remoteIds.has(m.id)) return false;
  if (remoteKeys.has(matchKey(m))) return false;
  // Drop corrupted local rows (replacement chars / mojibake)
  const blob = `${m.home || ''}${m.away || ''}`;
  if (blob.includes('\uFFFD') || /�/.test(blob)) return false;
  return true;
});

const mergedMatches = [
  ...remote.matches.map((m) => ({ ...m })),
  ...localOnly.map((m) => ({ ...m })),
];

// Ensure Spain vs Argentina final is flagged if present
for (const m of mergedMatches) {
  if (m.home === 'สเปน' && m.away === 'อาร์เจนตินา' && m.date === '2026-07-19') {
    m.isFinal = true;
    m.isKnockout = true;
  }
}

const beforePlayers = JSON.stringify(local.players);
const afterPlayers = JSON.stringify(remote.players);
const playersChanged = beforePlayers !== afterPlayers;

local.matches = mergedMatches;
local.players = remote.players.map((p) => ({ ...p }));
if (Array.isArray(remote.eliminatedTeams)) {
  local.eliminatedTeams = [...remote.eliminatedTeams];
}
if (remote.broadcast) {
  local.broadcast = remote.broadcast;
}

fs.writeFileSync(DATA_PATH, `${JSON.stringify(local, null, 2)}\n`, 'utf8');

const finished = local.matches.filter((m) => m.status === 'finished').length;
const pending = local.matches.filter((m) => m.status !== 'finished').length;
console.log('[sync-scores] Synced from origin/main:data.json');
console.log(`  matches: ${remote.matches.length} from git + ${localOnly.length} local-only = ${local.matches.length}`);
console.log(`  finished: ${finished}, pending: ${pending}`);
console.log(`  players: ${local.players.length} (replaced from git: ${playersChanged})`);
console.log(`  eliminatedTeams: ${(local.eliminatedTeams || []).length}`);
if (localOnly.length) {
  for (const m of localOnly) {
    console.log(`  kept local: #${m.id} ${m.home} vs ${m.away} (${m.date}) ${m.status}${m.isFinal ? ' FINAL' : ''}`);
  }
}
