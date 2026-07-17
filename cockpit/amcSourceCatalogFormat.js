import {
  formatMissingScalar,
  formatTimestamp,
} from './pipelineHealthFormat.js';

export { formatMissingScalar, formatTimestamp };

/**
 * Active = inactive_since is null/empty; inactive = inactive_since set.
 * Matches catalog stats.active_products / inactive_products semantics.
 * @param {object|null|undefined} product
 */
export function productLifecycleState(product) {
  const inactiveSince = product?.lifecycle?.inactive_since;
  if (inactiveSince == null || inactiveSince === '') return 'active';
  return 'inactive';
}

/**
 * @param {object|null|undefined} product
 */
export function productHasReleaseLink(product) {
  const releaseId = product?.source_release_id;
  return !(releaseId == null || releaseId === '');
}

/**
 * @param {object|null|undefined} catalog
 */
export function buildProductCatalogSummary(catalog) {
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const stored = catalog?.stats && typeof catalog.stats === 'object' ? catalog.stats : {};

  let active = 0;
  let inactive = 0;
  let withRelease = 0;
  let withoutRelease = 0;
  const refreshCounts = Object.create(null);
  let neverSuccessfullyRefreshed = 0;

  for (const product of products) {
    if (productLifecycleState(product) === 'inactive') inactive += 1;
    else active += 1;

    if (productHasReleaseLink(product)) withRelease += 1;
    else withoutRelease += 1;

    const refresh = product?.lifecycle?.refresh_status;
    const key =
      refresh == null || refresh === '' ? '(missing)' : String(refresh);
    refreshCounts[key] = (refreshCounts[key] || 0) + 1;

    if (
      product?.lifecycle?.last_successful_refresh_at == null ||
      product.lifecycle.last_successful_refresh_at === ''
    ) {
      neverSuccessfullyRefreshed += 1;
    }
  }

  return {
    schemaVersion: formatMissingScalar(catalog?.schema_version),
    generatedAt: formatTimestamp(catalog?.generated_at),
    source: formatMissingScalar(catalog?.source),
    totalProducts: products.length,
    activeProducts: active,
    inactiveProducts: inactive,
    withReleaseId: withRelease,
    withoutReleaseId: withoutRelease,
    refreshCounts,
    neverSuccessfullyRefreshed,
    storedStats: stored,
  };
}

/**
 * @param {object|null|undefined} catalog
 */
export function buildReleaseCatalogSummary(catalog) {
  const releases = Array.isArray(catalog?.releases) ? catalog.releases : [];
  const stored = catalog?.stats && typeof catalog.stats === 'object' ? catalog.stats : {};

  let singleton = 0;
  let multi = 0;
  let linkedMemberships = 0;
  const relationshipStatusCounts = Object.create(null);

  for (const release of releases) {
    const members = Array.isArray(release?.member_source_film_ids)
      ? release.member_source_film_ids
      : [];
    const count =
      typeof release?.member_count === 'number' ? release.member_count : members.length;
    linkedMemberships += members.length;
    if (count > 1) multi += 1;
    else singleton += 1;

    const status = release?.relationship_status;
    const key =
      status == null || status === '' ? '(missing)' : String(status);
    relationshipStatusCounts[key] = (relationshipStatusCounts[key] || 0) + 1;
  }

  return {
    schemaVersion: formatMissingScalar(catalog?.schema_version),
    generatedAt: formatTimestamp(catalog?.generated_at),
    source: formatMissingScalar(catalog?.source),
    totalReleases: releases.length,
    singletonGroups: singleton,
    multiProductGroups: multi,
    linkedMemberships,
    relationshipStatusCounts,
    storedStats: stored,
    derivation: catalog?.derivation && typeof catalog.derivation === 'object'
      ? catalog.derivation
      : null,
  };
}

/**
 * Cross-catalog inspection diagnostics (read-only).
 * @param {object|null|undefined} productsCatalog
 * @param {object|null|undefined} releasesCatalog
 */
export function buildAmcCatalogDiagnostics(productsCatalog, releasesCatalog) {
  const products = Array.isArray(productsCatalog?.products)
    ? productsCatalog.products
    : [];
  const releases = Array.isArray(releasesCatalog?.releases)
    ? releasesCatalog.releases
    : [];

  const productIds = new Map();
  const duplicateProductKeys = [];
  for (const product of products) {
    const id = product?.source_film_id;
    if (id == null || id === '') continue;
    const key = String(id);
    if (productIds.has(key)) {
      if (!duplicateProductKeys.includes(key)) duplicateProductKeys.push(key);
    } else {
      productIds.set(key, product);
    }
  }

  const releaseIds = new Map();
  const duplicateReleaseKeys = [];
  for (const release of releases) {
    const id = release?.source_release_id;
    if (id == null || id === '') continue;
    const key = String(id);
    if (releaseIds.has(key)) {
      if (!duplicateReleaseKeys.includes(key)) duplicateReleaseKeys.push(key);
    } else {
      releaseIds.set(key, release);
    }
  }

  const missingMemberProducts = [];
  const emptyOrInvalidMemberLists = [];
  for (const release of releases) {
    const releaseId = formatMissingScalar(release?.source_release_id);
    const members = release?.member_source_film_ids;
    if (!Array.isArray(members) || members.length === 0) {
      emptyOrInvalidMemberLists.push(releaseId);
      continue;
    }
    for (const memberId of members) {
      if (memberId == null || memberId === '') {
        emptyOrInvalidMemberLists.push(releaseId);
        continue;
      }
      if (!productIds.has(String(memberId))) {
        missingMemberProducts.push({
          sourceReleaseId: releaseId,
          sourceFilmId: String(memberId),
        });
      }
    }
  }

  const productsWithMissingReleaseObservation = [];
  for (const product of products) {
    if (!productHasReleaseLink(product)) continue;
    const releaseId = String(product.source_release_id);
    if (!releaseIds.has(releaseId)) {
      productsWithMissingReleaseObservation.push({
        sourceFilmId: formatMissingScalar(product.source_film_id),
        sourceReleaseId: releaseId,
      });
    }
  }

  const warnings = [];
  if (duplicateProductKeys.length > 0) {
    warnings.push(
      `Duplicate product source_film_id values: ${duplicateProductKeys.length}`,
    );
  }
  if (duplicateReleaseKeys.length > 0) {
    warnings.push(
      `Duplicate release source_release_id values: ${duplicateReleaseKeys.length}`,
    );
  }
  if (missingMemberProducts.length > 0) {
    warnings.push(
      `Release members missing from product catalog: ${missingMemberProducts.length}`,
    );
  }
  if (productsWithMissingReleaseObservation.length > 0) {
    warnings.push(
      `Products referencing missing release observations: ${productsWithMissingReleaseObservation.length}`,
    );
  }
  if (emptyOrInvalidMemberLists.length > 0) {
    warnings.push(
      `Releases with empty or invalid member lists: ${emptyOrInvalidMemberLists.length}`,
    );
  }

  const productSummary = buildProductCatalogSummary(productsCatalog);
  const releaseSummary = buildReleaseCatalogSummary(releasesCatalog);
  const storedProductTotal = productsCatalog?.stats?.products;
  const storedReleaseTotal = releasesCatalog?.stats?.release_observations;
  if (
    typeof storedProductTotal === 'number' &&
    storedProductTotal !== productSummary.totalProducts
  ) {
    warnings.push(
      `Stored product stats.products (${storedProductTotal}) disagrees with array length (${productSummary.totalProducts})`,
    );
  }
  if (
    typeof storedReleaseTotal === 'number' &&
    storedReleaseTotal !== releaseSummary.totalReleases
  ) {
    warnings.push(
      `Stored release stats.release_observations (${storedReleaseTotal}) disagrees with array length (${releaseSummary.totalReleases})`,
    );
  }

  return {
    warnings,
    duplicateProductKeys,
    duplicateReleaseKeys,
    missingMemberProducts,
    productsWithMissingReleaseObservation,
    emptyOrInvalidMemberLists,
    unresolvedMemberCount: missingMemberProducts.length,
  };
}

/**
 * @param {object[]} products
 * @param {{
 *   query?: string,
 *   lifecycle?: string,
 *   refreshStatus?: string,
 *   releaseLink?: string,
 * }} filters
 */
export function filterProducts(products, filters = {}) {
  const list = Array.isArray(products) ? products : [];
  const query = String(filters.query || '')
    .trim()
    .toLowerCase();
  const lifecycle = String(filters.lifecycle || '').trim();
  const refreshStatus = String(filters.refreshStatus || '').trim();
  const releaseLink = String(filters.releaseLink || '').trim();

  return list.filter((product) => {
    if (lifecycle === 'active' || lifecycle === 'inactive') {
      if (productLifecycleState(product) !== lifecycle) return false;
    }
    if (refreshStatus) {
      if (String(product?.lifecycle?.refresh_status || '') !== refreshStatus) {
        return false;
      }
    }
    if (releaseLink === 'linked' && !productHasReleaseLink(product)) return false;
    if (releaseLink === 'unlinked' && productHasReleaseLink(product)) return false;

    if (!query) return true;
    const title = String(product?.source_title || '').toLowerCase();
    const filmId = String(product?.source_film_id || '').toLowerCase();
    const releaseId = String(product?.source_release_id || '').toLowerCase();
    return (
      title.includes(query) ||
      filmId.includes(query) ||
      releaseId.includes(query)
    );
  });
}

/**
 * @param {object[]} releases
 * @param {{
 *   query?: string,
 *   memberSize?: string,
 *   relationshipStatus?: string,
 * }} filters
 */
export function filterReleases(releases, filters = {}) {
  const list = Array.isArray(releases) ? releases : [];
  const query = String(filters.query || '')
    .trim()
    .toLowerCase();
  const memberSize = String(filters.memberSize || '').trim();
  const relationshipStatus = String(filters.relationshipStatus || '').trim();

  return list.filter((release) => {
    const members = Array.isArray(release?.member_source_film_ids)
      ? release.member_source_film_ids
      : [];
    const count =
      typeof release?.member_count === 'number'
        ? release.member_count
        : members.length;

    if (memberSize === 'single' && count !== 1) return false;
    if (memberSize === 'multi' && count <= 1) return false;

    if (relationshipStatus) {
      if (String(release?.relationship_status || '') !== relationshipStatus) {
        return false;
      }
    }

    if (!query) return true;
    const releaseId = String(release?.source_release_id || '').toLowerCase();
    if (releaseId.includes(query)) return true;
    return members.some((id) => String(id).toLowerCase().includes(query));
  });
}

/**
 * @param {object|null|undefined} release
 */
export function isMultiProductRelease(release) {
  const members = Array.isArray(release?.member_source_film_ids)
    ? release.member_source_film_ids
    : [];
  const count =
    typeof release?.member_count === 'number'
      ? release.member_count
      : members.length;
  return count > 1;
}

/**
 * Build a product lookup map by source_film_id.
 * @param {object|null|undefined} productsCatalog
 */
export function indexProductsByFilmId(productsCatalog) {
  const map = new Map();
  const products = Array.isArray(productsCatalog?.products)
    ? productsCatalog.products
    : [];
  for (const product of products) {
    const id = product?.source_film_id;
    if (id == null || id === '') continue;
    if (!map.has(String(id))) map.set(String(id), product);
  }
  return map;
}
