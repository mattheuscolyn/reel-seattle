/**
 * Film Detail late-night / next-date showtime section.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeFilmDetailTodaySection,
  selectVisibleShowtimes,
} from '../../v2/filmDetail/filmDetailModel.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FD = readFileSync(join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'), 'utf8');

function opp(partial) {
  return {
    theaterName: 'AMC Pacific Place 11',
    theaterId: 'amc-pacific-place-11',
    formatLabels: ['Digital'],
    ticketUrl: 'https://tickets.example/x',
    source: 'amc',
    ...partial,
  };
}

function home(opportunities) {
  return {
    films: [
      {
        filmKey: 'alpha',
        filmId: 'tmdb:1',
        title: 'Alpha',
        runtimeMin: 100,
      },
    ],
    opportunities,
    theatersById: {
      'amc-pacific-place-11': {
        id: 'amc-pacific-place-11',
        name: 'AMC Pacific Place 11',
        type: 'chain',
      },
      'amc-oak-tree-6': {
        id: 'amc-oak-tree-6',
        name: 'AMC Oak Tree 6',
        type: 'chain',
      },
    },
  };
}

/** Late evening Pacific on 2026-08-10. */
const LATE_TODAY = new Date('2026-08-11T05:30:00.000Z'); // Aug 10 22:30 PT
/** Midday Pacific on 2026-08-10. */
const MIDDAY = new Date('2026-08-10T20:00:00.000Z'); // Aug 10 13:00 PT

test('A: remaining actionable today keeps the normal Today section', () => {
  const section = composeFilmDetailTodaySection(
    home([
      opp({
        opportunityKey: 'past',
        filmKey: 'alpha',
        localDate: '2026-08-10',
        localTime: '11:00',
        sortableLocalDateTime: '2026-08-10T11:00',
      }),
      opp({
        opportunityKey: 'future',
        filmKey: 'alpha',
        localDate: '2026-08-10',
        localTime: '20:30',
        sortableLocalDateTime: '2026-08-10T20:30',
      }),
    ]),
    'alpha',
    null,
    { now: MIDDAY },
  );
  assert.equal(section.mode, 'active');
  assert.equal(section.empty, false);
  assert.equal(section.fallback, null);
  const keys = section.rows.flatMap((r) => r.times.map((t) => t.opportunityKey));
  assert.ok(keys.includes('future'));
  assert.ok(keys.includes('past'));
});

test('B: started-only today + tomorrow showtimes surfaces tomorrow fallback', () => {
  const section = composeFilmDetailTodaySection(
    home([
      opp({
        opportunityKey: 'today-done',
        filmKey: 'alpha',
        localDate: '2026-08-10',
        localTime: '14:00',
        sortableLocalDateTime: '2026-08-10T14:00',
      }),
      opp({
        opportunityKey: 'tomorrow-a',
        filmKey: 'alpha',
        localDate: '2026-08-11',
        localTime: '15:45',
        sortableLocalDateTime: '2026-08-11T15:45',
      }),
      opp({
        opportunityKey: 'tomorrow-b',
        filmKey: 'alpha',
        theaterId: 'amc-oak-tree-6',
        theaterName: 'AMC Oak Tree 6',
        localDate: '2026-08-11',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-11T19:00',
      }),
    ]),
    'alpha',
    null,
    { now: LATE_TODAY },
  );
  assert.equal(section.mode, 'finished_with_fallback');
  assert.equal(section.emptyMessage, 'No more showtimes today');
  assert.equal(section.rows.length, 0);
  assert.equal(section.fallback?.kind, 'tomorrow');
  assert.match(section.fallback.title, /^Tomorrow, Aug 11$/);
  const keys = section.fallback.rows.flatMap((r) =>
    r.times.map((t) => t.opportunityKey),
  );
  assert.deepEqual(keys.sort(), ['tomorrow-a', 'tomorrow-b']);
  assert.equal(keys.includes('today-done'), false);
});

test('C: later-than-tomorrow next date is labeled clearly', () => {
  const section = composeFilmDetailTodaySection(
    home([
      opp({
        opportunityKey: 'wed',
        filmKey: 'alpha',
        localDate: '2026-08-12',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-12T18:00',
      }),
    ]),
    'alpha',
    null,
    { now: LATE_TODAY },
  );
  assert.equal(section.mode, 'finished_with_fallback');
  assert.equal(section.emptyMessage, 'No more showtimes today');
  assert.equal(section.fallback?.kind, 'next');
  assert.match(section.fallback.title, /^Next showtimes · Wed, Aug 12$/i);
  assert.equal(section.fallback.rows[0].times[0].opportunityKey, 'wed');
});

test('D: no upcoming showtimes uses the true empty state', () => {
  const section = composeFilmDetailTodaySection(
    home([
      opp({
        opportunityKey: 'past-only',
        filmKey: 'alpha',
        localDate: '2026-08-10',
        localTime: '10:00',
        sortableLocalDateTime: '2026-08-10T10:00',
      }),
    ]),
    'alpha',
    null,
    { now: LATE_TODAY },
  );
  assert.equal(section.mode, 'none_upcoming');
  assert.equal(section.fallback, null);
  assert.equal(
    section.emptyMessage,
    'No upcoming showtimes currently scheduled',
  );
});

test('3-time cap never hides remaining actionable showtimes', () => {
  const times = [
    { localTime: '10:00', actionable: false, opportunityKey: 's1' },
    { localTime: '12:00', actionable: false, opportunityKey: 's2' },
    { localTime: '14:00', actionable: false, opportunityKey: 's3' },
    { localTime: '16:00', actionable: false, opportunityKey: 's4' },
    { localTime: '20:00', actionable: true, opportunityKey: 'a1' },
    { localTime: '22:00', actionable: true, opportunityKey: 'a2' },
  ];
  const visible = selectVisibleShowtimes(times, 3);
  assert.equal(visible.length, 3);
  const keys = visible.map((t) => t.opportunityKey);
  assert.ok(keys.includes('a1'));
  assert.ok(keys.includes('a2'));
  assert.equal(keys.filter((k) => k.startsWith('a')).length, 2);
});

test('composer + view preserve fallback times and ShowtimeActionSheet wiring', () => {
  const presentation = composeFilmDetailPresentation(
    home([
      opp({
        opportunityKey: 'tomorrow-keep',
        filmKey: 'alpha',
        localDate: '2026-08-11',
        localTime: '19:15',
        sortableLocalDateTime: '2026-08-11T19:15',
      }),
    ]),
    'alpha',
    null,
    { now: LATE_TODAY },
  );
  const view = toFilmDetailView({
    mode: 'production',
    presentation,
  });
  assert.equal(view.today.mode, 'finished_with_fallback');
  assert.equal(
    view.today.fallback.rows[0].times[0].opportunityKey,
    'tomorrow-keep',
  );
  assert.equal(view.today.fallback.rows[0].times[0].localTime, '19:15');
  assert.equal(view.today.fallback.rows[0].times[0].localDate, '2026-08-11');
  assert.match(FD, /today\.fallback/);
  assert.match(FD, /today\.emptyMessage/);
  assert.match(FD, /No upcoming showtimes currently scheduled/);
  assert.match(FD, /ShowtimeActionSheet/);
  assert.match(FD, /v2-fd-today-fallback-title/);
});
