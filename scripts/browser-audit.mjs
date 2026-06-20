import { chromium, devices } from 'playwright';

const urls = [
  ['local', 'http://127.0.0.1:8080/'],
  ['prod', 'https://nguan08.github.io/world-cup/'],
];

const browser = await chromium.launch();
for (const [label, url] of urls) {
  for (const [mode, ctxOpts] of [['desktop', {}], ['iphone', devices['iPhone 13']]]) {
    const ctx = await browser.newContext({ ...ctxOpts, serviceWorkers: 'allow' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const tabs = ['dashboard', 'leaderboard', 'matches', 'players', 'statistics', 'teams', 'tools', 'payout'];
    for (const tab of tabs) {
      await page.click(`.nav-item[data-tab="${tab}"]`).catch(() => {});
      await page.waitForTimeout(400);
      const err = await page.evaluate((t) => {
        const active = document.querySelector('.page.active')?.id;
        return active !== t ? `wrong tab ${active}` : null;
      }, tab);
      if (err) errors.push(`${tab}: ${err}`);
    }
    const summary = await page.evaluate(() => ({
      leader: document.getElementById('stat-leader-score')?.textContent,
      rows: document.querySelectorAll('#top-leaders-tbody tr').length,
      matchCards: document.querySelectorAll('#matches-container .match-card, #matches-container .matches-page-card').length,
      playerRows: document.querySelectorAll('#players-tbody tr').length,
    }));
    console.log(JSON.stringify({ label, mode, summary, errors: errors.slice(0, 5) }));
    await ctx.close();
  }
}
await browser.close();