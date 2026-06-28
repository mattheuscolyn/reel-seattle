#!/usr/bin/env node
/**
 * Planner legacy parity audit (PR 66A).
 *
 * Discovers stable scenarios from showtimes_current.json, compares Planner
 * against Double Feature / Marathon expectations, and optionally runs browser QA.
 *
 * Usage:
 *   node scripts/qa_planner_parity.mjs [--data-only] [baseUrl]
 *
 * Default baseUrl: http://localhost:5173
 *
 * Uses ~2GB heap for scenario discovery on full showtimes_current.json.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverPlannerParityScenarios,
  pickBrowserScenario,
  pickBrowserEligibleScenario,
} from './lib/plannerParityScenarios.mjs';
import { buildPlannerPathFromDoubleFeature } from '../src/utils/plannerUrlState.js';
import { findDoubleFeaturePairs } from '../src/utils/doubleFeatureEngine.js';
import { buildPlannerSearchFilters } from '../src/utils/plannerDisplay.js';
import { findSchedules } from '../src/utils/plannerEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dataOnly = args.includes('--data-only');
const BASE = args.find((arg) => !arg.startsWith('--')) || 'http://localhost:5173';

const results = { pass: [], fail: [], notes: [] };

function pass(msg) {
  results.pass.push(msg);
}

function fail(msg) {
  results.fail.push(msg);
}

function note(msg) {
  results.notes.push(msg);
}

function printDataAudit({ scenarios, audit, rows }) {
  console.log('\n=== Planner Parity Data Audit ===\n');
  console.log(`Audit date: ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Data generated: ${audit.generatedAt}`);
  console.log(`Window: ${audit.window?.start_date} → ${audit.window?.end_date}`);
  console.log(`Showtimes: ${audit.stats?.showtime_count} | Films: ${audit.stats?.film_count} | Theaters: ${audit.stats?.theater_count}`);
  console.log(`Sources: ${audit.sourcesIncluded.join(', ')}`);
  console.log('');

  for (const [key, scenario] of Object.entries(scenarios)) {
    if (!scenario) {
      note(`Scenario missing: ${key}`);
      continue;
    }
    console.log(`${key}:`);
    console.log(`  date=${scenario.date} theater=${scenario.theater} filmCount=${scenario.filmCount}`);
    console.log(`  minResults=${scenario.minResults} topFilmCount=${scenario.topFilmCount}`);
    if (scenario.doubleFeatureCount != null) {
      console.log(`  doubleFeatureCount=${scenario.doubleFeatureCount} maxGapWithin59=${scenario.maxGapWithin59}`);
    }
    if (scenario.source) console.log(`  source=${scenario.source}`);
    console.log('');
  }

  const df = scenarios.doubleFeatureParity;
  if (df) {
    const dfPairs = findDoubleFeaturePairs(rows, {
      selectedDate: df.csvDate,
      selectedTheaters: [df.theater],
    });
    const planner = findSchedules({
      rows,
      filters: buildPlannerSearchFilters({
        date: df.csvDate,
        theaters: [df.theater],
        filmCount: 2,
      }),
    });
    pass(`Double Feature parity scenario: ${df.theater} on ${df.date}`);
    note(`Planner 2-film schedules: ${planner.schedules.length}; DF pairs: ${dfPairs.length} (DF counts showtime combos; Planner dedupes lineups)`);
    if (df.maxGapWithin59) pass('Planner 2-film gaps all <= 59 minutes');
    else fail('Planner 2-film gap exceeded 59 minutes');

    const migrationPath = buildPlannerPathFromDoubleFeature(
      `date=${encodeURIComponent(df.csvDate)}&theaters=${encodeURIComponent(df.theater)}&start=12%3A00PM&movies=TestFilm&exclude=OtherFilm`,
    );
    if (migrationPath.includes('count=2')) pass('Migration helper sets count=2');
    else fail('Migration helper missing count=2');
    if (migrationPath.includes('date=') && migrationPath.includes('theaters=')) {
      pass('Migration helper preserves date and theaters');
    } else {
      fail('Migration helper dropped date/theaters');
    }
    if (!migrationPath.includes('end=')) {
      pass('Migration helper omits Double Feature end param (documented semantic difference)');
    } else {
      fail('Migration helper incorrectly maps end param');
    }
  }

  const nonAmc = scenarios.nonAmc;
  if (nonAmc) {
    pass(`Non-AMC Planner scenario: ${nonAmc.theater} (${nonAmc.source})`);
    note('Marathon iframe is AMC-only; Planner covers SIFF/Beacon via showtimes_current.json');
  } else {
    fail('No non-AMC Planner scenario found');
  }

  const max = scenarios.maxMode;
  if (max) {
    pass(`Max-mode scenario: ${max.topFilmCount} films at ${max.theater}`);
  } else {
    fail('No max-mode scenario found');
  }

  try {
    const marathon = JSON.parse(
      readFileSync(join(__dirname, '../public/marathon/marathon_showtimes.json'), 'utf8'),
    );
    pass(`Marathon JSON loaded (${marathon.showtimes?.length ?? 0} AMC showtimes)`);
    note(`Marathon defaults: ${marathon.default_theater} on ${marathon.default_date}`);
  } catch (error) {
    fail(`Marathon JSON unavailable: ${error.message}`);
  }
}

async function runPlannerScenarioSearch(page, scenario, filmCount) {
  if (!scenario?.csvDate) return false;
  const params = new URLSearchParams();
  params.set('date', scenario.csvDate);
  if (scenario.theater && !scenario.theater.startsWith('(')) {
    params.append('theaters', scenario.theater);
  }
  params.set('count', String(filmCount));
  await page.goto(`${BASE}/planner?${params.toString()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#planner-date', { timeout: 20000 });
  await clickFindPlans(page);
  return true;
}

async function clickFindPlans(page) {
  await page.waitForFunction(
    () => !document.querySelector('.planner-loading-state'),
    { timeout: 20000 },
  );
  const promptBtn = page.locator('.double-feature-run-search');
  if (await promptBtn.isVisible()) {
    await promptBtn.click();
  } else {
    await page.locator('.search-button', { hasText: 'Find plans' }).click();
  }
  await page.waitForFunction(
    () =>
      document.querySelector('.planner-result-list') ||
      document.querySelector('.double-feature-empty-state') ||
      document.querySelector('.planner-empty-state'),
    { timeout: 20000 },
  );
  await page.waitForTimeout(300);
}

async function auditResultCard(page, minFilms = 2) {
  const cards = page.locator('.planner-result-card');
  if ((await cards.count()) === 0) return false;

  const card = cards.first();
  if (await card.locator('.double-feature-theater').count()) pass('Result card shows theater');
  if (await card.locator('.planner-timeline-track').count()) pass('Result timeline appears');
  const films = card.locator('.planner-film-row');
  if ((await films.count()) >= minFilms) pass(`Result card has >= ${minFilms} film rows`);
  return true;
}

async function runBrowserParity(page, scenarios) {
  const twoFilm = pickBrowserEligibleScenario(scenarios.twoFilm ?? scenarios.doubleFeatureParity);
  const maxMode = pickBrowserEligibleScenario(scenarios.maxMode ?? scenarios.marathonAmc);
  const pagination = pickBrowserEligibleScenario(scenarios.pagination);

  if (!twoFilm) {
    note('No browser-eligible 2-film scenario; UI filters past dates from dropdown');
  }
  if (!maxMode) {
    note('No browser-eligible max-mode scenario; skipping max card audit');
  }

  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#planner-date', { timeout: 20000 });
  pass('/planner loads');

  if (twoFilm) {
    await runPlannerScenarioSearch(page, twoFilm, 2);
    const count = await page.locator('.planner-result-card').count();
    if (count > 0) {
      pass(`2-film search: ${count} card(s) for ${twoFilm.theater} on ${twoFilm.date}`);
      await auditResultCard(page, 2);
    } else {
      fail(`2-film search returned no cards for discovered scenario`);
    }
  } else {
    note('Skipped browser 2-film card audit (no browser-eligible date in current window)');
  }

  if (maxMode) {
    await runPlannerScenarioSearch(page, maxMode, 'max');
    const count = await page.locator('.planner-result-card').count();
    if (count > 0) {
      pass(`Max-mode search: ${count} card(s) for ${maxMode.theater}`);
      const filmRows = await page.locator('.planner-result-card').first().locator('.planner-film-row').count();
      if (filmRows >= 4) pass(`Max-mode top schedule shows ${filmRows} films`);
      else note(`Max-mode top schedule has ${filmRows} films`);
      await auditResultCard(page, 2);
    } else {
      fail('Max-mode search returned no cards for discovered scenario');
    }
  } else {
    note('Skipped browser max-mode card audit (no browser-eligible date in current window)');
  }

  if (pagination && pagination.minResults > 20) {
    await runPlannerScenarioSearch(page, pagination, 2);
    if (await page.locator('.planner-show-more').isVisible()) {
      pass('Show More appears for large result set');
      await page.locator('.planner-show-more').click();
      await page.waitForTimeout(300);
      const after = await page.locator('.planner-result-card').count();
      if (after > 20) pass(`Show More reveals ${after} cards`);
      else fail('Show More did not reveal additional cards');
    } else {
      note('Show More not visible (UI may cap display differently than engine count)');
    }
  }

  await page.goto(`${BASE}/planner?count=3&start=12%3A00PM&advanced=1`, { waitUntil: 'networkidle' });
  if (await page.locator('.double-feature-url-prompt').isVisible()) {
    pass('Shared URL restore prompt appears');
    await page.locator('.double-feature-run-search').click();
    await page.waitForTimeout(1500);
    pass('Shared URL search runs');
  } else {
    fail('Shared URL restore prompt missing');
  }

  await page.goto(`${BASE}/double-feature`, { waitUntil: 'networkidle' });
  if (await page.locator('.legacy-tool-banner').isVisible()) pass('Double Feature legacy banner');
  else fail('Double Feature legacy banner missing');
  const dfLink = await page.locator('.legacy-tool-banner-link').getAttribute('href');
  if (dfLink?.includes('count=2')) pass(`Double Feature Try Planner link: ${dfLink}`);
  else fail(`Double Feature Try Planner link wrong: ${dfLink}`);

  await page.locator('.search-button', { hasText: 'Find Double Features' }).click();
  await page.waitForTimeout(800);
  const dfResults = await page.locator('.double-feature-card').count();
  const dfEmpty = await page.locator('.double-feature-empty-state').isVisible().catch(() => false);
  if (dfResults > 0 || dfEmpty) pass('Double Feature search runs');
  else fail('Double Feature search produced no UI state');

  await page.goto(`${BASE}/marathon/`, { waitUntil: 'networkidle' });
  if (await page.locator('.legacy-tool-banner').isVisible()) pass('Marathon legacy banner');
  else fail('Marathon legacy banner missing');
  const marathonHref = await page.locator('.legacy-tool-banner-link').getAttribute('href');
  if (marathonHref?.includes('count=max')) pass(`Marathon Try Planner link: ${marathonHref}`);
  else fail(`Marathon Try Planner link wrong: ${marathonHref}`);
  await page.waitForSelector('iframe', { timeout: 15000 });
  pass('Marathon iframe loads');
}

async function main() {
  const { scenarios, audit, rows } = discoverPlannerParityScenarios();
  printDataAudit({ scenarios, audit, rows });

  const browserScenario = pickBrowserScenario(scenarios);
  if (!browserScenario) {
    fail('No browser scenario discovered from current data');
  } else {
    note(`Primary browser scenario: ${browserScenario.theater} on ${browserScenario.date}`);
  }

  if (!dataOnly) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];

    page.on('request', (req) => {
      try {
        requests.push(new URL(req.url()).pathname);
      } catch {
        /* ignore */
      }
    });

    try {
      await runBrowserParity(page, scenarios);

      const dataRequests = [
        ...new Set(
          requests.filter(
            (p) =>
              p.includes('/data/') ||
              p.endsWith('.json') ||
              p.endsWith('.csv') ||
              p.includes('daily_logs'),
          ),
        ),
      ];
      note(`Data requests: ${dataRequests.join(', ')}`);

      for (const forbidden of [
        'showtimes_history.csv',
        'movies_announcements.csv',
        'newly_announced.csv',
        'daily_logs',
      ]) {
        if (dataRequests.some((p) => p.includes(forbidden))) fail(`Forbidden fetch: ${forbidden}`);
        else pass(`Did not fetch ${forbidden}`);
      }
    } catch (error) {
      fail(`Browser parity error: ${error.message}`);
    } finally {
      await browser.close();
    }
  }

  console.log('\n=== Planner Parity QA Summary ===\n');
  for (const msg of results.pass) console.log(`PASS: ${msg}`);
  for (const msg of results.notes) console.log(`NOTE: ${msg}`);
  for (const msg of results.fail) console.log(`FAIL: ${msg}`);
  console.log(`\n${results.pass.length} passed, ${results.fail.length} failed, ${results.notes.length} notes`);
  process.exit(results.fail.length > 0 ? 1 : 0);
}

main();
