import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLANNER_LANDING_MOCKUP_FIXTURE,
  PLANNER_LANDING_SECTION_ORDER,
  PLANNER_MOCKUP_QUERY,
  getPlannerLandingMockupPresentation,
  isPlannerMockupMode,
} from '../../v2/fixtures/plannerLandingMockupFixture.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  openFilmDetail,
  selectPrimaryDestination,
  startPlannerFromFilm,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';
import { acceptResultsPlan } from '../../v2/planner/acceptPlanFromResults.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
  'utf8',
);
const PLACEHOLDER_SRC = readFileSync(
  join(ROOT, 'v2/DestinationPlaceholder.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/plannerLandingMockupFixture.js'),
  'utf8',
);
const COMPOSE_SRC = readFileSync(
  join(ROOT, 'v2/planner/composePlannerLandingPresentation.js'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function liveFilm(overrides = {}) {
  return {
    type: 'film',
    localDate: '2026-08-20',
    date: '2026-08-20',
    localTime: '19:00',
    time: '19:00',
    title: 'The Conversation',
    filmKey: 'src:siff:conversation',
    filmId: 'tmdb:101',
    source: 'siff',
    sourceShowtimeId: 'st-conv',
    theaterId: 'siff-uptown',
    theaterName: 'SIFF Uptown',
    runtimeMin: 113,
    runtime: 113,
    format: '35mm',
    posterUrl: 'https://example.com/conversation.jpg',
    ...overrides,
  };
}

test('Planner Landing fixture matches Upcoming mockup sections', () => {
  const p = getPlannerLandingMockupPresentation();
  assert.equal(p.source, 'planner-landing-mockup');
  assert.equal(p, PLANNER_LANDING_MOCKUP_FIXTURE);
  assert.equal(p.pageTitle, 'Planner');
  assert.match(p.pageTagline, /Plan your moviegoing/);
  assert.equal(p.needsAttention.count, 1);
  assert.equal(p.needsAttention.items[0].headline, 'Thursday has a conflict');
  assert.equal(p.upcoming.dateGroups.length, 3);
  assert.equal(p.upcoming.dateGroups[0].items[0].title, 'The Conversation');
  assert.equal(p.upcoming.dateGroups[1].items[0].kind, 'conflict-group');
  assert.equal(p.upcoming.dateGroups[1].items[0].left.title, 'Bottoms');
  assert.equal(p.upcoming.dateGroups[2].items[0].formatLabel, '4K Restoration');
  assert.equal(p.tabs[0].label, 'Upcoming');
  assert.equal(p.tabs[1].label, 'Saved films');
  assert.equal(p.savedFilms.implemented, true);
  assert.deepEqual([...PLANNER_LANDING_SECTION_ORDER], [
    'header',
    'tabs',
    'needsAttention',
    'upcoming',
  ]);
  assert.equal(PLANNER_MOCKUP_QUERY, 'plannerMockup');
  assert.equal(typeof isPlannerMockupMode, 'function');
});

test('Planner fixture does not import stores or planner persistence', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(FIXTURE_SRC.includes('plannerEngine'), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
  // localStorage is only used for optional mockup-mode detection.
  assert.match(FIXTURE_SRC, /PLANNER_MOCKUP_STORAGE_KEY/);
});

test('production Planner compose stays honest without fixture films', () => {
  const storage = memoryStorage();
  const p = composePlannerLandingFromAcceptedPlans({ storage });
  assert.equal(p.source, 'accepted-plans');
  assert.equal(p.upcoming.dateGroups.length, 0);
  assert.equal(p.needsAttention.count, 0);
  assert.equal(p.summary.upcomingCount, 0);
  assert.equal(p.summary.screeningCount, 0);
  assert.match(p.upcoming.emptyTitle, /No upcoming screenings/i);
  assert.equal(p.pageTitle, 'Planner');
  assert.match(p.pageTagline, /Plan your moviegoing/);
  assert.equal(COMPOSE_SRC.includes('Long Horizon'), false);
  assert.equal(COMPOSE_SRC.includes('Bottoms'), false);
  assert.equal(COMPOSE_SRC.includes('The Conversation'), false);
});

test('production compose flattens screenings and detects overlaps', () => {
  const storage = memoryStorage();
  acceptResultsPlan(
    {
      id: 'live-a',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Bottoms',
          filmKey: 'src:nwff:bottoms',
          filmId: 'tmdb:201',
          source: 'nwff',
          sourceShowtimeId: 'st-b',
          theaterId: 'nwff',
          theaterName: 'NWFF',
          localTime: '19:00',
          time: '19:00',
          format: null,
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  acceptResultsPlan(
    {
      id: 'live-b',
      provenance: 'live',
      source: 'live',
      date: '2026-08-20',
      items: [
        liveFilm({
          title: 'Mysterious Skin',
          filmKey: 'src:beacon:mysterious',
          filmId: 'tmdb:202',
          source: 'beacon',
          sourceShowtimeId: 'st-m',
          theaterId: 'beacon',
          theaterName: 'The Beacon',
          localTime: '19:30',
          time: '19:30',
          runtimeMin: 99,
          runtime: 99,
          format: null,
        }),
      ],
    },
    [],
    { storage, provenance: 'live' },
  );
  const now = new Date('2026-08-08T18:00:00-07:00');
  const p = composePlannerLandingFromAcceptedPlans({ storage, now });
  assert.equal(p.summary.screeningCount, 2);
  assert.equal(p.needsAttention.count, 1);
  assert.match(p.needsAttention.items[0].body, /Bottoms and Mysterious Skin/);
  assert.equal(p.upcoming.dateGroups.length, 1);
  assert.equal(p.upcoming.dateGroups[0].items[0].kind, 'conflict-group');
});

test('Planner destination replaces placeholder shell', () => {
  assert.match(PLACEHOLDER_SRC, /PlannerDestination/);
  assert.match(PLANNER_SRC, /data-planner-source/);
  assert.match(PLANNER_SRC, /data-planner-section="header"/);
  assert.match(PLANNER_SRC, /data-planner-section="tabs"/);
  assert.match(PLANNER_SRC, /data-planner-section="needsAttention"/);
  assert.match(PLANNER_SRC, /data-planner-section="upcoming"/);
  assert.equal(PLANNER_SRC.includes('recentActivity'), false);
  assert.equal(PLANNER_SRC.includes('v2 shell · placeholder'), false);
  assert.match(PLANNER_SRC, /isPlannerMockupMode/);
});

test('Planner landing keeps interactive controls as buttons', () => {
  assert.match(PLANNER_SRC, /v2-planner-build-btn/);
  assert.match(PLANNER_SRC, /v2-planner-screening-row/);
  assert.match(PLANNER_SRC, /v2-planner-attention-cta/);
  assert.match(PLANNER_SRC, /v2-planner-timeline-link/);
  assert.match(PLANNER_SRC, /type="button"/);
  assert.match(PLANNER_SRC, /aria-labelledby="v2-planner-title"/);
  assert.match(PLANNER_SRC, /onOpenMyScheduleWeek/);
  assert.match(PLANNER_SRC, /onOpenBuildPlan/);
  assert.match(PLANNER_SRC, /role="tablist"/);
});

test('Planner landing CSS covers tabs attention upcoming conflict', () => {
  assert.match(CSS, /\.v2-planner\b/);
  assert.match(CSS, /\.v2-planner-tabs\b/);
  assert.match(CSS, /\.v2-planner-attention-card\b/);
  assert.match(CSS, /\.v2-planner-screening-row\b/);
  assert.match(CSS, /\.v2-planner-conflict-group\b/);
  assert.match(CSS, /\.v2-planner-build-btn\b/);
  assert.match(CSS, /--v2-nav-clearance/);
  assert.match(
    CSS,
    /padding-bottom:\s*calc\(\s*var\(--v2-nav-height\)\s*\+\s*var\(--v2-nav-clearance\)/,
  );
});

test('Planner tab activates correctly and nav unchanged', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
});

test('Film Detail planner seed still reaches Planner destination', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'home',
  });
  nav = startPlannerFromFilm(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    mode: 'multi',
  });
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(nav.plannerSeed?.filmKey, 'alpha');
  assert.equal(nav.plannerSeed?.mode, 'multi');
});

test('Planner landing interactions do not mutate storage', () => {
  // Landing may read localStorage for schedule settings / accepted plans, but
  // must not write Saved/Favorite stores or call setItem itself.
  assert.equal(PLANNER_SRC.includes('setItem'), false);
  assert.equal(PLANNER_SRC.includes('savedFilmsStore'), false);
  assert.equal(PLANNER_SRC.includes('getSavedFilms'), false);
  assert.equal(PLANNER_SRC.includes('acceptPlan'), false);
  assert.equal(PLANNER_SRC.includes('removeAcceptedPlan'), false);
  const storage = memoryStorage();
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
});

test('mockup mode isolation stays behind plannerMockup query', () => {
  assert.match(FIXTURE_SRC, /PLANNER_MOCKUP_QUERY/);
  assert.match(PLANNER_SRC, /isPlannerMockupMode/);
  assert.match(PLANNER_SRC, /getPlannerLandingMockupPresentation/);
  assert.match(PLANNER_SRC, /composePlannerLandingFromAcceptedPlans/);
});
