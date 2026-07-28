/**
 * Capture Film Detail mockup-replica QC screenshots (~360px).
 * Run: node scripts/capture_film_detail_qc.mjs
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
    localStorage.removeItem('reel-seattle.v2.recentSearches');
    localStorage.removeItem('reel-seattle.v2.dismissedFilms');
    localStorage.removeItem('reel-seattle.v2.seenFilms');
    localStorage.removeItem('reel-seattle.v2.savedFilms');
    localStorage.removeItem('reel-seattle.v2.fdVisual');
    localStorage.removeItem('reel-seattle.v2.fdMockup');
  });
}

async function openFilmDetailMockup(page) {
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
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await openFilmDetailMockup(page);

  await page.screenshot({
    path: join(OUT, 'i06fdm-01-full.png'),
    fullPage: true,
  });
  await page.screenshot({
    path: join(OUT, 'i06fdm-02-first-viewport.png'),
    fullPage: false,
  });
  await page.locator('.v2-fd-hero').screenshot({
    path: join(OUT, 'i06fdm-03-hero.png'),
  });
  await page.locator('.v2-fd-actions').screenshot({
    path: join(OUT, 'i06fdm-04-actions.png'),
  });
  await page.locator('.v2-fd-signals').screenshot({
    path: join(OUT, 'i06fdm-05-why-grid.png'),
  });
  await page.locator('.v2-fd-best').screenshot({
    path: join(OUT, 'i06fdm-06-best-way.png'),
  });
  await page
    .locator('.v2-fd-section', { has: page.locator('#v2-fd-today-h') })
    .screenshot({ path: join(OUT, 'i06fdm-07-showtimes.png') });

  await page.locator('.v2-fd-more').click();
  await page
    .locator('.v2-fd-section', { has: page.locator('#v2-fd-about-h') })
    .screenshot({ path: join(OUT, 'i06fdm-08-synopsis-expanded.png') });

  await page.screenshot({
    path: join(OUT, 'i06fdm-09-full-pass2.png'),
    fullPage: true,
  });

  console.log(`Film Detail mockup QC screenshots written to ${OUT}`);
} finally {
  await browser.close();
}
