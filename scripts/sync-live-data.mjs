/**
 * Downloads production data.json (single source of truth).
 * Usage: node scripts/sync-live-data.mjs
 */
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL = 'https://nguan08.github.io/world-cup/data.json';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const live = await fetchJson(LIVE_URL);
if (Array.isArray(live.players)) {
  live.players = live.players.map(({ targetScore, ...p }) => p);
}

fs.writeFileSync(
  path.join(ROOT, 'data.json'),
  `${JSON.stringify(live, null, 2)}\n`,
  'utf8'
);

console.log(`Synced data.json: ${live.matches?.length ?? 0} matches, ${live.players?.length ?? 0} players`);