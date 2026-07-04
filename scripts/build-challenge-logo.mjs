import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const srcJpg = path.join(ROOT, 'icons', 'yec-br-wc-logo.jpg');
const outSvg = path.join(ROOT, 'icons', 'yec-br-wc-challenge-logo.svg');

const b64 = fs.readFileSync(srcJpg).toString('base64');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" role="img" aria-label="YEC-BR World Cup 2026 Challenge">
  <defs>
    <clipPath id="trophyClip"><rect x="0" y="0" width="240" height="188"/></clipPath>
  </defs>
  <rect width="240" height="300" rx="28" fill="#ffffff"/>
  <rect x="18" y="18" width="204" height="264" rx="22" fill="#f8fafc"/>
  <image href="data:image/jpeg;base64,${b64}" x="20" y="8" width="200" height="250" preserveAspectRatio="xMidYMin slice" clip-path="url(#trophyClip)"/>
  <rect x="24" y="176" width="192" height="108" fill="#ffffff"/>
  <text x="120" y="206" text-anchor="middle" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="24" font-weight="800" fill="#c9a227" letter-spacing="1">YEC-BR</text>
  <line x1="52" y1="214" x2="188" y2="214" stroke="#c9a227" stroke-width="2"/>
  <text x="120" y="238" text-anchor="middle" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="18" font-weight="800" fill="#111827" letter-spacing="0.5">WORLD CUP 2026</text>
  <text x="120" y="272" text-anchor="middle" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="30" font-weight="900" fill="#111827" letter-spacing="1">CHALLENGE</text>
</svg>
`;

fs.writeFileSync(outSvg, svg, 'utf8');
console.log(`Wrote ${outSvg}`);