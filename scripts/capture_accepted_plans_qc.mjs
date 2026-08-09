/**
 * Capture T-PLAN-01 accepted-plans QC screenshots (~360px).
 * Run: node scripts/capture_accepted_plans_qc.mjs
 * Requires v2 at http://127.0.0.1:5175/
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = 'http://127.0.0.1:5175/';
const VIEWPORT = { width: 360, height: 800 };
const KEY = 'reel-seattle.v2.acceptedPlans';

mkdirSync(OUT, { recursive: true });

function buildSeedPlan() {
  // Deterministic live plan for Aug 1 2026 (Saturday) multi-film group.
  const startsA = new Date(Date.UTC(2026, 7, 2, 2, 0, 0)); // 19:00 PDT
  const endsA = new Date(startsA.getTime() + (15 + 137) * 60_000);
  const startsB = new Date(Date.UTC(2026, 7, 2, 5, 0, 0)); // 22:00 PDT
  const endsB = new Date(startsB.getTime() + (15 + 81) * 60_000);
  return {
    version: 1,
    items: [
      {
        planId:
          'accepted:2026-08-01:src:beacon:the-beacon:beacon-1+src:siff:siff-film-center:siff-2',
        acceptedAt: '2026-07-28T18:00:00.000Z',
        label: 'QC multi plan',
        date: '2026-08-01',
        timezone: 'America/Los_Angeles',
        provenance: 'live',
        settingsSnapshot: null,
        performances: [
          {
            performanceKey: 'src:beacon:the-beacon:beacon-1',
            filmId: null,
            filmKey: 'sinners',
            title: 'Sinners',
            theaterId: 'the-beacon',
            theaterName: 'The Beacon',
            source: 'beacon',
            sourceShowtimeId: 'beacon-1',
            opportunityKey: null,
            localDate: '2026-08-01',
            localTime: '19:00',
            startsAt: startsA.toISOString(),
            expectedEndsAt: endsA.toISOString(),
            runtimeMin: 137,
            format: '35mm',
            ticketUrl: null,
            addressLabel: '4405 Rainier Ave S, Seattle, WA 98118',
            posterUrl: null,
          },
          {
            performanceKey: 'src:siff:siff-film-center:siff-2',
            filmId: null,
            filmKey: 'perfect-blue',
            title: 'Perfect Blue',
            theaterId: 'siff-film-center',
            theaterName: 'SIFF Film Center',
            source: 'siff',
            sourceShowtimeId: 'siff-2',
            opportunityKey: null,
            localDate: '2026-08-01',
            localTime: '22:00',
            startsAt: startsB.toISOString(),
            expectedEndsAt: endsB.toISOString(),
            runtimeMin: 81,
            format: 'Subtitled',
            ticketUrl: null,
            addressLabel: null,
            posterUrl: null,
          },
        ],
      },
    ],
  };
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log('wrote', name);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

try {
  // Fixture Results — Add to Schedule rejects
  await page.goto(`${BASE}?planResultsMockup=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('reel-seattle.v2.')) localStorage.removeItem(key);
    }
  });
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
  await shot(page, 't-plan-01-01-results-accept-control.png');
  await page
    .getByRole('button', { name: /Add to My Schedule for plan/i })
    .first()
    .click();
  await page.waitForTimeout(400);
  await shot(page, 't-plan-01-02-results-fixture-rejected.png');

  await page.locator('.v2-bpr-share').click();
  await page.waitForTimeout(400);
  await shot(page, 't-plan-01-03-results-share-fixture.png');

  // Seed accepted plan and open live My Schedule
  await page.evaluate((payload) => {
    localStorage.setItem('reel-seattle.v2.acceptedPlans', JSON.stringify(payload));
  }, buildSeedPlan());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.getByRole('button', { name: /My Schedule/i }).first().click();
  await page.waitForSelector('[data-schedule-mode="accepted-plans"]', {
    timeout: 15_000,
  });
  // Navigate toward Aug 2026 if needed — seed date is 2026-08-01
  // From "today" Jul 28 2026 in user_info... wait user_info said Jul 28 2026. Week of Jul 27 includes Aug 1? 
  // Jul 27 Mon - Aug 2 Sun includes Aug 1. If "today" is Jul 28 2026, weekOffset 0 shows the plan.
  await shot(page, 't-plan-01-04-schedule-live-empty-or-plan.png');
  const group = page.locator('[data-schedule-plan-group]').first();
  if (await group.count()) {
    await group.scrollIntoViewIfNeeded();
    await shot(page, 't-plan-01-05-schedule-multi-plan.png');
  }

  // Mockup schedule still available
  await page.goto(`${BASE}?scheduleMockup=1`, { waitUntil: 'networkidle' });
  await page.locator('.v2-nav-button', { hasText: 'Planner' }).click();
  await page.getByRole('button', { name: /My Schedule/i }).first().click();
  await page.waitForSelector('[data-schedule-mode="mockup-fixture"]', {
    timeout: 15_000,
  });
  await shot(page, 't-plan-01-06-schedule-mockup.png');
} finally {
  await browser.close();
}

console.log(`T-PLAN-01 QC screenshots written to ${OUT}`);
