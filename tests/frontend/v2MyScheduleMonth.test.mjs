import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MY_SCHEDULE_MONTH_MOCKUP_FIXTURE,
  dotCountFromMovieCount,
  heatLevelFromMovieCount,
  getMyScheduleMonthMockupPresentation,
  resolveMyScheduleMonthPresentation,
} from '../../v2/fixtures/myScheduleMonthMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openMyScheduleMonth,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/planner/MyScheduleMonthSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/myScheduleMonthMockupFixture.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('Month fixture matches canonical labels and selected state', () => {
  const p = getMyScheduleMonthMockupPresentation();
  assert.equal(p, MY_SCHEDULE_MONTH_MOCKUP_FIXTURE);
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p.title, 'My Schedule');
  assert.equal(p.tagline, 'Your movie plans at a glance.');
  assert.equal(p.view, 'month');
  assert.equal(p.monthLabel, 'July 2026');

  const selected = p.heatmapGrid.find((c) => c.selected);
  assert.ok(selected);
  assert.equal(selected.dateNumber, 19);

  assert.deepEqual(p.heatmapWeekdays, ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  assert.equal(p.legend.length, 5);
  assert.equal(p.legend[4].label, '4+ movies');
});

test('Heat level and dots derive deterministically from movie count', () => {
  assert.equal(heatLevelFromMovieCount(0), 0);
  assert.equal(heatLevelFromMovieCount(1), 1);
  assert.equal(heatLevelFromMovieCount(2), 2);
  assert.equal(heatLevelFromMovieCount(3), 3);
  assert.equal(heatLevelFromMovieCount(4), 4);
  assert.equal(heatLevelFromMovieCount(99), 4);

  assert.equal(dotCountFromMovieCount(0), 0);
  assert.equal(dotCountFromMovieCount(1), 1);
  assert.equal(dotCountFromMovieCount(2), 2);
  assert.equal(dotCountFromMovieCount(3), 3);
  assert.equal(dotCountFromMovieCount(4), 4);
  assert.equal(dotCountFromMovieCount(9), 4);
});

test('Month fixture includes expected busiest and upcoming copy', () => {
  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.busiestDays.length, 3);
  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.busiestDays[0].dateLabel, 'Sat, Jul 25');
  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.busiestDays[0].movieCount, 4);

  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.upcomingHighlights.length, 2);
  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.upcomingHighlights[0].dateLabel, 'Sat, Jul 19');
  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.upcomingHighlights[0].filmCountLabel, '3 films');
  assert.equal(MY_SCHEDULE_MONTH_MOCKUP_FIXTURE.upcomingHighlights[1].filmCountLabel, '1 film');
});

test('Month surface is designed, not a placeholder', () => {
  assert.match(APP_SRC, /MyScheduleMonthSurface/);
  assert.match(SURFACE_SRC, /data-schedule-source/);
  assert.ok(SURFACE_SRC.includes('data-schedule-view={presentation.view}'));
  assert.match(
    SURFACE_SRC,
    /data-schedule-month=\{presentation\.yearMonth \?\? presentation\.monthLabel\}/,
  );
  assert.match(SURFACE_SRC, /aria-labelledby=\"v2-msw-month-title\"/);
  assert.match(SURFACE_SRC, /v2-msw-heatmap/);
  assert.match(SURFACE_SRC, /v2-msw-month-split/);
  assert.equal(SURFACE_SRC.includes('v2 shell · placeholder'), false);
  assert.ok(CSS.includes('.v2-msw-heatmap'));
});

test('Month view does not reference Week navigation labels', () => {
  // Month uses prev/next month, not week.
  assert.equal(SURFACE_SRC.includes('Previous week'), false);
  assert.equal(SURFACE_SRC.includes('Next week'), false);
});

test('Month toggle exposes Month active state', () => {
  assert.match(SURFACE_SRC, /activeView=\"month\"/);
  assert.ok(
    SURFACE_SRC.includes("aria-pressed={monthActive ? 'true' : 'false'}"),
  );
});

test('My Schedule month opens deterministic deep surface', () => {
  assert.match(NAV_SRC, /openMyScheduleMonth/);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openMyScheduleMonth(nav, { originPrimary: 'planner' });
  assert.equal(nav.surface?.type, 'my-schedule-month');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(
    navigateBack(nav).surface,
    null,
  );
});

test('Fixture does not import production stores or showtimes', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(/localStorage/.test(FIXTURE_SRC), false);
  assert.equal(FIXTURE_SRC.includes('showtimes'), false);
});

test('Opening Month View does not mutate v2 stores', () => {
  const storage = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: '[]',
    [FAVORITE_THEATERS_STORAGE_KEY]: '[]',
  });
  const beforeSaved = getSavedFilms(storage);
  const beforeFav = getFavoriteTheaters(storage);
  let nav = openMyScheduleMonth(createInitialNavState(), { originPrimary: 'planner' });
  assert.equal(nav.surface?.type, 'my-schedule-month');
  assert.deepEqual(getSavedFilms(storage), beforeSaved);
  assert.deepEqual(getFavoriteTheaters(storage), beforeFav);
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
});

test('Primary nav remains four destinations with Planner active on schedule month', () => {
  assert.deepEqual(PRIMARY_DESTINATIONS.map((d) => d.id), ['home', 'explore', 'planner', 'profile']);
});

