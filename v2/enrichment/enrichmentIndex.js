/**
 * TMDB film enrichment index (T-ENR-10).
 * Immutable Map keyed by canonical film_id (`tmdb:<id>`).
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asCanonicalFilmId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^tmdb:[1-9][0-9]*$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Minimal shape check for film_enrichment_current.json.
 * @param {unknown} doc
 * @returns {{ ok: true, version: number } | { ok: false, reason: string }}
 */
export function validateEnrichmentArtifactShape(doc) {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: 'enrichment artifact must be an object' };
  }
  const version = doc.version;
  if (version !== 1) {
    return { ok: false, reason: `unsupported enrichment version: ${String(version)}` };
  }
  if (!Array.isArray(doc.films)) {
    return { ok: false, reason: 'enrichment films must be an array' };
  }
  const imageConfig = doc.image_config;
  if (
    imageConfig == null ||
    typeof imageConfig !== 'object' ||
    typeof imageConfig.secure_base_url !== 'string' ||
    !imageConfig.secure_base_url.trim()
  ) {
    return { ok: false, reason: 'enrichment image_config.secure_base_url required' };
  }
  return { ok: true, version: 1 };
}

/**
 * Build an immutable enrichment index. Does not mutate `doc`.
 *
 * @param {unknown} doc
 * @returns {{
 *   status: 'ready' | 'unavailable',
 *   reason: string | null,
 *   version: number | null,
 *   imageConfig: { secureBaseUrl: string, posterSize: string, backdropSize: string } | null,
 *   byFilmId: ReadonlyMap<string, object>,
 *   rowCount: number,
 *   duplicateIds: string[],
 * }}
 */
export function buildEnrichmentIndex(doc) {
  const empty = {
    status: 'unavailable',
    reason: null,
    version: null,
    imageConfig: null,
    byFilmId: /** @type {ReadonlyMap<string, object>} */ (new Map()),
    rowCount: 0,
    duplicateIds: /** @type {string[]} */ ([]),
  };

  if (doc == null) {
    return { ...empty, reason: 'enrichment artifact missing' };
  }

  const shape = validateEnrichmentArtifactShape(doc);
  if (!shape.ok) {
    return { ...empty, reason: shape.reason };
  }

  const imageConfig = {
    secureBaseUrl: String(doc.image_config.secure_base_url).trim(),
    posterSize: String(doc.image_config.poster_size || 'w500').trim() || 'w500',
    backdropSize: String(doc.image_config.backdrop_size || 'w780').trim() || 'w780',
  };

  /** @type {Map<string, object>} */
  const byFilmId = new Map();
  /** @type {string[]} */
  const duplicateIds = [];

  for (const row of doc.films) {
    if (row == null || typeof row !== 'object') continue;
    const filmId = asCanonicalFilmId(row.film_id);
    if (!filmId) continue;
    if (byFilmId.has(filmId)) {
      duplicateIds.push(filmId);
      continue;
    }
    byFilmId.set(filmId, Object.freeze({ ...row }));
  }

  return {
    status: 'ready',
    reason: null,
    version: shape.version,
    imageConfig: Object.freeze(imageConfig),
    byFilmId,
    rowCount: byFilmId.size,
    duplicateIds,
  };
}

/**
 * @param {ReturnType<typeof buildEnrichmentIndex> | null | undefined} index
 * @param {string | null | undefined} filmId
 */
export function lookupEnrichment(index, filmId) {
  const id = asCanonicalFilmId(filmId);
  if (!id || !index || index.status !== 'ready') return null;
  return index.byFilmId.get(id) ?? null;
}
