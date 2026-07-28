/**
 * Capture Theater Detail Stage 1 QC screenshots.
 * Run: node scripts/capture_theater_detail_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/?theaterDetail=1';

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

async function openTheaterDetail(page) {
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector(
    '[data-theater-detail-source="mockup-fixture"]',
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
    await openTheaterDetail(page);

    const beforeKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-td-page');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-td-page h1').count();
    if (h1Count !== 1) {
      throw new Error(`Expected one h1 at ${vp.name}, found ${h1Count}`);
    }

    await page.screenshot({
      path: join(OUT, `i-theater-detail-${vp.name}-default.png`),
      fullPage: true,
    });

    await page.getByRole('button', { name: /Read more/i }).click();
    await page.getByRole('button', { name: /^Screen 2$/i }).click();
    await page.getByRole('button', { name: /^7:30pm$/i }).click();

    await page.screenshot({
      path: join(OUT, `i-theater-detail-${vp.name}-toggled.png`),
      fullPage: true,
    });

    await page
      .getByRole('button', { name: /Favorite theater/i })
      .click();

    const afterFavoriteKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });
    if (afterFavoriteKeys.length !== beforeKeys.length + 1) {
      throw new Error(`Favorite did not persist at ${vp.name}`);
    }

    await context.close();
    console.log(`OK ${vp.name}`);
  }
} finally {
  await browser.close();
}
