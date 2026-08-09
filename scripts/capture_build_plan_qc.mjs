/**
 * Build a Plan accordion visual QC.
 * Requires v2 at http://127.0.0.1:5175/
 *
 * Viewport captures keep real fixed bottom nav.
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = process.env.V2_BASE_URL || 'http://127.0.0.1:5175/';
const CANON_COLLAPSED = join(
  ROOT,
  'Canonical Mockup Images',
  'Build a Plan Page.png',
);
const CANON_EXPANDED = join(
  ROOT,
  'Canonical Mockup Images',
  'Build a Plan Page Expanded.png',
);
const WIDTH = 393;

mkdirSync(OUT, { recursive: true });

const FULLPAGE_CHROME_RESET = `
.v2-header{position:static!important;}
.v2-shell{padding-bottom:0!important;}
.v2-nav{
  position:static!important;
  left:auto!important;right:auto!important;bottom:auto!important;
  transform:none!important;width:100%!important;max-width:none!important;
}
`;

async function waitReady(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function openMockup(page, section = 'none') {
  const url = `${BASE}?buildPlanMockup=1&section=${encodeURIComponent(section)}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-build-plan-source="build-plan-mockup"]', {
    timeout: 15_000,
  });
  await waitReady(page);
}

async function assertNav(page, label) {
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
      plannerActive: buttons.find((b) => b.text.includes('Planner'))?.active,
      equalWidth:
        buttons.length === 4 &&
        buttons.every((b) => Math.abs(b.w - buttons[0].w) <= 2),
    };
  });
  if (
    info.labels.join('|') !== 'Home|Explore|Planner|Profile' ||
    !info.allVisible ||
    !info.plannerActive ||
    !info.equalWidth
  ) {
    throw new Error(`Nav audit failed (${label}): ${JSON.stringify(info)}`);
  }
}

async function captureViewport(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitReady(page);
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log(`wrote ${name}`);
}

async function captureFull(page, name) {
  await page.addStyleTag({ content: FULLPAGE_CHROME_RESET });
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitReady(page);
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  console.log(`wrote ${name}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: 852 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const report = { interactions: {} };

try {
  // Production
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('reel-seattle.v2.')) localStorage.removeItem(k);
    }
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.waitForSelector('.v2-planner');
  await page.getByRole('button', { name: /Build a Plan/i }).first().click();
  await page.waitForSelector('[data-build-plan-source="live-form"]');
  await waitReady(page);
  await assertNav(page, 'production');
  const openCount = await page.locator('.v2-bp-acc.is-open').count();
  if (openCount !== 0) throw new Error('Production should start collapsed');
  await captureViewport(page, 'bp-audit-00-production-viewport.png');

  // Collapsed mockup
  await openMockup(page, 'none');
  await assertNav(page, 'mockup-collapsed');
  await captureViewport(page, 'bp-audit-01-collapsed-viewport.png');
  await captureFull(page, 'bp-audit-02-collapsed-full.png');

  // Per-section expanded
  for (const [section, slug] of [
    ['when', '03-when'],
    ['what', '04-what'],
    ['where', '05-where'],
    ['fine-tuning', '06-fine'],
  ]) {
    await openMockup(page, section);
    const open = await page.getAttribute('.v2-bp', 'data-bp-open-section');
    const expected =
      section === 'fine-tuning' ? 'fineTuning' : section;
    if (open !== expected) {
      throw new Error(`Expected open ${expected}, got ${open}`);
    }
    const opens = await page.locator('.v2-bp-acc.is-open').count();
    if (opens !== 1) throw new Error(`${section}: expected 1 open, got ${opens}`);
    await captureViewport(page, `bp-audit-${slug}-viewport.png`);
    await captureFull(page, `bp-audit-${slug}-full.png`);
  }

  // Interaction sequence
  await openMockup(page, 'none');
  await page.locator('#v2-bp-acc-when').click();
  await page.waitForTimeout(200);
  await page.locator('#v2-bp-flexible').click({ force: true });
  const flexOff = await page.locator('#v2-bp-flexible').isChecked();
  await page.locator('#v2-bp-acc-what').click();
  await page.waitForTimeout(250);
  const afterWhat = await page.getAttribute('.v2-bp', 'data-bp-open-section');
  const whenExpanded = await page
    .locator('#v2-bp-acc-when')
    .getAttribute('aria-expanded');
  await page.locator('#v2-bp-acc-when').click();
  await page.waitForTimeout(200);
  const flexStill = await page.locator('#v2-bp-flexible').isChecked();
  report.interactions = {
    flexAfterToggle: flexOff,
    openAfterWhat: afterWhat,
    whenCollapsedWhenWhatOpen: whenExpanded === 'false',
    flexSurvivedRoundTrip: flexStill === flexOff,
  };
  if (afterWhat !== 'what' || whenExpanded !== 'false') {
    throw new Error(`Accordion switch failed: ${JSON.stringify(report.interactions)}`);
  }
  if (flexStill !== flexOff) {
    throw new Error('Flexible value did not survive collapse/reopen');
  }

  // Bottom clearance with fixed nav
  await openMockup(page, 'none');
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.waitForTimeout(150);
  const clearance = await page.evaluate(() => {
    const cta = document.querySelector('.v2-bp-cta');
    const nav = document.querySelector('.v2-nav');
    const cr = cta.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    return Math.round(nr.top - cr.bottom);
  });
  report.ctaNavGap = clearance;
  if (clearance < 8) {
    throw new Error(`CTA under nav: gap ${clearance}`);
  }
  await page.screenshot({
    path: join(OUT, 'bp-audit-07-bottom-fixed-nav.png'),
    fullPage: false,
  });
  console.log('wrote bp-audit-07-bottom-fixed-nav.png');

  // Comparisons
  if (existsSync(CANON_COLLAPSED)) {
    try {
      const sharp = require('sharp');
      const targetW = 786;
      const live = join(OUT, 'bp-audit-02-collapsed-full.png');
      const L = await sharp(live).resize({ width: targetW }).png().toBuffer();
      const R = await sharp(CANON_COLLAPSED)
        .resize({ width: targetW })
        .png()
        .toBuffer();
      const lm = await sharp(L).metadata();
      const rm = await sharp(R).metadata();
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
      const left = await pad(L, lm);
      const right = await pad(R, rm);
      await sharp({
        create: {
          width: targetW * 2 + 16,
          height: h,
          channels: 3,
          background: { r: 20, g: 20, b: 24 },
        },
      })
        .composite([
          { input: left, left: 0, top: 0 },
          { input: right, left: targetW + 16, top: 0 },
        ])
        .png()
        .toFile(join(OUT, 'bp-audit-08-collapsed-vs-canonical.png'));
      await sharp(right)
        .composite([{ input: left, blend: 'over', opacity: 0.45 }])
        .png()
        .toFile(join(OUT, 'bp-audit-09-collapsed-overlay.png'));
      console.log('wrote collapsed comparisons');
    } catch (err) {
      console.log(`collapsed comparison skipped: ${err.message}`);
    }
  }

  // QC-only composite of single-open captures (not production behavior)
  if (existsSync(CANON_EXPANDED)) {
    try {
      const sharp = require('sharp');
      const parts = [
        'bp-audit-03-when-full.png',
        'bp-audit-04-what-full.png',
        'bp-audit-05-where-full.png',
        'bp-audit-06-fine-full.png',
      ].map((n) => join(OUT, n));
      const bufs = [];
      for (const p of parts) {
        if (existsSync(p)) {
          bufs.push(await sharp(p).resize({ width: 393 }).png().toBuffer());
        }
      }
      if (bufs.length) {
        const metas = await Promise.all(bufs.map((b) => sharp(b).metadata()));
        const height = metas.reduce((s, m) => s + (m.height || 0), 0);
        let top = 0;
        const composite = [];
        for (let i = 0; i < bufs.length; i += 1) {
          composite.push({ input: bufs[i], left: 0, top });
          top += metas[i].height || 0;
        }
        await sharp({
          create: {
            width: 393,
            height,
            channels: 3,
            background: { r: 7, g: 8, b: 13 },
          },
        })
          .composite(composite)
          .png()
          .toFile(join(OUT, 'bp-audit-10-expanded-qc-composite-NOT-PRODUCTION.png'));
        console.log('wrote QC composite (not production behavior)');
      }
    } catch (err) {
      console.log(`expanded composite skipped: ${err.message}`);
    }
  }

  writeFileSync(join(OUT, 'bp-audit-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Build a Plan QC ok');
} finally {
  await browser.close();
}
