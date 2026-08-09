/**
 * Capture Results film-click interaction sheet QC screenshots.
 * Run: node scripts/capture_plan_film_interaction_qc.mjs
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

async function openResults(page) {
  await page.goto(`${BASE}?planResultsMockup=1`, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(`${BASE}?planResultsMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('.v2-planner', { timeout: 15_000 });
  await page.getByRole('button', { name: /Build a Plan/i }).first().click();
  await page.waitForSelector('[data-build-plan-source="mockup-fixture"]', {
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /Build my movie day/i }).click();
  await page.waitForSelector(
    '[data-build-plan-results-source="mockup-fixture"]',
    { timeout: 15_000 },
  );
}

async function openSheet(page) {
  const film = page.getByRole('button', {
    name: /Memories of Murder.*Adjust this movie/i,
  });
  await film.first().click();
  await page.waitForSelector('[data-bpr-sheet="open"]', { timeout: 10_000 });
  await page.waitForSelector('role=dialog', { timeout: 5_000 });
}

const browser = await chromium.launch();

try {
  for (const vp of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await openResults(page);

    const beforeKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    await openSheet(page);

    const dialogCount = await page.locator('[role="dialog"]').count();
    if (dialogCount !== 1) {
      throw new Error(`Expected 1 dialog at ${vp.name}, found ${dialogCount}`);
    }

    const title = await page.locator('.v2-bpr-sheet-title').innerText();
    if (!/Memories of Murder/i.test(title)) {
      throw new Error(`Unexpected sheet title at ${vp.name}: ${title}`);
    }

    for (const label of [
      'Must include',
      'Would love to see',
      'Neutral',
      'Not interested',
    ]) {
      if ((await page.getByRole('radio', { name: new RegExp(label, 'i') }).count()) < 1) {
        throw new Error(`Missing preference ${label} at ${vp.name}`);
      }
    }

    if ((await page.getByText(/Why we love/i).count()) > 0) {
      throw new Error('Why we love leaked into sheet');
    }

    await page.screenshot({
      path: join(OUT, `i-bpr-sheet-${vp.name}-default.png`),
      fullPage: false,
    });

    await page.getByRole('radio', { name: /Must include/i }).click();
    await page.screenshot({
      path: join(OUT, `i-bpr-sheet-${vp.name}-must.png`),
      fullPage: false,
    });

    await page.getByRole('radio', { name: /Not interested/i }).click();
    await page.screenshot({
      path: join(OUT, `i-bpr-sheet-${vp.name}-ni.png`),
      fullPage: false,
    });

    await page.getByRole('button', { name: /Showtime/i }).click();
    const body = await page.locator('body').innerText();
    if (!/Showtime adjustment isn’t available/i.test(body)) {
      const status = await page.locator('[role="status"]').allTextContents();
      if (!status.some((t) => /Showtime adjustment/i.test(t))) {
        throw new Error('Time adjust stub missing');
      }
    }

    await page.getByRole('button', { name: /^Close$/i }).click();
    await page.waitForSelector('[data-bpr-sheet="open"]', {
      state: 'detached',
      timeout: 5_000,
    });

    // Escape path
    await openSheet(page);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-bpr-sheet="open"]', {
      state: 'detached',
      timeout: 5_000,
    });

    // Backdrop dismiss
    await openSheet(page);
    await page.locator('.v2-bpr-sheet-backdrop').click({ position: { x: 20, y: 20 } });
    await page.waitForSelector('[data-bpr-sheet="open"]', {
      state: 'detached',
      timeout: 5_000,
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
      throw new Error(
        `localStorage mutated at ${vp.name}: ${beforeKeys} → ${afterKeys}`,
      );
    }

    await context.close();
    console.log(`ok ${vp.name}`);
  }
} finally {
  await browser.close();
}

console.log('Plan film interaction QC complete →', OUT);
