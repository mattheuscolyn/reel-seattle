/**
 * Capture Build a Plan Results Stage 1 QC screenshots.
 * Run: node scripts/capture_build_plan_results_qc.mjs
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

async function openResultsPage(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
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

const browser = await chromium.launch();

try {
  for (const vp of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await openResultsPage(page);

    const beforeKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-bpr');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-bpr h1').count();
    if (h1Count !== 1) {
      throw new Error(`Expected one Results h1 at ${vp.name}, found ${h1Count}`);
    }

    if ((await page.getByText(/Why we love/i).count()) > 0) {
      throw new Error('Why we love leaked into Results');
    }

    await page.screenshot({
      path: join(OUT, `i-bpr-${vp.name}-default.png`),
      fullPage: false,
    });

    await page.getByRole('radio', { name: /Smallest gaps/i }).click();
    await page.screenshot({
      path: join(OUT, `i-bpr-${vp.name}-sort.png`),
      fullPage: false,
    });

    const deselect = page
      .locator('.v2-bpr-film-select[aria-pressed="true"]')
      .first();
    await deselect.click();
    await page.screenshot({
      path: join(OUT, `i-bpr-${vp.name}-deselected.png`),
      fullPage: false,
    });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({
      path: join(OUT, `i-bpr-${vp.name}-refine.png`),
      fullPage: false,
    });

    await page.screenshot({
      path: join(OUT, `i-bpr-${vp.name}-full.png`),
      fullPage: true,
    });

    await page.getByRole('button', { name: /Share/i }).first().click();
    await page
      .getByRole('button', { name: /Add to My Schedule for plan/i })
      .first()
      .click();

    const body = await page.locator('body').innerText();
    if (
      !/Share \/ export isn’t available/i.test(body) &&
      !/Add to My Schedule isn’t available/i.test(body) &&
      !/isn’t available in this Stage 1 Results shell/i.test(body)
    ) {
      throw new Error('Expected stub status after Share / Add to My Schedule');
    }

    // Film row opens Stage 1 interaction sheet (not a silent no-op).
    await page.locator('.v2-bpr-film-main').first().click();
    await page.waitForSelector('.v2-bpr-sheet, [data-bpr-sheet="open"]', {
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /^Close$/i }).click();
    await page.waitForSelector('.v2-bpr-sheet', {
      state: 'detached',
      timeout: 10_000,
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

    await page.getByRole('button', { name: /Back to Build a Plan/i }).click();
    await page.waitForSelector('[data-build-plan-source="mockup-fixture"]', {
      timeout: 10_000,
    });

    await context.close();
    console.log(`ok ${vp.name}`);
  }
} finally {
  await browser.close();
}

console.log('Build a Plan Results QC complete →', OUT);
