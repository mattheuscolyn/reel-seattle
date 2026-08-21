/**
 * Structured Build-a-Plan draft constraint validation (PR1 / PLAN-10 foundation).
 */

import {
  filmMatchesToken,
} from '../../src/utils/plannerEngine.js';
import { parsePlannerShowtimeMinutes } from '../../src/utils/timeUtils.js';
import { calculateExpectedEndTime } from '../../src/utils/plannerBufferPolicy.js';
import { isValidSequence } from '../../src/utils/plannerBufferPolicy.js';
import { filmIdentityTokensFromCards } from '../identity/filmIdentity.js';
import { normalizePlanSize } from './planSize.js';
import {
  normalizeLockedShowtimes,
  resolveLockedShowtimeToCandidate,
  withCandidatePerformanceKey,
} from './lockedShowtimes.js';
import { buildPerformanceKeyFromPlannerRow } from '../identity/performanceIdentity.js';

/**
 * @typedef {{
 *   code: string,
 *   message: string,
 *   relatedPerformanceKeys?: string[],
 *   relatedFilmKeys?: string[],
 * }} PlannerConstraintConflict
 */

/**
 * @param {object} row
 * @returns {object | null}
 */
function rowToLightCandidate(row) {
  if (!row || typeof row !== 'object') return null;
  const startMin = parsePlannerShowtimeMinutes(row.Time);
  const runtime =
    typeof row.Runtime === 'number' ? row.Runtime : Number(row.Runtime);
  if (startMin == null || !Number.isFinite(runtime) || runtime <= 0) return null;
  const expected = calculateExpectedEndTime({ startMin, runtime }, runtime);
  if (!expected.ok || expected.endMin == null) return null;
  const filmKey = String(row.showtime_film_key ?? row.filmKey ?? '').trim();
  const title = String(row.Film ?? '').trim();
  const filmId = row.filmId ? String(row.filmId).trim() : null;
  const parentKey = row.parentFilmKey
    ? String(row.parentFilmKey).trim()
    : row.parent_film_key
      ? String(row.parent_film_key).trim()
      : null;
  return withCandidatePerformanceKey({
    row,
    identity: { key: filmKey || title, title, filmId, parentKey },
    film: title,
    filmKey: filmKey || title,
    filmId,
    parentFilmKey: parentKey,
    theater: String(row.Theater ?? '').trim(),
    theater_id: String(row.theater_id ?? '').trim(),
    date: String(row.Date ?? '').trim(),
    time: String(row.Time ?? '').trim(),
    startMin,
    endMin: expected.endMin,
    runtime,
    performanceKey: buildPerformanceKeyFromPlannerRow(row),
  });
}

/**
 * @param {object[]} rows
 * @returns {object[]}
 */
export function buildCandidatesFromPlannerRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {object[]} */
  const out = [];
  for (const row of list) {
    const c = rowToLightCandidate(row);
    if (c?.performanceKey) out.push(c);
  }
  return out;
}

/**
 * @param {object} a
 * @param {object} b
 * @param {{ minGapMin?: number | null, maxGapMin?: number | null, allowRepeatFilms?: boolean }} filters
 */
function locksCompatibleInOrder(a, b, filters) {
  if (!filters.allowRepeatFilms) {
    if (a.filmKey && b.filmKey && a.filmKey === b.filmKey) return false;
    if (a.filmId && b.filmId && a.filmId === b.filmId) return false;
    if (
      a.parentFilmKey &&
      b.parentFilmKey &&
      a.parentFilmKey === b.parentFilmKey
    ) {
      return false;
    }
  }
  const sameVenue = Boolean(
    a.theater_id && b.theater_id && a.theater_id === b.theater_id,
  );
  const sequence = isValidSequence(
    { startMin: a.startMin, runtime: a.runtime, theater_id: a.theater_id },
    { startMin: b.startMin, theater_id: b.theater_id },
    { sameVenue },
  );
  if (!sequence.valid) return false;
  const gap = b.startMin - a.endMin;
  if (filters.minGapMin != null && gap < filters.minGapMin) return false;
  if (filters.maxGapMin != null && gap > filters.maxGapMin) return false;
  return true;
}

/**
 * @param {{
 *   form: object,
 *   rows: object[],
 *   filters: object,
 *   dateIso: string,
 *   theaterIds: string[],
 * }} args
 * @returns {{
 *   ok: boolean,
 *   conflicts: PlannerConstraintConflict[],
 *   resolvedLocks: object[],
 *   planSize: ReturnType<typeof normalizePlanSize>,
 * }}
 */
export function validatePlannerDraftConstraints({
  form,
  rows,
  filters,
  dateIso,
  theaterIds,
}) {
  /** @type {PlannerConstraintConflict[]} */
  const conflicts = [];
  const planSize = normalizePlanSize(form?.planSize);
  const locks = normalizeLockedShowtimes(form?.lockedShowtimes);
  const candidates = buildCandidatesFromPlannerRows(rows);
  const allowRepeatFilms = Boolean(filters?.allowRepeatFilms);
  const gapFilters = {
    minGapMin: filters?.minGapMin ?? null,
    maxGapMin: filters?.maxGapMin ?? null,
    allowRepeatFilms,
  };

  /** @type {object[]} */
  const resolvedLocks = [];
  for (const lock of locks) {
    const resolved = resolveLockedShowtimeToCandidate(lock, candidates);
    if (!resolved.ok) {
      conflicts.push({
        code: 'locked_showtime_unresolved',
        message: `Locked screening “${lock.title}” is no longer available in the current showtimes data.`,
        relatedPerformanceKeys: [lock.performanceKey],
      });
      continue;
    }
    resolvedLocks.push(resolved.candidate);
  }

  // Sort resolved locks chronologically for overlap / multi-lock checks.
  resolvedLocks.sort(
    (a, b) =>
      a.startMin - b.startMin ||
      String(a.performanceKey).localeCompare(String(b.performanceKey)),
  );

  for (let i = 0; i < resolvedLocks.length - 1; i += 1) {
    const a = resolvedLocks[i];
    const b = resolvedLocks[i + 1];
    if (!locksCompatibleInOrder(a, b, gapFilters)) {
      conflicts.push({
        code: 'locked_showtimes_overlap',
        message:
          'Two locked screenings overlap or leave too little time between them. Unlock one, or widen the break window.',
        relatedPerformanceKeys: [a.performanceKey, b.performanceKey].filter(
          Boolean,
        ),
      });
    }
  }

  const theaterSet = Array.isArray(theaterIds) ? theaterIds.filter(Boolean) : [];
  const lockTheaters = [
    ...new Set(resolvedLocks.map((c) => c.theater_id).filter(Boolean)),
  ];
  if (lockTheaters.length > 1) {
    conflicts.push({
      code: 'locked_showtimes_multiple_theaters',
      message:
        'Locked screenings are at different theaters. Same-theater plans can’t include both yet.',
      relatedPerformanceKeys: resolvedLocks
        .map((c) => c.performanceKey)
        .filter(Boolean),
    });
  }

  for (const candidate of resolvedLocks) {
    if (candidate.date && dateIso && candidate.date !== dateIso) {
      conflicts.push({
        code: 'locked_showtime_date_mismatch',
        message: `Locked screening “${candidate.film}” is not on the selected plan date.`,
        relatedPerformanceKeys: [candidate.performanceKey].filter(Boolean),
      });
    }
    if (
      theaterSet.length &&
      candidate.theater_id &&
      !theaterSet.includes(candidate.theater_id) &&
      !theaterSet.includes(candidate.theater)
    ) {
      conflicts.push({
        code: 'locked_showtime_theater_mismatch',
        message: `Locked screening “${candidate.film}” is outside the selected theater filter.`,
        relatedPerformanceKeys: [candidate.performanceKey].filter(Boolean),
      });
    }
    if (
      filters?.startAfterMin != null &&
      candidate.startMin < filters.startAfterMin
    ) {
      conflicts.push({
        code: 'locked_showtime_outside_time_window',
        message: `Locked screening “${candidate.film}” starts before your “start after” time.`,
        relatedPerformanceKeys: [candidate.performanceKey].filter(Boolean),
      });
    }
    if (
      filters?.finishByMin != null &&
      candidate.endMin > filters.finishByMin
    ) {
      conflicts.push({
        code: 'locked_showtime_outside_time_window',
        message: `Locked screening “${candidate.film}” ends after your “finish before” time.`,
        relatedPerformanceKeys: [candidate.performanceKey].filter(Boolean),
      });
    }
  }

  const lockCount = locks.length;
  if (planSize.mode !== 'max' && lockCount > planSize.max) {
    conflicts.push({
      code: 'plan_size_smaller_than_locks',
      message: `Plan size allows at most ${planSize.max} film${planSize.max === 1 ? '' : 's'}, but ${lockCount} screenings are locked.`,
      relatedPerformanceKeys: locks.map((l) => l.performanceKey),
    });
  }

  const mustTokens = filmIdentityTokensFromCards(form?.mustInclude);
  const excludeTokens = [
    ...filmIdentityTokensFromCards(form?.notInterested),
    ...(Array.isArray(filters?.excludeFilms) ? filters.excludeFilms : []),
  ];
  // Dedupe exclude tokens
  const excludeSet = [...new Set(excludeTokens.map(String))];

  for (const token of mustTokens) {
    if (excludeSet.some((ex) => String(ex) === String(token))) {
      conflicts.push({
        code: 'must_include_not_interested',
        message:
          'A film can’t be both Must Include and Not Interested. Remove it from one list.',
        relatedFilmKeys: [String(token)],
      });
    }
  }

  for (const lock of locks) {
    const identity = {
      key: lock.filmKey ?? '',
      title: lock.title ?? '',
      filmId: lock.filmId,
      parentKey: lock.parentFilmKey,
    };
    if (excludeSet.some((token) => filmMatchesToken(token, identity))) {
      conflicts.push({
        code: 'locked_film_not_interested',
        message: `“${lock.title}” is locked and also marked Not Interested. Unlock it or remove Not Interested.`,
        relatedPerformanceKeys: [lock.performanceKey],
        relatedFilmKeys: [lock.filmKey].filter(Boolean),
      });
    }
  }

  // Must Include eligibility against date / theater / time hard universe.
  const dateRows = (Array.isArray(rows) ? rows : []).filter(
    (row) => row.Date === dateIso,
  );
  for (const token of mustTokens) {
    const eligible = dateRows.some((row) => {
      if (
        theaterSet.length &&
        !theaterSet.includes(row.theater_id) &&
        !theaterSet.includes(row.Theater)
      ) {
        return false;
      }
      const c = rowToLightCandidate(row);
      if (!c) return false;
      if (
        filters?.startAfterMin != null &&
        c.startMin < filters.startAfterMin
      ) {
        return false;
      }
      if (filters?.finishByMin != null && c.endMin > filters.finishByMin) {
        return false;
      }
      return filmMatchesToken(token, c.identity);
    });
    // Satisfied by a lock of that film counts as eligible.
    const satisfiedByLock = resolvedLocks.some((c) =>
      filmMatchesToken(token, c.identity),
    );
    if (!eligible && !satisfiedByLock) {
      conflicts.push({
        code: 'must_include_no_eligible_performance',
        message:
          'A Must Include film has no matching screening under the current date, theater, and time window.',
        relatedFilmKeys: [String(token)],
      });
    }
  }

  // Deduplicate conflict codes+keys
  const seen = new Set();
  const unique = [];
  for (const c of conflicts) {
    const key = `${c.code}|${(c.relatedPerformanceKeys ?? []).join(',')}|${(c.relatedFilmKeys ?? []).join(',')}|${c.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  return {
    ok: unique.length === 0,
    conflicts: unique,
    resolvedLocks,
    planSize,
  };
}

/**
 * Build a locked showtime draft object from a planner row (for tests / PR2).
 * @param {object} row
 * @param {object} [extra]
 */
export function lockedShowtimeFromPlannerRow(row, extra = {}) {
  return (
    normalizeLockedShowtimes([
      {
        ...extra,
        title: row.Film,
        filmKey: row.filmKey ?? row.showtime_film_key,
        filmId: row.filmId,
        parentFilmKey: row.parentFilmKey ?? row.parent_film_key,
        theaterId: row.theater_id,
        theaterName: row.Theater,
        localDate: row.localDate ?? row.Date,
        localTime: row.localTime,
        runtimeMin: row.Runtime,
        source: row.source,
        sourceShowtimeId: row.source_showtime_id,
        opportunityKey: row.opportunityKey,
        performanceKey: buildPerformanceKeyFromPlannerRow(row),
      },
    ])[0] ?? null
  );
}
