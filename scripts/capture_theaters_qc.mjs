/**
 * Capture Theaters list Stage 1 QC screenshots.
 * Run: node scripts/capture_theaters_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/';
const MOCKUP_BASE = 'http://127.0.0.1:5175/?theaterMockup=1';

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

async function openTheatersPage(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
  await page.waitForSelector('.v2-explore-page', { timeout: 15_000 });
  const theatersBtn = page.getByRole('button', { name: /^Theaters$/i });
  await theatersBtn.first().click();
  await page.waitForSelector('[data-theaters-source="home-data"]', {
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
    await openTheatersPage(page);

    const before = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-theaters-page');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-theaters-page h1').count();
    if (h1Count !== 1) {
      throw new Error(`Expected one theaters h1 at ${vp.name}, found ${h1Count}`);
    }

    // Expanded default (SIFF Downtown)
    await page.screenshot({
      path: join(OUT, `i-theaters-${vp.name}-expanded.png`),
      fullPage: false,
    });
    await page.screenshot({
      path: join(OUT, `i-theaters-${vp.name}-full.png`),
      fullPage: true,
    });

    // Collapse first, capture collapsed
    await page.locator('.v2-theaters-card-main').first().click();
    await page.screenshot({
      path: join(OUT, `i-theaters-${vp.name}-collapsed.png`),
      fullPage: false,
    });

    // Expand second only
    await page.locator('.v2-theaters-card-main').nth(1).click();
    const expandedCount = await page.locator('.v2-theaters-card-expanded').count();
    if (expandedCount !== 1) {
      throw new Error(`Expected one expanded card at ${vp.name}, found ${expandedCount}`);
    }

    await page.locator('.v2-theaters-card-fav-btn').first().click();
    await page.locator('.v2-theaters-page-filters').click();

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
        `Theaters interactions mutated storage at ${vp.name}: ${after.join(',')}`,
      );
    }

    await page.locator('.v2-theaters-page-back').click();
    await page.waitForSelector('.v2-explore-page', { timeout: 10_000 });

    // Explicit mockup QC pass
    await page.goto(MOCKUP_BASE, { waitUntil: 'networkidle' });
    await clearLocal(page);
    await page.goto(MOCKUP_BASE, { waitUntil: 'networkidle' });
    await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
    await page.waitForSelector('.v2-explore-page', { timeout: 15_000 });
    await page.getByRole('button', { name: /^Theaters$/i }).first().click();
    await page.waitForSelector('[data-theaters-source="mockup-fixture"]', {
      timeout: 15_000,
    });
    await page.screenshot({
      path: join(OUT, `i-theaters-mockup-${vp.name}.png`),
      fullPage: false,
    });

    await context.close();
    console.log(`captured ${vp.name}`);
  }
} finally {
  await browser.close();
}

console.log('Theaters list QC complete →', OUT);
