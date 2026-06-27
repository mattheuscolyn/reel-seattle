import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildTheaterNameIndex,
  CURRENT_URL,
  fetchShowtimeRows,
  fetchShowtimesArtifact,
  isoDateToCsvDate,
  mapCurrentShowtimeToLegacyRow,
  rowsFromShowtimesCurrent,
  SHOWTIMES_LOAD_ERROR,
  sourceInfoFromArtifact,
} from '../../src/showtimesAdapter.js';
import {
  brokenJsonFetchResponse,
  installFetchMock,
  jsonFetchResponse,
} from './helpers/mockFetch.mjs';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const showtimesFixture = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'showtimes_current_mini.json'), 'utf8'),
);

test('isoDateToCsvDate converts ISO to MM/DD/YYYY', () => {
  assert.equal(isoDateToCsvDate('2026-06-28'), '06/28/2026');
  assert.equal(isoDateToCsvDate('2026-07-01'), '07/01/2026');
  assert.equal(isoDateToCsvDate('bad'), '');
});

test('mapCurrentShowtimeToLegacyRow maps expected fields', () => {
  const artifact = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'showtimes_current_mini.json'), 'utf8'),
  );
  const theaterNameById = buildTheaterNameIndex(artifact.theaters);
  const row = mapCurrentShowtimeToLegacyRow(artifact.showtimes[0], theaterNameById);

  assert.equal(row.Date, '06/28/2026');
  assert.equal(row.Time, '7:30PM');
  assert.equal(row.Theater, 'AMC Pacific Place 11');
  assert.equal(row.Film, 'Sinners');
  assert.equal(row.Runtime, '137');
  assert.equal(row.posterDynamic, 'https://example.com/sinners.jpg');
  assert.equal(row.isCanceled, 'False');
  assert.equal(row.premiumFormat, 'IMAX, Dolby Cinema');
  assert.equal(row.source, 'amc');
  assert.equal(row.theater_id, 'amc-pacific-place-11');
  assert.equal(row.showtime_film_key, 'sinners');
  assert.equal(row.time_24h, '19:30');
});

test('rowsFromShowtimesCurrent returns two legacy rows from fixture', () => {
  const artifact = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'showtimes_current_mini.json'), 'utf8'),
  );
  const rows = rowsFromShowtimesCurrent(artifact);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.Film),
    ['Sinners', 'Indie Film'],
  );
});

test('rowsFromShowtimesCurrent skips rows missing theater name', () => {
  const rows = rowsFromShowtimesCurrent({
    theaters: [],
    showtimes: [
      {
        date: '2026-06-28',
        time: '19:30',
        time_display: '7:30 PM',
        theater_id: 'missing-theater',
        film_title: 'Orphan',
        runtime_min: 90,
        format_tags: [],
        source: 'amc',
      },
    ],
  });
  assert.equal(rows.length, 0);
});

test('fetchShowtimesArtifact fetches the expected URL and returns parsed JSON', async (t) => {
  let requestedUrl = null;
  const restore = installFetchMock(async (url) => {
    requestedUrl = url;
    return jsonFetchResponse(showtimesFixture);
  });
  t.after(restore);

  const artifact = await fetchShowtimesArtifact(CURRENT_URL);
  assert.equal(requestedUrl, CURRENT_URL);
  assert.equal(artifact.stats.showtime_count, 2);
});

test('fetchShowtimesArtifact rejects HTTP failures', async (t) => {
  const restore = installFetchMock(async () => jsonFetchResponse(null, { ok: false, status: 404 }));
  t.after(restore);

  await assert.rejects(fetchShowtimesArtifact(CURRENT_URL), (error) => {
    assert.match(error.message, /showtimes data is unavailable/i);
    return true;
  });
});

test('fetchShowtimesArtifact rejects malformed JSON', async (t) => {
  const restore = installFetchMock(async () => brokenJsonFetchResponse());
  t.after(restore);

  await assert.rejects(fetchShowtimesArtifact(CURRENT_URL), (error) => {
    assert.equal(error.message, SHOWTIMES_LOAD_ERROR);
    return true;
  });
});

test('fetchShowtimeRows returns legacy rows and sourceInfo can be derived from artifact', async (t) => {
  const restore = installFetchMock(async () => jsonFetchResponse(showtimesFixture));
  t.after(restore);

  const artifact = await fetchShowtimesArtifact(CURRENT_URL);
  const rows = await fetchShowtimeRows(CURRENT_URL);
  const sourceInfo = sourceInfoFromArtifact(artifact);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].Film, 'Sinners');
  assert.equal(rows[0].Date, '06/28/2026');
  assert.equal(sourceInfo.window.start_date, '2026-06-26');
  assert.equal(sourceInfo.stats.showtime_count, 2);
});

test('fetchShowtimeRows rejects invalid artifact shape', async (t) => {
  const restore = installFetchMock(async () => jsonFetchResponse(null));
  t.after(restore);

  await assert.rejects(fetchShowtimeRows(CURRENT_URL), /Invalid showtimes_current\.json shape/);
});
