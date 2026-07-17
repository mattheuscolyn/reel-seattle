import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAmcCatalogHealthSummary,
  buildSourceHealthRows,
  formatEmittedStatus,
  formatMissingScalar,
  formatTimestamp,
  listDiagnostics,
} from '../../cockpit/pipelineHealthFormat.js';

test('formatMissingScalar uses an em dash for nullish values', () => {
  assert.equal(formatMissingScalar(null), '—');
  assert.equal(formatMissingScalar(undefined), '—');
  assert.equal(formatMissingScalar(''), '—');
  assert.equal(formatMissingScalar(0), '0');
  assert.equal(formatMissingScalar(12), '12');
});

test('formatTimestamp preserves raw ISO and adds a readable form when parseable', () => {
  const result = formatTimestamp('2026-07-14T00:51:19-07:00');
  assert.equal(result.raw, '2026-07-14T00:51:19-07:00');
  assert.equal(typeof result.readable, 'string');
  assert.match(result.readable, /2026/);
});

test('formatTimestamp keeps the original string when parsing fails', () => {
  const result = formatTimestamp('not-a-timestamp');
  assert.equal(result.raw, 'not-a-timestamp');
  assert.equal(result.readable, null);
});

test('formatEmittedStatus does not remap pipeline status values', () => {
  assert.equal(formatEmittedStatus('success'), 'success');
  assert.equal(formatEmittedStatus('stale'), 'stale');
  assert.equal(formatEmittedStatus('empty'), 'empty');
  assert.equal(formatEmittedStatus('failed'), 'failed');
  assert.equal(formatEmittedStatus(null), '—');
});

test('listDiagnostics returns the full uncapped list', () => {
  const items = ['one', '  two  ', '', 'three', 'four'];
  assert.deepEqual(listDiagnostics(items), ['one', 'two', 'three', 'four']);
});

test('source with errors and status success still displays success', () => {
  const rows = buildSourceHealthRows({
    sources: {
      amc: {
        status: 'success',
        showtime_count: 5,
        film_count: 1,
        theater_count: 1,
        last_successful_run: '2026-07-14',
        warnings: ['allowlist note'],
        errors: ['scrape log error example'],
      },
      siff: {
        status: 'stale',
        showtime_count: 0,
        film_count: 0,
        theater_count: 0,
        last_successful_run: '2026-07-01',
        warnings: [],
        errors: [],
      },
    },
  });

  assert.equal(rows[0].key, 'amc');
  assert.equal(rows[0].status, 'success');
  assert.equal(rows[0].rawStatus, 'success');
  assert.deepEqual(rows[0].errors, ['scrape log error example']);
  assert.deepEqual(rows[0].warnings, ['allowlist note']);
  assert.equal(rows[1].status, 'stale');
});

test('buildAmcCatalogHealthSummary returns null when section absent', () => {
  assert.equal(buildAmcCatalogHealthSummary({ status: 'success' }), null);
});

test('buildAmcCatalogHealthSummary passes catalog statuses through unchanged', () => {
  const summary = buildAmcCatalogHealthSummary({
    amc_source_catalog: {
      status: 'stale',
      outcome: 'retained_previous',
      build_attempted: true,
      build_succeeded: false,
      soft_failure: true,
      artifacts_written_this_run: false,
      artifacts_retained_from_prior: true,
      reported_at: '2026-07-17T12:00:00-07:00',
      last_successful_build_at: '2026-07-15T12:00:00-07:00',
      message: 'retained prior catalogs',
      warnings: ['note'],
      errors: ['soft failure'],
      products_summary: { total: 50, active: 39, inactive: 11 },
      releases_summary: {
        total: 46,
        singleton_groups: 44,
        multi_product_groups: 2,
      },
      artifacts: {
        amc_movie_products: { path: 'data/source_catalog/amc_movie_products.json' },
        amc_release_observations: {
          path: 'data/source_catalog/amc_release_observations.json',
        },
      },
    },
  });
  assert.equal(summary.status, 'stale');
  assert.equal(summary.outcome, 'retained_previous');
  assert.equal(summary.buildSucceeded, false);
  assert.equal(summary.artifactsRetainedFromPrior, true);
  assert.deepEqual(summary.errors, ['soft failure']);
  assert.equal(summary.productsSummary.total, 50);
  assert.equal(summary.releasesSummary.multi_product_groups, 2);
});
