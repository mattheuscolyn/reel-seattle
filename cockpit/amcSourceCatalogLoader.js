/** Cockpit URLs for durable internal AMC source-catalog artifacts (local allowlist only). */
export const AMC_MOVIE_PRODUCTS_URL = '/data/source_catalog/amc_movie_products.json';
export const AMC_RELEASE_OBSERVATIONS_URL =
  '/data/source_catalog/amc_release_observations.json';

export const AMC_MOVIE_PRODUCTS_REPO_PATH =
  'data/source_catalog/amc_movie_products.json';
export const AMC_RELEASE_OBSERVATIONS_REPO_PATH =
  'data/source_catalog/amc_release_observations.json';

let productsCache = null;
let productsPromise = null;
let releasesCache = null;
let releasesPromise = null;

/**
 * Lightweight structural check for the AMC movie-products catalog.
 * Valid empty catalogs (products: []) are accepted.
 * @param {unknown} payload
 */
export function assertAmcMovieProductsShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('AMC movie products catalog must be a JSON object');
  }
  if (!Array.isArray(payload.products)) {
    throw new Error('AMC movie products catalog must include a products array');
  }
  if (payload.schema_version == null || payload.schema_version === '') {
    throw new Error('AMC movie products catalog must include schema_version');
  }
  return payload;
}

/**
 * Lightweight structural check for the AMC release-observations catalog.
 * Valid empty catalogs (releases: []) are accepted.
 * @param {unknown} payload
 */
export function assertAmcReleaseObservationsShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('AMC release observations catalog must be a JSON object');
  }
  if (!Array.isArray(payload.releases)) {
    throw new Error(
      'AMC release observations catalog must include a releases array',
    );
  }
  if (payload.schema_version == null || payload.schema_version === '') {
    throw new Error('AMC release observations catalog must include schema_version');
  }
  return payload;
}

/**
 * @param {string} label
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @param {(payload: unknown) => object} assertShape
 */
async function fetchCatalogArtifact(label, url, fetchImpl, assertShape) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch ${label} (${url}): ${detail}`);
  }

  if (!response.ok) {
    throw new Error(
      `Unable to load ${label}: HTTP ${response.status} for ${url}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} JSON parse failed (${url}): ${detail}`);
  }

  return assertShape(payload);
}

/**
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAmcMovieProducts(
  url = AMC_MOVIE_PRODUCTS_URL,
  fetchImpl = fetch,
) {
  return fetchCatalogArtifact(
    'AMC movie products catalog',
    url,
    fetchImpl,
    assertAmcMovieProductsShape,
  );
}

/**
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAmcReleaseObservations(
  url = AMC_RELEASE_OBSERVATIONS_URL,
  fetchImpl = fetch,
) {
  return fetchCatalogArtifact(
    'AMC release observations catalog',
    url,
    fetchImpl,
    assertAmcReleaseObservationsShape,
  );
}

/**
 * @param {() => Promise<object>} [fetchArtifact]
 */
export async function loadAmcMovieProductsOnce(
  fetchArtifact = () => fetchAmcMovieProducts(),
) {
  if (productsCache) return productsCache;
  if (productsPromise) return productsPromise;

  productsPromise = fetchArtifact()
    .then((artifact) => {
      productsCache = artifact;
      return artifact;
    })
    .catch((error) => {
      productsPromise = null;
      throw error;
    })
    .finally(() => {
      productsPromise = null;
    });

  return productsPromise;
}

/**
 * @param {() => Promise<object>} [fetchArtifact]
 */
export async function loadAmcReleaseObservationsOnce(
  fetchArtifact = () => fetchAmcReleaseObservations(),
) {
  if (releasesCache) return releasesCache;
  if (releasesPromise) return releasesPromise;

  releasesPromise = fetchArtifact()
    .then((artifact) => {
      releasesCache = artifact;
      return artifact;
    })
    .catch((error) => {
      releasesPromise = null;
      throw error;
    })
    .finally(() => {
      releasesPromise = null;
    });

  return releasesPromise;
}

/** @internal Test-only reset for module-level cache state. */
export function __resetAmcSourceCatalogCachesForTests() {
  productsCache = null;
  productsPromise = null;
  releasesCache = null;
  releasesPromise = null;
}
