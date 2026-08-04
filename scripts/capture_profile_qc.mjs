/**
 * Capture Profile hub Stage 1 QC screenshots.
 * Run: node scripts/capture_profile_qc.mjs
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

async function openProfile(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Profile' }).click();
  await page.waitForSelector('[data-profile-source="live"]', {
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
    await openProfile(page);

    const before = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('reel-seattle.v2.')) keys.push(key);
      }
      return keys.sort();
    });

    await page.locator('.v2-profile-settings-row').first().click();
    await page.locator('.v2-profile-activity-card').first().click();

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
        `Profile interactions mutated storage at ${vp.name}: ${after.join(',')}`,
      );
    }

    await page.screenshot({
      path: join(OUT, `i-profile-01-${vp.name}-full.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: join(OUT, `i-profile-02-${vp.name}-viewport.png`),
      fullPage: false,
    });

    await context.close();
    console.log(`captured ${vp.name}`);
  }
  console.log('Profile QC captures written to tmp-v2-qc/');
} finally {
  await browser.close();
}
