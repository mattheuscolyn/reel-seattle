/**
 * Home Landing visual QC — canonical comparison state.
 * Run with v2 at http://127.0.0.1:5175/
 *
 * Captures:
 * - Production Home (before structural comparison)
 * - Mockup mode with Blue Hour expanded (`?homeMockup=1`)
 * - Side-by-side / overlay / diff vs Canonical Mockup Images/Home Landing Page.png
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
  'Home Landing Page.png',
);
const WIDTH = 393;

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

async function captureFullPage(page, name) {
  const path = join(OUT, name);
  // Sticky header/nav duplicates or clips in Chromium fullPage stitches.
  // Clearing position alone is not enough: .v2-nav keeps transform:translateX(-50%),
  // which shifts Home/Explore off-canvas when position is static.
  await page.addStyleTag({
    content: `
.v2-header{position:static!important;}
.v2-nav{
  position:static!important;
  left:auto!important;
  right:auto!important;
  bottom:auto!important;
  transform:none!important;
  width:100%!important;
  max-width:none!important;
}`,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${name}`);
  return path;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: 852 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  // Production Home — structural baseline
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await clearLocal(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.v2-home', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await captureFullPage(page, 'home-audit-01-production.png');

  // Mockup mode — canonical comparison state
  await page.goto(`${BASE}?homeMockup=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-home-source="home-landing-mockup"]', {
    timeout: 20_000,
  });
  await page.waitForSelector('#v2-opening .v2-inline-detail', {
    timeout: 10_000,
  });
  // Ensure second Opening card is expanded (Blue Hour)
  const expanded = await page.locator('#v2-opening .v2-shelf-card-expanded').count();
  if (expanded === 0) {
    await page.locator('#v2-opening .v2-shelf-card').nth(1).click();
    await page.waitForSelector('#v2-opening .v2-inline-detail');
  }
  await page.waitForTimeout(500);
  const finalPath = await captureFullPage(
    page,
    'home-audit-02-mockup-final.png',
  );

  // Direct comparison artifacts when sharp is available
  if (existsSync(CANONICAL) && existsSync(finalPath)) {
    try {
      const sharp = require('sharp');
      const canon = sharp(CANONICAL);
      const canonMeta = await canon.metadata();
      const impl = sharp(finalPath);
      const implMeta = await impl.metadata();
      const targetW = Math.min(canonMeta.width || WIDTH * 2, implMeta.width || WIDTH * 2);
      const canonBuf = await sharp(CANONICAL)
        .resize({ width: targetW })
        .png()
        .toBuffer();
      const implBuf = await sharp(finalPath)
        .resize({ width: targetW })
        .png()
        .toBuffer();
      const cMeta = await sharp(canonBuf).metadata();
      const iMeta = await sharp(implBuf).metadata();
      const h = Math.max(cMeta.height || 0, iMeta.height || 0);
      const padCanon = await sharp(canonBuf)
        .extend({
          top: 0,
          bottom: Math.max(0, h - (cMeta.height || 0)),
          background: { r: 7, g: 8, b: 13, alpha: 1 },
        })
        .png()
        .toBuffer();
      const padImpl = await sharp(implBuf)
        .extend({
          top: 0,
          bottom: Math.max(0, h - (iMeta.height || 0)),
          background: { r: 7, g: 8, b: 13, alpha: 1 },
        })
        .png()
        .toBuffer();

      await sharp({
        create: {
          width: targetW * 2 + 16,
          height: h,
          channels: 3,
          background: { r: 20, g: 20, b: 24 },
        },
      })
        .composite([
          { input: padCanon, left: 0, top: 0 },
          { input: padImpl, left: targetW + 16, top: 0 },
        ])
        .png()
        .toFile(join(OUT, 'home-audit-03-side-by-side.png'));
      console.log('wrote home-audit-03-side-by-side.png');

      await sharp(padCanon)
        .composite([{ input: padImpl, blend: 'over', opacity: 0.45 }])
        .png()
        .toFile(join(OUT, 'home-audit-04-overlay.png'));
      console.log('wrote home-audit-04-overlay.png');

      // Absolute difference approximation via raw XOR-like luminance
      const { data: cData, info: cInfo } = await sharp(padCanon)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { data: iData } = await sharp(padImpl)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const out = Buffer.alloc(cData.length);
      for (let i = 0; i < cData.length; i += 4) {
        const dr = Math.abs(cData[i] - iData[i]);
        const dg = Math.abs(cData[i + 1] - iData[i + 1]);
        const db = Math.abs(cData[i + 2] - iData[i + 2]);
        const v = Math.min(255, dr + dg + db);
        out[i] = v;
        out[i + 1] = v;
        out[i + 2] = v;
        out[i + 3] = 255;
      }
      await sharp(out, {
        raw: {
          width: cInfo.width,
          height: cInfo.height,
          channels: 4,
        },
      })
        .png()
        .toFile(join(OUT, 'home-audit-05-diff.png'));
      console.log('wrote home-audit-05-diff.png');
    } catch (err) {
      console.log(`comparison skipped: ${err.message}`);
      writeFileSync(
        join(OUT, 'home-audit-compare-note.txt'),
        `Canonical: ${CANONICAL}\nImplementation: ${finalPath}\nInstall sharp for automated side-by-side/overlay/diff.\n`,
      );
    }
  }
} finally {
  await browser.close();
}
