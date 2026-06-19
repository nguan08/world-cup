/**
 * Site smoke + performance test
 * Run: node scripts/test-site-performance.mjs
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8080/';
const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fmtMs(ms) {
  return `${Math.round(ms)}ms`;
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function collectMetrics(page, label) {
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint');
    const resources = performance.getEntriesByType('resource');
    const jsBytes = resources
      .filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);
    const cssBytes = resources
      .filter((r) => r.initiatorType === 'link' || r.name.endsWith('.css'))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);
    const totalBytes = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

    return {
      domContentLoaded: nav?.domContentLoadedEventEnd - nav?.startTime,
      load: nav?.loadEventEnd - nav?.startTime,
      ttfb: nav?.responseStart - nav?.requestStart,
      fcp: fcp?.startTime ?? null,
      jsBytes,
      cssBytes,
      totalBytes,
      resourceCount: resources.length
    };
  });

  pass(`${label} — TTFB`, fmtMs(metrics.ttfb));
  pass(`${label} — DOMContentLoaded`, fmtMs(metrics.domContentLoaded));
  pass(`${label} — Load`, fmtMs(metrics.load));
  if (metrics.fcp != null) pass(`${label} — FCP`, fmtMs(metrics.fcp));
  pass(`${label} — Transfer`, `${fmtKb(metrics.totalBytes)} (JS ${fmtKb(metrics.jsBytes)}, CSS ${fmtKb(metrics.cssBytes)}, ${metrics.resourceCount} resources)`);
  return metrics;
}

async function testViewport(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const t0 = Date.now();
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
    pass(`${name} — โหลดหน้าแรก`, fmtMs(Date.now() - t0));
  } catch (e) {
    fail(`${name} — โหลดหน้าแรก`, e.message);
    await context.close();
    return;
  }

  await collectMetrics(page, name);

  const dashboard = page.locator('#dashboard.active, #dashboard');
  if (await dashboard.count()) pass(`${name} — พบ Dashboard`);
  else fail(`${name} — ไม่พบ Dashboard`);

  const liveCards = page.locator('#recent-matches-container .live-match-card');
  const liveCount = await liveCards.count();
  if (liveCount > 0) {
    pass(`${name} — Live Matches`, `${liveCount} การ์ด`);
    const simInput = page.locator('#recent-matches-container .score-sim-input').first();
    if (await simInput.count()) {
      const tSim = Date.now();
      await simInput.fill('2');
      await page.waitForTimeout(400);
      pass(`${name} — ทดลองใส่คะแนน`, fmtMs(Date.now() - tSim));
    }
  } else {
    pass(`${name} — Live Matches`, 'ไม่มีแมตช์วันนี้/พรุ่งนี้ (empty state)');
  }

  async function openNavTab(tabId) {
    const isMobile = viewport.width < 992;
    if (isMobile) {
      await page.locator('#menu-toggle-btn').click();
      await page.waitForSelector('#sidebar.active', { timeout: 5000 });
    }
    await page.locator(`.nav-item[data-tab="${tabId}"]`).click();
  }

  const pages = [
    ['leaderboard', 'Leaderboard'],
    ['matches', 'Matches'],
    ['players', 'Players'],
    ['statistics', 'Statistics']
  ];

  for (const [id, label] of pages) {
    const tNav = Date.now();
    await openNavTab(id);
    await page.waitForSelector(`#${id}.active`, { timeout: 10000 });
    const elapsed = Date.now() - tNav;
    const ok = elapsed < 2000;
    (ok ? pass : fail)(`${name} — เปิด ${label}`, fmtMs(elapsed));
  }

  if (consoleErrors.length === 0 && pageErrors.length === 0) {
    pass(`${name} — ไม่มี JS error`);
  } else {
    fail(`${name} — JS errors`, [...pageErrors, ...consoleErrors].slice(0, 3).join(' | '));
  }

  await context.close();
}

async function main() {
  console.log(`\n🧪 ทดสอบเว็บไซต์ + Performance\nBase: ${BASE}\n`);

  const browser = await chromium.launch({ headless: true });

  try {
    await testViewport(browser, 'Desktop', { width: 1280, height: 800 });
    await testViewport(browser, 'Mobile', devices['iPhone 13'].viewport);

    const context = await browser.newContext();
    const page = await context.newPage();
    const reqs = [];
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes(BASE.replace(/\/$/, ''))) {
        reqs.push({ url, status: res.status(), size: res.headers()['content-length'] || 0 });
      }
    });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
    const failed = reqs.filter((r) => r.status >= 400);
    if (failed.length === 0) pass('HTTP — ทุก resource โหลดสำเร็จ', `${reqs.length} requests`);
    else fail('HTTP — มี request ล้มเหลว', failed.map((r) => `${r.status} ${r.url}`).join(', '));

    const mainJs = reqs.find((r) => r.url.includes('main.js'));
    const bundle = reqs.find((r) => r.url.includes('bundle.js'));
    const constants = reqs.find((r) => r.url.includes('constants.js'));
    if (mainJs?.status === 200) pass('main.js', '200 OK');
    if (bundle?.status === 200) pass('bundle.js', '200 OK');
    if (constants?.status === 200) pass('constants.js', '200 OK');

    await context.close();
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`สรุป: ${passed} ผ่าน, ${failed} ล้มเหลว, รวม ${results.length} รายการ\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});