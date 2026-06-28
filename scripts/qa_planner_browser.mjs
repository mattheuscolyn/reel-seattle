#!/usr/bin/env node
/**
 * Interactive browser QA for /planner (PR 62).
 * Usage: node scripts/qa_planner_browser.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const WIDTHS = [375, 768, 1200];

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
  for (const expected of ['Showtimes', 'Planner', 'Double Feature', 'Marathon']) {
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
  await page.locator('.search-button', { hasText: 'Find plans' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.planner-result-list') ||
      document.querySelector('.double-feature-empty-state') ||
      document.querySelector('.search-loading') === null,
    { timeout: 15000 },
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

  for (const stat of ['Start', 'End', 'Total span', 'Gap time']) {
    const label = card.locator('.planner-stat-label', { hasText: stat });
    const value = card.locator('.planner-stat-label', { hasText: stat }).locator('..').locator('.planner-stat-value');
    const text = await value.textContent();
    if (text?.trim() && text.trim() !== 'Unknown') pass(`Result stat ${stat}: ${text.trim()}`);
    else fail(`Result missing or invalid stat: ${stat}`);
  }

  const films = card.locator('.planner-film-row');
  const filmCount = await films.count();
  if (filmCount >= minFilms) pass(`Result has ${filmCount} film row(s)`);
  else fail(`Expected >= ${minFilms} films, got ${filmCount}`);

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

    const runtime = await row.locator('dt', { hasText: 'Runtime' }).locator('..').locator('dd').textContent();
    if (runtime?.includes('min')) pass(`Film ${i + 1} runtime shown`);
    else fail(`Film ${i + 1} missing runtime`);
  }

  const footer = await card.locator('.double-feature-total-value').textContent();
  if (footer?.trim()) pass(`Result footer total: ${footer.trim()}`);
  else fail('Result missing film runtime total');

  return true;
}

async function runSearchMode(page, filmCountValue, label, minFilms) {
  await page.selectOption('#planner-film-count', String(filmCountValue));
  await page.fill('#planner-start-after', '');
  await page.fill('#planner-finish-by', '');
  await clickFindPlans(page);

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

  const empty = await page.locator('.double-feature-empty-state');
  if (await empty.isVisible()) {
    pass('Impossible constraints show empty state');
    const text = await empty.textContent();
    if (text?.includes('No movie plans found')) pass('Empty state copy is clear');
    else fail(`Empty state copy unexpected: ${text}`);
  } else {
    fail('Impossible constraints did not show empty state');
  }
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

async function checkLegacyRoutes(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.movie-list, h1.main-header', { timeout: 15000 });
  pass('Showtimes page loads');

  await page.goto(`${BASE}/double-feature`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1.main-header', { timeout: 15000 });
  const dfHeader = await page.locator('h1.main-header').textContent();
  if (dfHeader?.includes('Double Feature')) pass('Double Feature page loads');
  else fail(`Double Feature header wrong: ${dfHeader}`);

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
    if (msg.type() === 'error' && !text.includes('favicon')) {
      fail(`Console error: ${text}`);
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

    const got2 = await runSearchMode(page, '2', '2-film mode', 2);
    await runSearchMode(page, '3', '3-film mode', 3);
    await runSearchMode(page, '4', '4-film mode', 4);
    await runSearchMode(page, 'max', 'Max mode', 2);

    if (!got2) note('2-film schedules unavailable on first date; other modes may still be valid');

    await checkTimeFilters(page);
    await checkEmptyState(page);

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
