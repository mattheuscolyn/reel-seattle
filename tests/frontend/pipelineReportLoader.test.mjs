import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetPipelineReportCacheForTests,
  loadPipelineReportArtifactOnce,
} from '../../src/utils/pipelineReportLoader.js';

const miniArtifact = {
  generated_at: '2026-06-26T20:00:00-07:00',
  sources: {
    amc: { status: 'stale', showtime_count: 0 },
  },
};

test('loadPipelineReportArtifactOnce shares one in-flight fetch for concurrent calls', async () => {
  __resetPipelineReportCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return miniArtifact;
  };

  const [first, second] = await Promise.all([
    loadPipelineReportArtifactOnce(fetchMock),
    loadPipelineReportArtifactOnce(fetchMock),
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
});

test('loadPipelineReportArtifactOnce caches a successful artifact', async () => {
  __resetPipelineReportCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return miniArtifact;
  };

  await loadPipelineReportArtifactOnce(fetchMock);
  const cached = await loadPipelineReportArtifactOnce(fetchMock);

  assert.equal(calls, 1);
  assert.equal(cached, miniArtifact);
});

test('loadPipelineReportArtifactOnce propagates fetch errors', async () => {
  __resetPipelineReportCacheForTests();
  const fetchMock = async () => {
    throw new Error('Pipeline report unavailable');
  };

  await assert.rejects(
    () => loadPipelineReportArtifactOnce(fetchMock),
    /Pipeline report unavailable/,
  );
});

test('loadPipelineReportArtifactOnce allows retry after failure', async () => {
  __resetPipelineReportCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('Pipeline report unavailable');
    }
    return miniArtifact;
  };

  await assert.rejects(() => loadPipelineReportArtifactOnce(fetchMock));
  const artifact = await loadPipelineReportArtifactOnce(fetchMock);

  assert.equal(calls, 2);
  assert.equal(artifact, miniArtifact);
});
