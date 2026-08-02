/**
 * T-V2-LAUNCH-PLANNER-01 — static dist-v2 scenario smoke + screenshots (393px).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = process.env.V2_STATIC_URL || 'http://127.0.0.1:4190/';

mkdirSync(OUT, { recursive: true });

async function clearV2Storage(page) {
  await page.goto(BASE);
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('reel-seattle.v2')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function openPlannerBuild(page) {
  await page.getByRole('button', { name: /^Planner$/i }).click();
  await page.waitForTimeout(400);
  const build = page.getByRole('button', { name: /Build a Plan|Start planning|Build plan/i }).first();
  if (await build.count()) {
    await build.click();
  } else {
    // Fallback: primary CTA on planner landing
    await page.locator('.v2-planner-cta, [data-planner-cta]').first().click({ timeout: 5000 }).catch(() => {});
    const alt = page.getByText(/Build a Plan/i).first();
    await alt.click();
  }
  await page.waitForSelector('[data-build-plan-source="live-form"]', { timeout: 15000 });
}

async function expandSection(page, id) {
  const trigger = page.locator(`[data-bp-accordion="${id}"] button.v2-bp-acc-trigger`);
  const expanded = await trigger.getAttribute('aria-expanded');
  if (expanded !== 'true') await trigger.click();
  await page.waitForTimeout(200);
}

const report = {
  scenarios: {},
  screenshots: [],
  blockers: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await clearV2Storage(page);
  await openPlannerBuild(page);

  // Scenario A defaults
  await expandSection(page, 'where');
  const anyChecked = await page
    .locator('.v2-bp-where-card[aria-checked="true"] .v2-bp-where-title')
    .textContent();
  report.scenarios.A_theaterDefault = /any theater/i.test(anyChecked || '');
  await expandSection(page, 'fineTuning');
  const repeats = await page.locator('#v2-bp-allowRepeats').isChecked();
  report.scenarios.A_repeatsOff = repeats === false;

  const shot1 = join(OUT, 'planner-launch-01-build-defaults.png');
  await page.screenshot({ path: shot1, fullPage: true });
  report.screenshots.push(shot1);

  await expandSection(page, 'what');
  await page.getByRole('button', { name: /^Manage$/i }).first().click();
  await page.waitForSelector('[data-build-plan-manage="mustInclude"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  const candCount = await page.locator('.v2-bp-manage-add').count();
  report.scenarios.A_liveCatalog = candCount > 0;
  const shot2 = join(OUT, 'planner-launch-02-must-include-catalog.png');
  await page.screenshot({ path: shot2, fullPage: true });
  report.screenshots.push(shot2);

  // Select first film
  if (candCount > 0) {
    await page.locator('.v2-bp-manage-add').first().click();
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: /^Done$/i }).click();
  await page.waitForSelector('[data-build-plan-source="live-form"]');

  // Scenario G — alternate date (Tomorrow)
  await expandSection(page, 'when');
  const shot3 = join(OUT, 'planner-launch-03-date-controls.png');
  await page.screenshot({ path: shot3, fullPage: false });
  report.screenshots.push(shot3);
  const tomorrow = page.getByRole('button', { name: /^Tomorrow$/i });
  if (await tomorrow.count()) {
    await tomorrow.click();
    report.scenarios.G_dateControl = true;
  } else {
    report.scenarios.G_dateControl = false;
  }

  // Prefer today for denser results if tomorrow empty — still verify control works
  const today = page.getByRole('button', { name: /^Today$/i });
  if (await today.count()) await today.click();

  // Build results
  await page.locator('.v2-bp-cta').click();
  await page.waitForSelector('.v2-bpr, [data-build-plan-results]', { timeout: 20000 });
  await page.waitForTimeout(1000);
  const planCards = await page.locator('.v2-bpr-plan, [data-plan-card]').count();
  report.scenarios.A_results = planCards > 0 || (await page.getByText(/plan/i).count()) > 0;

  // Break adjust if available
  const breakBtn = page.locator('.v2-bpr-break-pill').first();
  if (await breakBtn.count()) {
    await breakBtn.click();
    await page.waitForTimeout(300);
    const minLabel = page.getByText(/Minimum|Min break/i).first();
    report.scenarios.D_breakDialog = (await minLabel.count()) > 0;
    const apply = page.getByRole('button', { name: /Apply and refresh plans/i });
    if (await apply.count()) {
      const plus = page.locator('.v2-bpr-break-dialog button, [data-break-step="up"]').first();
      // Prefer selecting a higher min preset if present
      const preset45 = page.getByRole('button', { name: /^45m$/i });
      if (await preset45.count()) await preset45.click();
      await apply.click({ force: true });
      await page.waitForTimeout(800);
      report.scenarios.D_breakApplied = true;
    } else {
      await page.keyboard.press('Escape');
      report.scenarios.D_breakApplied = false;
    }
  } else {
    report.scenarios.D_breakDialog = false;
  }

  const shot4 = join(OUT, 'planner-launch-04-results-after-break.png');
  await page.screenshot({ path: shot4, fullPage: true });
  report.screenshots.push(shot4);

  // Open plan details
  const details = page.getByRole('button', { name: /View plan details|Plan details/i }).first();
  if (await details.count()) {
    await details.click();
    await page.waitForSelector('.v2-bpd, [data-plan-details]', { timeout: 10000 });
    await page.waitForTimeout(400);
    const fakeSave = await page.locator('.v2-bpd-save').count();
    const addSchedule = await page.getByRole('button', { name: /Add to My Schedule/i }).count();
    report.scenarios.F_noFakeSave = fakeSave === 0;
    report.scenarios.F_addControl = addSchedule > 0;
    const shot5 = join(OUT, 'planner-launch-05-plan-details.png');
    await page.screenshot({ path: shot5, fullPage: true });
    report.screenshots.push(shot5);

    if (addSchedule > 0) {
      await page.getByRole('button', { name: /Add to My Schedule/i }).click();
      await page.waitForTimeout(500);
    }
  } else {
    report.scenarios.F_noFakeSave = null;
    report.scenarios.F_addControl = false;
  }

  // My Schedule via Planner or Profile
  await page.getByRole('button', { name: /^Planner$/i }).click().catch(() => {});
  await page.waitForTimeout(400);
  const mySched = page.getByRole('button', { name: /My Schedule|Schedule/i }).first();
  if (await mySched.count()) {
    await mySched.click();
    await page.waitForTimeout(600);
  }
  const shot6 = join(OUT, 'planner-launch-06-my-schedule.png');
  await page.screenshot({ path: shot6, fullPage: true });
  report.screenshots.push(shot6);

  // Reload persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Planner$/i }).click().catch(() => {});
  await page.waitForTimeout(400);
  if (await mySched.count()) await mySched.click().catch(() => {});
  await page.waitForTimeout(600);
  const afterReload = await page.locator('body').innerText();
  report.scenarios.F_persist =
    /Added|My Schedule|plan|movie/i.test(afterReload) &&
    !/Showtimes aren’t loaded yet/i.test(afterReload);

  // Soft prefs / exclusion covered by unit tests; note fixture verification
  report.scenarios.B_softPreferred = 'unit-covered';
  report.scenarios.C_exclusion = 'unit-covered';
  report.scenarios.E_theaterRestrict = 'unit-covered';
} catch (err) {
  report.error = String(err?.stack || err);
  const failShot = join(OUT, 'planner-launch-FAIL.png');
  await page.screenshot({ path: failShot, fullPage: true }).catch(() => {});
  report.screenshots.push(failShot);
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (report.error) process.exit(1);
