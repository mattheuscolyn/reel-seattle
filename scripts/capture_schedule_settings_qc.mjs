/**
 * Capture Schedule Settings Stage 1 QC screenshots.
 * Run: node scripts/capture_schedule_settings_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/?scheduleSettings=1';

mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { name: 'iphone15pro', width: 393, height: 852 },
  { name: '320', width: 320, height: 720 },
  { name: '430', width: 430, height: 900 },
];

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

async function openSettings(page) {
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector(
    '[data-schedule-settings-source="mockup-fixture"]',
    { timeout: 15_000 },
  );
}

const browser = await chromium.launch();

try {
  for (const vp of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await openSettings(page);

    const beforeKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-ss-sheet');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-ss-sheet h1').count();
    if (h1Count !== 1) {
      throw new Error(`Expected one h1 at ${vp.name}, found ${h1Count}`);
    }

    await page.screenshot({
      path: join(OUT, `i-schedule-settings-${vp.name}-default.png`),
      fullPage: true,
    });

    await page.getByRole('switch', { name: /Hide completed plans/i }).click();
    await page.getByRole('button', { name: /^24h$/i }).click();
    await page.locator('[data-color-mode="theater"]').click();
    await page
      .getByRole('button', { name: /Default timeline zoom/i })
      .click();

    await page.screenshot({
      path: join(OUT, `i-schedule-settings-${vp.name}-toggled.png`),
      fullPage: true,
    });

    const afterKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });
    if (JSON.stringify(afterKeys) !== JSON.stringify(beforeKeys)) {
      throw new Error(`localStorage changed at ${vp.name}`);
    }

    await context.close();
    console.log(`OK ${vp.name}`);
  }
} finally {
  await browser.close();
}
