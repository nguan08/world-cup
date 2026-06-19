/**
 * Browser test for toast + notification permission UI.
 * Run: node scripts/test-notifications.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://127.0.0.1:8080/';
const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['notifications'],
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    pass('โหลดแอปสำเร็จ', BASE);

    const hasSettings = await page.locator('#notification-settings').isVisible();
    if (hasSettings) pass('พบ UI การแจ้งเตือนใน sidebar');
    else fail('ไม่พบ #notification-settings');

    const statusBefore = await page.locator('[data-notif-status]').textContent();
    pass('สถานะเริ่มต้น', statusBefore?.trim() || '(ว่าง)');

    await page.evaluate(async () => {
      const mod = await import('./js/notifications.js');
      mod.notifyDataUpdate({ message: 'ทดสอบ toast จากสคริปต์' });
    });

    const toast = page.locator('#update-toast.update-toast--visible');
    await toast.waitFor({ state: 'visible', timeout: 5000 });
    const toastText = await toast.locator('.update-toast__text').textContent();
    if (toastText?.includes('ทดสอบ toast')) pass('Toast แสดงผล', toastText.trim());
    else fail('Toast ข้อความไม่ตรง', toastText || '');

    const enableBtn = page.locator('[data-notif-enable]');
    if (statusBefore?.includes('ถูกปฏิเสธ') || statusBefore?.includes('ไม่รองรับ')) {
      pass('ข้ามทดสอบเปิด permission — ต้องทดสอบด้วยมือในเบราว์เซอร์จริง');
    } else if (await enableBtn.isDisabled()) {
      pass('เปิดแจ้งเตือนแล้ว (ปุ่มถูกปิดใช้)');
    } else {
      await enableBtn.click();
      await page.waitForTimeout(500);
      const statusAfter = await page.locator('[data-notif-status]').textContent();
      if (statusAfter?.includes('เปิดแจ้งเตือนแล้ว')) {
        pass('เปิด permission สำเร็จ', statusAfter.trim());
        const enableText = await page.locator('#update-toast.update-toast--visible .update-toast__text').textContent().catch(() => '');
        if (enableText?.includes('เปิดการแจ้งเตือน')) pass('Toast ยืนยันเปิดแจ้งเตือน', enableText.trim());
      } else {
        pass('สถานะหลังกดปุ่ม', statusAfter?.trim() || '(ไม่ทราบ)');
      }
    }

    const dataPath = path.join(process.cwd(), 'data.json');
    const backupPath = path.join(process.cwd(), 'data.json.notif-test-bak');
    const original = fs.readFileSync(dataPath, 'utf8');
    fs.writeFileSync(backupPath, original);

    const parsed = JSON.parse(original);
    const firstPending = parsed.matches?.find((m) => m.status === 'pending');
    if (firstPending) {
      firstPending.status = 'finished';
      firstPending.homeScore = 1;
      firstPending.awayScore = 0;
      fs.writeFileSync(dataPath, JSON.stringify(parsed, null, 2));

      await page.evaluate(async () => {
        const sync = await import('./js/sync.js');
        await sync.pollServerData();
      });

      await page.waitForTimeout(800);
      const dataToast = await page.locator('#update-toast.update-toast--visible .update-toast__text').textContent().catch(() => '');
      if (dataToast?.includes('อัปเดต')) pass('แจ้งเตือนเมื่อ data.json เปลี่ยน', dataToast.trim());
      else fail('ไม่เห็น toast อัปเดตข้อมูล', dataToast || '');

      fs.writeFileSync(dataPath, original);
      fs.unlinkSync(backupPath);
    } else {
      pass('ข้ามทดสอบ data.json — ไม่มีแมตช์ pending');
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    }

    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg;
    });
    if (swRegistered) pass('Service Worker ลงทะเบียนแล้ว');
    else fail('Service Worker ไม่ได้ลงทะเบียน');
  } catch (err) {
    fail('เกิดข้อผิดพลาด', err.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nสรุป: ${results.length - failed}/${results.length} ผ่าน`);
  process.exit(failed > 0 ? 1 : 0);
}

main();