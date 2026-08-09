/**
 * Capture Theater Detail QC screenshots (live + mockup + not-found).
 * Run: node scripts/capture_theater_detail_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const LIVE_BEACON =
  'http://127.0.0.1:5175/?theaterDetail=1&theaterId=the-beacon';
const MOCKUP_BASE =
  'http://127.0.0.1:5175/?theaterDetail=1&theaterMockup=1';
const NOT_FOUND_BASE =
  'http://127.0.0.1:5175/?theaterDetail=1&theaterId=not-a-real-theater';
const SPARSE_BASE =
  'http://127.0.0.1:5175/?theaterDetail=1&theaterId=amc-alderwood-mall-16';

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

async function openTheaterDetail(page, url) {
  await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.v2-td-page', { timeout: 15_000 });
}

const browser = await chromium.launch();

try {
  for (const vp of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await openTheaterDetail(page, LIVE_BEACON);
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-td-page');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);
    await page.screenshot({
      path: join(OUT, `i-theater-detail-live-${vp.name}.png`),
      fullPage: true,
    });

    await openTheaterDetail(page, SPARSE_BASE);
    await page.screenshot({
      path: join(OUT, `i-theater-detail-sparse-${vp.name}.png`),
      fullPage: true,
    });

    await openTheaterDetail(page, NOT_FOUND_BASE);
    await page.waitForSelector('[data-theater-detail-state="not-found"]', {
      timeout: 10_000,
    });
    await page.screenshot({
      path: join(OUT, `i-theater-detail-notfound-${vp.name}.png`),
      fullPage: false,
    });

    await openTheaterDetail(page, MOCKUP_BASE);
    await page.waitForSelector(
      '[data-theater-detail-source="mockup-fixture"]',
      { timeout: 15_000 },
    );
    await page.screenshot({
      path: join(OUT, `i-theater-detail-mockup-${vp.name}.png`),
      fullPage: true,
    });

    await context.close();
    console.log(`OK ${vp.name}`);
  }
} finally {
  await browser.close();
}

console.log('Theater Detail QC complete →', OUT);
