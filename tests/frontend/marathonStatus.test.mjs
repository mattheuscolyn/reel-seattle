import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarathonStatusMessage,
  normalizePipelineReport,
} from '../../src/utils/pipelineReport.js';

function reportWithAmc(amcSource) {
  return normalizePipelineReport({
    generated_at: '2026-06-26T20:00:00-07:00',
    sources: {
      amc: amcSource,
      siff: { status: 'success', showtime_count: 10 },
      beacon: { status: 'success', showtime_count: 5 },
    },
  });
}

test('buildMarathonStatusMessage returns null for AMC success with showtimes', () => {
  const report = reportWithAmc({ status: 'success', showtime_count: 42 });
  assert.equal(buildMarathonStatusMessage(report), null);
});

test('buildMarathonStatusMessage returns empty message for AMC success with zero count', () => {
  const report = reportWithAmc({ status: 'success', showtime_count: 0 });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'empty');
  assert.match(result.message, /No current AMC showtimes/i);
});

test('buildMarathonStatusMessage returns stale message for AMC stale', () => {
  const report = reportWithAmc({
    status: 'stale',
    showtime_count: 0,
    last_successful_run: '2026-06-12',
  });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'stale');
  assert.match(result.message, /may be stale/i);
});

test('buildMarathonStatusMessage returns error message for AMC failed', () => {
  const report = reportWithAmc({ status: 'failed', showtime_count: 0, errors: ['scrape failed'] });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'error');
  assert.match(result.message, /reported an error/i);
});

test('buildMarathonStatusMessage returns error message for AMC error status', () => {
  const report = reportWithAmc({ status: 'error', showtime_count: 0 });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'error');
});

test('buildMarathonStatusMessage returns unavailable message when AMC source is missing', () => {
  const report = normalizePipelineReport({
    generated_at: '2026-06-26T20:00:00-07:00',
    sources: {
      siff: { status: 'success', showtime_count: 10 },
      beacon: { status: 'success', showtime_count: 5 },
    },
  });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'unavailable');
  assert.match(result.message, /Data status is unavailable/i);
});

test('buildMarathonStatusMessage returns unavailable message for null report', () => {
  const result = buildMarathonStatusMessage(null);
  assert.equal(result.variant, 'unavailable');
  assert.match(result.message, /Data status is unavailable/i);
});

test('buildMarathonStatusMessage returns caution message for unexpected AMC status', () => {
  const report = reportWithAmc({ status: 'weird', showtime_count: 0 });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'caution');
  assert.match(result.message, /may be unavailable/i);
});

test('buildMarathonStatusMessage returns empty message for AMC empty status', () => {
  const report = reportWithAmc({ status: 'empty', showtime_count: 0 });
  const result = buildMarathonStatusMessage(report);
  assert.equal(result.variant, 'empty');
});
