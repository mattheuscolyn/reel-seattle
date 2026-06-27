import { getMoviePopularity, moviesFromRows } from './movieUtils.js';
import { getMovieEndTime, parseRuntimeMinutes, parseTimeToMinutes } from './timeUtils.js';

/**
 * Double Feature pairing engine.
 * Expects legacy showtime rows where `Time` is a compact string like "7:30PM"
 * (see showtimesAdapter / timeUtils), not raw pipeline `time_24h` values.
 */

/** Maximum gap (minutes) between first film end and second film start. */
export const MAX_DOUBLE_FEATURE_GAP_MINUTES = 60;

function isFiniteMinutes(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidRuntime(runtime) {
  return isFiniteMinutes(runtime) && runtime > 0;
}

/**
 * Filter showtime rows for double-feature planning.
 *
 * @param {object[]} rows
 * @param {object} filters
 * @param {{ applyMovieFilter?: boolean }} options
 */
export function filterDoubleFeatureRows(
  rows,
  {
    selectedDate,
    selectedTheaters = [],
    earliestStartTime = '',
    earliestEndTime = '',
    movieFilterType = 'none',
    selectedMovies = [],
  },
  { applyMovieFilter = false } = {},
) {
  if (!selectedDate) return [];

  let filtered = rows.filter((row) => {
    if (row.Date !== selectedDate) return false;
    if (selectedTheaters.length > 0 && !selectedTheaters.includes(row.Theater)) return false;
    if (parseRuntimeMinutes(row.Runtime) === null) return false;

    if (applyMovieFilter) {
      if (movieFilterType === 'whitelist' && selectedMovies.length > 0) {
        if (!selectedMovies.includes(row.Film)) return false;
      } else if (movieFilterType === 'blacklist' && selectedMovies.length > 0) {
        if (selectedMovies.includes(row.Film)) return false;
      }
    }

    return true;
  });

  if (earliestStartTime) {
    const earliestStart = parseTimeToMinutes(earliestStartTime);
    if (earliestStart !== null) {
      filtered = filtered.filter((row) => {
        const start = parseTimeToMinutes(row.Time);
        return start !== null && start >= earliestStart;
      });
    }
  }

  if (earliestEndTime) {
    const earliestEnd = parseTimeToMinutes(earliestEndTime);
    if (earliestEnd !== null) {
      filtered = filtered.filter((row) => {
        const end = getMovieEndTime(row.Time, row.Runtime);
        return end !== null && end >= earliestEnd;
      });
    }
  }

  return filtered;
}

/** Unique films available for movie picker controls. */
export function buildDoubleFeatureMovieOptions(filteredRows) {
  return moviesFromRows(filteredRows);
}

/** Group filtered rows by theater and film with parsed showtimes. */
export function groupShowtimesByTheaterAndFilm(filteredRows) {
  const byTheater = {};

  filteredRows.forEach((row) => {
    const runtime = parseRuntimeMinutes(row.Runtime);
    if (runtime === null) return;

    const timeMinutes = parseTimeToMinutes(row.Time);
    if (timeMinutes === null) return;

    if (!byTheater[row.Theater]) byTheater[row.Theater] = {};
    if (!byTheater[row.Theater][row.Film]) {
      byTheater[row.Theater][row.Film] = {
        film: row.Film,
        runtime,
        poster: row.posterDynamic,
        showtimes: [],
      };
    }
    byTheater[row.Theater][row.Film].showtimes.push({
      time: row.Time,
      timeMinutes,
    });
  });

  return byTheater;
}

function tryAddPair(pairs, theater, firstFilm, firstShowtime, secondFilm, secondShowtime, popularity) {
  if (
    !hasValidRuntime(firstFilm.runtime) ||
    !hasValidRuntime(secondFilm.runtime) ||
    !isFiniteMinutes(firstShowtime.timeMinutes) ||
    !isFiniteMinutes(secondShowtime.timeMinutes)
  ) {
    return;
  }

  const endFirst = firstShowtime.timeMinutes + firstFilm.runtime;
  const startSecond = secondShowtime.timeMinutes;
  if (!isFiniteMinutes(endFirst) || !isFiniteMinutes(startSecond) || startSecond <= endFirst) {
    return;
  }

  const gap = startSecond - endFirst;
  if (!isFiniteMinutes(gap) || gap >= MAX_DOUBLE_FEATURE_GAP_MINUTES) {
    return;
  }

  pairs.push({
    theater,
    movieA: { ...firstFilm, showtime: firstShowtime.time },
    movieB: { ...secondFilm, showtime: secondShowtime.time },
    gap,
    popularity,
  });
}

/**
 * Pair two films when a valid A-then-B or B-then-A schedule exists.
 * Returns zero, one, or two pair objects (both orderings when both work).
 */
export function pairTwoFilms(theater, movieA, movieB, rows) {
  if (!hasValidRuntime(movieA.runtime) || !hasValidRuntime(movieB.runtime)) {
    return [];
  }

  const pairs = [];
  const popularity =
    getMoviePopularity(rows, movieA.film) + getMoviePopularity(rows, movieB.film);

  movieA.showtimes.forEach((showtimeA) => {
    movieB.showtimes.forEach((showtimeB) => {
      tryAddPair(pairs, theater, movieA, showtimeA, movieB, showtimeB, popularity);
      tryAddPair(pairs, theater, movieB, showtimeB, movieA, showtimeA, popularity);
    });
  });

  return pairs;
}

/** Sort pairs by popularity (desc), gap (asc), then film names. */
export function sortDoubleFeaturePairs(pairs) {
  return [...pairs].sort((a, b) => {
    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
    if (a.gap !== b.gap) return a.gap - b.gap;
    return `${a.movieA.film}-${a.movieB.film}`.localeCompare(
      `${b.movieA.film}-${b.movieB.film}`,
    );
  });
}

/**
 * Find render-ready double-feature pairs from current-window rows.
 *
 * @param {object[]} rows - full showtime rows (for popularity counts)
 * @param {object} filters - planner filter state
 */
export function findDoubleFeaturePairs(rows, filters) {
  const filtered = filterDoubleFeatureRows(rows, filters, { applyMovieFilter: true });
  const byTheater = groupShowtimesByTheaterAndFilm(filtered);
  const pairs = [];

  Object.entries(byTheater).forEach(([theater, films]) => {
    const filmList = Object.values(films).filter((film) => hasValidRuntime(film.runtime));
    for (let i = 0; i < filmList.length; i++) {
      for (let j = i + 1; j < filmList.length; j++) {
        pairs.push(...pairTwoFilms(theater, filmList[i], filmList[j], rows));
      }
    }
  });

  return sortDoubleFeaturePairs(pairs);
}
