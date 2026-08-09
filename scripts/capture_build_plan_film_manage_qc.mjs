/**
 * Build a Plan film-manage visual QC.
 * Requires v2 at http://127.0.0.1:5175/
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
const WIDTH = 393;
const CANON_LOVE = join(
  ROOT,
  'Canonical Mockup Images',
  'Build a Plan Page Manage Would Love To See.png',
);
const CANON_NI = join(
  ROOT,
  'Canonical Mockup Images',
  'Build a Plan Page Manage Not Interested In.png',
);

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

async function openManage(page, mode) {
  const url = `${BASE}?buildPlanMockup=1&manage=${encodeURIComponent(mode)}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-build-plan-manage="${mode}"]`, {
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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: WIDTH, height: 852 },
  deviceScaleFactor: 2,
});
const report = { interactions: {}, clearance: {} };

try {
  for (const [mode, slug] of [
    ['wouldLove', 'love'],
    ['notInterested', 'ni'],
    ['mustInclude', 'must'],
  ]) {
    await openManage(page, mode);
    await assertNav(page, mode);
    const chipAudit = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.v2-bp-manage-chip')];
      const vw = window.innerWidth;
      return chips.map((c) => {
        const r = c.getBoundingClientRect();
        const label = c.querySelector('span:last-child');
        const labelOverflow =
          label && label.scrollWidth > label.clientWidth + 1;
        return {
          text: c.innerText.replace(/\s+/g, ' ').trim(),
          left: Math.round(r.left),
          right: Math.round(r.right),
          fullyVisible: r.left >= 0 && r.right <= vw + 0.5 && r.width > 8,
          labelOverflow: Boolean(labelOverflow),
        };
      });
    });
    if (
      chipAudit.length !== 4 ||
      chipAudit.some((c) => !c.fullyVisible || c.labelOverflow)
    ) {
      throw new Error(`Chip audit failed (${mode}): ${JSON.stringify(chipAudit)}`);
    }
    report.chips = report.chips || {};
    report.chips[mode] = chipAudit;

    const sticky = await page.evaluate(() => {
      const footer = document.querySelector('.v2-bp-manage-footer');
      return footer ? getComputedStyle(footer).position : null;
    });
    if (sticky !== 'static') {
      throw new Error(`${mode} footer position ${sticky}`);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await waitReady(page);
    await page.screenshot({
      path: join(OUT, `bp-manage-${slug}-viewport.png`),
      fullPage: false,
    });

    await page.addStyleTag({ content: FULLPAGE_CHROME_RESET });
    await page.screenshot({
      path: join(OUT, `bp-manage-${slug}-full.png`),
      fullPage: true,
    });
    // reload clean for bottom nav capture
    await openManage(page, mode);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.waitForTimeout(150);
    const gap = await page.evaluate(() => {
      const done = document.querySelector('.v2-bp-manage-done');
      const nav = document.querySelector('.v2-nav');
      return Math.round(
        nav.getBoundingClientRect().top - done.getBoundingClientRect().bottom,
      );
    });
    report.clearance[mode] = gap;
    if (gap < 8) throw new Error(`${mode} Done under nav: ${gap}`);
    await page.screenshot({
      path: join(OUT, `bp-manage-${slug}-bottom-nav.png`),
      fullPage: false,
    });
    console.log(`wrote ${slug}`, gap);
  }

  // Interaction: add/remove + return What
  await openManage(page, 'wouldLove');
  const before = await page.locator('.v2-bp-manage-count-badge').innerText();
  await page.getByRole('button', { name: /Add All That Heaven Allows/i }).click();
  await page.waitForTimeout(150);
  const afterAdd = await page.locator('.v2-bp-manage-count-badge').innerText();
  await page
    .getByRole('button', { name: /Remove Perfect Blue from would love/i })
    .click();
  await page.waitForTimeout(150);
  const afterRemove = await page.locator('.v2-bp-manage-count-badge').innerText();
  await page.getByRole('button', { name: /^Done$/i }).click();
  await page.waitForSelector('[data-build-plan-source="build-plan-mockup"]');
  const openWhat = await page.getAttribute('.v2-bp', 'data-bp-open-section');
  report.interactions = {
    before: Number(before),
    afterAdd: Number(afterAdd),
    afterRemove: Number(afterRemove),
    openWhat,
  };
  if (Number(afterAdd) !== Number(before) + 1) {
    throw new Error(`add failed: ${JSON.stringify(report.interactions)}`);
  }
  if (openWhat !== 'what') {
    throw new Error(`expected What open, got ${openWhat}`);
  }

  // Comparisons — full-page like-for-like at 393px
  const sharp = require('sharp');
  async function compareFull(liveName, canonPath, outSide, outOverlay) {
    if (!existsSync(canonPath) || !existsSync(join(OUT, liveName))) return;
    const targetW = 393;
    const L = await sharp(join(OUT, liveName))
      .resize({ width: targetW })
      .png()
      .toBuffer();
    const R = await sharp(canonPath).resize({ width: targetW }).png().toBuffer();
    const lm = await sharp(L).metadata();
    const rm = await sharp(R).metadata();
    const h = Math.max(lm.height || 0, rm.height || 0);
    const pad = async (buf, meta) => {
      if ((meta.height || 0) >= h) {
        return sharp(buf).resize({ width: targetW, height: h, fit: 'cover', position: 'top' }).png().toBuffer();
      }
      return sharp({
        create: {
          width: targetW,
          height: h,
          channels: 3,
          background: '#07080d',
        },
      })
        .composite([{ input: buf, top: 0, left: 0 }])
        .png()
        .toBuffer();
    };
    const Lp = await pad(L, lm);
    const Rp = await pad(R, rm);
    const label = Buffer.from(
      `<svg width="${targetW * 2 + 16}" height="28" xmlns="http://www.w3.org/2000/svg"><text x="8" y="18" fill="#aaa" font-size="11" font-family="sans-serif">Full page @393 — canonical (left) vs live (right)</text></svg>`,
    );
    await sharp({
      create: {
        width: targetW * 2 + 16,
        height: h + 28,
        channels: 3,
        background: '#111',
      },
    })
      .composite([
        { input: label, top: 0, left: 0 },
        { input: Rp, top: 28, left: 4 },
        { input: Lp, top: 28, left: targetW + 12 },
      ])
      .png()
      .toFile(join(OUT, outSide));
    await sharp(Lp)
      .composite([{ input: Rp, blend: 'overlay', top: 0, left: 0 }])
      .png()
      .toFile(join(OUT, outOverlay));
    console.log('wrote', outSide, outOverlay);
  }

  await compareFull(
    'bp-manage-love-full.png',
    CANON_LOVE,
    'bp-manage-love-full-vs-canonical.png',
    'bp-manage-love-full-overlay.png',
  );
  await compareFull(
    'bp-manage-ni-full.png',
    CANON_NI,
    'bp-manage-ni-full-vs-canonical.png',
    'bp-manage-ni-full-overlay.png',
  );

  writeFileSync(join(OUT, 'bp-manage-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
