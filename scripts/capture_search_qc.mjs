/**
 * Capture Search Results QC screenshots at ~360px.
 * Requires: npm run v2 → http://127.0.0.1:5175/
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

async function goExplore(page) {
  await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
  await page.waitForSelector('.v2-explore-title');
}

async function submitSearch(page, query) {
  await page.fill('.v2-explore-search-input', query);
  await page.click('.v2-explore-search-submit');
  await page.waitForSelector('.v2-search-results');
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.removeItem('reel-seattle.v2.recentSearches');
    localStorage.removeItem('reel-seattle.v2.dismissedFilms');
    localStorage.removeItem('reel-seattle.v2.savedFilms');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await goExplore(page);

  // Use a query likely to hit real titles in Seattle data
  await submitSearch(page, 'the');
  await page.screenshot({ path: join(OUT, 'i05s-01-all.png'), fullPage: true });

  const firstFilm = page.locator('.v2-search-film-row').first();
  if (await firstFilm.count()) {
    await firstFilm.click();
    await page.waitForSelector('.v2-search-expand');
    await page.screenshot({
      path: join(OUT, 'i05s-02-expanded.png'),
      fullPage: true,
    });

    const second = page.locator('.v2-search-film-row').nth(1);
    if (await second.count()) {
      await second.click();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(OUT, 'i05s-03-expanded-second.png'),
        fullPage: true,
      });
    }
  }

  await page.getByRole('button', { name: 'Movies', exact: true }).click();
  await page.screenshot({
    path: join(OUT, 'i05s-04-movies-only.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Theaters', exact: true }).click();
  await page.screenshot({
    path: join(OUT, 'i05s-05-theaters-only.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Formats', exact: true }).click();
  await page.screenshot({
    path: join(OUT, 'i05s-06-formats-only.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.screenshot({
    path: join(OUT, 'i05s-07-today.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /Filters/ }).click();
  await page.waitForSelector('.v2-search-sheet');
  await page.screenshot({
    path: join(OUT, 'i05s-08-filters-sheet.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.fill('.v2-search-results-input', 'zzzxnotarealfilm999');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.v2-search-empty');
  await page.screenshot({
    path: join(OUT, 'i05s-09-no-results.png'),
    fullPage: true,
  });

  await page.fill('.v2-search-results-input', 'the');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.v2-search-film-row');
  await page.locator('.v2-search-film-row').first().click();
  await page.getByRole('button', { name: /More details/ }).click();
  await page.waitForSelector('.v2-film-detail-back, .v2-collection, h1');
  await page.screenshot({
    path: join(OUT, 'i05s-10-film-detail.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: /Back to Search/i }).click();
  await page.waitForSelector('.v2-search-results');
  await page.screenshot({
    path: join(OUT, 'i05s-11-after-back.png'),
    fullPage: true,
  });

  // Confirm production placeholder does not promise person search.
  const placeholder = await page
    .locator('.v2-search-results-input')
    .getAttribute('placeholder');
  if (placeholder !== 'Search movies, theaters, and formats') {
    throw new Error(`Unexpected search placeholder: ${placeholder}`);
  }

  await page.screenshot({
    path: join(OUT, 'i05s-12-restrained-violet.png'),
    fullPage: false,
  });

  console.log('Wrote Search Results screenshots to', OUT);
  console.log('placeholder:', placeholder);
} finally {
  await browser.close();
}
