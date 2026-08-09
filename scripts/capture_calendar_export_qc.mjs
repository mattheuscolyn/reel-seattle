/**
 * Capture T-CAL-02 calendar export QC screenshots (~360px).
 * Run: node scripts/capture_calendar_export_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/';
const VIEWPORT = { width: 360, height: 800 };

mkdirSync(OUT, { recursive: true });

async function clearLocal(page) {
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    for (const key of keys) {
      if (key.startsWith('reel-seattle.v2.')) localStorage.removeItem(key);
    }
  });
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: join(OUT, name), fullPage });
  console.log('wrote', name);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

try {
  // Mockup Film Detail — Add to calendar disabled (no invented showtimes)
  await page.goto(`${BASE}?fdMockup=1`, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.evaluate(() => {
    localStorage.setItem('reel-seattle.v2.fdMockup', '1');
  });
  await page.goto(`${BASE}?fdMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Home' }).click();
  await page.waitForSelector('.v2-feature-hit, .v2-home', { timeout: 30_000 });
  await page.locator('.v2-feature-hit').first().click();
  await page.waitForSelector('[data-fd-mode="mockup-fixture"]', {
    timeout: 15_000,
  });
  await page.locator('.v2-fd-best-export').scrollIntoViewIfNeeded();
  await shot(page, 't-cal-02-01-fd-mockup-export-disabled.png');
  await page.locator('.v2-fd-best-export').screenshot({
    path: join(OUT, 't-cal-02-02-fd-mockup-export-control.png'),
  });
  console.log('wrote t-cal-02-02-fd-mockup-export-control.png');

  // Live Film Detail — Add to calendar enabled
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Home' }).click();
  await page.waitForSelector('.v2-feature-hit, .v2-home', { timeout: 30_000 });
  await page.locator('.v2-feature-hit').first().click();
  await page.waitForSelector('.v2-fd[data-fd-resolved="true"], .v2-fd-best', {
    timeout: 20_000,
  });
  const liveExport = page.locator('.v2-fd-calendar-export');
  if (await liveExport.count()) {
    await page.locator('.v2-fd-best').scrollIntoViewIfNeeded();
    await shot(page, 't-cal-02-03-fd-live-export.png');
    page.once('download', () => {});
    await liveExport.click();
    await page.waitForTimeout(500);
    await shot(page, 't-cal-02-04-fd-live-export-status.png');
  } else {
    console.log('skip live FD export — no Best Way control on first feature film');
  }

  // Build Plan Results — Share → honest fixture failure
  await clearLocal(page);
  await page.goto(`${BASE}?planResultsMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('.v2-planner', { timeout: 15_000 });
  await page.getByRole('button', { name: /Build a Plan/i }).first().click();
  await page.waitForSelector('[data-build-plan-source="mockup-fixture"]', {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Build my movie day/i }).click();
  await page.waitForSelector(
    '[data-build-plan-results-source="mockup-fixture"]',
    { timeout: 15_000 },
  );
  await shot(page, 't-cal-02-05-bpr-share.png');
  await page.locator('.v2-bpr-share').click();
  await page.waitForTimeout(400);
  await shot(page, 't-cal-02-06-bpr-export-status.png');

  // About — D09 calendar card
  await clearLocal(page);
  await page.goto(`${BASE}?aboutSchedule=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-about-source="mockup-fixture"]', {
    timeout: 15_000,
  });
  await page.locator('[data-about-section="featureCards"]').scrollIntoViewIfNeeded();
  await shot(page, 't-cal-02-07-about-calendar-card.png');

  // Settings — sync row deferred
  await clearLocal(page);
  await page.goto(`${BASE}?scheduleSettings=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ss-section="sync"], .v2-ss', {
    timeout: 15_000,
  });
  const sync = page.locator('[data-ss-section="sync"]');
  if (await sync.count()) {
    await sync.scrollIntoViewIfNeeded();
    await shot(page, 't-cal-02-08-settings-sync-row.png');
  }
} finally {
  await browser.close();
}

console.log(`T-CAL-02 QC screenshots written to ${OUT}`);
