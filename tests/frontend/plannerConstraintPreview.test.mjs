import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMockSlotsFromFilters,
  detectImpossibleConstraints,
  getAverageRuntimeForFilm,
  shouldShowPreview,
} from '../../src/utils/plannerConstraintPreview.js';

const DATE = '06/28/2026';
const THEATER_A = 'Theater A';

function filmOption({ key, title, poster = '', theaterCount = 1, theaters = [THEATER_A] } = {}) {
  return {
    key: key ?? title.toLowerCase().replace(/\s+/g, '-'),
    title,
    poster,
    theaterCount,
    theaters,
  };
}

function row({
  film,
  time,
  runtime = '90',
  theater = THEATER_A,
  date = DATE,
  filmKey,
  poster = '',
} = {}) {
  const key = filmKey ?? film.toLowerCase().replace(/\s+/g, '-');
  return {
    Date: date,
    Time: time,
    Theater: theater,
    Film: film,
    Runtime: runtime,
    showtime_film_key: key,
    posterDynamic: poster,
  };
}

function baseFilters(overrides = {}) {
  return {
    selectedDate: DATE,
    filmCount: 2,
    includeFilms: [],
    preferredFilms: [],
    excludeFilms: [],
    firstFilm: '',
    lastFilm: '',
    startAfter: null,
    finishBy: null,
    minGapMin: null,
    maxGapMin: null,
    ...overrides,
  };
}

test('shouldShowPreview: false when no date', () => {
  const filters = baseFilters({ selectedDate: '' });
  assert.equal(shouldShowPreview(filters), false);
});

test('shouldShowPreview: false when no filmCount', () => {
  const filters = baseFilters({ filmCount: null });
  assert.equal(shouldShowPreview(filters), false);
});

test('shouldShowPreview: false when no constraints', () => {
  const filters = baseFilters();
  assert.equal(shouldShowPreview(filters), false);
});

test('shouldShowPreview: true when required films present', () => {
  const filters = baseFilters({ includeFilms: ['film-a'] });
  assert.equal(shouldShowPreview(filters), true);
});

test('shouldShowPreview: true when first film present', () => {
  const filters = baseFilters({ firstFilm: 'Film A' });
  assert.equal(shouldShowPreview(filters), true);
});

test('shouldShowPreview: true when last film present', () => {
  const filters = baseFilters({ lastFilm: 'Film B' });
  assert.equal(shouldShowPreview(filters), true);
});

test('shouldShowPreview: true when time constraints present', () => {
  const filters = baseFilters({ startAfter: '2:00PM' });
  assert.equal(shouldShowPreview(filters), true);
});

test('shouldShowPreview: true when gap constraints present', () => {
  const filters = baseFilters({ minGapMin: 15 });
  assert.equal(shouldShowPreview(filters), true);
});

test('getAverageRuntimeForFilm: returns null for no matches', () => {
  const rows = [row({ film: 'Alpha', time: '5:00PM', runtime: '90' })];
  const avg = getAverageRuntimeForFilm('beta', rows, DATE);
  assert.equal(avg, null);
});

test('getAverageRuntimeForFilm: returns single runtime', () => {
  const rows = [row({ film: 'Alpha', time: '5:00PM', runtime: '90' })];
  const avg = getAverageRuntimeForFilm('alpha', rows, DATE);
  assert.equal(avg, 90);
});

test('getAverageRuntimeForFilm: averages multiple runtimes', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Alpha', time: '7:00PM', runtime: '90' }),
    row({ film: 'Alpha', time: '9:00PM', runtime: '92' }),
  ];
  const avg = getAverageRuntimeForFilm('alpha', rows, DATE);
  assert.equal(avg, 91);
});

test('getAverageRuntimeForFilm: matches by film key', () => {
  const rows = [row({ film: 'Alpha', filmKey: 'alpha-2026', time: '5:00PM', runtime: '100' })];
  const avg = getAverageRuntimeForFilm('alpha-2026', rows, DATE);
  assert.equal(avg, 100);
});

test('buildMockSlotsFromFilters: creates slots for film count', () => {
  const filters = baseFilters({ filmCount: 3, includeFilms: ['film-a'] });
  const catalog = [filmOption({ key: 'film-a', title: 'Film A' })];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots.length, 3);
  assert.equal(result.slots[0].position, 0);
  assert.equal(result.slots[1].position, 1);
  assert.equal(result.slots[2].position, 2);
});

test('buildMockSlotsFromFilters: creates 5 slots for max mode', () => {
  const filters = baseFilters({ filmCount: 'max', includeFilms: ['film-a'] });
  const catalog = [filmOption({ key: 'film-a', title: 'Film A' })];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots.length, 5);
});

test('buildMockSlotsFromFilters: anchors first film', () => {
  const filters = baseFilters({ firstFilm: 'film-a', filmCount: 2 });
  const catalog = [filmOption({ key: 'film-a', title: 'Film A' })];
  const rows = [row({ film: 'Film A', filmKey: 'film-a', time: '5:00PM', runtime: '105' })];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots[0].type, 'first');
  assert.equal(result.slots[0].isAnchored, true);
  assert.equal(result.slots[0].film.title, 'Film A');
  assert.equal(result.slots[0].estimatedDurationMin, 105);
});

test('buildMockSlotsFromFilters: anchors last film', () => {
  const filters = baseFilters({ lastFilm: 'film-b', filmCount: 2 });
  const catalog = [filmOption({ key: 'film-b', title: 'Film B' })];
  const rows = [row({ film: 'Film B', filmKey: 'film-b', time: '7:00PM', runtime: '120' })];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots[1].type, 'last');
  assert.equal(result.slots[1].isAnchored, true);
  assert.equal(result.slots[1].film.title, 'Film B');
  assert.equal(result.slots[1].estimatedDurationMin, 120);
});

test('buildMockSlotsFromFilters: fills required films', () => {
  const filters = baseFilters({
    filmCount: 3,
    includeFilms: ['film-a', 'film-b'],
  });
  const catalog = [
    filmOption({ key: 'film-a', title: 'Film A' }),
    filmOption({ key: 'film-b', title: 'Film B' }),
  ];
  const rows = [
    row({ film: 'Film A', filmKey: 'film-a', time: '5:00PM', runtime: '90' }),
    row({ film: 'Film B', filmKey: 'film-b', time: '7:00PM', runtime: '100' }),
  ];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots[0].type, 'required');
  assert.equal(result.slots[0].film.title, 'Film A');
  assert.equal(result.slots[1].type, 'required');
  assert.equal(result.slots[1].film.title, 'Film B');
  assert.equal(result.slots[2].type, 'any');
});

test('buildMockSlotsFromFilters: respects first/last with required films', () => {
  const filters = baseFilters({
    filmCount: 3,
    firstFilm: 'film-a',
    lastFilm: 'film-c',
    includeFilms: ['film-b'],
  });
  const catalog = [
    filmOption({ key: 'film-a', title: 'Film A' }),
    filmOption({ key: 'film-b', title: 'Film B' }),
    filmOption({ key: 'film-c', title: 'Film C' }),
  ];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots[0].type, 'first');
  assert.equal(result.slots[0].film.title, 'Film A');
  assert.equal(result.slots[1].type, 'required');
  assert.equal(result.slots[1].film.title, 'Film B');
  assert.equal(result.slots[2].type, 'last');
  assert.equal(result.slots[2].film.title, 'Film C');
});

test('buildMockSlotsFromFilters: uses default 120min for unknown films', () => {
  const filters = baseFilters({ filmCount: 2, includeFilms: ['film-unknown'] });
  const catalog = [];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.slots[0].estimatedDurationMin, 120);
  assert.equal(result.slots[1].estimatedDurationMin, 120);
});

test('buildMockSlotsFromFilters: parses time constraints', () => {
  const filters = baseFilters({
    startAfter: '2:00PM',
    finishBy: '10:00PM',
    minGapMin: 15,
    maxGapMin: 60,
  });
  const catalog = [];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.startAfterMin, 14 * 60);
  assert.equal(result.finishByMin, 22 * 60);
  assert.equal(result.minGapMin, 15);
  assert.equal(result.maxGapMin, 60);
});

test('buildMockSlotsFromFilters: handles 24-hour time format', () => {
  const filters = baseFilters({
    startAfter: '14:00',
    finishBy: '22:00',
  });
  const catalog = [];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.equal(result.startAfterMin, 14 * 60);
  assert.equal(result.finishByMin, 22 * 60);
});

test('buildMockSlotsFromFilters: preserves preferredFilms', () => {
  const filters = baseFilters({ preferredFilms: ['film-a', 'film-b'] });
  const catalog = [];
  const rows = [];

  const result = buildMockSlotsFromFilters(filters, catalog, rows);

  assert.deepEqual(result.preferredFilms, ['film-a', 'film-b']);
});

test('detectImpossibleConstraints: start after >= finish by', () => {
  const previewData = {
    slots: [],
    startAfterMin: 22 * 60,
    finishByMin: 14 * 60,
    minGapMin: null,
    maxGapMin: null,
    preferredFilms: [],
  };

  const warning = detectImpossibleConstraints(previewData);
  assert.match(warning, /start after time is at or after finish by time/i);
});

test('detectImpossibleConstraints: tight time window', () => {
  const previewData = {
    slots: [
      { estimatedDurationMin: 120 },
      { estimatedDurationMin: 120 },
      { estimatedDurationMin: 120 },
    ],
    startAfterMin: 14 * 60,
    finishByMin: 16 * 60,
    minGapMin: 0,
    maxGapMin: null,
    preferredFilms: [],
  };

  const warning = detectImpossibleConstraints(previewData);
  assert.match(warning, /time window may be too tight/i);
});

test('detectImpossibleConstraints: very short max gap warning', () => {
  const previewData = {
    slots: [{ estimatedDurationMin: 90 }, { estimatedDurationMin: 90 }, { estimatedDurationMin: 90 }],
    startAfterMin: null,
    finishByMin: null,
    minGapMin: null,
    maxGapMin: 5,
    preferredFilms: [],
  };

  const warning = detectImpossibleConstraints(previewData);
  assert.match(warning, /very short max gap/i);
});

test('detectImpossibleConstraints: no warning for reasonable constraints', () => {
  const previewData = {
    slots: [{ estimatedDurationMin: 90 }, { estimatedDurationMin: 90 }],
    startAfterMin: 14 * 60,
    finishByMin: 22 * 60,
    minGapMin: 15,
    maxGapMin: 60,
    preferredFilms: [],
  };

  const warning = detectImpossibleConstraints(previewData);
  assert.equal(warning, null);
});
