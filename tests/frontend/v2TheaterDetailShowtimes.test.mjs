/**
 * Theater Detail date navigation, filters, and showtime identity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeTheaterDetailPresentation } from '../../v2/theaters/composeTheaterDetailPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE = readFileSync(
  join(ROOT, 'v2/theaters/TheaterDetailSurface.jsx'),
  'utf8',
);

const NOW = new Date('2026-08-08T20:00:00.000Z');

function home() {
  return {
    theatersById: {
      'the-beacon': {
        id: 'the-beacon',
        name: 'The Beacon',
        enabled: true,
        type: 'indie',
      },
    },
    films: [
      { filmKey: 'alpha', filmId: 'tmdb:1', title: 'Alpha', runtimeMin: 100 },
      { filmKey: 'beta', filmId: 'tmdb:2', title: 'Beta', runtimeMin: 90 },
    ],
    opportunities: [
      {
        opportunityKey: 'today-dolby',
        filmKey: 'alpha',
        filmId: 'tmdb:1',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-08-08',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-08T19:00',
        formatLabels: ['Dolby Cinema'],
      },
      {
        opportunityKey: 'today-digital',
        filmKey: 'beta',
        filmId: 'tmdb:2',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-08-08',
        localTime: '11:00',
        sortableLocalDateTime: '2026-08-08T11:00',
        formatLabels: ['Digital'],
      },
      {
        opportunityKey: 'tue-alpha',
        filmKey: 'alpha',
        filmId: 'tmdb:1',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-08-11',
        localTime: '20:15',
        sortableLocalDateTime: '2026-08-11T20:15',
        formatLabels: ['35mm'],
      },
    ],
  };
}

test('defaults to today and exposes a stable 7-day date strip', () => {
  const detail = composeTheaterDetailPresentation(home(), 'the-beacon', null, {
    now: NOW,
  });
  assert.equal(detail.todaysShowtimes.selectedDate, '2026-08-08');
  assert.equal(detail.todaysShowtimes.dateChips.length, 7);
  assert.equal(detail.todaysShowtimes.dateChips[0].label, 'Today');
  assert.equal(detail.todaysShowtimes.dateChips[1].label, 'Tomorrow');
  assert.match(detail.todaysShowtimes.dateChips[2].label, /8\/10/);
  const keys = detail.todaysShowtimes.filmGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.deepEqual(keys.sort(), ['today-digital', 'today-dolby']);
});

test('selecting another date shows only that date’s performances', () => {
  const detail = composeTheaterDetailPresentation(home(), 'the-beacon', null, {
    now: NOW,
    selectedDate: '2026-08-11',
  });
  assert.equal(detail.todaysShowtimes.selectedDate, '2026-08-11');
  const keys = detail.todaysShowtimes.filmGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.deepEqual(keys, ['tue-alpha']);
  assert.equal(keys.includes('today-dolby'), false);
});

test('empty date and empty filter states stay distinct', () => {
  const emptyDate = composeTheaterDetailPresentation(home(), 'the-beacon', null, {
    now: NOW,
    selectedDate: '2026-08-09',
  });
  assert.equal(emptyDate.todaysShowtimes.filmGroups.length, 0);
  assert.equal(emptyDate.todaysShowtimes.emptyReason, 'date');
  assert.match(emptyDate.todaysShowtimes.emptyMessage, /this date/i);

  const emptyFilters = composeTheaterDetailPresentation(home(), 'the-beacon', null, {
    now: NOW,
    selectedDate: '2026-08-08',
    formatKeys: ['35mm'],
  });
  assert.equal(emptyFilters.todaysShowtimes.filmGroups.length, 0);
  assert.equal(emptyFilters.todaysShowtimes.emptyReason, 'filters');
  assert.match(emptyFilters.todaysShowtimes.emptyMessage, /filters/i);
});

test('format and time filters narrow showtimes and clear restores them', () => {
  const filtered = composeTheaterDetailPresentation(home(), 'the-beacon', null, {
    now: NOW,
    formatKeys: ['dolby cinema'],
    timeRangeId: 'evening',
  });
  const keys = filtered.todaysShowtimes.filmGroups.flatMap((g) =>
    g.times.map((t) => t.opportunityKey),
  );
  assert.deepEqual(keys, ['today-dolby']);
  assert.equal(filtered.todaysShowtimes.activeFilterCount, 2);

  const cleared = composeTheaterDetailPresentation(home(), 'the-beacon', null, {
    now: NOW,
    formatKeys: [],
    timeRangeId: 'any',
  });
  assert.equal(cleared.todaysShowtimes.filmGroups.length, 2);
  assert.equal(cleared.todaysShowtimes.activeFilterCount, 0);
});

test('surface removes View 7 days and All films and opens the filter sheet plus action sheet', () => {
  assert.doesNotMatch(SURFACE, /View 7 days/);
  assert.doesNotMatch(SURFACE, /All films/);
  assert.match(SURFACE, /TheaterShowtimesFilterSheet/);
  assert.match(SURFACE, /ShowtimeActionSheet/);
  assert.match(SURFACE, /resolveHomeOpportunity/);
  assert.match(SURFACE, /row\.opportunityKey/);
  assert.match(SURFACE, /setSelectedDate\(chip\.id\)/);
});
