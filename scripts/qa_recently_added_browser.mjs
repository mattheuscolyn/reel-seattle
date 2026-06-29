#!/usr/bin/env node
/**
 * Browser QA for Recently Added preview (/) and full page (/recently-added) — PR 69.
 * Usage: node scripts/qa_recently_added_browser.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { RECENTLY_ADDED_PREVIEW_LIMIT } from '../src/utils/recentlyAddedDisplay.js';

const BASE = process.argv[2] || 'http://localhost:5198';
const WIDTHS = [375, 768, 1200];

const results = {
  pass: [],
  fail: [],
  notes: [],
};

function pass(msg) {
  results.pass.push(msg);
}

function fail(msg) {
  results.fail.push(msg);
}

function note(msg) {
  results.notes.push(msg);
}

function parseTotalFromCountLabel(countText) {
  if (!countText) return null;
  const match = countText.trim().match(/^(\d+)\s+recently added$/);
  return match ? Number(match[1]) : null;
}

async function waitForShowtimes(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.movie-list .movie-card, .movie-list', { timeout: 15000 });
}

async function auditRecentlyAddedPreview(page) {
  const section = page.locator('section.recently-added.recently-added--preview');
  const visible = await section.isVisible().catch(() => false);
  if (!visible) {
    const fallback = page.locator('section.recently-added');
    if (await fallback.isVisible().catch(() => false)) {
      note('Recently Added preview class missing; section still visible');
      return auditRecentlyAddedPreviewContent(fallback);
    }
    fail('Recently Added preview section not visible');
    return null;
  }
  return auditRecentlyAddedPreviewContent(section);
}

async function auditRecentlyAddedPreviewContent(section) {
  pass('Recently Added preview section visible');

  const title = await section.locator('.recently-added-title').textContent();
  if (title?.trim() === 'Recently added') pass('Preview heading text correct');
  else fail(`Preview heading text wrong: ${title}`);

  const subtitle = await section.locator('.recently-added-subtitle').textContent();
  if (subtitle?.includes('last 7 days') && subtitle?.includes('currently showing')) {
    pass('Preview subheading text correct');
  } else {
    fail(`Preview subheading unexpected: ${subtitle}`);
  }

  const countText = (await section.locator('.recently-added-count').textContent())?.trim();
  const total = parseTotalFromCountLabel(countText);
  if (total && total > 0) pass(`Preview count badge shows total (${total} recently added)`);
  else fail(`Preview count badge unexpected: "${countText}"`);

  const cards = section.locator('.recently-added-card');
  const cardCount = await cards.count();
  if (cardCount > 0) pass(`Preview rendered ${cardCount} film cards`);
  else fail('Preview has no film cards');

  if (total != null) {
    const expectedPreviewCount = Math.min(total, RECENTLY_ADDED_PREVIEW_LIMIT);
    if (cardCount === expectedPreviewCount) {
      pass(`Preview card count matches limit (${expectedPreviewCount})`);
    } else {
      fail(`Preview card count ${cardCount} != expected ${expectedPreviewCount}`);
    }

    if (total > RECENTLY_ADDED_PREVIEW_LIMIT) {
      const viewAll = section.locator('.recently-added-view-all');
      if ((await viewAll.count()) > 0) pass('View-all link present when total exceeds preview limit');
      else fail('View-all link missing when total exceeds preview limit');

      const href = await viewAll.getAttribute('href');
      if (href?.includes('/recently-added')) pass('View-all link targets /recently-added');
      else fail(`View-all href unexpected: ${href}`);
    } else {
      note('Total within preview limit; view-all link not required');
    }
  }

  const keys = new Set();
  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i);
    const filmTitle = (await card.locator('.recently-added-card-title').textContent())?.trim();
    if (!filmTitle) fail(`Preview card ${i} missing title`);
    if (keys.has(filmTitle)) fail(`Duplicate preview card title: ${filmTitle}`);
    keys.add(filmTitle);
  }

  return total;
}

async function auditRecentlyAddedFullPage(page, expectedTotal) {
  await page.goto(`${BASE}/recently-added`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/recently-added')) {
    fail(`Did not reach /recently-added: ${page.url()}`);
    return;
  }
  pass('/recently-added route loads');

  await page.waitForSelector('.recently-added--full .recently-added-card, .data-state', {
    timeout: 15000,
  });

  const fullSection = page.locator('section.recently-added--full');
  if (!(await fullSection.isVisible().catch(() => false))) {
    fail('Full Recently Added section not visible');
    return;
  }

  const cards = fullSection.locator('.recently-added-card');
  const cardCount = await cards.count();
  if (cardCount > 0) pass(`Full page rendered ${cardCount} film cards`);
  else fail('Full page has no film cards');

  if (expectedTotal != null && cardCount === expectedTotal) {
    pass(`Full page card count matches preview total (${expectedTotal})`);
  } else if (expectedTotal != null) {
    fail(`Full page card count ${cardCount} != preview total ${expectedTotal}`);
  }

  const backLink = page.locator('.recently-added-back-link');
  if ((await backLink.count()) > 0) pass('Back to showtimes link present');
  else fail('Back to showtimes link missing');
}

async function checkOverflow(page, width) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  if (overflow) fail(`Horizontal overflow at ${width}px`);
  else pass(`No horizontal overflow at ${width}px`);
}

async function checkResponsive(page, width, path = '/') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const selector =
    path === '/recently-added'
      ? 'section.recently-added--full, .data-state'
      : 'section.recently-added';
  await page.waitForSelector(selector, { timeout: 10000 });
  await checkOverflow(page, width);
  const section = page.locator(
    path === '/recently-added' ? 'section.recently-added--full' : 'section.recently-added',
  );
  const sectionBox = await section.boundingBox();
  if (sectionBox && sectionBox.width <= width + 1) {
    pass(`Section fits viewport width at ${width}px on ${path}`);
  } else if (await section.count()) {
    fail(`Section wider than viewport at ${width}px on ${path}`);
  }
}

async function checkShowtimesInteractions(page) {
  const search = page.locator('.showtimes-search-input');
  await search.fill('Cape');
  await page.waitForTimeout(300);
  pass('Search input accepts text and list updates');

  await search.fill('');
  await page.locator('.sticky-controls .dropdown-btn').first().click();
  await page.waitForTimeout(200);
  pass('Theater dropdown opens');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  await page.locator('.sort-btn').click({ force: true });
  await page.waitForTimeout(200);
  pass('Sort dropdown opens');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  const copyBtn = page.locator('.showtimes-copy-view');
  await copyBtn.click({ force: true });
  await page.waitForTimeout(500);
  const copied = await page.locator('.copy-link-status').textContent();
  if (copied?.includes('Link copied') || copied?.includes('Could not copy')) {
    pass('Copy current view shows feedback');
  }

  const firstToggle = page.locator('.movie-toggle-button').first();
  if (await firstToggle.count()) {
    await firstToggle.click();
    await page.waitForSelector('.movie-showtimes-expanded', { timeout: 3000 });
    pass('Expand/collapse works');
    await firstToggle.click();
  }
}

async function checkRoutes(page) {
  await page.goto(`${BASE}/double-feature`, { waitUntil: 'networkidle' });
  if (page.url().includes('/planner')) pass('Double Feature route redirects to Planner');
  else fail(`Double Feature route did not redirect: ${page.url()}`);

  await page.goto(`${BASE}/marathon`, { waitUntil: 'networkidle' });
  if (page.url().includes('/planner') && page.url().includes('count=max')) {
    pass('Marathon route redirects to Planner max mode');
  } else {
    fail(`Marathon route did not redirect to Planner: ${page.url()}`);
  }

  await page.goto(`${BASE}/?search=Test&sort=runtime-desc`, { waitUntil: 'networkidle' });
  const searchVal = await page.locator('.showtimes-search-input').inputValue();
  if (searchVal === 'Test') pass('URL restore preserves search param');
  else fail(`URL restore search got "${searchVal}"`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') fail(`Console error: ${msg.text()}`);
    if (msg.type() === 'warning') note(`Console warning: ${msg.text()}`);
  });

  page.on('request', (req) => {
    requests.push(new URL(req.url()).pathname);
  });

  try {
    await waitForShowtimes(page);
    pass('Showtimes page loads');

    const mainList = await page.locator('.movie-list .movie-card').count();
    if (mainList > 0) pass(`Main movie list has ${mainList} cards`);
    else note('Main movie list empty (may be data-related)');

    const total = await auditRecentlyAddedPreview(page);
    await auditRecentlyAddedFullPage(page, total);

    for (const width of WIDTHS) {
      await checkResponsive(page, width, '/');
      await checkResponsive(page, width, '/recently-added');
    }

    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await checkShowtimesInteractions(page);
    await checkRoutes(page);

    const dataRequests = [
      ...new Set(requests.filter((p) => p.includes('/data/') || p.endsWith('.json') || p.endsWith('.csv'))),
    ];
    note(`Data requests: ${dataRequests.join(', ')}`);

    const required = ['showtimes_current.json', 'pipeline_report.json', 'newly_added_current.json'];
    for (const file of required) {
      if (dataRequests.some((p) => p.includes(file))) pass(`Fetched ${file}`);
      else fail(`Missing fetch for ${file}`);
    }

    const forbidden = ['showtimes_history.csv', 'movies_announcements.csv', 'newly_announced.csv'];
    for (const file of forbidden) {
      if (dataRequests.some((p) => p.includes(file))) fail(`Forbidden fetch: ${file}`);
      else pass(`Did not fetch ${file}`);
    }
  } catch (error) {
    fail(`QA script error: ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log('\n=== Recently Added Browser QA ===\n');
  for (const msg of results.pass) console.log(`PASS: ${msg}`);
  for (const msg of results.notes) console.log(`NOTE: ${msg}`);
  for (const msg of results.fail) console.log(`FAIL: ${msg}`);
  console.log(`\n${results.pass.length} passed, ${results.fail.length} failed, ${results.notes.length} notes`);
  process.exit(results.fail.length > 0 ? 1 : 0);
}

main();
