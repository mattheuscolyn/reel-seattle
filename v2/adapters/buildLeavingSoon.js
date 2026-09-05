/**
 * Leaving Soon artifact adapter — normalizes leaving_soon_current.json
 * into homeData.leavingSoon. Bucket copy only; no probabilities or exact days.
 */

import { createHomeWarning } from './homeWarnings.js';

export const LEAVING_SOON_BUCKETS = Object.freeze({
  lastChance: 'last_chance',
  leavingSoon: 'leaving_soon',
});

export const LEAVING_SOON_BUCKET_LABELS = Object.freeze({
  last_chance: 'Last chance',
  leaving_soon: 'Leaving soon',
});

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} payload
 */
export function assertLeavingSoonShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('leaving_soon_current must be a JSON object');
  }
  if (!Array.isArray(payload.items)) {
    throw new Error('leaving_soon_current must include an items array');
  }
}

/**
 * @param {unknown} raw
 */
function normalizeItem(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const filmKey = asTrimmedString(raw.film_key);
  const title = asTrimmedString(raw.film_title);
  const bucket = asTrimmedString(raw.leaving_soon_bucket);
  if (!filmKey || !title) return null;
  if (bucket !== 'last_chance' && bucket !== 'leaving_soon') return null;
  const sortRank =
    typeof raw.sort_rank === 'number' && Number.isFinite(raw.sort_rank)
      ? Math.trunc(raw.sort_rank)
      : null;
  return {
    filmKey,
    title,
    bucket,
    bucketLabel: LEAVING_SOON_BUCKET_LABELS[bucket],
    riskLevel: asTrimmedString(raw.risk_level),
    reason: asTrimmedString(raw.reason),
    runType: asTrimmedString(raw.run_type),
    sortRank,
    posterUrl: asTrimmedString(raw.poster_url),
    runtimeMin:
      typeof raw.runtime_min === 'number' && Number.isFinite(raw.runtime_min)
        ? Math.trunc(raw.runtime_min)
        : null,
    visibleShowDateCount:
      typeof raw.visible_show_date_count === 'number'
        ? Math.max(0, Math.trunc(raw.visible_show_date_count))
        : 0,
    totalVisibleShowtimes:
      typeof raw.total_visible_showtimes === 'number'
        ? Math.max(0, Math.trunc(raw.total_visible_showtimes))
        : 0,
  };
}

/**
 * @param {unknown | null | undefined} artifact
 * @param {{ warnings?: object[] }} [options]
 */
export function buildLeavingSoon(artifact, options = {}) {
  const warnings = options.warnings ?? [];

  if (artifact == null) {
    warnings.push(
      createHomeWarning(
        'informational',
        'leaving_soon_missing',
        'leaving_soon_current unavailable; Leaving Soon list is empty.',
      ),
    );
    return {
      status: 'unavailable',
      reason: 'leaving_soon_current unavailable',
      generatedAt: null,
      modelVersion: null,
      stats: null,
      entries: [],
    };
  }

  try {
    assertLeavingSoonShape(artifact);
  } catch (error) {
    warnings.push(
      createHomeWarning(
        'recoverable',
        'leaving_soon_invalid',
        error instanceof Error ? error.message : String(error),
      ),
    );
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
      generatedAt: null,
      modelVersion: null,
      stats: null,
      entries: [],
    };
  }

  const entries = artifact.items
    .map(normalizeItem)
    .filter(Boolean)
    .sort((a, b) => {
      const rankA = a.sortRank ?? Number.MAX_SAFE_INTEGER;
      const rankB = b.sortRank ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

  if (entries.length === 0) {
    return {
      status: 'empty',
      reason: 'Nothing looks like it is leaving soon right now.',
      generatedAt: asTrimmedString(artifact.generated_at),
      modelVersion: asTrimmedString(artifact.model_version),
      stats: artifact.stats && typeof artifact.stats === 'object' ? artifact.stats : null,
      entries: [],
    };
  }

  return {
    status: 'ready',
    reason: null,
    generatedAt: asTrimmedString(artifact.generated_at),
    modelVersion: asTrimmedString(artifact.model_version),
    stats: artifact.stats && typeof artifact.stats === 'object' ? artifact.stats : null,
    entries,
  };
}

/**
 * @param {object} entry
 * @param {object[]} films
 */
export function joinLeavingSoonEntryToHomeFilm(entry, films) {
  const list = Array.isArray(films) ? films : [];
  const key = asTrimmedString(entry?.filmKey);
  if (!key) return null;
  return (
    list.find((film) => film.filmKey === key) ??
    list.find((film) => film.parentFilmKey === key) ??
    null
  );
}
