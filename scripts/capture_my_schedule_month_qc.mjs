/**
 * Capture My Schedule Month Stage 1 QC screenshots.
 * Run: node scripts/capture_my_schedule_month_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/?myScheduleMonth=1';

mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { name: 'iphone15pro', width: 393, height: 852 },
  { name: '320', width: 320, height: 720 },
  { name: '375', width: 375, height: 812 },
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

async function openScheduleMonth(page) {
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-schedule-source="mockup-fixture"][data-schedule-view="month"]', {
    timeout: 15_000,
  });
}

const browser = await chromium.launch();

try {
  for (const vp of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await openScheduleMonth(page);

    const beforeKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const shellOverflow = await page.evaluate(() => {
      const shell = document.querySelector('.v2-shell');
      if (!shell) return true;
      return shell.scrollWidth > shell.clientWidth + 1;
    });
    if (shellOverflow) throw new Error(`Page-level horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-msw h1').count();
    if (h1Count !== 1) throw new Error(`Expected one h1 at ${vp.name}, found ${h1Count}`);

    const backCount = await page.locator('.v2-header-back').count();
    if (backCount !== 0) throw new Error(`Unexpected back button at ${vp.name}`);

    await page.screenshot({
      path: join(OUT, `i-schedule-month-${vp.name}-default.png`),
      fullPage: true,
    });

    // Switch heatmap selection to ensure local day selection works.
    await page.locator('[data-schedule-day="sat-jul-25"]').click();
    await page.screenshot({
      path: join(OUT, `i-schedule-month-${vp.name}-selected.png`),
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

    if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
      throw new Error(`localStorage changed at ${vp.name}`);
    }

    await context.close();
    console.log(`OK ${vp.name}`);
  }
} finally {
  await browser.close();
}

