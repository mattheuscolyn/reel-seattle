/**
 * Capture Why See It four-column row QC at 360px.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 2,
});

await page.goto('http://127.0.0.1:5175/?fdMockup=1', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('reel-seattle.v2.fdMockup', '1');
});
await page.goto('http://127.0.0.1:5175/?fdMockup=1', { waitUntil: 'networkidle' });
await page.locator('.v2-nav-button', { hasText: 'Home' }).click();
await page.waitForSelector('.v2-feature-hit, .v2-home', { timeout: 30_000 });
await page.locator('.v2-feature-hit').first().click();
await page.waitForSelector('[data-fd-mode="mockup-fixture"]');

const why = page.locator('.v2-fd-section', { has: page.locator('#v2-fd-why-h') });
await why.screenshot({ path: join(OUT, 'i06fdm-why-row-360.png') });
await page.screenshot({
  path: join(OUT, 'i06fdm-full-why-row-360.png'),
  fullPage: true,
});

const metrics = await page.evaluate(() => {
  const grid = document.querySelector('.v2-fd-signals-grid');
  const cards = [...document.querySelectorAll('.v2-fd-signal')];
  const cs = getComputedStyle(grid);
  const rects = cards.map((c) => {
    const r = c.getBoundingClientRect();
    return {
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      left: Math.round(r.left * 10) / 10,
      top: Math.round(r.top * 10) / 10,
    };
  });
  const shell = document.querySelector('.v2-shell')?.getBoundingClientRect();
  return {
    cols: cs.gridTemplateColumns,
    gap: cs.columnGap || cs.gap,
    overflowX: cs.overflowX,
    cardCount: cards.length,
    rects,
    sameRow: rects.every((r) => Math.abs(r.top - rects[0].top) < 1),
    leftGutter: Math.round((rects[0].left - (shell?.left ?? 0)) * 10) / 10,
    rightGutter:
      Math.round(((shell?.right ?? 360) - (rects.at(-1).left + rects.at(-1).w)) * 10) /
      10,
  };
});

console.log(JSON.stringify(metrics, null, 2));
await browser.close();
