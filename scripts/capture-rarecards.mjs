/**
 * Capture rarecard print preview samples.
 * Usage: node scripts/capture-rarecards.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'rarecard-previews');
const BASE = 'http://127.0.0.1:8080';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1500, height: 1100 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log('[capture] open app');
await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1200);

// Open admin login
await page.click('#admin-login-toggle-btn');
await page.waitForSelector('#admin-login-overlay.active, #admin-password-input', { timeout: 8000 });
await page.fill('#admin-password-input', '123456');
// room select if required
const roomSelect = page.locator('#admin-room-select');
if (await roomSelect.count()) {
  const opts = await roomSelect.locator('option').all();
  if (opts.length > 1) {
    const val = await opts[1].getAttribute('value');
    if (val) await roomSelect.selectOption(val);
  }
}
await page.locator('#admin-login-submit-btn').click({ force: true });
await page.waitForTimeout(1200);

// Wait rarecard button
await page.waitForFunction(() => {
  const b = document.getElementById('rarecard-btn');
  return b && getComputedStyle(b).display !== 'none';
}, { timeout: 10000 }).catch(() => {});

const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
await page.evaluate(() => {
  const b = document.getElementById('rarecard-btn');
  if (b) {
    b.style.display = 'flex';
    b.click();
  }
});

let printPage = await popupPromise;
if (!printPage) {
  // maybe same-tab debug
  await page.waitForTimeout(2000);
  printPage = page;
} else {
  await printPage.waitForLoadState('domcontentloaded');
  await printPage.waitForTimeout(2000);
}

await printPage.waitForSelector('.rc-card', { timeout: 20000 });
const count = await printPage.locator('.rc-card').count();
console.log('[capture] cards:', count);

// Full first print page
const printSection = printPage.locator('.rc-print-page').first();
if (await printSection.count()) {
  await printSection.screenshot({
    path: path.join(OUT_DIR, 'sheet-page1.jpg'),
    type: 'jpeg',
    quality: 92,
  });
} else {
  await printPage.screenshot({
    path: path.join(OUT_DIR, 'sheet-page1.jpg'),
    type: 'jpeg',
    quality: 90,
  });
}

// Individual samples: first 6 + last 1 if available
const n = Math.min(6, count);
for (let i = 0; i < n; i++) {
  await printPage.locator('.rc-card').nth(i).screenshot({
    path: path.join(OUT_DIR, `card-rank-${i + 1}.jpg`),
    type: 'jpeg',
    quality: 94,
  });
}
if (count > 6) {
  await printPage.locator('.rc-card').nth(count - 1).screenshot({
    path: path.join(OUT_DIR, 'card-last.jpg'),
    type: 'jpeg',
    quality: 94,
  });
}

console.log('[capture] saved to', OUT_DIR);
await browser.close();
