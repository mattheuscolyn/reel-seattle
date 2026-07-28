/**
 * Capture Opening This Week Stage 1 QC screenshots.
 * Run: node scripts/capture_opening_this_week_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/';

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

async function openOpeningPage(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Wait for Home content; Opening shelf See all is always rendered.
  await page.waitForSelector('#v2-opening .v2-shelf-see-all', {
    timeout: 30_000,
  });
  await page.locator('#v2-opening .v2-shelf-see-all').click();
  await page.waitForSelector('[data-opening-source="mockup-fixture"]', {
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
    await openOpeningPage(page);

    const before = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-opening-page');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-opening-page h1').count();
    if (h1Count !== 1) {
      throw new Error(`Expected one opening h1 at ${vp.name}, found ${h1Count}`);
    }

    await page.screenshot({
      path: join(OUT, `i-opening-${vp.name}-full.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: join(OUT, `i-opening-${vp.name}-top.png`),
      fullPage: false,
    });

    await page.locator('.v2-opening-card-main').nth(0).click();
    await page.locator('.v2-opening-card-main').nth(1).click();
    await page.locator('.v2-opening-page-filters').click();

    const after = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(
        `Opening interactions mutated storage at ${vp.name}: ${after.join(',')}`,
      );
    }

    await page.screenshot({
      path: join(OUT, `i-opening-${vp.name}-expanded-second.png`),
      fullPage: false,
    });

    await page.locator('.v2-opening-page-back').click();
    await page.waitForSelector('#v2-opening', { timeout: 10_000 });

    await context.close();
    console.log(`captured ${vp.name}`);
  }
} finally {
  await browser.close();
}

console.log('Opening This Week QC complete →', OUT);
