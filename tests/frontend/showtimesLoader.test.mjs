import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rowsFromShowtimesCurrent,
  sourceInfoFromArtifact,
  SHOWTIMES_LOAD_ERROR,
} from '../../src/showtimesAdapter.js';
import {
  __resetShowtimesLoaderCacheForTests,
  loadShowtimesArtifactOnce,
} from '../../src/utils/showtimesLoader.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const miniArtifact = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'showtimes_current_mini.json'), 'utf8'),
);

test('loadShowtimesArtifactOnce shares one in-flight fetch for concurrent calls', async () => {
  __resetShowtimesLoaderCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return miniArtifact;
  };

  const [first, second] = await Promise.all([
    loadShowtimesArtifactOnce(fetchMock),
    loadShowtimesArtifactOnce(fetchMock),
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
});

test('loadShowtimesArtifactOnce caches a successful artifact', async () => {
  __resetShowtimesLoaderCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return miniArtifact;
  };

  await loadShowtimesArtifactOnce(fetchMock);
  const cached = await loadShowtimesArtifactOnce(fetchMock);

  assert.equal(calls, 1);
  assert.equal(cached, miniArtifact);
});

test('loadShowtimesArtifactOnce propagates fetch errors', async () => {
  __resetShowtimesLoaderCacheForTests();
  const fetchMock = async () => {
    throw new Error(SHOWTIMES_LOAD_ERROR);
  };

  await assert.rejects(
    () => loadShowtimesArtifactOnce(fetchMock),
    /Showtimes data is unavailable/,
  );
});

test('loadShowtimesArtifactOnce allows retry after failure', async () => {
  __resetShowtimesLoaderCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error(SHOWTIMES_LOAD_ERROR);
    }
    return miniArtifact;
  };

  await assert.rejects(() => loadShowtimesArtifactOnce(fetchMock));
  const artifact = await loadShowtimesArtifactOnce(fetchMock);

  assert.equal(calls, 2);
  assert.equal(artifact, miniArtifact);
});

test('cached showtimes artifact supports rows and sourceInfo derivation', async () => {
  __resetShowtimesLoaderCacheForTests();
  const fetchMock = async () => miniArtifact;

  const artifact = await loadShowtimesArtifactOnce(fetchMock);
  const rows = rowsFromShowtimesCurrent(artifact);
  const sourceInfo = sourceInfoFromArtifact(artifact);

  assert.equal(rows.length, 2);
  assert.equal(sourceInfo.stats.showtime_count, 2);
  assert.equal(sourceInfo.window.start_date, '2026-06-26');
});
