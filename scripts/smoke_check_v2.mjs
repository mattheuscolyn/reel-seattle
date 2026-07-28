#!/usr/bin/env node
/**
 * Smoke-check the isolated v2 Vite shell (four-tab + real Home data path).
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const V2_URL = 'http://127.0.0.1:5175/';
const READY_TIMEOUT_MS = 45_000;
const POLL_MS = 250;

const CANONICAL_LABELS = ['Home', 'Explore', 'Planner', 'Profile'];
const REJECTED_LABELS = ['Movies', 'Theaters', 'Me'];

function fail(message) {
  console.error(`smoke_check_v2: ${message}`);
  process.exit(1);
}

async function waitForV2(child) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode != null) {
      fail(`v2 process exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(V2_URL);
      if (response.ok) return response;
    } catch {
      // not ready
    }
    await delay(POLL_MS);
  }
  fail(`timed out waiting for ${V2_URL}`);
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode != null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      }).once('exit', () => resolve());
      setTimeout(() => resolve(), 5_000).unref();
      return;
    }
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode == null) child.kill('SIGKILL');
    }, 3_000).unref();
  });
}

const child = spawn('npm', ['run', 'v2'], {
  cwd: ROOT,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForV2(child);

  const destinationsSource = await (
    await fetch(new URL('/destinations.js', V2_URL))
  ).text();
  for (const label of CANONICAL_LABELS) {
    if (
      !destinationsSource.includes(`label: '${label}'`) &&
      !destinationsSource.includes(`label: "${label}"`)
    ) {
      fail(`canonical label missing: ${label}`);
    }
  }
  for (const rejected of REJECTED_LABELS) {
    if (
      destinationsSource.includes(`label: '${rejected}'`) ||
      destinationsSource.includes(`label: "${rejected}"`)
    ) {
      fail(`rejected primary label present: ${rejected}`);
    }
  }

  const homeSource = await (
    await fetch(new URL('/HomeDestination.jsx', V2_URL))
  ).text();
  if (homeSource.includes('TOP_OPPORTUNITY_FIXTURES')) {
    fail('Home still defaults to fictional Top Opportunity fixtures');
  }
  if (homeSource.includes('OPENING_THIS_WEEK_FIXTURES')) {
    fail('Home still defaults to Opening This Week fixtures');
  }
  if (!homeSource.includes('buildOpeningThisWeekShelf')) {
    fail('Home missing Opening This Week shelf builder');
  }

  const topSource = await (
    await fetch(new URL('/home/TopOpportunityFeature.jsx', V2_URL))
  ).text();
  if (!topSource.includes('selectTopOpportunities')) {
    fail('Top Opportunity missing real selector wiring');
  }
  if (!topSource.includes('onOpenFilmDetail')) {
    fail('Top Opportunity missing Film Detail open handler');
  }

  const leavingSoon = await fetch(new URL('/data/leaving_soon_current.json', V2_URL));
  if (leavingSoon.status !== 404) {
    fail(`leaving_soon_current.json should be 404, got ${leavingSoon.status}`);
  }

  const showtimes = await fetch(new URL('/data/showtimes_current.json', V2_URL));
  if (!showtimes.ok) fail('showtimes_current.json not served');

  const appSource = await (await fetch(new URL('/V2App.jsx', V2_URL))).text();
  if (!appSource.includes('Local only')) fail('missing Local only marker');
  if (!appSource.includes('FilmDetailSurface')) {
    fail('V2App missing Film Detail surface');
  }

  const exploreSource = await (
    await fetch(new URL('/explore/ExploreDestination.jsx', V2_URL))
  ).text();
  if (!exploreSource.includes('ExploreQuickStart')) {
    fail('Explore landing missing Quick Start');
  }
  if (!exploreSource.includes('ExploreBrowseBy')) {
    fail('Explore landing missing Browse By');
  }
  if (
    exploreSource.includes('Everything Everywhere All at Once') ||
    exploreSource.includes('Minions & Monsters')
  ) {
    fail('Explore embeds fictional mockup titles');
  }

  const catalogSource = await (
    await fetch(new URL('/explore/exploreCatalog.js', V2_URL))
  ).text();
  if (!catalogSource.includes('personSearchSupported: false')) {
    fail('Explore catalog must not claim person search');
  }

  const searchSurface = await (
    await fetch(new URL('/surfaces/SearchResultsSurface.jsx', V2_URL))
  ).text();
  if (!searchSurface.includes('More details')) {
    fail('Search Results missing More details');
  }
  if (searchSurface.includes('Seven Samurai') || searchSurface.includes('Rashomon')) {
    fail('Search Results embeds fictional mockup titles');
  }

  const appSource2 = await (await fetch(new URL('/V2App.jsx', V2_URL))).text();
  if (!appSource2.includes('SearchResultsSurface')) {
    fail('V2App missing SearchResultsSurface wiring');
  }

  const filmDetail = await (
    await fetch(new URL('/surfaces/FilmDetailSurface.jsx', V2_URL))
  ).text();
  if (!filmDetail.includes('Why see it now')) {
    fail('Film Detail missing Why see it section');
  }
  if (!filmDetail.includes('Add to planner')) {
    fail('Film Detail missing Add to planner');
  }
  if (
    /Buy now|Get tickets for the best|checkout|seat selection/i.test(filmDetail)
  ) {
    fail('Film Detail must not include ticket-purchase CTA copy');
  }
  if (!filmDetail.includes('composeFilmDetailPresentation') && !filmDetail.includes('resolveFilmDetailPresentation')) {
    fail('Film Detail must resolve presentation via composer / resolver');
  }
  if (!filmDetail.includes('data-fd-mode')) {
    fail('Film Detail missing mode marker');
  }
  if (!filmDetail.includes('v2-fd-signals-grid')) {
    fail('Film Detail missing Why See It four-column signal row');
  }
  // Production path must not hard-default to mockup fixture.
  if (/getFilmDetailMockupPresentation\(\)/.test(filmDetail) && !filmDetail.includes('resolveFilmDetailPresentation')) {
    fail('Film Detail still defaults to mockup presentation helper');
  }

  const mockupFixture = await (
    await fetch(new URL('/fixtures/filmDetailMockupFixture.js', V2_URL))
  ).text();
  if (!mockupFixture.includes('2001: A Space Odyssey')) {
    fail('Film Detail mockup fixture missing approved title');
  }
  if (!mockupFixture.includes('Letterboxd Top 250')) {
    fail('Film Detail mockup fixture missing approved signal copy');
  }
  if (!mockupFixture.includes('fdMockup')) {
    fail('Film Detail mockup fixture missing explicit QC flag');
  }

  const resolver = await (
    await fetch(new URL('/fixtures/resolveFilmDetailPresentation.js', V2_URL))
  ).text();
  if (!resolver.includes('production')) {
    fail('Film Detail resolver missing production mode');
  }

  const oppScaffold = await (
    await fetch(new URL('/surfaces/OpportunityDetailSurface.jsx', V2_URL))
  ).text();
  if (!oppScaffold.includes('scaffold')) {
    fail('Opportunity Detail scaffold missing');
  }

  console.log(`smoke_check_v2: ok (${V2_URL})`);
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await stopProcess(child);
}
