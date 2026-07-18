import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const localPath = path.join(ROOT, 'data.json');
const remotePath = path.join(ROOT, '.tmp-remote-data.json');

execSync('git fetch origin main', { cwd: ROOT, stdio: 'inherit' });
const raw = execSync('git show origin/main:data.json', {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
fs.writeFileSync(remotePath, raw, 'utf8');

const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
const remote = JSON.parse(fs.readFileSync(remotePath, 'utf8'));

console.log(`local matches ${local.matches.length} | remote ${remote.matches.length}`);
console.log(`local finished ${local.matches.filter((m) => m.status === 'finished').length} | remote ${remote.matches.filter((m) => m.status === 'finished').length}`);

const rById = new Map(remote.matches.map((m) => [m.id, m]));
const lById = new Map(local.matches.map((m) => [m.id, m]));

const scoreDiffs = [];
for (const [id, r] of rById) {
  const l = lById.get(id);
  if (!l) {
    scoreDiffs.push({ id, type: 'missing-local', remote: `${r.home} ${r.homeScore}-${r.awayScore} ${r.away}` });
    continue;
  }
  if (
    l.homeScore !== r.homeScore ||
    l.awayScore !== r.awayScore ||
    l.status !== r.status ||
    (l.penaltyWinner || null) !== (r.penaltyWinner || null)
  ) {
    scoreDiffs.push({
      id,
      match: `${r.home} vs ${r.away}`,
      local: `${l.homeScore}-${l.awayScore} ${l.status} pen=${l.penaltyWinner ?? null}`,
      remote: `${r.homeScore}-${r.awayScore} ${r.status} pen=${r.penaltyWinner ?? null}`,
    });
  }
}

console.log(`\nMatch score/status diffs: ${scoreDiffs.length}`);
for (const d of scoreDiffs) console.log(JSON.stringify(d, null, 0));

const onlyLocal = [];
for (const [id, l] of lById) {
  if (!rById.has(id)) {
    onlyLocal.push({
      id,
      match: `${l.home} vs ${l.away}`,
      status: l.status,
      score: `${l.homeScore}-${l.awayScore}`,
      isFinal: !!l.isFinal,
    });
  }
}
console.log(`\nOnly local matches: ${onlyLocal.length}`);
for (const d of onlyLocal) console.log(JSON.stringify(d));

const rf = remote.matches.filter((m) => m.isFinal);
const lf = local.matches.filter((m) => m.isFinal);
console.log('\nremote isFinal:', rf.map((m) => `${m.id} ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} ${m.status}`));
console.log('local isFinal:', lf.map((m) => `${m.id} ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} ${m.status}`));

console.log('\nremote last 6:');
for (const m of remote.matches.slice(-6)) {
  console.log(`#${m.id} ${m.date} ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} ${m.status} pen=${m.penaltyWinner ?? null} final=${!!m.isFinal}`);
}
console.log('local last 6:');
for (const m of local.matches.slice(-6)) {
  console.log(`#${m.id} ${m.date} ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} ${m.status} pen=${m.penaltyWinner ?? null} final=${!!m.isFinal}`);
}

// eliminated
const le = [...(local.eliminatedTeams || [])].sort();
const re = [...(remote.eliminatedTeams || [])].sort();
const elimOnlyLocal = le.filter((t) => !re.includes(t));
const elimOnlyRemote = re.filter((t) => !le.includes(t));
console.log(`\neliminated only local: ${elimOnlyLocal.join(', ') || '-'}`);
console.log(`eliminated only remote: ${elimOnlyRemote.join(', ') || '-'}`);

// player guess/teams diffs
const rPlayers = new Map((remote.players || []).map((p) => [p.name, p]));
let playerDiffs = 0;
for (const p of local.players || []) {
  const r = rPlayers.get(p.name);
  if (!r) {
    playerDiffs += 1;
    continue;
  }
  if (JSON.stringify(p.teams) !== JSON.stringify(r.teams) || p.guess !== r.guess) {
    playerDiffs += 1;
    if (playerDiffs <= 5) {
      console.log(`player data diff: ${p.name} guess ${p.guess}->${r.guess}`);
    }
  }
}
console.log(`player roster diffs (name/teams/guess): ${playerDiffs}`);
