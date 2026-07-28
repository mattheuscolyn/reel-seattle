import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILM_DETAIL_MOCKUP_FIXTURE,
  FILM_DETAIL_MOCKUP_MARKERS,
  getFilmDetailMockupPresentation,
} from '../../v2/fixtures/filmDetailMockupFixture.js';
import { resolveFilmDetailPresentation } from '../../v2/fixtures/resolveFilmDetailPresentation.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { resolveFilmDetailBackLabel } from '../../v2/filmDetail/filmDetailModel.js';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  PRIMARY_DESTINATIONS,
  REJECTED_PRIMARY_NAV_LABELS,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/filmDetailMockupFixture.js'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const V1_APP = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function homeData() {
  return buildHomeData({
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
  });
}

test('mockup fixture contains all major Film Detail sections', () => {
  const p = getFilmDetailMockupPresentation();
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p, FILM_DETAIL_MOCKUP_FIXTURE);
  assert.ok(p.film?.title);
  assert.ok(p.film?.posterUrl);
  assert.ok(p.film?.backdropUrl);
  assert.ok(p.film?.year);
  assert.ok(p.film?.director);
  assert.ok(p.actions);
  assert.equal(p.whySeeIt.signals.length, 4);
  assert.ok(p.synopsis?.preview);
  assert.equal(p.synopsis.tags.length, 3);
  assert.ok(p.bestWay?.formatLabel);
  assert.equal(p.bestWay.facts.length, 3);
  assert.equal(p.todaysShowtimes.rows.length, 3);
  assert.ok(p.originLabel);
});

test('Film Detail surface preserves structural contract', () => {
  for (const marker of [
    'v2-fd-hero',
    'v2-fd-actions',
    'v2-fd-signals-grid',
    'v2-fd-synopsis',
    'v2-fd-best',
    'v2-fd-today-list',
    'Why see it now',
    'What it’s about',
    'Best way to see it',
    'Today’s showtimes',
    'Save',
    'Seen',
    'Not interested',
    'Add to planner',
  ]) {
    assert.ok(SURFACE.includes(marker), `missing ${marker}`);
  }
  assert.ok(SURFACE.includes('resolveFilmDetailPresentation'));
  assert.ok(SURFACE.includes('toFilmDetailView'));
  assert.ok(SURFACE.includes('data-fd-mode'));
  assert.ok(SURFACE.includes('homeData'));
  assert.equal(SURFACE.includes('loadHomeData'), false);
});

test('Why See It uses a four-column row at the mobile target', () => {
  assert.ok(SURFACE.includes('v2-fd-signals-grid'));
  assert.ok(CSS.includes('.v2-fd-signals-grid'));
  assert.match(
    CSS,
    /\.v2-fd-signals-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.equal(
    /\.v2-fd-signals-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/.test(CSS),
    false,
  );
  assert.match(CSS, /@media \(max-width:\s*319px\)/);
  assert.equal(FILM_DETAIL_MOCKUP_FIXTURE.whySeeIt.signals.length, 4);
});

test('canonical bottom navigation remains Home / Explore / Planner / Profile', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.label),
    ['Home', 'Explore', 'Planner', 'Profile'],
  );
  for (const rejected of REJECTED_PRIMARY_NAV_LABELS) {
    assert.equal(
      PRIMARY_DESTINATIONS.some((d) => d.label === rejected),
      false,
    );
  }
});

test('fixture values stay centralized in mockup fixture module', () => {
  for (const marker of FILM_DETAIL_MOCKUP_MARKERS) {
    assert.ok(FIXTURE_SRC.includes(marker), `fixture missing ${marker}`);
  }
  assert.equal(SURFACE.includes('Letterboxd Top 250'), false);
  assert.equal(SURFACE.includes('Stanley Kubrick'), false);
  assert.equal(SURFACE.includes('Mind-bending'), false);
  assert.equal(SURFACE.includes('0.6 mi'), false);
});

test('production V2App wires HomeData into Film Detail', () => {
  assert.ok(APP.includes('FilmDetailSurface'));
  assert.ok(APP.includes('homeData={sharedHomeData.homeData}'));
  assert.ok(APP.includes('filmKey={filmKey}'));
  assert.ok(APP.includes('resolveFilmDetailBackLabel'));
  assert.equal(APP.includes("filmTitle = isFilmDetail ? '2001: A Space Odyssey'"), false);
});

test('v1 remains unaffected by Film Detail fixtures', () => {
  assert.equal(V1_APP.includes('filmDetailMockupFixture'), false);
  assert.equal(V1_APP.includes('FilmDetailSurface'), false);
  assert.equal(V1_APP.includes('v2-fd-mockup'), false);
});

test('Film Detail keeps Explore-active chrome', () => {
  assert.ok(APP.includes("? 'explore'"));
  assert.ok(APP.includes('v2-shell-fd'));
});

test('Back from Film Detail restores prior surface in nav state', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'sinners',
    originPrimary: 'explore',
    returnSurface: {
      type: 'collection',
      collectionId: 'search-results',
      originPrimary: 'explore',
      query: 'sinners',
      searchUi: { query: 'sinners', typeFilter: 'movies' },
    },
  });
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.primaryDestinationId, 'explore');
});

test('origin-aware Back labels', () => {
  assert.equal(resolveFilmDetailBackLabel('home', null), 'Home');
  assert.equal(
    resolveFilmDetailBackLabel('explore', {
      type: 'collection',
      collectionId: 'search-results',
    }),
    'Search',
  );
  assert.equal(resolveFilmDetailBackLabel('explore', null), 'Explore');
});

test('production mode resolves real film titles and never the mockup title by default', () => {
  const home = homeData();
  const a = resolveFilmDetailPresentation({
    homeData: home,
    filmKey: 'sinners',
    forceMode: 'production',
  });
  const b = resolveFilmDetailPresentation({
    homeData: home,
    filmKey: 'indie-film',
    forceMode: 'production',
  });
  assert.equal(a.mode, 'production');
  assert.equal(a.resolved, true);
  assert.equal(a.presentation.displayTitle, 'Sinners');
  assert.equal(b.presentation.displayTitle, 'Indie Film');
  assert.notEqual(a.presentation.displayTitle, b.presentation.displayTitle);
  assert.notEqual(a.presentation.displayTitle, '2001: A Space Odyssey');
});

test('unknown film key does not fall back to mockup fixture', () => {
  const home = homeData();
  const missing = resolveFilmDetailPresentation({
    homeData: home,
    filmKey: 'does-not-exist',
    forceMode: 'production',
  });
  assert.equal(missing.resolved, false);
  assert.equal(missing.mode, 'production');
  const view = toFilmDetailView(missing);
  assert.equal(view.resolved, false);
  assert.equal(view.displayTitle, null);
  assert.notEqual(view.hero?.title, '2001: A Space Odyssey');
});

test('mockup QC mode still renders canonical fixture values', () => {
  const resolved = resolveFilmDetailPresentation({
    homeData: null,
    filmKey: 'ignored',
    forceMode: 'mockup-fixture',
  });
  assert.equal(resolved.mode, 'mockup-fixture');
  const view = toFilmDetailView(resolved);
  assert.equal(view.displayTitle, '2001: A Space Odyssey');
  assert.equal(view.hero.director, 'Directed by Stanley Kubrick');
  assert.ok(view.synopsis.tags.includes('Mind-bending'));
  assert.ok(
    view.whySeeIt.signals.some((s) => s.primary.includes('Letterboxd')),
  );
  assert.ok(view.bestWay.facts.some((f) => f.label === '0.6 mi'));
});

test('visual QC mode uses design fixture, not production HomeData', () => {
  const home = homeData();
  const resolved = resolveFilmDetailPresentation({
    homeData: home,
    filmKey: 'sinners',
    forceMode: 'visual-fixture',
  });
  assert.equal(resolved.mode, 'visual-fixture');
  assert.equal(resolved.presentation.displayTitle, '2001: A Space Odyssey');
});

test('production suppresses enrichment fields and fixture-only evidence', () => {
  const home = homeData();
  const presentation = composeFilmDetailPresentation(home, 'sinners');
  assert.equal(presentation.mode, 'real');
  assert.equal(presentation.hero.year, null);
  assert.equal(presentation.hero.rating, null);
  assert.equal(presentation.hero.genres, null);
  assert.equal(presentation.hero.director, null);
  assert.equal(presentation.synopsis.available, false);
  assert.equal(presentation.synopsis.tags.length, 0);
  assert.equal(
    presentation.signals.some((s) => /Letterboxd/i.test(s.primary)),
    false,
  );
  assert.equal(
    (presentation.bestWay?.facts ?? []).some((f) => /0\.6 mi|mi\b/.test(f.label)),
    false,
  );
});

test('production activates supported schedule fields', () => {
  const home = homeData();
  const presentation = composeFilmDetailPresentation(home, 'sinners');
  assert.equal(presentation.displayTitle, 'Sinners');
  assert.ok(presentation.hero.runtimeLabel);
  assert.ok(presentation.hero.posterUrl);
  assert.ok(presentation.bestWay);
  assert.ok(presentation.bestWay.theaterName);
  assert.ok(presentation.bestWay.whenLabel);
});

test('mixed ticket URLs stay distinct on today rows when dates match today', () => {
  const home = structuredClone(homeData());
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  for (const opp of home.opportunities) {
    if (opp.filmKey === 'sinners') opp.localDate = today;
  }
  const presentation = composeFilmDetailPresentation(home, 'sinners');
  const urls = presentation.today.rows.flatMap((row) =>
    row.times.map((t) => t.ticketUrl),
  );
  assert.ok(urls.includes('https://example.com/tickets/1'));
  assert.ok(urls.includes(null));
});

test('production Film Detail surface does not call mockup helper as default', () => {
  assert.equal(SURFACE.includes('getFilmDetailMockupPresentation()'), false);
  assert.ok(FIXTURE_SRC.includes('fdMockup'));
});

test('reactivation: supplying synopsis to the model surfaces it', () => {
  const home = homeData();
  const film = home.films.find((f) => f.filmKey === 'indie-film');
  film.synopsis = 'A short indie film about a rainy Seattle night.';
  const presentation = composeFilmDetailPresentation(home, 'indie-film');
  assert.equal(presentation.synopsis.available, true);
  assert.match(presentation.synopsis.preview, /rainy Seattle/);
});
