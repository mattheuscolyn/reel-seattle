/**
 * Locked showtime / locked performance helpers for Build a Plan (PR1).
 */

import {
  buildPerformanceKey,
  buildPerformanceKeyFromPlannerRow,
} from '../identity/performanceIdentity.js';

/**
 * @typedef {{
 *   performanceKey: string,
 *   filmKey: string | null,
 *   filmId: string | null,
 *   parentFilmKey: string | null,
 *   title: string,
 *   theaterId: string,
 *   theaterName: string | null,
 *   localDate: string,
 *   localTime: string,
 *   runtimeMin: number | null,
 *   source: string | null,
 *   sourceShowtimeId: string | null,
 *   opportunityKey: string | null,
 *   formatLabel: string | null,
 *   posterUrl: string | null,
 * }} LockedShowtime
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asPositiveInt(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * Normalize one lock entry. Returns null if identity cannot be formed.
 * @param {unknown} raw
 * @returns {LockedShowtime | null}
 */
export function normalizeLockedShowtime(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);

  const filmKey =
    asTrimmed(record.filmKey) ?? asTrimmed(record.showtimeFilmKey);
  const theaterId =
    asTrimmed(record.theaterId) ?? asTrimmed(record.theater_id);
  const localDate =
    asTrimmed(record.localDate) ??
    asTrimmed(record.date) ??
    asTrimmed(record.showDate);
  const localTime =
    asTrimmed(record.localTime) ??
    asTrimmed(record.time) ??
    asTrimmed(record.startTime);

  const performanceKey =
    asTrimmed(record.performanceKey) ??
    buildPerformanceKey({
      source: record.source,
      sourceShowtimeId: record.sourceShowtimeId ?? record.source_showtime_id,
      theaterId,
      opportunityKey: record.opportunityKey,
      filmKey,
      showtimeFilmKey: record.showtimeFilmKey,
      localDate,
      date: localDate,
      localTime,
      time: localTime,
    });

  if (!performanceKey || !theaterId || !localDate) return null;

  const title = asTrimmed(record.title) ?? 'Locked screening';
  return {
    performanceKey,
    filmKey,
    filmId: asTrimmed(record.filmId),
    parentFilmKey:
      asTrimmed(record.parentFilmKey) ?? asTrimmed(record.parent_film_key),
    title,
    theaterId,
    theaterName:
      asTrimmed(record.theaterName) ?? asTrimmed(record.theater) ?? null,
    localDate,
    localTime: localTime ?? '',
    runtimeMin: asPositiveInt(record.runtimeMin ?? record.runtime),
    source: asTrimmed(record.source),
    sourceShowtimeId:
      asTrimmed(record.sourceShowtimeId) ??
      asTrimmed(record.source_showtime_id),
    opportunityKey: asTrimmed(record.opportunityKey),
    formatLabel:
      asTrimmed(record.formatLabel) ?? asTrimmed(record.format) ?? null,
    posterUrl:
      asTrimmed(record.posterUrl) ?? asTrimmed(record.imageUrl) ?? null,
  };
}

/**
 * @param {unknown} value
 * @returns {LockedShowtime[]}
 */
export function normalizeLockedShowtimes(value) {
  if (!Array.isArray(value)) return [];
  /** @type {LockedShowtime[]} */
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const lock = normalizeLockedShowtime(item);
    if (!lock) continue;
    if (seen.has(lock.performanceKey)) continue;
    seen.add(lock.performanceKey);
    out.push(lock);
  }
  return out;
}

/**
 * Resolve a lock to a plannerEngine candidate by exact performanceKey.
 * @param {LockedShowtime} lock
 * @param {object[]} candidates - candidates with .performanceKey
 * @returns {{ ok: true, candidate: object } | { ok: false, code: string }}
 */
export function resolveLockedShowtimeToCandidate(lock, candidates) {
  const key = lock?.performanceKey;
  if (!key) return { ok: false, code: 'locked_showtime_unresolved' };
  const list = Array.isArray(candidates) ? candidates : [];
  const match = list.find((c) => c?.performanceKey === key);
  if (!match) return { ok: false, code: 'locked_showtime_unresolved' };
  return { ok: true, candidate: match };
}

/**
 * Attach performanceKey to a candidate built from a planner row.
 * @param {object} candidate
 * @returns {object}
 */
export function withCandidatePerformanceKey(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  if (candidate.performanceKey) return candidate;
  const key = buildPerformanceKeyFromPlannerRow(candidate.row ?? candidate);
  return key ? { ...candidate, performanceKey: key } : candidate;
}

export { buildPerformanceKey, buildPerformanceKeyFromPlannerRow };
