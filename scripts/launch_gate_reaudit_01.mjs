/**
 * T-V2-LAUNCH-GATE-REAUDIT-01 — static artifact diagnostics + UI gate.
 * Pure audit; does not mutate product code.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp-v2-qc');
const BASE = process.env.V2_STATIC_URL || 'http://127.0.0.1:4191/';
const reportPath = join(OUT, 'launch-gate-reaudit-01-report.json');

mkdirSync(OUT, { recursive: true });

// --- Import eligibility helpers from built sources via dynamic import ---
const {
  listEligibleBrowseOpportunities,
  opportunityDedupeKey,
  isEligibleBrowseOpportunity,
  opportunitySortableKey,
  pacificSortableDateTime,
} = await import('../v2/showtimes/showtimeEligibility.js');
const { pacificDateString, addIsoDays } = await import('../v2/explore/exploreCatalog.js');
const { buildHomeData } = await import('../v2/adapters/buildHomeData.js');

function inventoryDist() {
  const dist = join(ROOT, 'dist-v2');
  const dataDir = join(dist, 'data');
  const files = readdirSync(dataDir).map((name) => {
    const st = statSync(join(dataDir, name));
    return { name: `data/${name}`, bytes: st.size };
  });
  let total = 0;
  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  }
  walk(dist);
  return { totalBytes: total, dataFiles: files };
}

async function fetchJson(url) {
  const res = await fetch(url);
  return { status: res.status, body: res.ok ? await res.json() : null };
}

function reconcileMode(homeData, dateMode, now) {
  const filmsByKey = new Map(
    (homeData.films ?? []).map((f) => [f.filmKey, f]),
  );
  let eligible = 0;
  const seen = new Set();
  for (const opp of homeData.opportunities ?? []) {
    if (!isEligibleBrowseOpportunity(opp, { dateMode, filmsByKey, now })) continue;
    eligible += 1;
    seen.add(opportunityDedupeKey(opp));
  }
  const listed = listEligibleBrowseOpportunities(homeData, dateMode, now);
  return {
    dateMode,
    eligibleRaw: eligible,
    represented: listed.length,
    dedupeUnique: seen.size,
    diff: eligible - listed.length,
    // eligibleRaw counts before dedupe in loop above counts each eligible;
    // represented is after dedupe. Diff should equal eligible - unique if we
    // counted raw before dedupe incorrectly — fix: eligibleRaw should be pre-dedupe.
  };
}

function ticketCoverage(opportunities) {
  let withUrl = 0;
  let nullUrl = 0;
  let unsafe = 0;
  for (const o of opportunities ?? []) {
    const u = o.ticketUrl ?? o.ticket_url ?? null;
    if (!u) {
      nullUrl += 1;
      continue;
    }
    try {
      const url = new URL(String(u));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') unsafe += 1;
      else withUrl += 1;
    } catch {
      unsafe += 1;
    }
  }
  return { withUrl, nullUrl, unsafe, total: opportunities?.length ?? 0 };
}

const distInv = inventoryDist();
const showtimesFetch = await fetchJson(`${BASE}data/showtimes_current.json`);
const theatersFetch = await fetchJson(`${BASE}data/theaters.json`);
const pipelineFetch = await fetchJson(`${BASE}data/pipeline_report.json`);
const newlyFetch = await fetchJson(`${BASE}data/newly_added_current.json`);
const enrichFetch = await fetchJson(`${BASE}data/film_enrichment_current.json`);

const showtimes = showtimesFetch.body;
const theaters = theatersFetch.body;
const pipeline = pipelineFetch.body;

// Build HomeData similarly to runtime
let homeData = null;
try {
  homeData = buildHomeData({
    showtimesCurrent: showtimes,
    theatersJson: theaters,
    newlyAdded: newlyFetch.body,
    pipelineReport: pipeline,
    filmEnrichment: enrichFetch.body,
  });
} catch (e) {
  homeData = { error: String(e) };
}

const now = () => new Date(); // wall clock during audit
const today = pacificDateString(now());
const reconcile = ['today', 'tomorrow', 'week'].map((m) =>
  reconcileMode(homeData, m, now),
);

// Fix reconcile: compute pre-dedupe eligible properly
function reconcileAccurate(homeData, dateMode, nowFn) {
  const filmsByKey = new Map(
    (homeData.films ?? []).map((f) => [f.filmKey, f]),
  );
  const eligible = [];
  for (const opp of homeData.opportunities ?? []) {
    if (isEligibleBrowseOpportunity(opp, { dateMode, filmsByKey, now: nowFn })) {
      eligible.push(opp);
    }
  }
  const unique = new Map();
  for (const opp of eligible) {
    const k = opportunityDedupeKey(opp);
    if (!unique.has(k)) unique.set(k, opp);
  }
  const listed = listEligibleBrowseOpportunities(homeData, dateMode, nowFn);
  const listedKeys = new Set(listed.map(opportunityDedupeKey));
  const missing = [...unique.keys()].filter((k) => !listedKeys.has(k));
  const extra = [...listedKeys].filter((k) => !unique.has(k));
  return {
    dateMode,
    eligibleBeforeDedupe: eligible.length,
    uniqueAfterDedupe: unique.size,
    representedByListHelper: listed.length,
    diffEligibleVsRepresented: eligible.length - listed.length,
    diffUniqueVsListed: unique.size - listed.length,
    missingFromList: missing.length,
    extraInList: extra.length,
    unexplained: unique.size !== listed.length,
  };
}

const reconcileAccurateRows = ['today', 'tomorrow', 'week'].map((m) =>
  reconcileAccurate(homeData, m, now),
);

const tickets = ticketCoverage(homeData?.opportunities);

const dataSection = {
  distInventory: distInv,
  fetchStatus: {
    showtimes: showtimesFetch.status,
    theaters: theatersFetch.status,
    newly_added: newlyFetch.status,
    pipeline_report: pipelineFetch.status,
    film_enrichment: enrichFetch.status,
  },
  counts: {
    films: homeData?.films?.length ?? null,
    theaters: homeData?.theaters?.length ?? null,
    opportunitiesHomeData: homeData?.opportunities?.length ?? null,
    showtimesRawRows: Array.isArray(showtimes?.showtimes)
      ? showtimes.showtimes.length
      : Array.isArray(showtimes)
        ? showtimes.length
        : null,
  },
  pipeline: pipeline
    ? {
        generated_at: pipeline.generated_at,
        status: pipeline.status,
        window: pipeline.window,
        sources: Object.fromEntries(
          Object.entries(pipeline.sources ?? {}).map(([k, v]) => [
            k,
            {
              status: v.status,
              last_successful_run: v.last_successful_run,
              showtime_count: v.showtime_count,
              errors: v.errors?.length ?? 0,
            },
          ]),
        ),
      }
    : null,
  auditPacificToday: today,
  daysSinceGenerated: pipeline?.generated_at
    ? Math.floor(
        (Date.now() - Date.parse(pipeline.generated_at)) / (24 * 3600 * 1000),
      )
    : null,
  ticketCoverage: tickets,
  reconcile: reconcileAccurateRows,
};

// --- Playwright UI gates ---
const ui = {
  fixtureModeActive: null,
  showtimes: {},
  planner: {},
  navigation: {},
  incomplete: [],
  mobile: {},
  copy: {},
  screenshots: [],
  errors: [],
};

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  ui.screenshots.push(path);
  return path;
}

async function clearStorage(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('reel-seattle')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: 'networkidle' });
}

try {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await clearStorage(page);

  // Fixture mode check
  const url = page.url();
  ui.fixtureModeActive = /Mockup=1|mockup=1|fixture/i.test(url) === false
    ? false
    : true;
  const bodyText = await page.locator('body').innerText();
  ui.fixtureModeActive =
    ui.fixtureModeActive ||
    /build-plan-mockup|mockup-fixture/i.test(
      await page.locator('html').innerHTML().catch(() => ''),
    );

  // Nav destinations
  const tabs = ['Home', 'Explore', 'Planner', 'Profile'];
  for (const tab of tabs) {
    await page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).click();
    await page.waitForTimeout(350);
    const active = await page
      .locator('nav button[aria-current="page"], nav button.is-active, .v2-tab.is-active')
      .first()
      .textContent()
      .catch(() => null);
    ui.navigation[tab] = {
      opened: true,
      activeHint: active,
      blank: !(await page.locator('body').innerText()).trim(),
    };
  }
  const navCount = await page.locator('nav button, .v2-bottom-nav button').count();
  ui.navigation.bottomNavButtonCount = navCount;

  // --- Showtimes Home entry ---
  await page.getByRole('button', { name: /^Home$/i }).click();
  await page.waitForTimeout(500);
  const browse = page.getByRole('button', { name: /Browse all showtimes/i }).or(
    page.getByText(/Browse all showtimes/i),
  );
  ui.showtimes.homeEntryVisible = (await browse.count()) > 0;
  if (ui.showtimes.homeEntryVisible) {
    await browse.first().click();
    await page.waitForTimeout(800);
    ui.showtimes.homeOpened =
      (await page.locator('[data-showtimes-browse], .v2-stb').count()) > 0 ||
      (await page.getByText(/Showtimes|Today|Tomorrow|This week/i).count()) > 0;
    await shot(page, 'launch-gate-showtimes-home.png');
    // Back
    const back = page.getByRole('button', { name: /^Back$/i }).or(
      page.locator('button.v2-header-back, [aria-label="Back"]').first(),
    );
    if (await back.count()) {
      await back.first().click();
      await page.waitForTimeout(400);
      ui.showtimes.backToHome =
        (await page.getByText(/Browse all showtimes|Top opportunit/i).count()) > 0;
    }
  }

  // Explore entry
  await page.getByRole('button', { name: /^Explore$/i }).click();
  await page.waitForTimeout(500);
  const allSt = page.getByRole('button', { name: /All showtimes/i }).or(
    page.getByText(/All showtimes/i),
  );
  ui.showtimes.exploreEntryVisible = (await allSt.count()) > 0;
  if (ui.showtimes.exploreEntryVisible) {
    await allSt.first().click();
    await page.waitForTimeout(800);
    ui.showtimes.exploreOpened =
      (await page.getByText(/Today|Tomorrow|This week/i).count()) > 0;
    // Date modes
    for (const mode of ['Today', 'Tomorrow', 'This week']) {
      const chip = page.getByRole('button', { name: new RegExp(`^${mode}$`, 'i') });
      if (await chip.count()) {
        await chip.first().click();
        await page.waitForTimeout(500);
        const text = await page.locator('body').innerText();
        ui.showtimes[`mode_${mode}`] = {
          clicked: true,
          hasRows:
            (await page.locator('.v2-stb-row, .v2-stb-film, [data-stb-film]').count()) >
              0 || /showtime|AM|PM/i.test(text),
          emptyBanner: /No showtimes|nothing playing/i.test(text),
        };
      }
    }
    // Filters presence
    ui.showtimes.filters = {
      theater: (await page.getByRole('button', { name: /Theater/i }).count()) > 0,
      format: (await page.getByRole('button', { name: /Format/i }).count()) > 0,
      time: (await page.getByRole('button', { name: /Time/i }).count()) > 0,
      reset: (await page.getByRole('button', { name: /Reset/i }).count()) > 0,
    };
    await shot(page, 'launch-gate-showtimes-explore.png');

    // Film detail round-trip
    const filmRow = page.locator('.v2-stb-film-title, .v2-stb-row button, [data-stb-open-film]').first();
    if (await filmRow.count()) {
      await filmRow.click();
      await page.waitForTimeout(600);
      ui.showtimes.filmDetailOpened =
        (await page.getByText(/Showtimes|Runtime|About/i).count()) > 0;
      const back2 = page.getByRole('button', { name: /^Back$/i }).or(
        page.locator('[aria-label="Back"]').first(),
      );
      if (await back2.count()) {
        await back2.first().click();
        await page.waitForTimeout(500);
        ui.showtimes.filmDetailBackRestored =
          (await page.getByText(/Today|Tomorrow|This week/i).count()) > 0;
      }
    }
  }

  // --- Planner ---
  await clearStorage(page);
  await page.getByRole('button', { name: /^Planner$/i }).click();
  await page.waitForTimeout(400);
  const buildBtn = page.getByRole('button', { name: /Build a Plan|Build plan/i }).first();
  if (await buildBtn.count()) await buildBtn.click();
  else await page.getByText(/Build a Plan/i).first().click();
  await page.waitForSelector('[data-build-plan-source="live-form"]', { timeout: 15000 });
  ui.planner.liveForm = true;
  ui.fixtureModeActive = ui.fixtureModeActive || false;

  // Expand where / fine
  async function expand(id) {
    const t = page.locator(`[data-bp-accordion="${id}"] button.v2-bp-acc-trigger`);
    if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
    await page.waitForTimeout(200);
  }
  await expand('where');
  const whereTitle = await page
    .locator('.v2-bp-where-card[aria-checked="true"] .v2-bp-where-title')
    .textContent();
  ui.planner.anyTheater = /any theater/i.test(whereTitle || '');
  await expand('fineTuning');
  ui.planner.repeatsOff = !(await page.locator('#v2-bp-allowRepeats').isChecked());
  await shot(page, 'launch-gate-planner-defaults.png');

  await expand('what');
  await page.getByRole('button', { name: /^Manage$/i }).first().click();
  await page.waitForSelector('[data-build-plan-manage="mustInclude"]');
  await page.waitForTimeout(600);
  const cand = await page.locator('.v2-bp-manage-add').count();
  ui.planner.liveCatalogCount = cand;
  ui.planner.liveCatalog = cand > 0;
  await shot(page, 'launch-gate-must-include.png');
  if (cand > 0) await page.locator('.v2-bp-manage-add').first().click();
  await page.getByRole('button', { name: /^Done$/i }).click();
  await page.waitForSelector('[data-build-plan-source="live-form"]');

  await expand('when');
  ui.planner.dateControl =
    (await page.locator('input[type="date"]').count()) > 0 &&
    (await page.getByRole('button', { name: /^Tomorrow$/i }).count()) > 0;
  await page.getByRole('button', { name: /^Tomorrow$/i }).click().catch(() => {});
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Today$/i }).click().catch(() => {});

  await page.locator('.v2-bp-cta').click();
  await page.waitForTimeout(1500);
  ui.planner.resultsAppeared =
    (await page.locator('.v2-bpr-plan, [data-plan-card]').count()) > 0 ||
    (await page.getByText(/plans? found/i).count()) > 0;
  await shot(page, 'launch-gate-results.png');

  // Save plan copy
  const savePlan = await page.getByRole('button', { name: /Save plan/i }).count();
  const addSched = await page.getByRole('button', { name: /Add to My Schedule/i }).count();
  ui.copy.resultsSavePlan = savePlan > 0;
  ui.copy.resultsAddToSchedule = addSched > 0;

  // Accept first plan if present
  if (savePlan > 0) {
    await page.getByRole('button', { name: /Save plan/i }).first().click();
    await page.waitForTimeout(400);
  } else if (addSched > 0) {
    await page.getByRole('button', { name: /Add to My Schedule/i }).first().click();
    await page.waitForTimeout(400);
  }

  const detailsBtn = page.getByRole('button', { name: /View plan details|Plan details/i }).first();
  if (await detailsBtn.count()) {
    await detailsBtn.click();
    await page.waitForTimeout(500);
    ui.planner.planDetailsOpened = true;
    ui.copy.detailsFakeSave = (await page.locator('.v2-bpd-save').count()) > 0;
    ui.copy.detailsAdd = (await page.getByRole('button', { name: /Add to My Schedule|Added to My Schedule/i }).count()) > 0;
    await shot(page, 'launch-gate-plan-details.png');
    if (
      (await page.getByRole('button', { name: /^Add to My Schedule$/i }).count()) > 0
    ) {
      await page.getByRole('button', { name: /^Add to My Schedule$/i }).click();
      await page.waitForTimeout(400);
    }
  }

  // My Schedule
  await page.getByRole('button', { name: /^Planner$/i }).click();
  await page.waitForTimeout(400);
  const my = page.getByRole('button', { name: /My Schedule/i }).first();
  if (await my.count()) {
    await my.click();
    await page.waitForTimeout(600);
    ui.planner.myScheduleOpened = true;
    await shot(page, 'launch-gate-my-schedule.png');
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  ui.planner.reloadOk = !(await page.getByText(/Showtimes aren’t loaded yet/i).count());
  // incomplete Profile stubs
  await page.getByRole('button', { name: /^Profile$/i }).click();
  await page.waitForTimeout(400);
  const profileText = await page.locator('body').innerText();
  ui.incomplete.push({
    surface: 'Profile',
    note: /Settings|Account|Sign/i.test(profileText)
      ? 'Profile hub present; Stage 1 stubs may remain'
      : 'Profile opened',
  });

  // Mobile overflow checks
  for (const vp of [
    { w: 393, h: 852, name: '393' },
    { w: 375, h: 667, name: '375' },
    { w: 430, h: 932, name: '430' },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.getByRole('button', { name: /^Home$/i }).click();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        overflowX: doc.scrollWidth > doc.clientWidth + 2,
      };
    });
    ui.mobile[vp.name] = overflow;
    if (overflow.overflowX) {
      await shot(page, `launch-gate-overflow-${vp.name}.png`);
    }
  }

  // Browser history
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ui.navigation.directRootLoad = (await page.locator('#root, #app, body').count()) > 0;
  await page.goBack().catch(() => {});
  await page.goForward().catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  ui.navigation.reloadAfterHistory = !(
    await page.getByText(/Showtimes aren’t loaded yet/i).count()
  );

  await context.close();
} catch (err) {
  ui.errors.push(String(err?.stack || err));
} finally {
  await browser.close();
}

const report = {
  task: 'T-V2-LAUNCH-GATE-REAUDIT-01',
  auditedAt: new Date().toISOString(),
  baseUrl: BASE,
  data: dataSection,
  ui,
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
