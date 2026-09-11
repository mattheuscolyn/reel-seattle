/**
 * Overlay hydrated TMDB snapshots onto a static enrichment index.
 * Does not mutate the base index.
 */

import { asCanonicalFilmId, lookupEnrichment } from './enrichmentIndex.js';
import { enrichmentRowFromTmdbSnapshot } from './enrichmentFromTmdbSnapshot.js';

/**
 * @param {ReturnType<import('./enrichmentIndex.js').buildEnrichmentIndex> | null | undefined} baseIndex
 * @param {Iterable<object | null | undefined>} snapshots
 * @returns {ReturnType<import('./enrichmentIndex.js').buildEnrichmentIndex> | null | undefined}
 */
export function mergeEnrichmentIndexWithSnapshots(baseIndex, snapshots) {
  if (!baseIndex || baseIndex.status !== 'ready') {
    // Without a ready base index we still allow a synthetic ready index when
    // snapshots exist so cold opening films can enrich before the artifact loads.
    const rows = [];
    for (const snapshot of snapshots ?? []) {
      const row = enrichmentRowFromTmdbSnapshot(snapshot);
      if (row) rows.push(row);
    }
    if (rows.length === 0) return baseIndex ?? null;
    /** @type {Map<string, object>} */
    const byFilmId = new Map();
    for (const row of rows) {
      byFilmId.set(row.film_id, Object.freeze(row));
    }
    return {
      status: 'ready',
      reason: null,
      version: 1,
      imageConfig: null,
      byFilmId,
      rowCount: byFilmId.size,
      duplicateIds: [],
    };
  }

  /** @type {Map<string, object>} */
  const byFilmId = new Map(baseIndex.byFilmId);
  let added = 0;
  for (const snapshot of snapshots ?? []) {
    const row = enrichmentRowFromTmdbSnapshot(snapshot);
    if (!row) continue;
    const id = asCanonicalFilmId(row.film_id);
    if (!id) continue;
    if (lookupEnrichment(baseIndex, id)) continue;
    if (byFilmId.has(id)) continue;
    byFilmId.set(id, Object.freeze(row));
    added += 1;
  }
  if (added === 0) return baseIndex;

  return {
    ...baseIndex,
    byFilmId,
    rowCount: byFilmId.size,
  };
}
