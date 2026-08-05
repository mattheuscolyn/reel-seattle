import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAmcCatalogDiagnostics,
  buildProductCatalogSummary,
  buildReleaseCatalogSummary,
  filterProducts,
  filterReleases,
  formatMissingScalar,
  formatTimestamp,
  isMultiProductRelease,
  productLifecycleState,
} from '../../cockpit/amcSourceCatalogFormat.js';
import { ALLOWED_DATA_ROUTES } from '../../cockpit/allowedDataRoutes.js';

function sampleProduct(overrides = {}) {
  return {
    source: 'amc',
    source_film_id: '100',
    source_release_id: '200',
    source_title: 'Example Film',
    lifecycle: {
      first_seen_at: '2026-07-15T00:00:00-07:00',
      last_seen_at: '2026-07-17T00:00:00-07:00',
      last_refreshed_at: '2026-07-17T00:00:00-07:00',
      last_successful_refresh_at: '2026-07-17T00:00:00-07:00',
      inactive_since: null,
      refresh_status: 'success',
    },
    presentation: { category: 'standard', is_special_presentation: false },
    ...overrides,
  };
}

function sampleRelease(overrides = {}) {
  return {
    source: 'amc',
    source_release_id: '200',
    member_source_film_ids: ['100'],
    member_count: 1,
    observed_titles: ['Example Film'],
    relationship_status: 'grouping_evidence_only',
    relationship_observations: {},
    lifecycle: {
      first_observed_at: '2026-07-15T00:00:00-07:00',
      last_rebuilt_at: '2026-07-17T00:00:00-07:00',
    },
    ...overrides,
  };
}

test('productLifecycleState treats inactive_since as inactive', () => {
  assert.equal(productLifecycleState(sampleProduct()), 'active');
  assert.equal(
    productLifecycleState(
      sampleProduct({
        lifecycle: {
          ...sampleProduct().lifecycle,
          inactive_since: '2026-07-16T00:00:00-07:00',
        },
      }),
    ),
    'inactive',
  );
});

test('buildProductCatalogSummary counts lifecycle and refresh states', () => {
  const catalog = {
    schema_version: '1.0.0',
    generated_at: '2026-07-17T10:06:13-07:00',
    source: 'amc',
    stats: { products: 2 },
    products: [
      sampleProduct(),
      sampleProduct({
        source_film_id: '101',
        source_release_id: null,
        lifecycle: {
          ...sampleProduct().lifecycle,
          inactive_since: '2026-07-16T00:00:00-07:00',
          refresh_status: 'failed',
          last_successful_refresh_at: null,
        },
      }),
    ],
  };
  const summary = buildProductCatalogSummary(catalog);
  assert.equal(summary.totalProducts, 2);
  assert.equal(summary.activeProducts, 1);
  assert.equal(summary.inactiveProducts, 1);
  assert.equal(summary.withReleaseId, 1);
  assert.equal(summary.withoutReleaseId, 1);
  assert.equal(summary.refreshCounts.success, 1);
  assert.equal(summary.refreshCounts.failed, 1);
  assert.equal(summary.neverSuccessfullyRefreshed, 1);
});

test('buildReleaseCatalogSummary counts singleton and multi-product groups', () => {
  const catalog = {
    schema_version: '1.0.0',
    generated_at: '2026-07-17T10:06:13-07:00',
    source: 'amc',
    stats: { release_observations: 2 },
    releases: [
      sampleRelease(),
      sampleRelease({
        source_release_id: '353146',
        member_source_film_ids: ['84361', '84362'],
        member_count: 2,
      }),
    ],
  };
  const summary = buildReleaseCatalogSummary(catalog);
  assert.equal(summary.totalReleases, 2);
  assert.equal(summary.singletonGroups, 1);
  assert.equal(summary.multiProductGroups, 1);
  assert.equal(summary.linkedMemberships, 3);
  assert.equal(isMultiProductRelease(catalog.releases[1]), true);
});

test('filterProducts supports title, id, lifecycle, refresh, and release-link filters', () => {
  const products = [
    sampleProduct({ source_title: 'Moana', source_film_id: '72474' }),
    sampleProduct({
      source_title: 'Scary Movie',
      source_film_id: '79322',
      source_release_id: null,
      lifecycle: {
        ...sampleProduct().lifecycle,
        inactive_since: '2026-07-16T00:00:00-07:00',
        refresh_status: 'stale',
      },
    }),
  ];
  assert.equal(filterProducts(products, { query: 'moana' }).length, 1);
  assert.equal(filterProducts(products, { query: '72474' }).length, 1);
  assert.equal(filterProducts(products, { lifecycle: 'inactive' }).length, 1);
  assert.equal(filterProducts(products, { refreshStatus: 'stale' }).length, 1);
  assert.equal(filterProducts(products, { releaseLink: 'unlinked' }).length, 1);
  assert.equal(
    filterProducts(products, { query: 'nope', lifecycle: 'active' }).length,
    0,
  );
});

test('filterReleases supports release id, member id, and multi-product filter', () => {
  const releases = [
    sampleRelease(),
    sampleRelease({
      source_release_id: '353146',
      member_source_film_ids: ['84361', '84362'],
      member_count: 2,
    }),
  ];
  assert.equal(filterReleases(releases, { query: '353146' }).length, 1);
  assert.equal(filterReleases(releases, { query: '84362' }).length, 1);
  assert.equal(filterReleases(releases, { memberSize: 'multi' }).length, 1);
  assert.equal(filterReleases(releases, { memberSize: 'single' }).length, 1);
});

test('buildAmcCatalogDiagnostics surfaces missing members and duplicate keys', () => {
  const productsCatalog = {
    products: [
      sampleProduct({ source_film_id: '100', source_release_id: '200' }),
      sampleProduct({ source_film_id: '100', source_release_id: '999' }),
      sampleProduct({ source_film_id: '101', source_release_id: 'missing-release' }),
    ],
  };
  const releasesCatalog = {
    releases: [
      sampleRelease({
        source_release_id: '200',
        member_source_film_ids: ['100', 'missing-member'],
        member_count: 2,
      }),
      sampleRelease({
        source_release_id: '200',
        member_source_film_ids: ['100'],
        member_count: 1,
      }),
      sampleRelease({
        source_release_id: 'empty',
        member_source_film_ids: [],
        member_count: 0,
      }),
    ],
  };
  const diagnostics = buildAmcCatalogDiagnostics(productsCatalog, releasesCatalog);
  assert.ok(diagnostics.duplicateProductKeys.includes('100'));
  assert.ok(diagnostics.duplicateReleaseKeys.includes('200'));
  assert.equal(diagnostics.unresolvedMemberCount, 1);
  assert.equal(diagnostics.missingMemberProducts[0].sourceFilmId, 'missing-member');
  assert.ok(
    diagnostics.productsWithMissingReleaseObservation.some(
      (item) => item.sourceReleaseId === 'missing-release',
    ),
  );
  assert.ok(diagnostics.warnings.length >= 3);
});

test('formatTimestamp and formatMissingScalar preserve nulls', () => {
  assert.equal(formatMissingScalar(null), '—');
  assert.equal(formatTimestamp(null).raw, '—');
  assert.equal(formatTimestamp('2026-07-17T10:06:13-07:00').raw, '2026-07-17T10:06:13-07:00');
  assert.ok(formatTimestamp('2026-07-17T10:06:13-07:00').readable);
});

test('ALLOWED_DATA_ROUTES includes catalog paths and excludes arbitrary data paths', () => {
  assert.ok(
    Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/source_catalog/amc_movie_products.json'),
  );
  assert.ok(
    Object.hasOwn(
      ALLOWED_DATA_ROUTES,
      '/data/source_catalog/amc_release_observations.json',
    ),
  );
  assert.ok(
    Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/film_identity/tmdb_match_review_queue.json'),
  );
  assert.ok(
    Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/film_identity/tmdb_match_decisions.json'),
  );
  assert.ok(
    Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/audits/film_identity_review_pack.json'),
  );
  assert.ok(Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/film_enrichment_current.json'));
  assert.equal(
    Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/newly_added_current.json'),
    false,
  );
  assert.equal(
    Object.hasOwn(ALLOWED_DATA_ROUTES, '/data/source_catalog/not_a_real_catalog.json'),
    false,
  );
  assert.equal(Object.keys(ALLOWED_DATA_ROUTES).length, 11);
});
