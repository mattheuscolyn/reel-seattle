/**
 * Unified same-theater schedule planner.
 *
 * Accepts legacy showtime rows from showtimesAdapter / useShowtimesData and
 * returns ordered multi-film chains (2+ films) for one theater at a time.
 *
 * @see docs/unified-planner-design.md
 */

import { isShowtimeCanceled } from './showtimeFilters.js';
import {
  formatMinutesToTime,
  parsePlannerShowtimeMinutes,
  parseRuntimeMinutes,
} from './timeUtils.js';
import {
  calculateExpectedEndTime,
  getTransferMinutes,
  isValidSequence,
} from './plannerBufferPolicy.js';

/** Default maximum gap (minutes) aligned with legacy Double Feature behavior. */
export const TWO_FILM_EXCLUSIVE_GAP_CEILING_MINUTES = 60;

export const PLANNER_SORT_MODES = [
  'earliest_start',
  'shortest_span',
  'longest_span',
  'most_films',
  'smallest_gaps',
  'latest_finish',
];

export const DEFAULT_PLANNER_LIMITS = {
  maxResults: 200,
  maxChainDepth: 8,
};

const DEFAULT_FILTERS = {
  date: '',
  theaters: [],
  filmCount: 2,
  startAfterMin: null,
  finishByMin: null,
  minGapMin: null,
  maxGapMin: null,
  includeFilms: [],
  excludeFilms: [],
  firstFilm: null,
  lastFilm: null,
  preferredFilms: [],
  allowRepeatFilms: false,
};

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v).trim()).filter(Boolean);
}

function normalizeFilmCount(value) {
  if (value === 'max') return 'max';
  const n = Number(value);
  if (n === 2 || n === 3 || n === 4) return n;
  return 2;
}

/** @returns {import('./plannerEngine.js').PlannerFilters} */
export function normalizePlannerFilters(filters = {}) {
  return {
    date: String(filters.date ?? DEFAULT_FILTERS.date).trim(),
    theaters: normalizeStringList(filters.theaters),
    filmCount: normalizeFilmCount(filters.filmCount),
    startAfterMin:
      filters.startAfterMin == null || filters.startAfterMin === ''
        ? null
        : Number(filters.startAfterMin),
    finishByMin:
      filters.finishByMin == null || filters.finishByMin === ''
        ? null
        : Number(filters.finishByMin),
    minGapMin:
      filters.minGapMin == null || filters.minGapMin === ''
        ? null
        : Number(filters.minGapMin),
    maxGapMin:
      filters.maxGapMin == null || filters.maxGapMin === ''
        ? null
        : Number(filters.maxGapMin),
    includeFilms: normalizeStringList(filters.includeFilms),
    excludeFilms: normalizeStringList(filters.excludeFilms),
    firstFilm: filters.firstFilm ? String(filters.firstFilm).trim() : null,
    lastFilm: filters.lastFilm ? String(filters.lastFilm).trim() : null,
    preferredFilms: normalizeStringList(filters.preferredFilms),
    allowRepeatFilms: Boolean(filters.allowRepeatFilms),
  };
}

function normalizeLimits(limits = {}) {
  return {
    maxResults:
      limits.maxResults == null ? DEFAULT_PLANNER_LIMITS.maxResults : Number(limits.maxResults),
    maxChainDepth:
      limits.maxChainDepth == null
        ? DEFAULT_PLANNER_LIMITS.maxChainDepth
        : Number(limits.maxChainDepth),
  };
}

function filmIdentityFromRow(row) {
  const title = String(row.Film ?? '').trim();
  const key = String(row.showtime_film_key ?? '').trim() || title;
  return { key, title };
}

/** Match filter token against film key or display title (case-insensitive for titles). */
export function filmMatchesToken(token, identity) {
  const needle = String(token).trim();
  if (!needle) return false;
  if (needle === identity.key) return true;
  if (needle.toLowerCase() === identity.title.toLowerCase()) return true;
  return false;
}

function rowMatchesAnyToken(tokenList, identity) {
  return tokenList.some((token) => filmMatchesToken(token, identity));
}

function theaterMatches(row, theaters) {
  if (!theaters.length) return true;
  const theaterId = String(row.theater_id ?? '').trim();
  const theaterName = String(row.Theater ?? '').trim();
  return theaters.some(
    (t) => t === theaterId || t === theaterName || t.toLowerCase() === theaterName.toLowerCase(),
  );
}

function parseFormatTags(row) {
  const premium = String(row.premiumFormat ?? '').trim();
  if (!premium) return [];
  return premium
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {object} row
 * @returns {object|null} internal candidate
 */
function rowToCandidate(row) {
  if (isShowtimeCanceled(row)) return null;

  const startMin = parsePlannerShowtimeMinutes(row.Time);
  const runtime = parseRuntimeMinutes(row.Runtime);
  if (startMin === null || runtime === null) return null;

  // D17 / T-BUF-01: expected end = advertised start + preshow + runtime.
  const expected = calculateExpectedEndTime(
    { startMin, runtime },
    runtime,
  );
  if (!expected.ok || expected.endMin == null) return null;

  const identity = filmIdentityFromRow(row);
  if (!identity.title) return null;

  return {
    row,
    identity,
    film: identity.title,
    filmKey: identity.key,
    theater: String(row.Theater ?? '').trim(),
    theater_id: String(row.theater_id ?? '').trim(),
    date: String(row.Date ?? '').trim(),
    time: String(row.Time ?? '').trim(),
    startMin,
    endMin: expected.endMin,
    runtime,
    poster: row.posterDynamic || null,
    premiumFormat: String(row.premiumFormat ?? '').trim(),
    formatTags: parseFormatTags(row),
  };
}

function gapBetween(prev, next) {
  return next.startMin - prev.endMin;
}

function canFollow(prev, next, filters) {
  if (!filters.allowRepeatFilms && prev.filmKey === next.filmKey) return false;

  // Same-theater chains always share venue context; also compare canonical IDs.
  const sameVenue = Boolean(
    (prev.theater_id && next.theater_id && prev.theater_id === next.theater_id) ||
      (!prev.theater_id &&
        !next.theater_id &&
        prev.theater &&
        prev.theater === next.theater),
  );
  const sequence = isValidSequence(
    { startMin: prev.startMin, runtime: prev.runtime, theater_id: prev.theater_id },
    { startMin: next.startMin, theater_id: next.theater_id },
    { sameVenue },
  );
  if (!sequence.valid) return false;

  const gap = gapBetween(prev, next);
  if (filters.minGapMin != null && gap < filters.minGapMin) return false;
  if (filters.maxGapMin != null && gap > filters.maxGapMin) return false;

  return true;
}

function chainFilmKeys(chain) {
  return chain.map((c) => c.filmKey);
}

function chainFilmTitles(chain) {
  return chain.map((c) => c.film);
}

function countPreferredMatches(chain, preferredFilms) {
  if (!preferredFilms.length) return 0;
  const identities = chain.map((c) => c.identity);
  let count = 0;
  for (const token of preferredFilms) {
    if (identities.some((id) => filmMatchesToken(token, id))) count += 1;
  }
  return count;
}

function chainMeetsFilmConstraints(chain, filters) {
  const identities = chain.map((c) => c.identity);

  for (const token of filters.excludeFilms) {
    if (identities.some((id) => filmMatchesToken(token, id))) return false;
  }

  for (const token of filters.includeFilms) {
    if (!identities.some((id) => filmMatchesToken(token, id))) return false;
  }

  // preferredFilms are soft ranking preferences — not hard requirements.

  if (filters.firstFilm) {
    if (!filmMatchesToken(filters.firstFilm, identities[0])) return false;
  }

  if (filters.lastFilm) {
    if (!filmMatchesToken(filters.lastFilm, identities[identities.length - 1])) return false;
  }

  return true;
}

function chainMeetsTimeConstraints(chain, filters) {
  if (filters.startAfterMin != null && chain[0].startMin < filters.startAfterMin) return false;
  if (filters.finishByMin != null && chain[chain.length - 1].endMin > filters.finishByMin) {
    return false;
  }
  return true;
}

function summarizeChain(chain, filters) {
  const first = chain[0];
  const last = chain[chain.length - 1];
  const totalSpanMin = last.endMin - first.startMin;
  const filmRuntimeMin = chain.reduce((sum, c) => sum + c.runtime, 0);
  // Break/gap time is idle after each expected end (includes transfer window).
  // Do not use totalSpan − runtime — that would fold preshow into “gap”.
  let gapTimeMin = 0;
  for (let i = 0; i < chain.length - 1; i += 1) {
    gapTimeMin += chain[i + 1].startMin - chain[i].endMin;
  }

  return {
    theater: first.theater,
    theater_id: first.theater_id,
    filmCount: chain.length,
    films: chainFilmTitles(chain),
    movies: chain.map((c) => ({
      film: c.film,
      showtime_film_key: c.filmKey,
      theater: c.theater,
      theater_id: c.theater_id,
      date: c.date,
      time: c.time,
      startMin: c.startMin,
      endMin: c.endMin,
      runtime: c.runtime,
      poster: c.poster,
      premiumFormat: c.premiumFormat,
      formatTags: c.formatTags,
    })),
    totalSpanMin,
    filmRuntimeMin,
    gapTimeMin,
    transferMinutes: getTransferMinutes(first, last, {
      sameVenue: Boolean(
        (first.theater_id &&
          last.theater_id &&
          first.theater_id === last.theater_id) ||
          (!first.theater_id &&
            !last.theater_id &&
            first.theater &&
            first.theater === last.theater),
      ),
    }),
    startMin: first.startMin,
    endMin: last.endMin,
    startLabel: formatMinutesToTime(first.startMin, { showNextDayOffset: true }),
    endLabel: formatMinutesToTime(last.endMin, { showNextDayOffset: true }),
    preferredMatchCount: countPreferredMatches(chain, filters.preferredFilms),
    alternateCount: 1,
  };
}

function findChainsForTheater(candidates, filters, limits) {
  const chains = [];

  function dfs(path, filmsSeen, startIdx) {
    if (path.length >= limits.maxChainDepth) return;

    const last = path[path.length - 1];

    for (let j = startIdx; j < candidates.length; j += 1) {
      const next = candidates[j];
      if (!canFollow(last, next, filters)) continue;

      const nextSeen = filters.allowRepeatFilms ? filmsSeen : new Set(filmsSeen).add(next.filmKey);
      if (!filters.allowRepeatFilms && filmsSeen.has(next.filmKey)) continue;

      const nextPath = path.concat(next);
      dfs(nextPath, nextSeen, j + 1);

      if (nextPath.length >= 2) {
        chains.push(nextPath);
      }
    }
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const st = candidates[i];
    if (filters.startAfterMin != null && st.startMin < filters.startAfterMin) continue;
    dfs([st], new Set([st.filmKey]), i + 1);
  }

  return chains;
}

function filterByFilmCount(schedules, filmCount) {
  if (filmCount === 'max') {
    const maxLen = schedules.reduce((m, s) => Math.max(m, s.filmCount), 0);
    if (maxLen < 2) return [];
    return schedules.filter((s) => s.filmCount === maxLen);
  }
  return schedules.filter((s) => s.filmCount === filmCount);
}

function dedupeByFilmLineup(schedules) {
  const best = new Map();
  for (const schedule of schedules) {
    const key = schedule.movies.map((m) => m.showtime_film_key).join('\0');
    const prev = best.get(key);
    if (!prev || schedule.totalSpanMin < prev.totalSpanMin) {
      best.set(key, schedule);
    }
  }
  return [...best.values()];
}

function resolveDefaultSort(filmCount) {
  return filmCount === 'max' ? 'most_films' : 'earliest_start';
}

function compareSchedules(a, b, sort, filters) {
  if (filters.preferredFilms.length > 0) {
    if (b.preferredMatchCount !== a.preferredMatchCount) {
      return b.preferredMatchCount - a.preferredMatchCount;
    }
  }

  switch (sort) {
    case 'shortest_span':
      if (a.totalSpanMin !== b.totalSpanMin) return a.totalSpanMin - b.totalSpanMin;
      return a.startMin - b.startMin;
    case 'longest_span':
      if (b.totalSpanMin !== a.totalSpanMin) return b.totalSpanMin - a.totalSpanMin;
      return b.filmCount - a.filmCount;
    case 'most_films':
      if (b.filmCount !== a.filmCount) return b.filmCount - a.filmCount;
      return a.totalSpanMin - b.totalSpanMin;
    case 'smallest_gaps':
      if (a.gapTimeMin !== b.gapTimeMin) return a.gapTimeMin - b.gapTimeMin;
      return a.totalSpanMin - b.totalSpanMin;
    case 'latest_finish':
      if (b.endMin !== a.endMin) return b.endMin - a.endMin;
      return b.filmCount - a.filmCount;
    case 'earliest_start':
    default:
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return a.totalSpanMin - b.totalSpanMin;
  }
}

function sortSchedules(schedules, sort, filters, filmCount) {
  const mode = sort || resolveDefaultSort(filmCount);
  const safeSort = PLANNER_SORT_MODES.includes(mode) ? mode : resolveDefaultSort(filmCount);
  return [...schedules].sort((a, b) => compareSchedules(a, b, safeSort, filters));
}

/**
 * Find same-theater multi-film schedules matching planner filters.
 *
 * @param {object} options
 * @param {object[]} options.rows - Legacy showtime rows
 * @param {object} [options.filters]
 * @param {string} [options.sort]
 * @param {object} [options.limits]
 * @returns {{ schedules: object[], meta: object }}
 */
export function findSchedules({ rows, filters: rawFilters = {}, sort, limits: rawLimits = {} }) {
  const filters = normalizePlannerFilters(rawFilters);
  const limits = normalizeLimits(rawLimits);

  if (!filters.date || !Array.isArray(rows) || rows.length === 0) {
    return {
      schedules: [],
      meta: {
        candidateShowtimeCount: 0,
        rawCombinationCount: 0,
        truncated: false,
        theatersSearched: [],
      },
    };
  }

  const candidates = [];
  const byTheater = new Map();

  for (const row of rows) {
    if (row.Date !== filters.date) continue;
    if (!theaterMatches(row, filters.theaters)) continue;

    const candidate = rowToCandidate(row);
    if (!candidate) continue;

    if (filters.excludeFilms.length && rowMatchesAnyToken(filters.excludeFilms, candidate.identity)) {
      continue;
    }

    candidates.push(candidate);
    const groupKey = candidate.theater_id || candidate.theater;
    if (!byTheater.has(groupKey)) byTheater.set(groupKey, []);
    byTheater.get(groupKey).push(candidate);
  }

  let rawCombinationCount = 0;
  let allSchedules = [];

  for (const theaterCandidates of byTheater.values()) {
    theaterCandidates.sort(
      (a, b) =>
        a.startMin - b.startMin ||
        a.filmKey.localeCompare(b.filmKey) ||
        a.time.localeCompare(b.time),
    );

    const rawChains = findChainsForTheater(theaterCandidates, filters, limits);
    rawCombinationCount += rawChains.length;

    const validSummaries = rawChains
      .filter((chain) => chainMeetsFilmConstraints(chain, filters) && chainMeetsTimeConstraints(chain, filters))
      .map((chain) => summarizeChain(chain, filters));

    allSchedules = allSchedules.concat(validSummaries);
  }

  allSchedules = filterByFilmCount(allSchedules, filters.filmCount);
  allSchedules = dedupeByFilmLineup(allSchedules);
  allSchedules = sortSchedules(allSchedules, sort, filters, filters.filmCount);

  const truncated = allSchedules.length > limits.maxResults;
  const schedules = truncated ? allSchedules.slice(0, limits.maxResults) : allSchedules;

  return {
    schedules,
    meta: {
      candidateShowtimeCount: candidates.length,
      rawCombinationCount,
      truncated,
      theatersSearched: [...byTheater.keys()],
    },
  };
}
