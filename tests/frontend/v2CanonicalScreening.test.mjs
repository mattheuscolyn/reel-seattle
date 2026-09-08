import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONABLE_CUTOFF_MINUTES,
  SEATTLE_TIMEZONE,
  STARTED_SCREENING_LABEL,
  attachCanonicalScreeningFields,
  buildStableScreeningId,
  compareScreeningsByStart,
  dedupeScreeningsByContent,
  formatPresentationLabel,
  formatPresentationLabels,
  isActionableScreening,
  isPastScreening,
  scheduleScreeningState,
  seattleStartsAtIso,
  seattleWallTimeToUtcMs,
  screeningContentKey,
} from '../../v2/showtimes/canonicalScreening.js';
import { buildOpportunityKey } from '../../v2/adapters/opportunityIdentity.js';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  SHOWTIME_STALE_AFTER_MS,
  SHOWTIME_STALE_NOTICE,
  SHOWTIME_PARTIAL_NOTICE,
  composeShowtimesFreshness,
} from '../../v2/showtimes/showtimesFreshness.js';

test('Seattle timezone and cutoff are documented constants', () => {
  assert.equal(SEATTLE_TIMEZONE, 'America/Los_Angeles');
  assert.equal(ACTIONABLE_CUTOFF_MINUTES, 0);
});

test('seattleStartsAtIso attaches a Pacific offset', () => {
  assert.equal(
    seattleStartsAtIso('2026-09-07', '19:30'),
    '2026-09-07T19:30:00-07:00',
  );
  assert.equal(
    seattleStartsAtIso('2026-01-15', '19:30'),
    '2026-01-15T19:30:00-08:00',
  );
});

test('midnight is assigned to the Seattle calendar date', () => {
  const justBefore = new Date('2026-09-08T06:30:00.000Z'); // 11:30 PM PDT Sep 7
  const midnight = new Date('2026-09-08T07:00:00.000Z'); // 12:00 AM PDT Sep 8
  const late = {
    localDate: '2026-09-07',
    localTime: '23:45',
    sortableLocalDateTime: '2026-09-07T23:45',
  };
  const early = {
    localDate: '2026-09-08',
    localTime: '00:15',
    sortableLocalDateTime: '2026-09-08T00:15',
  };
  assert.equal(isPastScreening(late, justBefore), false);
  assert.equal(isActionableScreening(late, justBefore), true);
  assert.equal(isPastScreening(late, midnight), true);
  assert.equal(isActionableScreening(late, midnight), false);
  assert.equal(isActionableScreening(early, midnight), true);
  assert.equal(isPastScreening(early, midnight), false);
});

test('spring-forward gap snaps to the next valid Seattle instant', () => {
  // 2026-03-08 02:00 PST → 03:00 PDT. 02:30 does not exist.
  const ms = seattleWallTimeToUtcMs('2026-03-08', '02:30');
  assert.ok(typeof ms === 'number');
  const iso = seattleStartsAtIso('2026-03-08', '03:00');
  assert.equal(iso, '2026-03-08T03:00:00-07:00');
  assert.equal(seattleWallTimeToUtcMs('2026-03-08', '03:00'), ms);
});

test('fall-back overlap prefers the first daylight occurrence', () => {
  const iso = seattleStartsAtIso('2026-11-01', '01:30');
  assert.equal(iso, '2026-11-01T01:30:00-07:00');
});

test('past-today times are not actionable; future dates stay eligible', () => {
  const now = new Date('2026-09-07T22:00:00.000Z'); // 3:00 PM PDT
  const past = {
    localDate: '2026-09-07',
    localTime: '14:00',
    sortableLocalDateTime: '2026-09-07T14:00',
    status: 'available',
  };
  const later = {
    localDate: '2026-09-07',
    localTime: '19:30',
    sortableLocalDateTime: '2026-09-07T19:30',
    status: 'available',
  };
  const tomorrow = {
    localDate: '2026-09-08',
    localTime: '10:00',
    sortableLocalDateTime: '2026-09-08T10:00',
    status: 'available',
  };
  assert.equal(isActionableScreening(past, now), false);
  assert.equal(isActionableScreening(later, now), true);
  assert.equal(isActionableScreening(tomorrow, now), true);
  assert.equal(isActionableScreening({ ...later, status: 'sold_out' }, now), false);
});

test('sorting uses timestamps, not formatted clock strings', () => {
  const evening = attachCanonicalScreeningFields({
    opportunityKey: 'b',
    localDate: '2026-09-07',
    localTime: '19:30',
    timeDisplay: '7:30 PM',
    sortableLocalDateTime: '2026-09-07T19:30',
  });
  const afternoon = attachCanonicalScreeningFields({
    opportunityKey: 'a',
    localDate: '2026-09-07',
    localTime: '14:00',
    timeDisplay: '2:00 PM',
    sortableLocalDateTime: '2026-09-07T14:00',
  });
  const ordered = [evening, afternoon].sort(compareScreeningsByStart);
  assert.equal(ordered[0].opportunityKey, 'a');
  assert.ok(afternoon.startsAtMs < evening.startsAtMs);
});

test('raw format slugs never become user-facing labels', () => {
  assert.equal(formatPresentationLabel('IMAX-AT-AMC'), 'IMAX');
  assert.equal(formatPresentationLabel('CLOSED-CAPTION'), 'Closed Captions');
  assert.equal(formatPresentationLabel('open-caption'), 'Open Captions');
  assert.equal(formatPresentationLabel('audio-description'), 'Audio Description');
  assert.equal(formatPresentationLabel('dolby-cinema-at-amc'), 'Dolby Cinema');
  assert.equal(formatPresentationLabel('70mm'), '70mm');
  assert.equal(formatPresentationLabel('standard'), 'Standard');
  assert.equal(formatPresentationLabel('source-internal-enum'), null);
  assert.deepEqual(
    formatPresentationLabels(['imax-at-amc', 'IMAX', 'closed-caption']),
    ['IMAX', 'Closed Captions'],
  );
});

test('source-label differences collapse to one content identity', () => {
  const a = {
    filmKey: 'sinners',
    theaterId: 'amc-pacific-place-11',
    localDate: '2026-09-07',
    localTime: '19:30',
    formatLabels: ['imax-at-amc'],
    source: 'amc',
    opportunityKey: 'src:amc:1',
  };
  const b = {
    filmKey: 'sinners',
    theaterId: 'amc-pacific-place-11',
    localDate: '2026-09-07',
    localTime: '19:30',
    formatLabels: ['IMAX'],
    source: 'manual',
    opportunityKey: 'id:other',
  };
  assert.equal(screeningContentKey(a), screeningContentKey(b));
  assert.equal(dedupeScreeningsByContent([a, b]).length, 1);
});

test('freshness never labels partial data as complete', () => {
  const now = new Date('2026-09-07T05:14:05-07:00');
  const partial = composeShowtimesFreshness(
    {
      generatedAt: '2026-09-07T04:14:05-07:00',
      sourceHealth: {
        status: 'partial',
        sources: {
          amc: { status: 'success' },
          siff: { status: 'error' },
        },
      },
    },
    { now },
  );
  assert.equal(partial.completeness, 'partial');
  assert.equal(partial.stale, false);
  assert.equal(partial.notice, SHOWTIME_PARTIAL_NOTICE);
  assert.ok(!/\bcomplete\b/i.test(partial.line));
  assert.match(partial.lastRefreshedLabel, /Updated /);

  const ready = composeShowtimesFreshness(
    {
      generatedAt: '2026-09-07T04:14:05-07:00',
      sourceHealth: { status: 'success', sources: { amc: { status: 'success' } } },
    },
    { now },
  );
  assert.equal(ready.completeness, 'ready');
  assert.equal(ready.stale, false);
  assert.equal(ready.notice, null);
  assert.equal(ready.staleNotice, null);
});

test('freshness threshold: fresh, boundary, stale, and stale-plus-partial', () => {
  const generatedAt = '2026-09-07T04:14:05-07:00';
  const generatedMs = new Date(generatedAt).getTime();
  const base = {
    generatedAt,
    sourceHealth: { status: 'success', sources: { amc: { status: 'success' } } },
  };

  const fresh = composeShowtimesFreshness(base, {
    now: new Date(generatedMs + SHOWTIME_STALE_AFTER_MS - 1),
  });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.staleNotice, null);
  assert.ok(!fresh.line.includes(SHOWTIME_STALE_NOTICE));

  const boundary = composeShowtimesFreshness(base, {
    now: new Date(generatedMs + SHOWTIME_STALE_AFTER_MS),
  });
  assert.equal(boundary.stale, false);

  const stale = composeShowtimesFreshness(base, {
    now: new Date(generatedMs + SHOWTIME_STALE_AFTER_MS + 1),
  });
  assert.equal(stale.stale, true);
  assert.equal(stale.staleNotice, SHOWTIME_STALE_NOTICE);
  assert.match(stale.line, /may have changed/);

  const both = composeShowtimesFreshness(
    {
      generatedAt,
      sourceHealth: {
        status: 'partial',
        sources: { amc: { status: 'success' }, siff: { status: 'error' } },
      },
    },
    { now: new Date(generatedMs + SHOWTIME_STALE_AFTER_MS + 1) },
  );
  assert.equal(both.stale, true);
  assert.equal(both.completeness, 'partial');
  assert.match(both.line, /may have changed/);
  assert.match(both.line, /incomplete/);
  assert.equal(both.line.includes(SHOWTIME_STALE_NOTICE), true);
  assert.equal(
    both.line.indexOf(SHOWTIME_STALE_NOTICE) !==
      both.line.lastIndexOf(SHOWTIME_STALE_NOTICE),
    false,
  );
});

test('source screening IDs are preferred when present', () => {
  assert.equal(
    buildStableScreeningId({
      source: 'amc',
      sourceShowtimeId: 'perf-99',
      filmKey: 'sinners',
      theaterId: 'amc-pacific-place-11',
      localDate: '2026-09-07',
      localTime: '19:30',
      formatLabels: ['imax-at-amc'],
    }),
    'src:amc:perf-99',
  );
});

test('fallback screening IDs are stable across reorder and equivalent slugs', () => {
  const a = buildStableScreeningId({
    filmKey: 'sinners',
    theaterId: 'amc-pacific-place-11',
    localDate: '2026-09-07',
    localTime: '19:30',
    formatLabels: ['imax-at-amc', 'CLOSED-CAPTION'],
    source: 'amc',
  });
  const b = buildStableScreeningId({
    filmKey: 'sinners',
    theaterId: 'amc-pacific-place-11',
    localDate: '2026-09-07',
    localTime: '19:30',
    formatLabels: ['closed-caption', 'IMAX'],
    source: 'manual',
  });
  assert.ok(a.startsWith('scr:'));
  assert.equal(a, b);
  assert.match(a, /2026-09-07T19:30:00-07:00/);
});

test('screening IDs change when film, theater, start instant, or format changes', () => {
  const base = {
    filmKey: 'sinners',
    theaterId: 'amc-pacific-place-11',
    localDate: '2026-09-07',
    localTime: '19:30',
    formatLabels: ['70mm'],
  };
  const id = buildStableScreeningId(base);
  assert.notEqual(buildStableScreeningId({ ...base, filmKey: 'other' }), id);
  assert.notEqual(
    buildStableScreeningId({ ...base, theaterId: 'siff-cinema-uptown' }),
    id,
  );
  assert.notEqual(buildStableScreeningId({ ...base, localTime: '21:00' }), id);
  assert.notEqual(buildStableScreeningId({ ...base, formatLabels: ['35mm'] }), id);
});

test('DST-ambiguous wall times produce distinct identities', () => {
  const first = seattleStartsAtIso('2026-11-01', '01:30', { occurrence: 'first' });
  const second = seattleStartsAtIso('2026-11-01', '01:30', { occurrence: 'second' });
  assert.equal(first, '2026-11-01T01:30:00-07:00');
  assert.equal(second, '2026-11-01T01:30:00-08:00');
  assert.notEqual(
    buildStableScreeningId({
      filmKey: 'sinners',
      theaterId: 'amc-pacific-place-11',
      startsAt: first,
      formatLabels: [],
    }),
    buildStableScreeningId({
      filmKey: 'sinners',
      theaterId: 'amc-pacific-place-11',
      startsAt: second,
      formatLabels: [],
    }),
  );
});

test('opportunityKey from artifact id survives harmless regeneration and reorder', () => {
  const row = {
    id: 'abc123',
    source: 'amc',
    sourceShowtimeId: null,
    theaterId: 'amc-pacific-place-11',
    localDate: '2026-09-07',
    localTime: '19:30',
    filmKey: 'sinners',
    formatLabels: ['imax-at-amc'],
  };
  assert.equal(buildOpportunityKey(row), 'id:abc123');
  assert.equal(
    buildOpportunityKey({ ...row, formatLabels: ['IMAX'], source: 'manual' }),
    'id:abc123',
  );
});

test('buildHomeData screening IDs are order-independent', () => {
  const theaters = [
    { id: 'amc-pacific-place-11', name: 'AMC Pacific Place 11', enabled: true },
  ];
  const films = [
    { showtime_film_key: 'sinners', title: 'Sinners', runtime_min: 137 },
  ];
  const showA = {
    id: 'st-later',
    date: '2026-09-07',
    time: '19:30',
    theater_id: 'amc-pacific-place-11',
    showtime_film_key: 'sinners',
    film_title: 'Sinners',
    runtime_min: 137,
    status: 'active',
    format_tags: ['imax-at-amc'],
    source: 'amc',
  };
  const showB = {
    ...showA,
    id: 'st-early',
    time: '11:00',
  };
  const artifact = (showtimes) => ({
    generated_at: '2026-09-07T04:14:05-07:00',
    timezone: 'America/Los_Angeles',
    theaters,
    films,
    showtimes,
  });
  const first = buildHomeData({ showtimesCurrent: artifact([showA, showB]) });
  const second = buildHomeData({ showtimesCurrent: artifact([showB, showA]) });
  const ids = (home) =>
    home.opportunities
      .map((row) => `${row.opportunityKey}|${row.screeningId}`)
      .sort();
  assert.deepEqual(ids(first), ids(second));
});

test('schedule state marks past rows as started and not actionable', () => {
  const now = new Date('2026-09-07T22:00:00.000Z');
  const past = scheduleScreeningState(
    {
      localDate: '2026-09-07',
      localTime: '11:00',
      sortableLocalDateTime: '2026-09-07T11:00',
      status: 'available',
    },
    now,
  );
  const later = scheduleScreeningState(
    {
      localDate: '2026-09-07',
      localTime: '19:30',
      sortableLocalDateTime: '2026-09-07T19:30',
      status: 'available',
    },
    now,
  );
  assert.equal(past.past, true);
  assert.equal(past.actionable, false);
  assert.equal(past.stateLabel, STARTED_SCREENING_LABEL);
  assert.equal(later.past, false);
  assert.equal(later.actionable, true);
  assert.equal(later.stateLabel, null);
});
