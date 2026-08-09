/**
 * Build a Plan Results visual QC — base + Time/Film/Break overlays.
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = process.env.V2_BASE_URL || 'http://127.0.0.1:5175/';
const WIDTH = 393;

const CANONS = {
  base: join(ROOT, 'Canonical Mockup Images', 'Build a Plan Results Page.png'),
  time: join(
    ROOT,
    'Canonical Mockup Images',
    'Build a Plan Results Page Time Interaction.png',
  ),
  film: join(
    ROOT,
    'Canonical Mockup Images',
    'Build a Plan Results Page Film Interaction.png',
  ),
  break: join(
    ROOT,
    'Canonical Mockup Images',
    'Build a Plan Results Page Break Interaction.png',
  ),
};

mkdirSync(OUT, { recursive: true });

async function normalizeCanon(key, src) {
  const out = join(OUT, `canon-393-bpr-${key}.png`);
  await sharp(src).resize({ width: WIDTH }).png().toFile(out);
  return out;
}

async function waitReady(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function openResults(page, interaction = 'none') {
  const q =
    interaction && interaction !== 'none'
      ? `?planResultsMockup=1&interaction=${encodeURIComponent(interaction)}`
      : '?planResultsMockup=1&interaction=none';
  await page.goto(`${BASE}${q}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-build-plan-results-source]', {
    timeout: 20_000,
  });
  await waitReady(page);
}

async function assertNav(page) {
  const info = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.v2-nav-button')].map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: b.innerText.replace(/\s+/g, ' ').trim(),
        visible: r.width > 0 && r.right > 1 && r.left < window.innerWidth - 1,
        active: b.classList.contains('v2-nav-button-active'),
      };
    });
    return {
      labels: buttons.map((b) => b.text),
      allVisible: buttons.every((b) => b.visible),
      plannerActive: buttons.find((b) => b.text.includes('Planner'))?.active,
    };
  });
  if (
    info.labels.join('|') !== 'Home|Explore|Planner|Profile' ||
    !info.allVisible ||
    !info.plannerActive
  ) {
    throw new Error(`Nav audit failed: ${JSON.stringify(info)}`);
  }
}

async function compare(livePath, canonPath, outSide, outOverlay) {
  if (!existsSync(livePath) || !existsSync(canonPath)) return;
  const targetW = WIDTH;
  const L = await sharp(livePath).resize({ width: targetW }).png().toBuffer();
  const R = await sharp(canonPath).resize({ width: targetW }).png().toBuffer();
  const lm = await sharp(L).metadata();
  const rm = await sharp(R).metadata();
  const h = Math.max(lm.height || 0, rm.height || 0);
  const pad = async (buf, meta) => {
    if ((meta.height || 0) >= h) {
      return sharp(buf)
        .resize({ width: targetW, height: h, fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
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
  await sharp({
    create: {
      width: targetW * 2 + 12,
      height: h,
      channels: 3,
      background: '#111',
    },
  })
    .composite([
      { input: Rp, top: 0, left: 0 },
      { input: Lp, top: 0, left: targetW + 12 },
    ])
    .png()
    .toFile(join(OUT, outSide));
  await sharp(Lp)
    .composite([{ input: Rp, blend: 'overlay', top: 0, left: 0 }])
    .png()
    .toFile(join(OUT, outOverlay));
  console.log('wrote', outSide, outOverlay);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: WIDTH, height: 852 },
  deviceScaleFactor: 2,
});
const report = {};

try {
  for (const [key, src] of Object.entries(CANONS)) {
    await normalizeCanon(key, src);
  }

  // Base
  await openResults(page, 'none');
  await assertNav(page);
  await page.screenshot({
    path: join(OUT, 'bpr-base-viewport.png'),
    fullPage: false,
  });
  await page.screenshot({
    path: join(OUT, 'bpr-base-full.png'),
    fullPage: true,
  });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.waitForTimeout(150);
  await page.screenshot({
    path: join(OUT, 'bpr-base-bottom-nav.png'),
    fullPage: false,
  });

  // Interactions
  for (const interaction of ['time', 'film', 'break']) {
    await openResults(page, interaction);
    await assertNav(page);
    await page.waitForSelector(
      `[data-bpr-adjustment="${interaction}"], .v2-bpr-adj-dialog`,
      { timeout: 10_000 },
    );
    await waitReady(page);
    await page.screenshot({
      path: join(OUT, `bpr-${interaction}-viewport.png`),
      fullPage: false,
    });
  }

  // Short viewport modal
  await page.setViewportSize({ width: WIDTH, height: 667 });
  for (const interaction of ['time', 'film', 'break']) {
    await openResults(page, interaction);
    await page.waitForSelector('.v2-bpr-adj-dialog', { timeout: 10_000 });
    await waitReady(page);
    await page.screenshot({
      path: join(OUT, `bpr-${interaction}-short-667.png`),
      fullPage: false,
    });
  }

  await page.setViewportSize({ width: WIDTH, height: 852 });

  await compare(
    join(OUT, 'bpr-base-viewport.png'),
    join(OUT, 'canon-393-bpr-base.png'),
    'bpr-base-vs-canonical.png',
    'bpr-base-overlay.png',
  );
  await compare(
    join(OUT, 'bpr-time-viewport.png'),
    join(OUT, 'canon-393-bpr-time.png'),
    'bpr-time-vs-canonical.png',
    'bpr-time-overlay.png',
  );
  await compare(
    join(OUT, 'bpr-film-viewport.png'),
    join(OUT, 'canon-393-bpr-film.png'),
    'bpr-film-vs-canonical.png',
    'bpr-film-overlay.png',
  );
  await compare(
    join(OUT, 'bpr-break-viewport.png'),
    join(OUT, 'canon-393-bpr-break.png'),
    'bpr-break-vs-canonical.png',
    'bpr-break-overlay.png',
  );

  report.ok = true;
  writeFileSync(join(OUT, 'bpr-qc-report.json'), JSON.stringify(report, null, 2));
  console.log('QC complete');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
