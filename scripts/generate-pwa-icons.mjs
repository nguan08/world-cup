import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'icons');

async function renderPng(size, outName) {
  const svgPath = path.join(ICONS, `icon-${size}.svg`);
  const svg = fs.readFileSync(svgPath, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:#0f172a">${svg}</body></html>`,
    { waitUntil: 'networkidle' }
  );
  await page.locator('svg').screenshot({ path: path.join(ICONS, outName) });
  await browser.close();
}

await renderPng(192, 'icon-192.png');
await renderPng(512, 'icon-512.png');
console.log('Generated icons/icon-192.png and icons/icon-512.png');