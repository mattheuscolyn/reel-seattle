/**
 * Planner Landing visual QC — canonical comparison.
 * Run with v2 at http://127.0.0.1:5175/
 *
 * Full-page stitching disables sticky chrome and clears nav transform so
 * all four bottom-nav items remain visible.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = process.env.V2_BASE_URL || 'http://127.0.0.1:5175/';
const CANONICAL = join(
  ROOT,
  'Canonical Mockup Images',
  'Planner Main Page Upcoming.png',
);
const WIDTH = 470;

mkdirSync(OUT, { recursive: true });

const FULLPAGE_CHROME_RESET = `
.v2-header{position:static!important;}
.v2-shell{padding-bottom:0!important;}
.v2-nav{
  position:static!important;
  left:auto!important;
  right:auto!important;
  bottom:auto!important;
  transform:none!important;
  width:100%!important;
  max-width:none!important;
}
`;

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

async function waitReady(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function captureViewport(page, name) {
  const path = join(OUT, name);
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitReady(page);
  await page.screenshot({ path, fullPage: false });
  console.log(`wrote ${name}`);
  return path;
}

async function captureFullPage(page, name) {
  const path = join(OUT, name);
  await page.addStyleTag({ content: FULLPAGE_CHROME_RESET });
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitReady(page);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${name}`);
  return path;
}

async function navAudit(page, label) {
  const info = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.v2-nav-button')].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: b.innerText.replace(/\s+/g, ' ').trim(),
        visible: r.width > 0 && r.right > 1 && r.left < window.innerWidth - 1,
        active: b.classList.contains('v2-nav-button-active'),
        w: Math.round(r.width),
      };
    });
    return {
      labels: buttons.map((b) => b.text),
      allVisible: buttons.every((b) => b.visible),
      plannerActive: buttons.find((b) => b.text.includes('Planner'))?.active === true,
      equalWidth:
        buttons.length === 4 &&
        buttons.every((b) => Math.abs(b.w - buttons[0].w) <= 2),
    };
  });
  console.log(`nav (${label}):`, JSON.stringify(info));
  if (
    info.labels.join('|') !== 'Home|Explore|Planner|Profile' ||
    !info.allVisible ||
    !info.plannerActive ||
    !info.equalWidth
  ) {
    throw new Error(`Nav audit failed (${label}): ${JSON.stringify(info)}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: 852 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  // Production (honest empty) before/final
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="accepted-plans"]', {
    timeout: 15_000,
  });
  await waitReady(page);
  await navAudit(page, 'production-viewport');

  const beforePath = join(OUT, 'planner-audit-00-production-before.png');
  if (!existsSync(beforePath)) {
    await captureFullPage(page, 'planner-audit-00-production-before.png');
  } else {
    console.log('kept planner-audit-00-production-before.png');
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="accepted-plans"]');
  await captureViewport(page, 'planner-audit-01-production-viewport.png');
  await captureFullPage(page, 'planner-audit-02-production-full.png');

  // Mockup mode
  await page.goto(`${BASE}?plannerMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="planner-landing-mockup"]', {
    timeout: 15_000,
  });
  await page.waitForSelector('[data-planner-section="upcoming"]');
  await waitReady(page);
  await navAudit(page, 'mockup-viewport');
  await captureViewport(page, 'planner-audit-03-mockup-viewport.png');
  await captureFullPage(page, 'planner-audit-04-mockup-full.png');

  // Spot interactions on mockup
  await page.goto(`${BASE}?plannerMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="planner-landing-mockup"]');
  await page.getByRole('button', { name: /Build a Plan/i }).first().click();
  await page.waitForTimeout(400);
  const leftForBuild = (await page.locator('.v2-planner').count()) === 0;
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="planner-landing-mockup"]');
  await page.getByRole('button', { name: /View full timeline/i }).first().click();
  await page.waitForTimeout(400);
  const leftForTimeline = (await page.locator('.v2-planner').count()) === 0;

  await page.goto(`${BASE}?plannerMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('[data-planner-source="planner-landing-mockup"]');
  await page.getByRole('button', { name: /Review options/i }).first().click();
  await page.waitForSelector('[data-planner-conflict-review="open"]', {
    timeout: 10_000,
  });
  await captureViewport(page, 'planner-audit-08-conflict-review-viewport.png');
  const conflictReviewOpen =
    (await page.locator('[data-planner-conflict-review="open"]').count()) > 0;

  console.log(
    JSON.stringify({ leftForBuild, leftForTimeline, conflictReviewOpen }, null, 2),
  );

  // Comparisons
  if (existsSync(CANONICAL)) {
    try {
      const sharp = require('sharp');
      const targetW = 786;
      const mockup = join(OUT, 'planner-audit-04-mockup-full.png');
      const left = await sharp(mockup).resize({ width: targetW }).png().toBuffer();
      const right = await sharp(CANONICAL)
        .resize({ width: targetW })
        .png()
        .toBuffer();
      const lm = await sharp(left).metadata();
      const rm = await sharp(right).metadata();
      const h = Math.max(lm.height || 0, rm.height || 0);
      const pad = async (buf, meta) =>
        sharp(buf)
          .extend({
            top: 0,
            bottom: Math.max(0, h - (meta.height || 0)),
            background: { r: 7, g: 8, b: 13, alpha: 1 },
          })
          .png()
          .toBuffer();
      const L = await pad(left, lm);
      const R = await pad(right, rm);
      await sharp({
        create: {
          width: targetW * 2 + 16,
          height: h,
          channels: 3,
          background: { r: 20, g: 20, b: 24 },
        },
      })
        .composite([
          { input: L, left: 0, top: 0 },
          { input: R, left: targetW + 16, top: 0 },
        ])
        .png()
        .toFile(join(OUT, 'planner-audit-05-mockup-vs-canonical.png'));
      console.log('wrote planner-audit-05-mockup-vs-canonical.png');

      await sharp(R)
        .composite([{ input: L, blend: 'over', opacity: 0.45 }])
        .png()
        .toFile(join(OUT, 'planner-audit-06-mockup-vs-canonical-overlay.png'));
      console.log('wrote planner-audit-06-mockup-vs-canonical-overlay.png');

      const { data: cData, info: cInfo } = await sharp(R)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { data: iData } = await sharp(L)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const out = Buffer.alloc(cData.length);
      for (let i = 0; i < cData.length; i += 4) {
        const v = Math.min(
          255,
          Math.abs(cData[i] - iData[i]) +
            Math.abs(cData[i + 1] - iData[i + 1]) +
            Math.abs(cData[i + 2] - iData[i + 2]),
        );
        out[i] = v;
        out[i + 1] = v;
        out[i + 2] = v;
        out[i + 3] = 255;
      }
      await sharp(out, {
        raw: { width: cInfo.width, height: cInfo.height, channels: 4 },
      })
        .png()
        .toFile(join(OUT, 'planner-audit-07-diff.png'));
      console.log('wrote planner-audit-07-diff.png');
    } catch (err) {
      console.log(`comparison skipped: ${err.message}`);
    }
  }

  writeFileSync(
    join(OUT, 'planner-audit-capture-notes.txt'),
    [
      'Full-page captures disable sticky/fixed header+nav, clear nav transform,',
      'and zero .v2-shell padding-bottom so nav document-flow does not leave a blank gap.',
      'Viewport captures keep real sticky/fixed chrome.',
      'Mockup mode: ?plannerMockup=1',
      'Conflict review: Review options from Needs Attention',
      'Production uses accepted-plans source (honest empty when none).',
      '',
    ].join('\n'),
  );
} finally {
  await browser.close();
}
