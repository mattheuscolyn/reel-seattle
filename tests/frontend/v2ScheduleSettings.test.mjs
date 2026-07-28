import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEDULE_SETTINGS_MOCKUP_FIXTURE,
  SCHEDULE_SETTINGS_SECTION_ORDER,
  createScheduleSettingsUiState,
  cycleTimelineZoomId,
  getScheduleSettingsMockupPresentation,
  resolveScheduleSettingsPresentation,
  resolveTimelineZoomLabel,
} from '../../v2/fixtures/scheduleSettingsMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openMyScheduleWeek,
  openScheduleSettings,
  openAboutMySchedule,
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
  join(ROOT, 'v2/planner/ScheduleSettingsSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/scheduleSettingsMockupFixture.js'),
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

test('Schedule Settings fixture matches canonical regions', () => {
  const p = getScheduleSettingsMockupPresentation();
  assert.equal(p, SCHEDULE_SETTINGS_MOCKUP_FIXTURE);
  assert.equal(resolveScheduleSettingsPresentation(), p);
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p.title, 'Schedule Settings');
  assert.equal(p.sections.display.hideCompleted.label, 'Hide completed plans');
  assert.equal(p.sections.display.showBreaks.label, 'Show breaks');
  assert.equal(p.sections.display.timelineZoom.label, 'Default timeline zoom');
  assert.equal(p.sections.sync.calendarSync.valueLabel, 'Off');
  assert.equal(p.sections.preferences.timeFormat.label, 'Time format');
  assert.equal(p.sections.preferences.colorCoding.modes.length, 3);
  assert.equal(p.sections.about.aboutSchedule.label, 'About My Schedule');
  assert.match(p.sections.about.clearAll.label, /Clear all schedule data/);
  assert.deepEqual([...SCHEDULE_SETTINGS_SECTION_ORDER], [
    'display',
    'sync',
    'preferences',
    'about',
  ]);
});

test('Fixture defaults match mockup selected states', () => {
  const ui = createScheduleSettingsUiState();
  assert.equal(ui.hideCompleted, true);
  assert.equal(ui.showBreaks, true);
  assert.equal(ui.timelineZoomId, '12-24');
  assert.equal(resolveTimelineZoomLabel(ui.timelineZoomId), '12 PM – 12 AM');
  assert.equal(ui.timeFormatId, '12h');
  assert.equal(ui.colorCodingId, 'opportunity');
});

test('Timeline zoom cycles locally among fixture options', () => {
  assert.equal(cycleTimelineZoomId('12-24'), '10-22');
  assert.equal(cycleTimelineZoomId('10-22'), 'full');
  assert.equal(cycleTimelineZoomId('full'), '12-24');
});

test('Schedule Settings surface is designed sheet, not placeholder', () => {
  assert.match(APP_SRC, /ScheduleSettingsSurface/);
  assert.match(SURFACE_SRC, /data-schedule-settings-source/);
  assert.match(SURFACE_SRC, /role="dialog"/);
  assert.match(SURFACE_SRC, /aria-modal="true"/);
  assert.match(SURFACE_SRC, /data-ss-section="display"/);
  assert.match(SURFACE_SRC, /data-ss-section="sync"/);
  assert.match(SURFACE_SRC, /data-ss-section="preferences"/);
  assert.match(SURFACE_SRC, /data-ss-section="about"/);
  assert.match(SURFACE_SRC, /role="switch"/);
  assert.match(SURFACE_SRC, /aria-pressed/);
  assert.equal(SURFACE_SRC.includes('v2 shell · placeholder'), false);
  assert.ok(CSS.includes('.v2-ss-sheet'));
});

test('Week and Month open Schedule Settings; Back restores origin', () => {
  assert.match(NAV_SRC, /openScheduleSettings/);
  assert.match(APP_SRC, /scheduleSettings/);
  assert.match(APP_SRC, /handleOpenScheduleSettings/);

  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openMyScheduleWeek(nav, { originPrimary: 'planner' });
  nav = openScheduleSettings(nav, {
    originPrimary: 'planner',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'schedule-settings');
  assert.equal(nav.surface.returnSurface?.type, 'my-schedule-week');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'my-schedule-week');
});

test('About from Settings returns to Settings sheet', () => {
  let nav = openScheduleSettings(createInitialNavState(), {
    originPrimary: 'planner',
  });
  nav = openAboutMySchedule(nav, {
    originPrimary: 'planner',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'about-my-schedule');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'schedule-settings');
});

test('Fixture does not import stores or use localStorage', () => {
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(/localStorage/.test(FIXTURE_SRC), false);
  assert.equal(FIXTURE_SRC.includes('public/data'), false);
});

test('Opening Schedule Settings does not mutate v2 stores', () => {
  const storage = memoryStorage({
    [SAVED_FILMS_STORAGE_KEY]: '[]',
    [FAVORITE_THEATERS_STORAGE_KEY]: '[]',
  });
  const beforeSaved = getSavedFilms(storage);
  const beforeFav = getFavoriteTheaters(storage);
  let nav = openScheduleSettings(createInitialNavState(), {
    originPrimary: 'planner',
  });
  assert.equal(nav.surface?.type, 'schedule-settings');
  assert.deepEqual(getSavedFilms(storage), beforeSaved);
  assert.deepEqual(getFavoriteTheaters(storage), beforeFav);
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'my-schedule-week');
});

test('Primary nav remains four destinations', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
});
