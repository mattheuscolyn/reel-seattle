import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetPipelineReportCacheForTests,
  fetchPipelineReport,
  loadPipelineReportOnce,
  PIPELINE_REPORT_URL,
} from '../../cockpit/pipelineReportLoader.js';
import {
  brokenJsonFetchResponse,
  installFetchMock,
  jsonFetchResponse,
} from './helpers/mockFetch.mjs';

const sampleReport = {
  schema_version: '1.0.0',
  generated_at: '2026-07-14T00:51:19-07:00',
  status: 'success',
  window: { start_date: '2026-07-14', end_date: '2026-07-28' },
  sources: {
    amc: {
      status: 'success',
      showtime_count: 10,
      film_count: 2,
      theater_count: 1,
      last_successful_run: '2026-07-14',
      warnings: [],
      errors: [],
    },
  },
  totals: { showtime_count: 10, film_count: 2, theater_count: 1 },
  messages: [],
};

test('fetchPipelineReport returns parsed JSON for a successful response', async () => {
  const restore = installFetchMock(async (url) => {
    assert.equal(url, PIPELINE_REPORT_URL);
    return jsonFetchResponse(sampleReport);
  });

  try {
    const report = await fetchPipelineReport();
    assert.equal(report.status, 'success');
    assert.equal(report.totals.showtime_count, 10);
  } finally {
    restore();
  }
});

test('fetchPipelineReport rejects a non-OK HTTP response', async () => {
  const restore = installFetchMock(async () => jsonFetchResponse(null, { ok: false, status: 404 }));

  try {
    await assert.rejects(
      () => fetchPipelineReport(),
      /Unable to load pipeline report: HTTP 404/,
    );
  } finally {
    restore();
  }
});

test('fetchPipelineReport rejects invalid JSON bodies', async () => {
  const restore = installFetchMock(async () => brokenJsonFetchResponse());

  try {
    await assert.rejects(
      () => fetchPipelineReport(),
      /Pipeline report JSON parse failed/,
    );
  } finally {
    restore();
  }
});

test('loadPipelineReportOnce caches a successful artifact', async () => {
  __resetPipelineReportCacheForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return sampleReport;
  };

  await loadPipelineReportOnce(fetchMock);
  const cached = await loadPipelineReportOnce(fetchMock);

  assert.equal(calls, 1);
  assert.equal(cached, sampleReport);
});
