/**
 * Capture Explore landing QC screenshots (I-05E2) at ~360px width.
 * Run with: node scripts/capture_explore_qc.mjs
 * Requires v2 serving http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const URL = 'http://127.0.0.1:5175/';
const VIEWPORT = { width: 360, height: 800 };

mkdirSync(OUT, { recursive: true });

async function waitReady(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.v2-shell');
}

async function goExplore(page) {
  await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
  await page.waitForSelector('.v2-explore-title');
}

async function clearLocal(page) {
  await page.evaluate(() => {
    localStorage.removeItem('reel-seattle.v2.recentSearches');
    localStorage.removeItem('reel-seattle.v2.dismissedFilms');
    localStorage.removeItem('reel-seattle.v2.seenFilms');
    localStorage.removeItem('reel-seattle.v2.savedFilms');
  });
}

async function seedActivity(page) {
  await page.evaluate(async () => {
    localStorage.setItem(
      'reel-seattle.v2.recentSearches',
      JSON.stringify(['IMAX', 'Central', 'SIFF']),
    );
    const response = await fetch('/data/showtimes_current.json');
    if (!response.ok) return;
    const data = await response.json();
    const films = Array.isArray(data?.films) ? data.films : [];
    const keys = films
      .map((f) => f.showtime_film_key || f.film_key || f.id)
      .filter(Boolean)
      .slice(0, 3);
    if (keys.length) {
      localStorage.setItem(
        'reel-seattle.v2.dismissedFilms',
        JSON.stringify([keys[0]]),
      );
      localStorage.setItem(
        'reel-seattle.v2.seenFilms',
        JSON.stringify(keys.slice(0, 2)),
      );
    }
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await waitReady(page);
  await clearLocal(page);
  await page.reload({ waitUntil: 'networkidle' });
  await goExplore(page);
  await page.screenshot({
    path: join(OUT, 'i05e2-01-explore-empty.png'),
    fullPage: true,
  });

  await seedActivity(page);
  await page.reload({ waitUntil: 'networkidle' });
  await goExplore(page);
  await page.screenshot({
    path: join(OUT, 'i05e2-02-explore-activity.png'),
    fullPage: true,
  });

  await page.locator('.v2-suggested').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(OUT, 'i05e2-03-suggested-starts.png'),
    fullPage: false,
  });

  await page.getByRole('button', { name: 'Manage film activity' }).click();
  await page.waitForSelector('#v2-collection-title');
  await page.screenshot({
    path: join(OUT, 'i05e2-04-film-activity.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /Not interested/ }).click();
  await page.waitForSelector('#v2-collection-title');
  await page.screenshot({
    path: join(OUT, 'i05e2-05-not-interested.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: '← Back' }).click();
  await page.waitForSelector('.v2-explore-title');
  await page.screenshot({
    path: join(OUT, 'i05e2-06-explore-after-back.png'),
    fullPage: true,
  });

  console.log('Wrote screenshots to', OUT);
} finally {
  await browser.close();
}
