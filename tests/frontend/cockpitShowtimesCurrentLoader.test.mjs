import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetShowtimesCurrentCacheForTests,
  assertShowtimesCurrentShape,
  fetchShowtimesCurrent,
  hasShowtimesCurrentCache,
  loadShowtimesCurrentOnce,
  SHOWTIMES_CURRENT_URL,
} from '../../cockpit/showtimesCurrentLoader.js';
import {
  installFetchMock,
  jsonFetchResponse,
} from './helpers/mockFetch.mjs';

const sampleArtifact = {
  schema_version: '1.0.0',
  generated_at: '2026-07-14T00:51:19-07:00',
  window: { start_date: '2026-07-14', end_date: '2026-07-28' },
  showtimes: [
    {
      id: 'abc',
      date: '2026-07-14',
      time: '19:00',
      theater_id: 'amc-pacific-place-11',
      film_title: 'Example',
    },
  ],
  films: [{ showtime_film_key: 'example', title: 'Example' }],
  theaters: [{ id: 'amc-pacific-place-11', name: 'AMC Pacific Place 11' }],
};

test('fetchShowtimesCurrent returns a normalized artifact for a successful response', async () => {
  const restore = installFetchMock(async (url) => {
    assert.equal(url, SHOWTIMES_CURRENT_URL);
    return jsonFetchResponse(sampleArtifact);
  });

  try {
    const { artifact, meta } = await fetchShowtimesCurrent();
    assert.equal(artifact.showtimes.length, 1);
    assert.equal(typeof meta.loadMs, 'number');
  } finally {
    restore();
  }
});

test('fetchShowtimesCurrent rejects a non-OK response', async () => {
  const restore = installFetchMock(async () =>
    jsonFetchResponse(null, { ok: false, status: 500 }),
  );

  try {
    await assert.rejects(
      () => fetchShowtimesCurrent(),
      /Unable to load current showtimes: HTTP 500/,
    );
  } finally {
    restore();
  }
});

test('assertShowtimesCurrentShape rejects missing arrays', () => {
  assert.throws(
    () => assertShowtimesCurrentShape({ films: [], theaters: [] }),
    /showtimes array/,
  );
  assert.throws(
    () =>
      assertShowtimesCurrentShape({
        showtimes: [],
        theaters: [],
      }),
    /films array/,
  );
  assert.throws(
    () =>
      assertShowtimesCurrentShape({
        showtimes: [],
        films: [],
      }),
    /theaters array/,
  );
});

test('loadShowtimesCurrentOnce caches successful loads and skips a second fetch', async () => {
  __resetShowtimesCurrentCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return {
      artifact: sampleArtifact,
      meta: { loadMs: 1, approximateBytes: 10 },
    };
  };

  const first = await loadShowtimesCurrentOnce(fetchMock);
  const second = await loadShowtimesCurrentOnce(fetchMock);

  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(hasShowtimesCurrentCache(), true);
});

test('loadShowtimesCurrentOnce does not permanently poison the cache after failure', async () => {
  __resetShowtimesCurrentCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('boom');
    }
    return {
      artifact: sampleArtifact,
      meta: { loadMs: 2, approximateBytes: 20 },
    };
  };

  await assert.rejects(() => loadShowtimesCurrentOnce(fetchMock), /boom/);
  const recovered = await loadShowtimesCurrentOnce(fetchMock);
  assert.equal(calls, 2);
  assert.equal(recovered.artifact, sampleArtifact);
});
