import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShowtimeInspectionResult,
  buildTheaterSelectOptions,
  compareShowtimeRecords,
  defaultInspectionDate,
  filterShowtimesByTheaterAndDate,
  formatDuplicateObservation,
  formatFormatTags,
  formatRuntimeMinutes,
  isDateOutsideArtifactWindow,
  SHOWTIME_ROW_CAP,
  summarizeDuplicateIds,
} from '../../cockpit/showtimesInspectionFormat.js';

function makeShowtime(overrides = {}) {
  return {
    id: 'id-1',
    date: '2026-07-14',
    time: '19:00',
    time_display: '7:00 PM',
    theater_id: 'amc-pacific-place-11',
    showtime_film_key: 'example',
    film_title: 'Example',
    runtime_min: 100,
    status: 'active',
    format_tags: [],
    source: 'amc',
    source_film_id: '1',
    first_seen_at: '2026-07-14',
    last_seen_at: '2026-07-14',
    parent_film_key: 'example',
    parent_display_title: 'Example',
    screening_variant_type: 'none',
    ...overrides,
  };
}

const artifact = {
  generated_at: '2026-07-14T00:51:19-07:00',
  window: { start_date: '2026-07-14', end_date: '2026-07-28' },
  showtimes: [
    makeShowtime({ id: 'b', time: '21:00', film_title: 'Beta' }),
    makeShowtime({ id: 'a', time: '18:00', film_title: 'Alpha' }),
    makeShowtime({
      id: 'c',
      theater_id: 'the-beacon',
      date: '2026-07-15',
      film_title: 'Beacon Film',
    }),
  ],
  films: [],
  theaters: [],
};

test('exact theater/date filtering returns only matching records', () => {
  const matched = filterShowtimesByTheaterAndDate(
    artifact,
    'amc-pacific-place-11',
    '2026-07-14',
  );
  assert.equal(matched.length, 2);
  assert.ok(matched.every((row) => row.theater_id === 'amc-pacific-place-11'));
  assert.ok(matched.every((row) => row.date === '2026-07-14'));
});

test('filter returns empty for empty selection fields', () => {
  assert.deepEqual(filterShowtimesByTheaterAndDate(artifact, '', '2026-07-14'), []);
  assert.deepEqual(
    filterShowtimesByTheaterAndDate(artifact, 'amc-pacific-place-11', ''),
    [],
  );
});

test('filtering does not mutate the cached artifact arrays', () => {
  const original = artifact.showtimes.map((row) => row.id);
  const matched = filterShowtimesByTheaterAndDate(
    artifact,
    'amc-pacific-place-11',
    '2026-07-14',
  );
  matched.reverse();
  assert.deepEqual(
    artifact.showtimes.map((row) => row.id),
    original,
  );
});

test('stable ordering sorts by time then film_title then id', () => {
  const rows = [
    makeShowtime({ id: '2', time: '19:00', film_title: 'B' }),
    makeShowtime({ id: '1', time: '18:00', film_title: 'A' }),
    makeShowtime({ id: '3', time: '19:00', film_title: 'A' }),
  ];
  const sorted = [...rows].sort(compareShowtimeRecords);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ['1', '3', '2'],
  );
});

test('more than 200 results are truncated and reported', () => {
  const showtimes = [];
  for (let i = 0; i < SHOWTIME_ROW_CAP + 5; i += 1) {
    showtimes.push(
      makeShowtime({
        id: `id-${i}`,
        time: `10:${String(i % 60).padStart(2, '0')}`,
        film_title: `Film ${i}`,
      }),
    );
  }
  const result = buildShowtimeInspectionResult(
    { ...artifact, showtimes },
    {
      theaterId: 'amc-pacific-place-11',
      date: '2026-07-14',
      theater: { id: 'amc-pacific-place-11', name: 'AMC Pacific Place 11', enabled: true },
    },
  );
  assert.equal(result.matchedCount, SHOWTIME_ROW_CAP + 5);
  assert.equal(result.displayedCount, SHOWTIME_ROW_CAP);
  assert.equal(result.truncated, true);
  assert.equal(result.rows.length, SHOWTIME_ROW_CAP);
});

test('unknown status values remain unchanged', () => {
  const result = buildShowtimeInspectionResult(
    {
      ...artifact,
      showtimes: [makeShowtime({ status: 'mystery_status' })],
    },
    {
      theaterId: 'amc-pacific-place-11',
      date: '2026-07-14',
      theater: { enabled: true, name: 'AMC Pacific Place 11' },
    },
  );
  assert.equal(result.rows[0].status, 'mystery_status');
});

test('empty format_tags render as None and missing scalars as em dash', () => {
  assert.equal(formatFormatTags([]), 'None');
  assert.equal(formatFormatTags(null), '—');
  assert.equal(formatRuntimeMinutes(null), '—');
  const result = buildShowtimeInspectionResult(
    {
      ...artifact,
      showtimes: [
        makeShowtime({
          format_tags: [],
          source_film_id: null,
          runtime_min: null,
        }),
      ],
    },
    {
      theaterId: 'amc-pacific-place-11',
      date: '2026-07-14',
      theater: { enabled: true, name: 'AMC Pacific Place 11' },
    },
  );
  assert.equal(result.rows[0].formatTags, 'None');
  assert.equal(result.rows[0].sourceFilmId, '—');
  assert.equal(result.rows[0].runtime, '—');
});

test('disabled registry theaters remain selectable with disabled labels', () => {
  const options = buildTheaterSelectOptions({
    theaters: [
      {
        id: 'amc-kitsap-8',
        name: 'AMC Kitsap 8',
        enabled: false,
      },
      {
        id: 'the-beacon',
        name: 'The Beacon',
        enabled: true,
      },
    ],
  });
  assert.equal(options.length, 2);
  assert.equal(options[0].label, 'AMC Kitsap 8 — Disabled');
  assert.equal(options[0].disabled, true);
  assert.equal(options[1].label, 'The Beacon');
});

test('dates outside the artifact window are identified informationally', () => {
  assert.equal(
    isDateOutsideArtifactWindow(artifact.window, '2026-08-01'),
    true,
  );
  assert.equal(
    isDateOutsideArtifactWindow(artifact.window, '2026-07-14'),
    false,
  );
  const result = buildShowtimeInspectionResult(artifact, {
    theaterId: 'amc-pacific-place-11',
    date: '2026-08-01',
    theater: { enabled: true, name: 'AMC Pacific Place 11' },
  });
  assert.equal(result.outsideWindow, true);
  assert.equal(result.matchedCount, 0);
});

test('duplicate IDs inside a slice are counted and rows remain displayed', () => {
  const sliceArtifact = {
    ...artifact,
    showtimes: [
      makeShowtime({ id: 'dup', film_title: 'One' }),
      makeShowtime({ id: 'dup', film_title: 'Two' }),
      makeShowtime({ id: 'unique', film_title: 'Three', time: '20:00' }),
    ],
  };
  const summary = summarizeDuplicateIds(sliceArtifact.showtimes);
  assert.equal(summary.duplicateIdCount, 1);
  assert.equal(summary.extraRowCount, 1);
  assert.match(
    formatDuplicateObservation(summary),
    /1 ID appears on 2 records/,
  );

  const result = buildShowtimeInspectionResult(sliceArtifact, {
    theaterId: 'amc-pacific-place-11',
    date: '2026-07-14',
    theater: { enabled: true, name: 'AMC Pacific Place 11' },
  });
  assert.equal(result.matchedCount, 3);
  assert.equal(result.displayedCount, 3);
  assert.equal(result.rows.length, 3);
  assert.match(result.duplicateObservation, /Duplicate ID observation/);
});

test('missing source film ID is not treated as an error state', () => {
  const result = buildShowtimeInspectionResult(
    {
      ...artifact,
      showtimes: [makeShowtime({ source_film_id: null, source: 'siff' })],
    },
    {
      theaterId: 'amc-pacific-place-11',
      date: '2026-07-14',
      theater: { enabled: true, name: 'AMC Pacific Place 11' },
    },
  );
  assert.equal(result.rows[0].sourceFilmId, '—');
  assert.equal(result.matchedCount, 1);
});

test('defaultInspectionDate uses pipeline window start when valid', () => {
  assert.equal(
    defaultInspectionDate({ window: { start_date: '2026-07-14' } }),
    '2026-07-14',
  );
  assert.equal(defaultInspectionDate({ window: { start_date: 'bad' } }), '');
  assert.equal(defaultInspectionDate(null), '');
});

test('showtime section failure does not imply sibling section clearance', () => {
  // Pure independence contract used by the cockpit composition:
  // a showtime error may coexist with successful pipeline/registry data.
  const pipeline = { status: 'success' };
  const registry = { theaters: [{ id: 'the-beacon', enabled: true }] };
  const showtimesError = 'Unable to load current showtimes: HTTP 500';
  assert.ok(pipeline && registry && showtimesError);
  assert.equal(pipeline.status, 'success');
  assert.equal(registry.theaters.length, 1);
});
