import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { buildLeavingSoon } from '../../v2/adapters/buildLeavingSoon.js';
import {
  buildLeavingDateLabel,
  buildLiveLeavingSoonPresentation,
  formatLeavingDateShort,
} from '../../v2/leaving/buildLiveLeavingSoonPresentation.js';
import {
  LEAVING_SORT_OPTIONS,
  filterLeavingFilms,
  sortLeavingFilms,
} from '../../v2/leaving/leavingListControls.js';
import { formatCompactTheaterLine } from '../../v2/homeShelfDetail/compactTheaterLine.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES_DIR = join(ROOT, 'tests/fixtures/frontend');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const LEAVING_SRC = readFileSync(
  join(ROOT, 'v2/leaving/LeavingSoonSurface.jsx'),
  'utf8',
);
const PRESENTATION_SRC = readFileSync(
  join(ROOT, 'v2/leaving/buildLiveLeavingSoonPresentation.js'),
  'utf8',
);
const SHELL_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailSurface.jsx'),
  'utf8',
);
const CARD_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailFilmCard.jsx'),
  'utf8',
);
const OPENING_SRC = readFileSync(
  join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'),
  'utf8',
);

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

const leavingSoonArtifact = {
  schema_version: '1.1.0',
  generated_at: '2026-09-04T12:00:00-07:00',
  source: 'amc',
  model_version: 'amc_remaining_run_survival_v1',
  window: { start_date: '2026-09-04', end_date: '2026-09-17' },
  method: {
    name: 'amc_remaining_run_survival_v1',
    description: 'Frozen remaining-run model.',
  },
  stats: { candidate_film_count: 3, flagged_film_count: 2 },
  items: [
    {
      film_key: 'sinners',
      film_title: 'Sinners',
      risk_level: 'high',
      reason: 'This theatrical run looks likely to end this week.',
      leaving_soon_bucket: 'last_chance',
      sort_rank: 1,
      visible_show_date_count: 2,
      min_show_date: '2026-09-04',
      max_show_date: '2026-09-05',
      total_visible_showtimes: 4,
      total_visible_theaters: 3,
      theaters: [
        { theater_id: 'amc-pacific-place-11', theater_name: 'AMC Pacific Place 11' },
        { theater_id: 'siff-cinema-uptown', theater_name: 'SIFF Cinema Uptown' },
        { theater_id: 'amc-oak-tree-6', theater_name: 'AMC Oak Tree 6' },
        // duplicate should be ignored
        { theater_id: 'amc-pacific-place-11', theater_name: 'AMC Pacific Place 11' },
      ],
      show_dates: ['2026-09-04', '2026-09-05'],
      has_primetime: true,
      has_weekend_show: true,
      poster_url: 'https://example.com/sinners.jpg',
      runtime_min: 137,
    },
    {
      film_key: 'indie-film',
      film_title: 'Indie Film',
      risk_level: 'elevated',
      reason: 'This theatrical run may be winding down soon.',
      leaving_soon_bucket: 'leaving_soon',
      sort_rank: 2,
      visible_show_date_count: 3,
      min_show_date: '2026-09-04',
      max_show_date: '2026-09-10',
      total_visible_showtimes: 6,
      total_visible_theaters: 1,
      theaters: [
        { theater_id: 'siff-cinema-uptown', theater_name: 'SIFF Cinema Uptown' },
      ],
      show_dates: ['2026-09-04'],
      has_primetime: true,
      has_weekend_show: false,
      poster_url: null,
      runtime_min: 100,
    },
  ],
};

function homeWithLeaving() {
  return buildHomeData({
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: { entries: [] },
    leavingSoon: leavingSoonArtifact,
  });
}

test('Home Leaving Soon See all navigates to leaving-soon collection', () => {
  assert.match(HOME_SRC, /COLLECTION_IDS\.leavingSoon/);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.leavingSoon,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.collectionId, 'leaving-soon');
  assert.equal(nav.surface?.originPrimary, 'home');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'home',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'home');
});

test('Leaving Soon full-list is routed through LeavingSoonSurface + shared shell', () => {
  assert.match(APP_SRC, /LeavingSoonSurface/);
  assert.match(APP_SRC, /isLeavingSoon/);
  assert.match(LEAVING_SRC, /HomeShelfDetailSurface/);
  assert.match(LEAVING_SRC, /HomeShelfDetailFilmCard/);
  assert.equal(LEAVING_SRC.includes('className="v2-opening-page"'), false);
  assert.equal(LEAVING_SRC.includes('className="v2-shelf-detail-page"'), false);
  assert.equal(LEAVING_SRC.includes('function OpeningFilmCard'), false);
  assert.match(SHELL_SRC, /data-shelf-detail-surface/);
});

test('Leaving Soon presentation title and no redundant subtitle', () => {
  const presentation = buildLiveLeavingSoonPresentation(homeWithLeaving());
  assert.equal(presentation.pageTitle, 'Leaving Soon');
  assert.equal(presentation.pageSubtitle, null);
  assert.equal(presentation.countLabel, null);
  assert.equal(presentation.showCategoryChips, false);
  assert.deepEqual(presentation.categoryChips, []);
  assert.equal(
    JSON.stringify(presentation).includes('Films leaving Seattle'),
    false,
  );
  assert.equal(LEAVING_SRC.includes('categoryChips={null}'), true);
});

test('Leaving Soon cards use shared card fields and last-screening copy', () => {
  assert.equal(formatLeavingDateShort('2026-09-14'), 'Sep 14');
  assert.equal(buildLeavingDateLabel('2026-09-14'), 'Last screening Sep 14');
  assert.equal(buildLeavingDateLabel(null), null);

  const presentation = buildLiveLeavingSoonPresentation(homeWithLeaving());
  const sinners = presentation.films.find((film) => film.filmKey === 'sinners');
  assert.ok(sinners);
  assert.equal(sinners.badge, 'Last chance');
  assert.equal(sinners.dateLabel, 'Last screening Sep 5');
  assert.equal(sinners.maxShowDate, '2026-09-05');
  assert.equal(sinners.formatLabel, null);
  assert.deepEqual(sinners.formatLabels, []);
  assert.equal(sinners.formatLabels.includes('Closed Captions'), false);
  assert.match(CARD_SRC, /film\.dateLabel/);
  assert.match(CARD_SRC, /film\.theaterName/);
});

test('Leaving Soon aggregates unique theaters with +N more truncation', () => {
  const presentation = buildLiveLeavingSoonPresentation(homeWithLeaving());
  const sinners = presentation.films.find((film) => film.filmKey === 'sinners');
  assert.equal(sinners.theaters.length, 3);
  assert.equal(
    sinners.theaterName,
    'AMC Pacific Place 11 · SIFF Cinema Uptown · +1 more',
  );
  assert.equal(
    formatCompactTheaterLine(sinners.theaters.map((t) => t.name)),
    sinners.theaterName,
  );

  const indie = presentation.films.find((film) => film.filmKey === 'indie-film');
  assert.equal(indie.theaters.length, 1);
  assert.equal(indie.theaterName, 'SIFF Cinema Uptown');
});

test('Leaving Soon default sort is leaving soonest by maxShowDate', () => {
  assert.equal(LEAVING_SORT_OPTIONS[0].id, 'leaving-soonest');
  assert.match(LEAVING_SRC, /useState\('leaving-soonest'\)/);

  const presentation = buildLiveLeavingSoonPresentation(homeWithLeaving());
  const sorted = sortLeavingFilms(presentation.films, 'leaving-soonest');
  assert.equal(sorted[0].filmKey, 'sinners');
  assert.equal(sorted[0].maxShowDate, '2026-09-05');
  assert.equal(sorted[1].maxShowDate, '2026-09-10');

  const byTitle = sortLeavingFilms(presentation.films, 'title-az');
  assert.equal(byTitle[0].title, 'Indie Film');
});

test('Leaving Soon theater filter works; no OTW category pills', () => {
  const presentation = buildLiveLeavingSoonPresentation(homeWithLeaving());
  assert.equal(presentation.showCategoryChips, false);
  assert.equal(LEAVING_SRC.includes('Opening categories'), false);
  assert.equal(LEAVING_SRC.includes('v2-opening-chip-row'), false);

  const filtered = filterLeavingFilms(presentation.films, {
    theaterId: 'amc-oak-tree-6',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].filmKey, 'sinners');
});

test('Leaving Soon film clickthrough opens Film Detail and restores', () => {
  assert.match(LEAVING_SRC, /onOpenFilmDetail/);
  assert.match(CARD_SRC, /More details/);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.leavingSoon,
    originPrimary: 'home',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'sinners',
    opportunityKey: null,
    originPrimary: 'home',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(nav.surface?.returnSurface?.collectionId, 'leaving-soon');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'leaving-soon');
});

test('adapter preserves theaters and maxShowDate for full-list', () => {
  const model = buildLeavingSoon(leavingSoonArtifact);
  assert.equal(model.entries[0].maxShowDate, '2026-09-05');
  assert.equal(model.entries[0].theaters.length, 3);
  assert.equal(model.entries[0].totalVisibleTheaters, 3);
});

test('Opening This Week still uses shared shell independently', () => {
  assert.match(OPENING_SRC, /HomeShelfDetailSurface/);
  assert.match(OPENING_SRC, /buildLiveOpeningThisWeekPresentation/);
  assert.match(PRESENTATION_SRC, /buildLiveLeavingSoonPresentation|leaving_soon/);
  assert.equal(OPENING_SRC.includes('LeavingSoonSurface'), false);
});

test('no duplicated Leaving Soon page shell', () => {
  assert.equal(LEAVING_SRC.includes('<section className="v2-opening-page"'), false);
  assert.equal(LEAVING_SRC.includes('<section className="v2-shelf-detail-page"'), false);
  assert.equal(LEAVING_SRC.includes('v2-collection-leaving-soon'), false);
  assert.match(LEAVING_SRC, /from '\.\.\/homeShelfDetail\/HomeShelfDetailSurface\.jsx'/);
});
