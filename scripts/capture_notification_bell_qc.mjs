/**
 * Capture notification bell header QC at 393px.
 * Run: node scripts/capture_notification_bell_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 *
 * Uses ?qcHeaderNotifications= to force presentation without auth/backend.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/';
const VIEWPORT = { width: 393, height: 852 };

mkdirSync(OUT, { recursive: true });

async function capture(page, mode, name) {
  await page.goto(`${BASE}?qcHeaderNotifications=${mode}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('.v2-header');
  await page.waitForSelector('.v2-home, .v2-main');

  const metrics = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    return {
      header: box(q('.v2-header')),
      wordmark: box(q('.v2-wordmark')),
      profile: box(q('.v2-header-profile')),
      bell: box(q('.v2-header-notifications')),
      spacer: box(q('.v2-header-spacer')),
      dot: Boolean(q('.v2-header-notifications-dot')),
      mainTop: q('.v2-main')
        ? Math.round(q('.v2-main').getBoundingClientRect().top)
        : null,
    };
  });
  console.log(name, JSON.stringify(metrics));

  await page.screenshot({
    path: join(OUT, `notif-bell-${name}-393-viewport.png`),
    fullPage: false,
  });
  await page.locator('.v2-header').screenshot({
    path: join(OUT, `notif-bell-${name}-393-header.png`),
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await capture(page, 'read', '01-logged-in-read');
  await capture(page, 'unread', '02-logged-in-unread');
  await capture(page, 'logged-out', '03-logged-out');
  console.log('Wrote screenshots to', OUT);
} finally {
  await browser.close();
}
