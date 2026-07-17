import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetAmcSourceCatalogCachesForTests,
  AMC_MOVIE_PRODUCTS_URL,
  AMC_RELEASE_OBSERVATIONS_URL,
  assertAmcMovieProductsShape,
  assertAmcReleaseObservationsShape,
  fetchAmcMovieProducts,
  fetchAmcReleaseObservations,
  loadAmcMovieProductsOnce,
  loadAmcReleaseObservationsOnce,
} from '../../cockpit/amcSourceCatalogLoader.js';
import {
  brokenJsonFetchResponse,
  installFetchMock,
  jsonFetchResponse,
} from './helpers/mockFetch.mjs';

const sampleProducts = {
  schema_version: '1.0.0',
  generated_at: '2026-07-17T10:06:13-07:00',
  source: 'amc',
  stats: {
    products: 0,
    active_products: 0,
    inactive_products: 0,
    with_release_id: 0,
    without_release_id: 0,
    refresh_pending: 0,
    refresh_success: 0,
    refresh_stale: 0,
    refresh_failed: 0,
    refresh_invalid: 0,
    special_presentations: 0,
  },
  products: [],
};

const sampleReleases = {
  schema_version: '1.0.0',
  generated_at: '2026-07-17T10:06:13-07:00',
  source: 'amc',
  derivation: {
    source_artifact: 'amc_movie_products',
    source_schema_version: '1.0.0',
    classifier_version: '1.0.0',
    rebuilt_at: '2026-07-17T10:06:13-07:00',
  },
  stats: {
    release_observations: 0,
    singleton_groups: 0,
    multi_product_groups: 0,
    largest_group: 0,
  },
  releases: [],
};

test('fetchAmcMovieProducts returns parsed JSON for a successful response', async () => {
  const restore = installFetchMock(async (url) => {
    assert.equal(url, AMC_MOVIE_PRODUCTS_URL);
    return jsonFetchResponse(sampleProducts);
  });
  try {
    const catalog = await fetchAmcMovieProducts();
    assert.equal(catalog.schema_version, '1.0.0');
    assert.deepEqual(catalog.products, []);
  } finally {
    restore();
  }
});

test('fetchAmcReleaseObservations returns parsed JSON for a successful response', async () => {
  const restore = installFetchMock(async (url) => {
    assert.equal(url, AMC_RELEASE_OBSERVATIONS_URL);
    return jsonFetchResponse(sampleReleases);
  });
  try {
    const catalog = await fetchAmcReleaseObservations();
    assert.equal(catalog.schema_version, '1.0.0');
    assert.deepEqual(catalog.releases, []);
  } finally {
    restore();
  }
});

test('fetchAmcMovieProducts rejects missing file HTTP 404', async () => {
  const restore = installFetchMock(async () =>
    jsonFetchResponse(null, { ok: false, status: 404 }),
  );
  try {
    await assert.rejects(
      () => fetchAmcMovieProducts(),
      /Unable to load AMC movie products catalog: HTTP 404/,
    );
  } finally {
    restore();
  }
});

test('fetchAmcReleaseObservations rejects missing file HTTP 404', async () => {
  const restore = installFetchMock(async () =>
    jsonFetchResponse(null, { ok: false, status: 404 }),
  );
  try {
    await assert.rejects(
      () => fetchAmcReleaseObservations(),
      /Unable to load AMC release observations catalog: HTTP 404/,
    );
  } finally {
    restore();
  }
});

test('fetchAmcMovieProducts rejects invalid JSON bodies', async () => {
  const restore = installFetchMock(async () => brokenJsonFetchResponse());
  try {
    await assert.rejects(
      () => fetchAmcMovieProducts(),
      /AMC movie products catalog JSON parse failed/,
    );
  } finally {
    restore();
  }
});

test('valid empty product catalog is accepted; missing products array is not', () => {
  assert.equal(assertAmcMovieProductsShape(sampleProducts), sampleProducts);
  assert.throws(
    () => assertAmcMovieProductsShape({ schema_version: '1.0.0' }),
    /products array/,
  );
  assert.throws(() => assertAmcMovieProductsShape(null), /JSON object/);
});

test('valid empty release catalog is accepted; missing releases array is not', () => {
  assert.equal(assertAmcReleaseObservationsShape(sampleReleases), sampleReleases);
  assert.throws(
    () => assertAmcReleaseObservationsShape({ schema_version: '1.0.0' }),
    /releases array/,
  );
});

test('loadAmcMovieProductsOnce caches a successful artifact', async () => {
  __resetAmcSourceCatalogCachesForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return sampleProducts;
  };
  await loadAmcMovieProductsOnce(fetchMock);
  const cached = await loadAmcMovieProductsOnce(fetchMock);
  assert.equal(calls, 1);
  assert.equal(cached, sampleProducts);
});

test('loadAmcReleaseObservationsOnce caches a successful artifact', async () => {
  __resetAmcSourceCatalogCachesForTests();
  let calls = 0;
  const fetchMock = async () => {
    calls += 1;
    return sampleReleases;
  };
  await loadAmcReleaseObservationsOnce(fetchMock);
  const cached = await loadAmcReleaseObservationsOnce(fetchMock);
  assert.equal(calls, 1);
  assert.equal(cached, sampleReleases);
});
