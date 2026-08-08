/**
 * Live same-theater planner generation for v2 Results (T-PENG-01).
 *
 * Reuses `findSchedules` + shared buffer policy for 2+ film chains.
 * Adds single-film itineraries when plan size includes 1.
 * Walk / budget / multi-theater miles stay suppressed.
 */

import {
  findSchedules,
  filmMatchesToken,
  DEFAULT_PLANNER_LIMITS,
} from '../../src/utils/plannerEngine.js';
import { calculateExpectedEndTime } from '../../src/utils/plannerBufferPolicy.js';
import { parsePlannerShowtimeMinutes } from '../../src/utils/timeUtils.js';
import { formatMinutesToTime } from '../../src/utils/timeUtils.js';
import { formatTheaterAddressLabel } from '../theaters/resolveTheaterPresentation.js';
import { homeDataToPlannerRows } from './homeDataToPlannerRows.js';
import { mapBuildFormToPlannerFilters } from './mapBuildFormToPlannerFilters.js';
import { filmIdentityTokensFromCards } from '../identity/filmIdentity.js';
import { getNotInterestedFilms } from '../stores/notInterestedFilmsStore.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';

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
 * @param {string | null | undefined} sortId
 */
export function mapResultsSortToEngineSort(sortId) {
  switch (sortId) {
    case 'smallest-gaps':
      return 'smallest_gaps';
    case 'shortest-runtime':
    case 'earliest-finish':
      return 'shortest_span';
    case 'leaves-soonest':
    case 'best-match':
    default:
      return 'earliest_start';
  }
}

/**
 * @param {number} minutes
 */
function formatClockLabel(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const within = ((minutes % 1440) + 1440) % 1440;
  // Match Results mockup spacing ("2:00 PM") while engine Time stays compact.
  return formatMinutesToTime(within, { showNextDayOffset: false }).replace(
    /(AM|PM)$/i,
    ' $1',
  );
}

/**
 * @param {number} totalMin
 */
function formatTotalRuntimeLabel(totalMin) {
  if (!Number.isFinite(totalMin) || totalMin < 0) return '';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m total`;
  if (m === 0) return `${h}h total`;
  return `${h}h ${m}m total`;
}

/**
 * @param {number} runtime
 */
function formatRuntimeLabel(runtime) {
  if (!Number.isFinite(runtime)) return '';
  const h = Math.floor(runtime / 60);
  const m = runtime % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * @param {object} movie
 * @param {object | null | undefined} homeData
 * @param {string} planId
 * @param {number} index
 * @param {object | null} [row]
 */
function movieToLiveResultsFilm(movie, homeData, planId, index, row = null) {
  const theaterId =
    asTrimmed(movie.theater_id) ?? asTrimmed(row?.theater_id) ?? null;
  const theaterMeta =
    (theaterId && homeData?.theatersById?.[theaterId]) ||
    (Array.isArray(homeData?.theaters)
      ? homeData.theaters.find((t) => t.id === theaterId)
      : null);

  const localDate =
    asTrimmed(movie.date) ?? asTrimmed(row?.localDate) ?? asTrimmed(row?.Date);
  let localTime = asTrimmed(row?.localTime);
  if (!localTime && typeof movie.startMin === 'number') {
    const within = ((movie.startMin % 1440) + 1440) % 1440;
    localTime = `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(
      within % 60,
    ).padStart(2, '0')}`;
  }

  const format =
    asTrimmed(movie.premiumFormat)?.split(',')[0]?.trim() ||
    (Array.isArray(row?.formatLabels) ? row.formatLabels[0] : null) ||
    null;

  return {
    id: `${planId}-f${index + 1}`,
    title: movie.film,
    startTime: formatClockLabel(movie.startMin),
    endTime: formatClockLabel(movie.endMin),
    theater: movie.theater,
    runtimeLabel: formatRuntimeLabel(movie.runtime),
    formatBadge: format ? String(format).toUpperCase() : null,
    imageUrl: movie.poster ?? row?.posterDynamic ?? null,
    preference: 'neutral',
    date: localDate,
    localDate,
    time: localTime,
    localTime,
    runtime: movie.runtime,
    runtimeMin: movie.runtime,
    theaterId,
    theater_id: theaterId,
    theaterName: movie.theater,
    filmKey: asTrimmed(movie.showtime_film_key) ?? asTrimmed(row?.filmKey),
    filmId: movie.filmId ?? row?.filmId ?? null,
    parentFilmKey:
      asTrimmed(movie.parent_film_key) ?? asTrimmed(row?.parentFilmKey),
    showtimeFilmKey:
      asTrimmed(movie.showtime_film_key) ?? asTrimmed(row?.filmKey),
    source: asTrimmed(row?.source),
    sourceShowtimeId: asTrimmed(row?.source_showtime_id),
    source_showtime_id: asTrimmed(row?.source_showtime_id),
    opportunityKey: asTrimmed(row?.opportunityKey),
    ticketUrl: row?.ticket_url ?? null,
    ticket_url: row?.ticket_url ?? null,
    addressLabel: formatTheaterAddressLabel(theaterMeta),
    format,
    formatLabel: format,
  };
}

/**
 * @param {object[]} rows
 * @param {object} movie
 */
function findRowForMovie(rows, movie) {
  return (
    rows.find(
      (r) =>
        r.showtime_film_key === movie.showtime_film_key &&
        r.Date === movie.date &&
        (r.theater_id === movie.theater_id || r.Theater === movie.theater),
    ) ?? null
  );
}

/**
 * @param {object} schedule
 * @param {object | null | undefined} homeData
 * @param {object[]} rows
 * @param {number} rank
 */
export function mapEngineScheduleToResultsPlan(schedule, homeData, rows, rank) {
  const movies = Array.isArray(schedule.movies) ? schedule.movies : [];
  const planId = `live-${asTrimmed(schedule.theater_id) || 'theater'}-${rank}-${movies
    .map((m) => m.showtime_film_key || m.film)
    .join('+')
    .replace(/[^a-zA-Z0-9+_:-]+/g, '-')
    .slice(0, 96)}`;

  /** @type {object[]} */
  const items = [];
  for (let i = 0; i < movies.length; i += 1) {
    const row = findRowForMovie(rows, movies[i]);
    items.push(movieToLiveResultsFilm(movies[i], homeData, planId, i, row));
    const next = movies[i + 1];
    if (!next) continue;
    const gap = next.startMin - movies[i].endMin;
    if (gap >= 5) {
      const h = Math.floor(gap / 60);
      const m = gap % 60;
      const gapLabel =
        h > 0 ? (m ? `Break ${h}h ${m}m` : `Break ${h}h`) : `Break ${m}m`;
      items.push({
        id: `${planId}-b${i + 1}`,
        type: 'break',
        label: gapLabel,
      });
    }
  }

  const breaks = items.filter((i) => i.type === 'break').length;
  const finishLabel = formatClockLabel(schedule.endMin);

  return {
    id: planId,
    rank,
    provenance: 'live',
    source: 'live',
    date: movies[0]?.date ?? null,
    movieCountLabel: `${schedule.filmCount} MOVIE${schedule.filmCount === 1 ? '' : 'S'}`,
    totalRuntime: formatTotalRuntimeLabel(schedule.filmRuntimeMin),
    walkLabel: null,
    breaksLabel:
      breaks > 0
        ? `${breaks} break${breaks === 1 ? '' : 's'}`
        : 'No breaks',
    finishesLabel: finishLabel ? `Finishes ${finishLabel}` : '',
    items,
    theaterId: schedule.theater_id ?? null,
    theaterName: schedule.theater ?? null,
  };
}

/**
 * @param {object} row
 * @param {string[]} tokens
 */
function rowMatchesAnyToken(row, tokens) {
  if (!tokens.length) return false;
  const identity = {
    key: String(row.showtime_film_key ?? row.Film ?? '').trim(),
    title: String(row.Film ?? '').trim(),
    filmId: row.filmId ? String(row.filmId).trim() : null,
    parentKey: row.parentFilmKey
      ? String(row.parentFilmKey).trim()
      : row.parent_film_key
        ? String(row.parent_film_key).trim()
        : null,
  };
  return tokens.some((token) => filmMatchesToken(token, identity));
}

/**
 * @param {object[]} rows
 * @param {object} filters
 */
function buildSingleFilmSchedules(rows, filters) {
  const theaterSet = Array.isArray(filters.theaters) ? filters.theaters : [];
  console.log('[buildSingleFilmSchedules] theaterSet:', theaterSet);
  const include = filters.includeFilms ?? [];
  const exclude = filters.excludeFilms ?? [];
  /** @type {object[]} */
  const out = [];

  for (const row of rows) {
    if (row.Date !== filters.date) continue;
    if (
      theaterSet.length &&
      !theaterSet.includes(row.theater_id) &&
      !theaterSet.includes(row.Theater)
    ) {
      continue;
    }

    const title = String(row.Film ?? '');
    const key = String(row.showtime_film_key ?? title);
    if (exclude.length && rowMatchesAnyToken(row, exclude)) continue;
    if (include.length && !rowMatchesAnyToken(row, include)) continue;

    const startMin = parsePlannerShowtimeMinutes(row.Time);
    const runtime =
      typeof row.Runtime === 'number' ? row.Runtime : Number(row.Runtime);
    if (startMin == null || !Number.isFinite(runtime) || runtime <= 0) continue;

    const expected = calculateExpectedEndTime(
      { startMin, runtime },
      runtime,
      { planner: true },
    );
    if (!expected.ok || expected.endMin == null) continue;

    if (
      filters.startAfterMin != null &&
      startMin < filters.startAfterMin
    ) {
      continue;
    }
    if (filters.finishByMin != null && expected.endMin > filters.finishByMin) {
      continue;
    }

    out.push({
      theater: row.Theater,
      theater_id: row.theater_id,
      filmCount: 1,
      films: [title],
      movies: [
        {
          film: title,
          showtime_film_key: key,
          filmId: row.filmId ?? null,
          parent_film_key: row.parentFilmKey ?? row.parent_film_key ?? null,
          theater: row.Theater,
          theater_id: row.theater_id,
          date: row.Date,
          time: row.Time,
          startMin,
          endMin: expected.endMin,
          runtime,
          poster: row.posterDynamic ?? null,
          premiumFormat: row.premiumFormat ?? '',
          formatTags: row.formatLabels ?? [],
        },
      ],
      totalSpanMin: expected.endMin - startMin,
      filmRuntimeMin: runtime,
      gapTimeMin: 0,
      transferMinutes: [],
      startMin,
      endMin: expected.endMin,
      preferredMatchCount: 0,
    });
  }

  const seen = new Set();
  return out.filter((s) => {
    const m = s.movies[0];
    const id = `${m.showtime_film_key}|${m.theater_id}|${m.startMin}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * @param {object[]} schedules
 * @param {string} engineSort
 * @param {string[]} preferred
 */
function sortMergedSchedules(schedules, engineSort, preferred) {
  return [...schedules].sort((a, b) => {
    if (preferred.length > 0) {
      const d = (b.preferredMatchCount ?? 0) - (a.preferredMatchCount ?? 0);
      if (d) return d;
    }
    if (engineSort === 'smallest_gaps') {
      return (a.gapTimeMin ?? 0) - (b.gapTimeMin ?? 0) || (a.startMin ?? 0) - (b.startMin ?? 0);
    }
    if (engineSort === 'shortest_span') {
      return (a.totalSpanMin ?? 0) - (b.totalSpanMin ?? 0) || (a.startMin ?? 0) - (b.startMin ?? 0);
    }
    if (engineSort === 'most_films') {
      return (b.filmCount ?? 0) - (a.filmCount ?? 0) || (a.startMin ?? 0) - (b.startMin ?? 0);
    }
    return (a.startMin ?? 0) - (b.startMin ?? 0);
  });
}

/**
 * Expand global Not Interested preferences into planner exclude tokens.
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} homeData
 * @returns {string[]}
 */
function globalNotInterestedTokens(storage, homeData) {
  if (!storage) return [];
  const items = getNotInterestedFilms(storage);
  if (!items.length) return [];

  /** @type {Set<string>} */
  const tokens = new Set();
  for (const item of items) {
    const ref = item.filmRef;
    if (!ref) continue;
    if (ref.filmId) tokens.add(ref.filmId);
    if (ref.showtimeFilmKey) tokens.add(ref.showtimeFilmKey);
    for (const alias of ref.aliasKeys ?? []) {
      if (alias) tokens.add(alias);
    }
  }

  // Include variant filmKeys that share parent / filmId with a NI row.
  for (const film of homeData?.films ?? []) {
    const ref = filmRefFromHomeFilm(film);
    if (!ref) continue;
    const marked = items.some((item) => {
      const a = item.filmRef;
      if (!a) return false;
      if (a.filmId && ref.filmId && a.filmId === ref.filmId) return true;
      if (a.showtimeFilmKey === ref.showtimeFilmKey) return true;
      const aliases = new Set([
        a.showtimeFilmKey,
        ...(a.aliasKeys ?? []),
      ]);
      return (
        aliases.has(film.filmKey) ||
        (film.parentFilmKey && aliases.has(film.parentFilmKey))
      );
    });
    if (marked) {
      for (const token of filmIdentityTokensFromCards([film])) {
        tokens.add(token);
      }
    }
  }

  return [...tokens];
}

/**
 * @param {{
 *   homeData: object | null | undefined,
 *   form: object,
 *   sortId?: string | null,
 *   now?: Date | (() => Date),
 *   maxResults?: number,
 *   storage?: Storage | null,
 * }} args
 */
export function generateLivePlannerResults({
  homeData,
  form,
  sortId = 'best-match',
  now = new Date(),
  maxResults = 40,
  storage = null,
  enrichmentIndex = null,
}) {
  if (!homeData) {
    return {
      ok: false,
      source: 'live',
      provenance: 'live',
      plans: [],
      error: 'missing_home_data',
      message: 'Showtimes aren’t loaded yet.',
      meta: null,
      summaryLine: '',
      plansFoundLabel: '0 plans found',
    };
  }

  const rows = homeDataToPlannerRows(homeData, { enrichmentIndex });
  const mapped = mapBuildFormToPlannerFilters(form, homeData, { now });
  const globalExclude = globalNotInterestedTokens(storage, homeData);
  if (globalExclude.length) {
    const merged = new Set([
      ...(mapped.filters.excludeFilms ?? []),
      ...globalExclude,
    ]);
    mapped.filters.excludeFilms = [...merged];
  }
  const engineSort = mapResultsSortToEngineSort(sortId);
  const countList =
    mapped.filmCounts === 'max'
      ? ['max']
      : Array.isArray(mapped.filmCounts)
        ? mapped.filmCounts
        : [2];

  /** @type {object[]} */
  let schedules = [];

  for (const count of countList) {
    if (count === 1) {
      schedules = schedules.concat(
        buildSingleFilmSchedules(rows, mapped.filters),
      );
      continue;
    }
    const { schedules: found } = findSchedules({
      rows,
      filters: {
        ...mapped.filters,
        filmCount: count === 'max' ? 'max' : count,
      },
      sort: engineSort,
      limits: {
        ...DEFAULT_PLANNER_LIMITS,
        maxResults: maxResults * 2,
      },
    });
    schedules = schedules.concat(found);
  }

  schedules = sortMergedSchedules(
    schedules,
    engineSort,
    mapped.filters.preferredFilms ?? [],
  );

  const seen = new Set();
  schedules = schedules.filter((s) => {
    const key = `${s.theater_id}|${(s.movies ?? [])
      .map((m) => `${m.showtime_film_key}:${m.startMin}`)
      .join('>')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const truncated = schedules.length > maxResults;
  schedules = schedules.slice(0, maxResults);

  const plans = schedules.map((s, index) =>
    mapEngineScheduleToResultsPlan(s, homeData, rows, index + 1),
  );

  const summaryLine = [
    mapped.dateIso,
    form?.startAfter && form?.finishBefore
      ? `${form.startAfter} – ${form.finishBefore}`
      : null,
    form?.planSize ?? null,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    ok: true,
    source: 'live',
    provenance: 'live',
    plans,
    error: null,
    message: plans.length
      ? null
      : 'No same-theater plans fit these filters. Try a wider time window or fewer must-include films.',
    meta: {
      rowCount: rows.length,
      planCount: plans.length,
      truncated,
      suppressed: mapped.suppressed,
      dateIso: mapped.dateIso,
    },
    summaryLine,
    plansFoundLabel: `${plans.length} plan${plans.length === 1 ? '' : 's'} found`,
  };
}
