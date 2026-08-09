/**
 * Capture live Film Detail enrichment QC (~360px).
 * Requires: npm run v2 → http://127.0.0.1:5175/
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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('reel-seattle.v2.')) localStorage.removeItem(key);
    }
  });
  await page.reload({ waitUntil: 'networkidle' });

  // Prefer Home → Film Detail (stable production path).
  await page.locator('.v2-nav-button', { hasText: 'Home' }).click();
  await page.waitForSelector('.v2-home, .v2-feature-hit', { timeout: 30_000 });

  const feature = page.locator('.v2-feature-hit').first();
  if (await feature.count()) {
    await feature.click();
  } else {
    await page.locator('.v2-shelf-card, .v2-poster-card, button.v2-shelf-film').first().click();
  }

  await page.waitForSelector('.v2-fd[data-fd-mode="production"], .v2-fd-empty', {
    timeout: 15_000,
  });

  const mode = await page.locator('.v2-fd').getAttribute('data-fd-mode');
  console.log('fd mode', mode);

  await page.screenshot({
    path: join(OUT, 'i06fd-enr-01-live.png'),
    fullPage: true,
  });

  const meta = await page.locator('.v2-fd-meta').textContent().catch(() => null);
  const genres = await page.locator('.v2-fd-genres').textContent().catch(() => null);
  const director = await page.locator('.v2-fd-director').textContent().catch(() => null);
  const synopsis = await page.locator('.v2-fd-synopsis').textContent().catch(() => null);
  const title = await page.locator('#v2-fd-title, .v2-fd-title').textContent().catch(() => null);
  console.log({
    title,
    meta,
    genres,
    director,
    synopsis: synopsis?.slice(0, 140) ?? null,
  });

  const more = page.locator('.v2-fd-more');
  if (await more.count()) {
    await more.click();
    await page.screenshot({
      path: join(OUT, 'i06fd-enr-02-synopsis-more.png'),
      fullPage: true,
    });
  }

  // Search → More details path
  await page.locator('.v2-nav-button', { hasText: 'Explore' }).click();
  await page.waitForSelector('.v2-explore-title');
  await page.fill('.v2-explore-search-input', 'Fifth Element');
  await page.click('.v2-explore-search-submit');
  await page.waitForSelector('.v2-search-results');
  await page.locator('.v2-search-film-row').first().click();
  await page.waitForSelector('.v2-search-expand');
  await page.locator('.v2-search-more').first().click();
  await page.waitForSelector('.v2-fd[data-fd-mode="production"]', { timeout: 15_000 });
  await page.screenshot({
    path: join(OUT, 'i06fd-enr-04-from-search.png'),
    fullPage: true,
  });

  console.log(`Wrote Film Detail enrichment QC to ${OUT}`);
} finally {
  await browser.close();
}
