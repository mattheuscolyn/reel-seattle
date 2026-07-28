/**
 * Capture Planner Landing Stage 1 QC screenshots.
 * Run: node scripts/capture_planner_landing_qc.mjs
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

async function openPlanner(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="mockup-fixture"]', {
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
    await openPlanner(page);

    const before = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.v2-planner');
      if (!el) return true;
      return el.scrollWidth > el.clientWidth + 1;
    });
    if (overflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const h1Count = await page.locator('.v2-planner h1').count();
    if (h1Count !== 1) {
      throw new Error(`Expected one planner h1 at ${vp.name}, found ${h1Count}`);
    }

    // Stub interactions that stay on landing (do not navigate away first).
    await page.locator('.v2-planner-plan-main').first().click();
    await page.locator('.v2-planner-link').first().click();

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
        `Planner interactions mutated storage at ${vp.name}: ${after.join(',')}`,
      );
    }

    await page.screenshot({
      path: join(OUT, `i-planner-01-${vp.name}-full.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: join(OUT, `i-planner-02-${vp.name}-viewport.png`),
      fullPage: false,
    });

    // Entry cards navigate: Build a Plan then return via primary tab.
    await page.getByRole('button', { name: /Build a Plan/i }).first().click();
    await page.waitForSelector('[data-build-plan-source="mockup-fixture"]', {
      timeout: 10_000,
    });
    await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
    await page.waitForSelector('[data-planner-source="mockup-fixture"]', {
      timeout: 10_000,
    });

    await context.close();
    console.log(`captured ${vp.name}`);
  }
  console.log('Planner Landing QC captures written to tmp-v2-qc/');
} finally {
  await browser.close();
}
