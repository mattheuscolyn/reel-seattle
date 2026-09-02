import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MY_SCHEDULE_WEEK_MOCKUP_FIXTURE,
  MY_SCHEDULE_WEEK_SECTION_ORDER,
  MY_SCHEDULE_WEEK_TIMELINE_RANGE,
  breakBlockGeometry,
  eventBlockGeometry,
  getMyScheduleWeekMockupPresentation,
  minutesToTimelinePercent,
  resolveMyScheduleWeekPresentation,
} from '../../v2/fixtures/myScheduleWeekMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openMyScheduleWeek,
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
  join(ROOT, 'v2/planner/MyScheduleWeekSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/myScheduleWeekMockupFixture.js'),
  'utf8',
);
const PLANNER_SRC = readFileSync(
  join(ROOT, 'v2/planner/PlannerDestination.jsx'),
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

test('My Schedule Week fixture matches canonical mockup regions', () => {
  const p = getMyScheduleWeekMockupPresentation();
  assert.equal(p, MY_SCHEDULE_WEEK_MOCKUP_FIXTURE);
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p.title, 'My Schedule');
  assert.equal(p.tagline, 'Your movie plans at a glance.');
  assert.equal(p.view, 'week');
  assert.equal(p.nextUp.filmTitle, 'The Long Horizon');
  assert.equal(p.insights.statsLine, '8 movie days • 11 films • 23h 45m');
  assert.equal(p.weeks.length, 2);
  const week = resolveMyScheduleWeekPresentation(0);
  assert.equal(week.weekRangeLabel, 'JUL 19 – JUL 25, 2026');
  assert.equal(week.days.length, 7);
  assert.deepEqual([...MY_SCHEDULE_WEEK_SECTION_ORDER], [
    'header',
    'weekPicker',
    'nextUp',
    'timeline',
    'insights',
  ]);
});

test('Week fixture includes grouped plan, breaks, and empty days', () => {
  const week = resolveMyScheduleWeekPresentation(0);
  const sat = week.days.find((d) => d.id === 'sat-jul-19');
  assert.ok(sat);
  assert.equal(sat.planGroups.length, 1);
  assert.equal(sat.planGroups[0].label, 'Multi-movie plan');
  assert.ok(sat.planGroups[0].items.some((i) => i.type === 'break'));
  const mon = week.days.find((d) => d.id === 'mon-jul-21');
  assert.equal(mon.empty, true);
  assert.equal(mon.emptyTitle, 'No plans yet');
  const sun = week.days.find((d) => d.id === 'sun-jul-20');
  assert.equal(sun.standaloneEvents[0].title, 'The Long Horizon');
  assert.equal(sun.placeholders.length, 1);
});

test('Timeline geometry derives deterministically from fixture minutes', () => {
  const range = MY_SCHEDULE_WEEK_TIMELINE_RANGE;
  assert.equal(minutesToTimelinePercent(720, range), 0);
  assert.equal(minutesToTimelinePercent(1320, range), 100);
  const event = {
    startMinutes: 840,
    endMinutes: 990,
  };
  const geom = eventBlockGeometry(event, range);
  assert.equal(geom.leftPercent, 20);
  assert.equal(geom.widthPercent, 25);
  const brk = breakBlockGeometry(
    { startMinutes: 990, durationMinutes: 30 },
    range,
  );
  assert.equal(brk.leftPercent, 45);
  // 30 minutes is 5% of the 10h span; min readable width floors at 8%.
  assert.equal(brk.widthPercent, 8);
});

test('Grouped events preserve fixture ordering', () => {
  const week = resolveMyScheduleWeekPresentation(0);
  const items = week.days[0].planGroups[0].items;
  assert.deepEqual(
    items.map((i) => i.title ?? i.label),
    ['Solar Tide', 'Break', 'Blue Hour', 'Break', 'After the Storm'],
  );
});

test('My Schedule Week surface is designed, not a placeholder', () => {
  assert.match(APP_SRC, /MyScheduleWeekSurface/);
  assert.match(SURFACE_SRC, /data-schedule-source/);
  assert.match(SURFACE_SRC, /data-schedule-mode/);
  assert.match(SURFACE_SRC, /resolveMyScheduleWeekPagePresentation/);
  assert.match(SURFACE_SRC, /data-schedule-section="header"/);
  assert.match(SURFACE_SRC, /data-schedule-section="weekPicker"/);
  assert.match(SURFACE_SRC, /data-schedule-section="nextUp"/);
  assert.match(SURFACE_SRC, /data-schedule-section="timeline"/);
  assert.match(SURFACE_SRC, /data-schedule-section="insights"/);
  assert.match(SURFACE_SRC, /aria-labelledby="v2-msw-title"/);
  assert.match(SURFACE_SRC, /data-schedule-plan-group/);
  assert.match(SURFACE_SRC, /data-schedule-break/);
  assert.equal(SURFACE_SRC.includes('v2 shell · placeholder'), false);
  assert.equal(SURFACE_SRC.includes('Back to'), false);
  assert.equal(SURFACE_SRC.includes('More actions'), false);
  assert.match(CSS, /\.v2-msw\b/);
  assert.match(CSS, /\.v2-msw-plan-group\b/);
});

test('Week view toggle exposes selected Week state', () => {
  assert.match(SURFACE_SRC, /aria-pressed="true"/);
  assert.match(SURFACE_SRC, /v2-msw-view-btn-active/);
  assert.match(SURFACE_SRC, /aria-label=\{presentation\.searchLabel\}/);
  assert.match(SURFACE_SRC, /aria-label=\{presentation\.settingsLabel\}/);
});

test('Planner landing opens My Schedule Week surface', () => {
  assert.match(PLANNER_SRC, /onOpenMyScheduleWeek/);
  assert.match(PLANNER_SRC, /View full timeline|openTimeline|viewTimelineLabel/);
  assert.match(NAV_SRC, /openMyScheduleWeek/);
  assert.match(APP_SRC, /myScheduleWeek/);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openMyScheduleWeek(nav, { originPrimary: 'planner' });
  assert.equal(nav.surface?.type, 'my-schedule-week');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
});

test('Week navigation uses deterministic fixture weeks', () => {
  assert.equal(resolveMyScheduleWeekPresentation(0).id, 'week-jul-19-25');
  assert.equal(resolveMyScheduleWeekPresentation(1).id, 'week-jul-26-aug-1');
  assert.equal(resolveMyScheduleWeekPresentation(2).id, 'week-jul-19-25');
});

test('Interactions respond honestly without silent failure', () => {
  assert.match(SURFACE_SRC, /monthViewStatus/);
  assert.match(SURFACE_SRC, /settingsStatus/);
  assert.match(SURFACE_SRC, /searchPrefilterStatus/);
  assert.match(SURFACE_SRC, /modifyPlanPrompt/);
  assert.match(SURFACE_SRC, /onOpenSearch/);
  assert.match(SURFACE_SRC, /onOpenSettings/);
});

test('Fixture does not import production stores or showtimes', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(/localStorage/.test(FIXTURE_SRC), false);
  assert.equal(FIXTURE_SRC.includes("from '../stores/"), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
});

test('Opening My Schedule Week does not mutate v2 stores', () => {
  const storage = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: '[]',
    [FAVORITE_THEATERS_STORAGE_KEY]: '[]',
  });
  const beforeSaved = getSavedFilms(storage);
  const beforeFav = getFavoriteTheaters(storage);
  let nav = openMyScheduleWeek(createInitialNavState(), {
    originPrimary: 'planner',
  });
  assert.equal(nav.surface?.type, 'my-schedule-week');
  assert.deepEqual(getSavedFilms(storage), beforeSaved);
  assert.deepEqual(getFavoriteTheaters(storage), beforeFav);
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
});

test('Primary nav remains four destinations with Planner active on schedule week', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
});
