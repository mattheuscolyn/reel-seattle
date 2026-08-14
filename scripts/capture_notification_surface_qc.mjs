/**
 * Capture Notifications sheet QC at 393px.
 * Run: node scripts/capture_notification_surface_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
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

async function openSheet(page, query) {
  await page.goto(`${BASE}?${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.v2-header-notifications', { timeout: 10_000 });
  await page.locator('.v2-header-notifications').click();
  await page.waitForSelector('.v2-notif-sheet', { timeout: 10_000 });
}

async function capture(page, name) {
  await page.screenshot({
    path: join(OUT, `notif-sheet-${name}-393-viewport.png`),
    fullPage: false,
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  // A. Unread + sheet open
  await openSheet(page, 'qcNotifications=unread');
  await capture(page, '01-unread-open');
  const unreadMeta = await page.evaluate(() => ({
    hasDot: Boolean(document.querySelector('.v2-header-notifications-dot')),
    hasNew: Boolean(document.querySelector('#v2-notif-new-h')),
    hasEarlier: Boolean(document.querySelector('#v2-notif-earlier-h')),
    hasMarkAll: Boolean(
      document.querySelector('.v2-notif-mark-all'),
    ),
  }));
  console.log('unread-open', unreadMeta);

  // Mark all as read → all-read open
  await page.locator('.v2-notif-mark-all').click();
  await page.waitForTimeout(100);
  await capture(page, '02-all-read-open');
  const allReadMeta = await page.evaluate(() => ({
    hasDot: Boolean(document.querySelector('.v2-header-notifications-dot')),
    hasNew: Boolean(document.querySelector('#v2-notif-new-h')),
    hasMarkAll: Boolean(document.querySelector('.v2-notif-mark-all')),
    earlierCount: document.querySelectorAll(
      '#v2-notif-earlier-h ~ .v2-notif-list .v2-notif-card',
    ).length,
  }));
  console.log('all-read-open', allReadMeta);

  // C. Empty + sheet open
  await openSheet(page, 'qcNotifications=empty');
  await capture(page, '03-empty-open');

  // D. Closed / unread
  await page.goto(`${BASE}?qcNotifications=unread`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('.v2-header-notifications');
  await capture(page, '04-closed-unread');
  const closedMeta = await page.evaluate(() => ({
    hasDot: Boolean(document.querySelector('.v2-header-notifications-dot')),
    sheetOpen: Boolean(document.querySelector('.v2-notif-sheet')),
  }));
  console.log('closed-unread', closedMeta);

  console.log('Wrote screenshots to', OUT);
} finally {
  await browser.close();
}
