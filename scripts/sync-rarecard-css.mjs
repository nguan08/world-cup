import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = fs.readFileSync(path.join(ROOT, 'js/bundle.js'), 'utf8');
const appPath = path.join(ROOT, 'app.js');
const app = fs.readFileSync(appPath, 'utf8');

const markerNew = '/* CMYK / print-safe premium collectible';
const markerOld = '/* CMYK / print-safe: solid colors';
const endMarker = "'<div class=\"rc-pages\">'";

const bStart = bundle.indexOf(markerNew);
const bEnd = bundle.indexOf(endMarker, bStart);
if (bStart < 0 || bEnd < 0) {
  console.error('bundle markers not found', bStart, bEnd);
  process.exit(1);
}
const premiumCssChunk = bundle.slice(bStart, bEnd);

let aStart = app.indexOf(markerOld);
if (aStart < 0) aStart = app.indexOf(markerNew);
const aEnd = app.indexOf(endMarker, aStart > 0 ? aStart : 0);
if (aStart < 0 || aEnd < 0) {
  console.error('app markers not found', aStart, aEnd);
  process.exit(1);
}

const next = app.slice(0, aStart) + premiumCssChunk + app.slice(aEnd);
fs.writeFileSync(appPath, next, 'utf8');
console.log('Synced premium rarecard CSS into app.js');
console.log('has premium:', next.includes(markerNew));
console.log('has podium css:', next.includes('rc-card--podium'));
console.log('has #1-3 text:', next.includes('#1–3 ทอง'));
