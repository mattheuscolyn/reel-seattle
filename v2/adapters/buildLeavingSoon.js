/**
 * Leaving Soon artifact adapter — normalizes leaving_soon_current.json
 * into homeData.leavingSoon. Keeps public semantic timing fields only;
 * never surfaces raw probabilities or remaining-day medians.
 */

import { createHomeWarning } from './homeWarnings.js';
import { asCanonicalFilmId } from '../enrichment/enrichmentIndex.js';
import {
  DEPARTURE_TIMING_FRESHNESS_MAX_AGE_DAYS,
  isDepartureTimingFresh,
} from '../filmDetail/departureTiming.js';
import { pacificDateString } from '../explore/exploreCatalog.js';

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
 * @param {{ todayIso?: string | null }} [options]
 */
function normalizeItem(raw, options = {}) {
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

  const predictionAsOf = asTrimmedString(raw.prediction_as_of);
  const timingConfidence = asTrimmedString(raw.timing_confidence);
  const timingMode = asTrimmedString(raw.timing_mode);
  const predictedEndDate = asTrimmedString(raw.predicted_end_date);
  const predictionScope = asTrimmedString(raw.prediction_scope) ?? 'amc';
  const todayIso = asTrimmedString(options.todayIso) ?? pacificDateString();
  const timingFresh = predictionAsOf
    ? isDepartureTimingFresh(predictionAsOf, todayIso)
    : false;

  /** @type {string | null} */
  let safeConfidence = null;
  /** @type {string | null} */
  let safeMode = null;
  /** @type {string | null} */
  let safePredicted = null;
  if (
    timingConfidence &&
    timingMode &&
    (timingConfidence === 'high' ||
      timingConfidence === 'moderate' ||
      timingConfidence === 'low') &&
    (timingMode === 'likely_around' ||
      timingMode === 'could_around' ||
      timingMode === 'horizon_only')
  ) {
    if (!timingFresh) {
      safeConfidence = 'low';
      safeMode = 'horizon_only';
      safePredicted = null;
    } else if (timingMode === 'horizon_only' || timingConfidence === 'low') {
      safeConfidence = 'low';
      safeMode = 'horizon_only';
      safePredicted = null;
    } else if (predictedEndDate) {
      safeConfidence = timingConfidence;
      safeMode = timingMode;
      safePredicted = predictedEndDate;
    } else {
      safeConfidence = 'low';
      safeMode = 'horizon_only';
      safePredicted = null;
    }
  }

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
    // Observed booking fact — last currently known screening, not a prediction.
    maxShowDate: asTrimmedString(raw.max_show_date),
    totalVisibleTheaters:
      typeof raw.total_visible_theaters === 'number'
        ? Math.max(0, Math.trunc(raw.total_visible_theaters))
        : 0,
    theaters: normalizeTheaters(raw.theaters),
    predictionAsOf,
    predictedEndDate: safePredicted,
    timingConfidence: safeConfidence,
    timingMode: safeMode,
    predictionScope: safeConfidence ? predictionScope : null,
    timingFreshnessMaxAgeDays: DEPARTURE_TIMING_FRESHNESS_MAX_AGE_DAYS,
  };
}

/**
 * @param {unknown} rawTheaters
 * @returns {{ id: string, name: string }[]}
 */
function normalizeTheaters(rawTheaters) {
  if (!Array.isArray(rawTheaters)) return [];
  /** @type {{ id: string, name: string }[]} */
  const theaters = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const row of rawTheaters) {
    if (row == null || typeof row !== 'object') continue;
    const id = asTrimmedString(row.theater_id);
    const name = asTrimmedString(row.theater_name);
    if (!id || !name) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    theaters.push({ id, name });
  }
  return theaters;
}

/**
 * @param {unknown | null | undefined} artifact
 * @param {{ warnings?: object[], todayIso?: string | null }} [options]
 */
export function buildLeavingSoon(artifact, options = {}) {
  const warnings = options.warnings ?? [];
  const todayIso = asTrimmedString(options.todayIso) ?? pacificDateString();

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
    .map((item) => normalizeItem(item, { todayIso }))
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
  if (key) {
    const byKey =
      list.find((film) => film.filmKey === key) ??
      list.find((film) => film.parentFilmKey === key) ??
      null;
    if (byKey) return byKey;
  }
  const filmId = asCanonicalFilmId(entry?.filmId ?? entry?.film_id);
  if (!filmId) return null;
  return (
    list.find((film) => film.filmId === filmId && !film.parentFilmKey) ??
    list.find((film) => film.filmId === filmId) ??
    null
  );
}
