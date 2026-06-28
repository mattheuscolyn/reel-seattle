#!/usr/bin/env node
/**
 * Interactive browser QA for /planner (PR 62+).
 * Usage: node scripts/qa_planner_browser.mjs [baseUrl]
 *
 * Uses ~2GB heap for scenario discovery on full showtimes_current.json.
 */
import { chromium } from 'playwright';
import { discoverPlannerParityScenarios, pickBrowserEligibleScenario } from './lib/plannerParityScenarios.mjs';

const BASE = process.argv[2] || 'http://localhost:5173';
const WIDTHS = [375, 768, 1200];

const { scenarios } = discoverPlannerParityScenarios();

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

async function waitForPlannerReady(page) {
  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1.main-header', { timeout: 20000 });
  const header = await page.locator('h1.main-header').textContent();
  if (header?.includes('Movie Planner')) pass('/planner loads with Movie Planner heading');
  else fail(`/planner heading wrong: ${header}`);
  await page.waitForSelector('#planner-date', { timeout: 20000 });
  const dateOptions = await page.locator('#planner-date option').count();
  if (dateOptions === 0) fail('Date dropdown has no options after load');
}

async function checkNav(page) {
  const labels = [];
  const links = page.locator('.main-nav .nav-button');
  const count = await links.count();
  for (let i = 0; i < count; i += 1) {
    labels.push((await links.nth(i).textContent())?.trim());
  }
  for (const expected of ['Showtimes', 'Planner', 'Legacy: Double Feature', 'Legacy: Marathon']) {
    if (labels.includes(expected)) pass(`Nav includes ${expected}`);
    else fail(`Nav missing ${expected} (got: ${labels.join(', ')})`);
  }
}

async function checkFiltersPopulated(page) {
  const dateOptions = await page.locator('#planner-date option').count();
  if (dateOptions > 0) pass(`Date dropdown has ${dateOptions} options`);
  else fail('Date dropdown empty');

  const theaterBtn = page.locator('.planner-controls .dropdown-btn').first();
  await theaterBtn.click();
  await page.waitForSelector('.planner-controls .dropdown-option', { timeout: 5000 });
  const theaterOptions = await page.locator('.planner-controls .dropdown-option').count();
  if (theaterOptions > 0) pass(`Theater multi-select has ${theaterOptions} options`);
  else fail('Theater multi-select empty');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  const filmCountOptions = await page.locator('#planner-film-count option').allTextContents();
  const expectedCounts = ['2', '3', '4', 'As many as possible'];
  if (expectedCounts.every((label) => filmCountOptions.includes(label))) {
    pass('Number-of-movies control has all options');
  } else {
    fail(`Film count options wrong: ${filmCountOptions.join(', ')}`);
  }
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
  const cardCount = await cards.count();
  if (cardCount === 0) return false;

  pass(`Found ${cardCount} result card(s)`);
  const card = cards.first();

  const theater = await card.locator('.double-feature-theater').textContent();
  if (theater?.trim()) pass(`Result shows theater: ${theater.trim()}`);
  else fail('Result missing theater');

  const badge = await card.locator('.planner-film-count-badge').textContent();
  if (badge?.includes('film')) pass(`Result shows film count badge: ${badge.trim()}`);
  else fail('Result missing film count badge');

  if (await card.locator('.planner-timeline-track').count()) {
    pass('Result timeline appears');
  } else {
    fail('Result missing timeline');
  }

  for (const stat of ['Total', 'Movies', 'Gaps']) {
    const value = card
      .locator('.planner-stat-label', { hasText: stat })
      .locator('..')
      .locator('.planner-stat-value');
    const text = await value.textContent();
    if (text?.trim() && text.trim() !== 'Unknown') pass(`Result stat ${stat}: ${text.trim()}`);
    else fail(`Result missing or invalid stat: ${stat}`);
  }

  const films = card.locator('.planner-film-row');
  const filmCount = await films.count();
  if (filmCount >= minFilms) pass(`Result has ${filmCount} film row(s)`);
  else fail(`Expected >= ${minFilms} films, got ${filmCount}`);

  if ((await card.locator('.planner-gap-row').count()) >= Math.max(0, minFilms - 1)) {
    pass('Result shows inter-film gap rows');
  } else if (minFilms > 1) {
    fail('Result missing gap rows');
  }

  for (let i = 0; i < Math.min(filmCount, 3); i += 1) {
    const row = films.nth(i);
    const title = await row.locator('.double-feature-film-title').textContent();
    if (title?.trim()) pass(`Film ${i + 1} title: ${title.trim()}`);
    else fail(`Film ${i + 1} missing title`);

    const hasPoster =
      (await row.locator('.double-feature-poster').count()) > 0 ||
      (await row.locator('.poster-placeholder').count()) > 0;
    if (hasPoster) pass(`Film ${i + 1} has poster or placeholder`);
    else fail(`Film ${i + 1} missing poster/placeholder`);
  }

  return true;
}

async function selectPlannerDate(page, scenario) {
  const csvDate = scenario?.csvDate ?? scenario?.date;
  if (!csvDate) return false;
  try {
    await page.selectOption('#planner-date', csvDate);
    return true;
  } catch {
    note(`Could not select planner date ${csvDate}; using default`);
    return false;
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

async function selectTheater(page, theaterName) {
  if (!theaterName || theaterName.startsWith('(')) return;
  const btn = page.locator('.planner-controls .dropdown-btn').first();
  await btn.click();
  const option = page.locator('.planner-controls .dropdown-option', { hasText: theaterName });
  if ((await option.count()) === 0) {
    note(`Theater option not found: ${theaterName}`);
    await page.keyboard.press('Escape');
    return;
  }
  await option.first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

async function applyDiscoveredScenario(page, scenario) {
  if (!scenario) return;
  await selectPlannerDate(page, scenario);
  await selectTheater(page, scenario.theater);
}

async function runSearchMode(page, filmCountValue, label, minFilms, scenario = null) {
  if (scenario) {
    await runPlannerScenarioSearch(page, scenario, filmCountValue);
  } else {
    await page.selectOption('#planner-film-count', String(filmCountValue));
    await page.fill('#planner-start-after', '');
    await page.fill('#planner-finish-by', '');
    await clickFindPlans(page);
  }

  const empty = await page.locator('.double-feature-empty-state').isVisible().catch(() => false);
  const hasResults = await page.locator('.planner-result-card').count();

  if (hasResults > 0) {
    pass(`${label}: generated ${hasResults} schedule(s)`);
    await auditResultCard(page, minFilms);
    return true;
  }

  if (empty) {
    note(`${label}: no schedules for default date (empty state shown)`);
    return false;
  }

  fail(`${label}: neither results nor empty state after search`);
  return false;
}

async function checkTimeFilters(page) {
  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#planner-start-after', { timeout: 15000 });
  await page.fill('#planner-start-after', '12:00PM');
  await page.fill('#planner-finish-by', '11:00PM');
  const startVal = await page.inputValue('#planner-start-after');
  const finishVal = await page.inputValue('#planner-finish-by');
  if (startVal === '12:00PM' && finishVal === '11:00PM') {
    pass('Start after and finish by accept valid times');
  } else {
    fail(`Time inputs wrong: start=${startVal}, finish=${finishVal}`);
  }

  await page.selectOption('#planner-film-count', '2');
  await clickFindPlans(page);
  const hasResults = (await page.locator('.planner-result-card').count()) > 0;
  const empty = await page.locator('.double-feature-empty-state').isVisible().catch(() => false);
  if (hasResults || empty) pass('Search with time filters completes');
  else fail('Search with time filters produced no UI state');
}

async function checkEmptyState(page) {
  await page.selectOption('#planner-film-count', '2');
  await page.fill('#planner-start-after', '11:00PM');
  await page.fill('#planner-finish-by', '8:00AM');
  await clickFindPlans(page);

  const empty = page.locator('.planner-empty-state, .double-feature-empty-state');
  if (await empty.isVisible()) {
    pass('Impossible constraints show empty state');
    const text = await empty.textContent();
    if (text?.includes('No movie plans found')) pass('Empty state copy is clear');
    else fail(`Empty state copy unexpected: ${text}`);
    if (text?.includes('widening your time window')) pass('Empty state suggests relaxing filters');
    else fail('Empty state missing suggestion text');
  } else {
    fail('Impossible constraints did not show empty state');
  }
}

async function checkAdvancedAndShareFlow(page) {
  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
  await page.locator('.planner-advanced-toggle').click();
  await page.waitForSelector('#planner-min-gap', { timeout: 5000 });
  pass('Advanced filters panel opens');

  if (await page.locator('.double-feature-copy-link').count()) {
    pass('Copy share link button exists');
  } else {
    fail('Copy share link button missing');
  }

  await page.goto(`${BASE}/planner?count=3&start=12%3A00PM&advanced=1`, { waitUntil: 'networkidle' });
  if (await page.locator('.double-feature-url-prompt').isVisible()) {
    pass('Shared URL prompt appears');
  } else {
    fail('Shared URL prompt missing');
  }

  await page.locator('.double-feature-run-search').click();
  await page.waitForTimeout(1500);
  const cards = await page.locator('.planner-result-card').count();
  const empty = await page.locator('.planner-empty-state, .double-feature-empty-state').isVisible();
  if (cards > 0 || empty) pass('Shared URL search runs');
  else fail('Shared URL search produced no UI state');
}

async function checkPaginationAndMaxMode(page) {
  const paginationScenario = pickBrowserEligibleScenario(scenarios.pagination ?? scenarios.twoFilm);
  const maxScenario = pickBrowserEligibleScenario(scenarios.maxMode ?? scenarios.marathonAmc);

  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
  if (paginationScenario) {
    await runPlannerScenarioSearch(page, paginationScenario, 2);
  } else {
    await page.selectOption('#planner-film-count', '2');
    await clickFindPlans(page);
  }

  const totalCards = await page.locator('.planner-result-card').count();
  if (totalCards > 20) {
    if (await page.locator('.planner-show-more').isVisible()) {
      pass('Show more button appears when results exceed page size');
      await page.locator('.planner-show-more').click();
      await page.waitForTimeout(300);
      const afterMore = await page.locator('.planner-result-card').count();
      if (afterMore > 20) pass('Show more reveals additional results');
      else fail('Show more did not reveal additional results');
    } else {
      fail('Show more button missing for large result set');
    }
  } else {
    note('Fewer than 21 results; pagination not exercised');
  }

  if (maxScenario) {
    await runPlannerScenarioSearch(page, maxScenario, 'max');
  } else {
    await page.selectOption('#planner-film-count', 'max');
    await clickFindPlans(page);
  }
  const maxCard = page.locator('.planner-result-card').first();
  if ((await maxCard.count()) === 0) {
    note('Max mode returned no schedules on default date');
    return;
  }
  const filmRows = await maxCard.locator('.planner-film-row').count();
  if (filmRows > 4) pass(`Max mode schedule shows ${filmRows} films`);
  else note(`Max mode top schedule has ${filmRows} films on this date`);
}

async function checkInitialPrompt(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.planner-prompt', { timeout: 10000 });
  const prompt = await page.locator('.planner-prompt').textContent();
  if (prompt?.includes('Find plans')) pass('Initial prompt shown before search');
  else fail('Initial prompt missing before search');
}

async function checkOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) fail(`Horizontal overflow at ${width}px`);
  else pass(`No horizontal overflow at ${width}px`);
}

async function checkResponsivePlanner(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#planner-date', { timeout: 15000 });
  await checkOverflow(page, width);

  const container = page.locator('.app-container');
  const box = await container.boundingBox();
  if (box && box.width <= width + 2) pass(`App container fits at ${width}px`);
  else fail(`App container wider than viewport at ${width}px`);

  await page.selectOption('#planner-film-count', '2');
  await clickFindPlans(page);
  if ((await page.locator('.planner-result-card').count()) > 0) {
    const card = page.locator('.planner-result-card').first();
    const cardBox = await card.boundingBox();
    if (cardBox && cardBox.width <= width + 2) pass(`Result card fits at ${width}px`);
    else fail(`Result card wider than viewport at ${width}px`);
  } else {
    note(`No result cards to check card width at ${width}px`);
  }
}

async function checkLegacyMigrationBanners(page) {
  await page.goto(`${BASE}/double-feature`, { waitUntil: 'networkidle' });
  if (await page.locator('.legacy-tool-banner').isVisible()) {
    pass('Double Feature legacy banner appears');
  } else {
    fail('Double Feature legacy banner missing');
  }

  const dfLink = page.locator('.legacy-tool-banner-link', { hasText: 'Try Planner for 2 movies' });
  const dfHref = await dfLink.getAttribute('href');
  if (dfHref?.includes('/planner') && dfHref.includes('count=2')) {
    pass(`Double Feature Try Planner link: ${dfHref}`);
  } else {
    fail(`Double Feature Try Planner link wrong: ${dfHref}`);
  }

  await page.goto(`${BASE}/marathon/`, { waitUntil: 'networkidle' });
  if (await page.locator('.legacy-tool-banner').isVisible()) {
    pass('Marathon legacy banner appears');
  } else {
    fail('Marathon legacy banner missing');
  }

  const marathonLink = page.locator('.legacy-tool-banner-link', { hasText: 'Try Planner' });
  const marathonHref = await marathonLink.getAttribute('href');
  if (marathonHref?.includes('/planner') && marathonHref.includes('count=max')) {
    pass(`Marathon Try Planner link: ${marathonHref}`);
  } else {
    fail(`Marathon Try Planner link wrong: ${marathonHref}`);
  }
}

async function checkLegacyRoutes(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.movie-list, h1.main-header', { timeout: 15000 });
  pass('Showtimes page loads');

  await checkLegacyMigrationBanners(page);

  await page.goto(`${BASE}/double-feature`, { waitUntil: 'networkidle' });
  const findBtn = page.locator('.search-button', { hasText: 'Find Double Features' });
  if (await findBtn.count()) {
    await findBtn.click();
    await page.waitForTimeout(800);
    const hasResults = (await page.locator('.double-feature-card').count()) > 0;
    const hasEmpty = await page.locator('.double-feature-empty-state').isVisible().catch(() => false);
    if (hasResults || hasEmpty) pass('Double Feature search runs');
    else fail('Double Feature search produced no UI state');
  }

  await page.goto(`${BASE}/marathon/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('iframe', { timeout: 15000 });
  const iframeSrc = await page.locator('iframe').getAttribute('src');
  if (iframeSrc?.includes('marathon')) pass(`Marathon iframe present (${iframeSrc})`);
  else fail('Marathon iframe missing');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const onPlanner = page.url().includes('/planner');
    if (msg.type() === 'error' && onPlanner && !text.includes('favicon')) {
      fail(`Planner console error: ${text.slice(0, 120)}`);
    }
    if (msg.type() === 'warning') note(`Console warning: ${text}`);
  });

  page.on('pageerror', (err) => fail(`Page error: ${err.message}`));

  page.on('request', (req) => {
    try {
      requests.push(new URL(req.url()).pathname);
    } catch {
      /* ignore */
    }
  });

  try {
    await waitForPlannerReady(page);
    await checkInitialPrompt(page);
    await waitForPlannerReady(page);
    await checkNav(page);
    await checkFiltersPopulated(page);

    const twoScenario = pickBrowserEligibleScenario(scenarios.twoFilm ?? scenarios.doubleFeatureParity);
    const threeScenario = pickBrowserEligibleScenario(scenarios.threeFilm ?? twoScenario);
    const fourScenario = pickBrowserEligibleScenario(scenarios.fourFilm ?? twoScenario);
    const maxScenario = pickBrowserEligibleScenario(scenarios.maxMode ?? twoScenario);
    const paginationScenario = pickBrowserEligibleScenario(scenarios.pagination);

    if (twoScenario) {
      note(`Using discovered 2-film scenario: ${twoScenario.theater} on ${twoScenario.date}`);
    } else {
      note('No browser-eligible 2-film scenario (past dates filtered in UI); using default date');
    }

    const got2 = await runSearchMode(page, '2', '2-film mode', 2, twoScenario);
    await runSearchMode(page, '3', '3-film mode', 3, threeScenario);
    await runSearchMode(page, '4', '4-film mode', 4, fourScenario);
    await runSearchMode(page, 'max', 'Max mode', 2, maxScenario);

    if (!got2) note('2-film schedules unavailable on first date; other modes may still be valid');

    await checkTimeFilters(page);
    await checkEmptyState(page);
    await checkAdvancedAndShareFlow(page);
    await checkPaginationAndMaxMode(page);

    for (const width of WIDTHS) {
      await checkResponsivePlanner(page, width);
    }

    await page.setViewportSize({ width: 1200, height: 900 });
    await checkLegacyRoutes(page);

    const dataRequests = [...new Set(requests.filter((p) => p.includes('/data/') || p.endsWith('.json') || p.endsWith('.csv') || p.includes('daily_logs')))];
    note(`Data-related requests: ${dataRequests.join(', ')}`);

    const forbidden = [
      'showtimes_history.csv',
      'movies_announcements.csv',
      'newly_announced.csv',
      'daily_logs',
    ];
    for (const file of forbidden) {
      if (dataRequests.some((p) => p.includes(file))) fail(`Forbidden fetch: ${file}`);
      else pass(`Did not fetch ${file}`);
    }

    if (dataRequests.some((p) => p.includes('showtimes_current.json'))) {
      pass('Fetched showtimes_current.json');
    } else {
      fail('Missing fetch for showtimes_current.json');
    }
  } catch (error) {
    fail(`QA script error: ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n=== Planner Browser QA ===\n');
  for (const msg of results.pass) console.log(`PASS: ${msg}`);
  for (const msg of results.notes) console.log(`NOTE: ${msg}`);
  for (const msg of results.fail) console.log(`FAIL: ${msg}`);
  console.log(`\n${results.pass.length} passed, ${results.fail.length} failed, ${results.notes.length} notes`);
  process.exit(results.fail.length > 0 ? 1 : 0);
}

main();
