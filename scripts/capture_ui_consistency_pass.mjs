/**
 * UI consistency pass — viewport chrome captures.
 * Requires v2 at http://127.0.0.1:5175/
 *
 * Usage:
 *   node scripts/capture_ui_consistency_pass.mjs before
 *   node scripts/capture_ui_consistency_pass.mjs after
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHASE = process.argv[2] === 'after' ? 'after' : 'before';
const OUT = join(ROOT, '.tmp', 'ui-consistency', PHASE);
const BASE = process.env.V2_BASE_URL || 'http://127.0.0.1:5175/';

const VIEWPORTS = [
  { id: '390', width: 390, height: 844 },
  { id: '1440', width: 1440, height: 900 },
];

mkdirSync(OUT, { recursive: true });

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

async function waitSettled(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

async function clickNav(page, label) {
  await page.locator('.v2-nav-button', { hasText: label }).click();
  await page.waitForTimeout(250);
}

async function loadHome(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.v2-home, .v2-nav', { timeout: 30_000 });
}

async function capture(page, name) {
  await waitSettled(page);
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`wrote ${name}`);
}

async function openFirstFilm(page, from) {
  const feature = page.locator('.v2-feature-hit').first();
  if (from === 'home' && (await feature.count())) {
    await feature.click();
    await page.waitForSelector('.v2-fd, [data-fd-mode]', { timeout: 20_000 });
    return;
  }

  const shelf = page.locator('.v2-shelf-card, .v2-film-card, button[data-film-key]').first();
  if (await shelf.count()) {
    await shelf.click();
    await page.waitForSelector('.v2-fd, [data-fd-mode]', { timeout: 20_000 });
    return;
  }

  throw new Error(`Could not open a film from ${from}`);
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const prefix = `${viewport.id}`;

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await loadHome(page);
  await capture(page, `${prefix}-01-home.png`);

  await clickNav(page, 'Explore');
  await page.waitForSelector('.v2-explore-page, .v2-explore-title', { timeout: 15_000 });
  await capture(page, `${prefix}-02-explore.png`);

  await loadHome(page);
  await clickNav(page, 'Planner');
  await page.waitForSelector('.v2-planner', { timeout: 15_000 });
  await capture(page, `${prefix}-03-planner.png`);

  await loadHome(page);
  await clickNav(page, 'Profile');
  await page.waitForSelector('.v2-profile', { timeout: 15_000 });
  await capture(page, `${prefix}-04-profile.png`);

  await loadHome(page);
  await page.locator('[data-browse-entry="all"]').click();
  await page.waitForSelector('.v2-stb, .v2-stb-title', { timeout: 15_000 });
  await capture(page, `${prefix}-05-showtimes.png`);

  await loadHome(page);
  await clickNav(page, 'Explore');
  await page.waitForSelector('.v2-browse', { timeout: 15_000 });
  await page.locator('.v2-browse-row', { hasText: 'Theaters' }).click();
  await page.waitForSelector('.v2-theaters-page, .v2-theaters-page-title', {
    timeout: 15_000,
  });
  await capture(page, `${prefix}-06-theaters.png`);

  await loadHome(page);
  await openFirstFilm(page, 'home');
  await capture(page, `${prefix}-07-film-from-home.png`);

  await loadHome(page);
  await clickNav(page, 'Explore');
  await page.waitForSelector('.v2-quick-button', { timeout: 15_000 });
  await page.locator('.v2-quick-button').first().click();
  await page.waitForSelector('.v2-stb-film-open', { timeout: 20_000 });
  await page.locator('.v2-stb-film-open').first().click();
  await page.waitForSelector('.v2-fd, [data-fd-mode]', { timeout: 20_000 });
  await capture(page, `${prefix}-08-film-from-explore.png`);

  await loadHome(page);
  await clickNav(page, 'Planner');
  await page.waitForSelector('.v2-planner-build-btn', { timeout: 15_000 });
  await page.locator('.v2-planner-build-btn').click();
  await page.waitForSelector('.v2-bp, .v2-bp-title', { timeout: 15_000 });
  await capture(page, `${prefix}-09-build-a-plan.png`);

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) {
    await runViewport(browser, viewport);
  }
} finally {
  await browser.close();
}

console.log(`UI consistency ${PHASE} captures written to ${OUT}`);
