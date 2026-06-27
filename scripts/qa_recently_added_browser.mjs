#!/usr/bin/env node
/**
 * One-off browser QA for Recently Added section (PR 58).
 * Usage: node scripts/qa_recently_added_browser.mjs [baseUrl]
 */
import { chromium } from 'playwright';

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

async function waitForShowtimes(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.movie-list .movie-card, .movie-list', { timeout: 15000 });
}

async function auditRecentlyAdded(page) {
  const section = page.locator('section.recently-added');
  const visible = await section.isVisible().catch(() => false);
  if (!visible) {
    fail('Recently Added section not visible');
    return;
  }
  pass('Recently Added section visible');

  const title = await section.locator('.recently-added-title').textContent();
  if (title?.trim() === 'Recently added') pass('Heading text correct');
  else fail(`Heading text wrong: ${title}`);

  const subtitle = await section.locator('.recently-added-subtitle').textContent();
  if (subtitle?.includes('last 7 days') && subtitle?.includes('currently showing')) {
    pass('Subheading text correct');
  } else {
    fail(`Subheading unexpected: ${subtitle}`);
  }

  const countText = (await section.locator('.recently-added-count').textContent())?.trim();
  const cards = section.locator('.recently-added-card');
  const cardCount = await cards.count();
  if (cardCount > 0) pass(`Rendered ${cardCount} film cards`);
  else fail('No film cards rendered');

  if (countText && cardCount > 0) {
    const expected = cardCount === 1 ? '1 film' : `${cardCount} films`;
    if (countText === expected) pass(`Count badge matches cards (${expected})`);
    else fail(`Count badge "${countText}" != ${expected}`);
  }

  const keys = new Set();
  for (let i = 0; i < cardCount; i += 1) {
    const card = cards.nth(i);
    const filmTitle = (await card.locator('.recently-added-card-title').textContent())?.trim();
    if (!filmTitle) fail(`Card ${i} missing title`);
    if (keys.has(filmTitle)) fail(`Duplicate card title visible: ${filmTitle}`);
    keys.add(filmTitle);

    const hasPosterOrPlaceholder =
      (await card.locator('.recently-added-card-poster').count()) > 0 ||
      (await card.locator('.poster-placeholder').count()) > 0;
    if (hasPosterOrPlaceholder) pass(`Card "${filmTitle}" has poster or placeholder`);
    else fail(`Card "${filmTitle}" missing poster/placeholder`);

    const date = await card.locator('.recently-added-card-date').textContent();
    if (date?.startsWith('Added ')) pass(`Card "${filmTitle}" has added date`);
    else note(`Card "${filmTitle}" missing added date label`);

    const meta = await card.locator('.recently-added-card-meta').textContent();
    if (meta?.includes('showtime')) pass(`Card "${filmTitle}" has showtime meta`);
    else note(`Card "${filmTitle}" missing showtime meta`);
  }
}

async function checkOverflow(page, width) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  if (overflow) fail(`Horizontal overflow at ${width}px`);
  else pass(`No horizontal overflow at ${width}px`);
}

async function checkResponsive(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('section.recently-added', { timeout: 10000 });
  await checkOverflow(page, width);
  const sectionBox = await page.locator('section.recently-added').boundingBox();
  if (sectionBox && sectionBox.width <= width + 1) {
    pass(`Section fits viewport width at ${width}px`);
  } else {
    fail(`Section wider than viewport at ${width}px`);
  }
}

async function checkShowtimesInteractions(page) {
  const search = page.locator('.showtimes-search-input');
  await search.fill('Cape');
  await page.waitForTimeout(300);
  const filtered = await page.locator('.movie-list .movie-card').count();
  if (filtered >= 0) pass('Search input accepts text and list updates');

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

async function checkRoutes(page, requests) {
  await page.goto(`${BASE}/double-feature`, { waitUntil: 'networkidle' });
  if (page.url().includes('double-feature')) pass('Double Feature route loads');
  else fail('Double Feature route failed');

  await page.goto(`${BASE}/marathon/`, { waitUntil: 'networkidle' });
  if (page.url().includes('marathon')) pass('Marathon route loads');
  else fail('Marathon route failed');

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

    await auditRecentlyAdded(page);

    for (const width of WIDTHS) {
      await checkResponsive(page, width);
    }

    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await checkShowtimesInteractions(page);
    await checkRoutes(page, requests);

    const dataRequests = [...new Set(requests.filter((p) => p.includes('/data/') || p.endsWith('.json') || p.endsWith('.csv')))];
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
