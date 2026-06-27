import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  __resetRecentlyAddedLoaderCacheForTests,
  loadRecentlyAddedArtifactOnce,
} from '../../src/utils/recentlyAddedLoader.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const miniArtifact = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'newly_added_current_mini.json'), 'utf8'),
);

test('loadRecentlyAddedArtifactOnce shares one in-flight fetch for concurrent calls', async () => {
  __resetRecentlyAddedLoaderCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return miniArtifact;
  };

  const [first, second] = await Promise.all([
    loadRecentlyAddedArtifactOnce(fetchMock),
    loadRecentlyAddedArtifactOnce(fetchMock),
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
});

test('loadRecentlyAddedArtifactOnce caches a successful artifact', async () => {
  __resetRecentlyAddedLoaderCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return miniArtifact;
  };

  await loadRecentlyAddedArtifactOnce(fetchMock);
  const cached = await loadRecentlyAddedArtifactOnce(fetchMock);

  assert.equal(calls, 1);
  assert.equal(cached, miniArtifact);
});

test('loadRecentlyAddedArtifactOnce allows retry after failure', async () => {
  __resetRecentlyAddedLoaderCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('Recently added data unavailable');
    }
    return miniArtifact;
  };

  await assert.rejects(() => loadRecentlyAddedArtifactOnce(fetchMock));
  const artifact = await loadRecentlyAddedArtifactOnce(fetchMock);

  assert.equal(calls, 2);
  assert.equal(artifact, miniArtifact);
});
