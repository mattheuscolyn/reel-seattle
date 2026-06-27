import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchPipelineReportArtifact, PIPELINE_REPORT_URL } from '../../src/showtimesAdapter.js';
import {
  buildSummaryLine,
  formatSourceStatus,
  isValidPipelineReport,
  normalizePipelineReport,
  normalizeSourceReport,
  sourceStatusClass,
} from '../../src/utils/pipelineReport.js';
import {
  brokenJsonFetchResponse,
  installFetchMock,
  jsonFetchResponse,
} from './helpers/mockFetch.mjs';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const pipelineFixture = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'pipeline_report_mini.json'), 'utf8'),
);

test('formatSourceStatus maps known statuses', () => {
  assert.equal(formatSourceStatus('success'), 'Current');
  assert.equal(formatSourceStatus('stale'), 'Stale');
  assert.equal(formatSourceStatus('failed'), 'Error');
  assert.equal(formatSourceStatus('empty'), 'Empty');
  assert.equal(formatSourceStatus('weird'), 'Weird');
  assert.equal(formatSourceStatus(null), 'Unknown');
});

test('sourceStatusClass maps success to current', () => {
  assert.equal(sourceStatusClass('success'), 'current');
  assert.equal(sourceStatusClass('stale'), 'stale');
});

test('normalizeSourceReport extracts counts and stale detail', () => {
  const artifact = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'pipeline_report_mini.json'), 'utf8'),
  );
  const siff = normalizeSourceReport('siff', artifact.sources.siff);
  const amc = normalizeSourceReport('amc', artifact.sources.amc);

  assert.equal(siff.statusLabel, 'Current');
  assert.equal(siff.detail, '102 showtimes');
  assert.equal(amc.statusLabel, 'Stale');
  assert.equal(amc.detail, 'last successful scrape: June 12');
});

test('normalizeSourceReport handles missing source', () => {
  const row = normalizeSourceReport('amc', null);
  assert.equal(row.statusLabel, 'Unknown');
  assert.equal(row.detail, null);
});

test('normalizePipelineReport builds summary from fixture', () => {
  const artifact = JSON.parse(
    readFileSync(join(FIXTURES_DIR, 'pipeline_report_mini.json'), 'utf8'),
  );
  const view = normalizePipelineReport(artifact);

  assert.equal(view.sources.length, 3);
  assert.match(view.summaryLine, /SIFF current/);
  assert.match(view.summaryLine, /Beacon current/);
  assert.match(view.summaryLine, /AMC stale/);
  assert.equal(view.totals.showtime_count, 123);
});

test('isValidPipelineReport rejects malformed payloads', () => {
  assert.equal(isValidPipelineReport(null), false);
  assert.equal(isValidPipelineReport({ generated_at: 'x' }), false);
  assert.equal(
    isValidPipelineReport({ generated_at: 'x', sources: {} }),
    true,
  );
});

test('buildSummaryLine handles empty input', () => {
  assert.match(buildSummaryLine([]), /unavailable/i);
});

test('fetchPipelineReportArtifact fetches the expected URL and returns parsed JSON', async (t) => {
  let requestedUrl = null;
  const restore = installFetchMock(async (url) => {
    requestedUrl = url;
    return jsonFetchResponse(pipelineFixture);
  });
  t.after(restore);

  const artifact = await fetchPipelineReportArtifact(PIPELINE_REPORT_URL);
  assert.equal(requestedUrl, PIPELINE_REPORT_URL);
  assert.equal(artifact.totals.showtime_count, 123);
});

test('fetchPipelineReportArtifact rejects HTTP failures', async (t) => {
  const restore = installFetchMock(async () => jsonFetchResponse(null, { ok: false, status: 503 }));
  t.after(restore);

  await assert.rejects(fetchPipelineReportArtifact(PIPELINE_REPORT_URL), (error) => {
    assert.match(error.message, /pipeline report unavailable/i);
    return true;
  });
});

test('fetchPipelineReportArtifact rejects malformed JSON', async (t) => {
  const restore = installFetchMock(async () => brokenJsonFetchResponse());
  t.after(restore);

  await assert.rejects(fetchPipelineReportArtifact(PIPELINE_REPORT_URL), (error) => {
    assert.match(error.message, /pipeline report unavailable/i);
    return true;
  });
});
