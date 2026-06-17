const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const OUT = path.join(__dirname, 'leaderboard.jpg');
  const URL = 'http://localhost:8080';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();

  console.log('[capture] navigating to', URL);
  await page.goto(URL, { waitUntil: 'networkidle' });

  // Click leaderboard nav if present
  const nav = await page.$('.nav-item[data-tab="leaderboard"]');
  if (nav) {
    await nav.click();
  }

  // Wait for leaderboard table
  await page.waitForSelector('#leaderboard .table-container', { timeout: 5000 });
  const container = await page.$('#leaderboard .table-container');
  if (!container) {
    console.error('Leaderboard container not found');
    await browser.close();
    process.exit(2);
  }
  // Give time for data to render
  await page.waitForTimeout(500);

  // Inject print-friendly styles to make the exported image readable
  await page.addStyleTag({ content: `
    body { background: #ffffff !important; }
    #leaderboard .table-container { background: #ffffff !important; padding: 18px; border-radius: 8px; }
    #leaderboard table { color: #111 !important; background: #fff !important; border-collapse: collapse !important; width: 100% !important; }
    #leaderboard thead th { background: #f7f7f7 !important; color: #111 !important; font-weight: 700 !important; }
    #leaderboard tbody td, #leaderboard thead th { padding: 8px 10px !important; border-bottom: 1px solid #e6e6e6 !important; font-size: 14px !important; }
    #leaderboard .search-bar, #leaderboard .input-group, #team-filter-menu, #export-leaderboard-btn { display: none !important; }
    #leaderboard table thead th:nth-last-child(1), #leaderboard table tbody td:nth-last-child(1) { display: none !important; }
  `});

  // Small delay to apply styles
  await page.waitForTimeout(150);

  await container.screenshot({ path: OUT, type: 'jpeg', quality: 80 });
  console.log('[capture] saved', OUT);

  await browser.close();
})();
