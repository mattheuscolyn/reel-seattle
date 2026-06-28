import {
  formatGapMinutes,
  formatRuntimeMinutes,
  formatScheduleDuration,
  formatTheaterName,
} from './doubleFeatureDisplay.js';
import { DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES } from './plannerEngine.js';
import { formatMinutesToTime, parseTimeToMinutes } from './timeUtils.js';

/** Default max gap for 2-film mode (legacy Double Feature uses gap < 60). */
export const DEFAULT_TWO_FILM_MAX_GAP_MINUTES = DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES - 1;

/** UI options for the film-count control on `/planner`. */
export const FILM_COUNT_OPTIONS = [
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 'max', label: 'As many as possible' },
];

/** Sort options exposed in the planner advanced panel. */
export const PLANNER_SORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'earliest_start', label: 'Earliest start' },
  { value: 'shortest_span', label: 'Shortest total span' },
  { value: 'most_films', label: 'Most movies' },
  { value: 'smallest_gaps', label: 'Smallest total gaps' },
  { value: 'latest_finish', label: 'Latest finish' },
];

/**
 * @param {string} sortValue
 * @returns {string}
 */
export function formatPlannerSortLabel(sortValue) {
  const match = PLANNER_SORT_OPTIONS.find((option) => option.value === sortValue);
  return match?.label ?? 'Default';
}

/**
 * Parse comma-separated film titles from a text field.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function parseFilmListInput(value) {
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} films
 * @returns {string}
 */
export function formatFilmListInput(films) {
  if (!Array.isArray(films) || films.length === 0) return '';
  return films.join(', ');
}

/**
 * Parse optional gap minutes from UI input.
 *
 * @param {string | number | null | undefined} value
 * @returns {number | null}
 */
export function parseGapInput(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * @param {number | string} filmCount
 * @returns {string}
 */
export function formatFilmCountLabel(filmCount) {
  if (filmCount === 'max') return 'As many as possible';
  const n = Number(filmCount);
  if (Number.isFinite(n) && n >= 2) return String(n);
  return '2';
}

/**
 * @param {number | null | undefined} minutes
 * @returns {string}
 */
export function formatPlannerTimeLabel(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return 'Unknown';
  return formatMinutesToTime(minutes);
}

/**
 * Parse optional planner time text; returns null when blank or invalid.
 *
 * @param {string | null | undefined} value
 * @returns {number | null}
 */
export function parsePlannerTimeInput(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return parseTimeToMinutes(trimmed);
}

/**
 * Map planner page filter state to `findSchedules` filters.
 *
 * Gap defaults: 2-film mode uses maxGapMin 59 unless maxGapExplicit is true.
 * 3, 4, and max modes leave maxGapMin unset unless explicitly provided.
 *
 * @param {object} options
 * @param {string} options.date
 * @param {string[]} options.theaters
 * @param {number | string} options.filmCount
 * @param {string} [options.startAfter]
 * @param {string} [options.finishBy]
 * @param {string | number} [options.minGapMin]
 * @param {string | number} [options.maxGapMin]
 * @param {boolean} [options.maxGapExplicit]
 * @param {string[]} [options.includeFilms]
 * @param {string[]} [options.excludeFilms]
 * @param {string} [options.firstFilm]
 * @param {string} [options.lastFilm]
 */
export function buildPlannerSearchFilters({
  date,
  theaters,
  filmCount,
  startAfter,
  finishBy,
  minGapMin = '',
  maxGapMin = '',
  maxGapExplicit = false,
  includeFilms = [],
  excludeFilms = [],
  firstFilm = '',
  lastFilm = '',
}) {
  const safeCount =
    filmCount === 'max'
      ? 'max'
      : filmCount === 2 || filmCount === 3 || filmCount === 4
        ? filmCount
        : Number(filmCount) === 2 || Number(filmCount) === 3 || Number(filmCount) === 4
          ? Number(filmCount)
          : 2;

  const parsedMinGap = parseGapInput(minGapMin);
  const parsedMaxGap = parseGapInput(maxGapMin);

  let effectiveMaxGap = null;
  if (maxGapExplicit) {
    effectiveMaxGap = parsedMaxGap;
  } else if (safeCount === 2) {
    effectiveMaxGap = DEFAULT_TWO_FILM_MAX_GAP_MINUTES;
  }

  const filters = {
    date,
    theaters: Array.isArray(theaters) ? theaters : [],
    filmCount: safeCount,
    startAfterMin: parsePlannerTimeInput(startAfter),
    finishByMin: parsePlannerTimeInput(finishBy),
    minGapMin: parsedMinGap,
    maxGapMin: effectiveMaxGap,
    includeFilms: Array.isArray(includeFilms) ? includeFilms : [],
    excludeFilms: Array.isArray(excludeFilms) ? excludeFilms : [],
    firstFilm: firstFilm ? String(firstFilm).trim() : null,
    lastFilm: lastFilm ? String(lastFilm).trim() : null,
  };

  return filters;
}

/**
 * Helper text for max gap field based on film count mode.
 *
 * @param {number | string} filmCount
 * @returns {string}
 */
export function getMaxGapHelperText(filmCount) {
  if (filmCount === 2) {
    return `Leave blank to use the double-feature default (${DEFAULT_TWO_FILM_MAX_GAP_MINUTES} min). Enter a value to override.`;
  }
  return 'Leave blank for no maximum gap between films.';
}

/**
 * @param {object} schedule - Planner schedule from findSchedules
 * @returns {object}
 */
export function formatPlannerScheduleSummary(schedule) {
  return {
    theater: formatTheaterName(schedule?.theater),
    filmCountLabel: formatFilmCountLabel(schedule?.filmCount),
    startTime: schedule?.startLabel || formatPlannerTimeLabel(schedule?.startMin),
    endTime: schedule?.endLabel || formatPlannerTimeLabel(schedule?.endMin),
    totalSpan: formatScheduleDuration(schedule?.totalSpanMin),
    totalGap: formatGapMinutes(schedule?.gapTimeMin),
    filmRuntime: formatScheduleDuration(schedule?.filmRuntimeMin),
  };
}

/**
 * @param {number} count
 * @param {number | string} filmCount
 * @returns {string}
 */
export function formatPlannerResultsHeading(count, filmCount) {
  const noun = count === 1 ? 'Plan' : 'Plans';
  if (filmCount === 'max') {
    return `${count} Schedule ${noun} Found`;
  }
  return `${count} ${formatFilmCountLabel(filmCount)}-Film ${noun} Found`;
}

/**
 * @param {object} movie - Planner schedule movie entry
 * @returns {{ film: string, startTime: string, endTime: string, runtime: string }}
 */
export function formatPlannerMovieDisplay(movie) {
  return {
    film: movie?.film ? String(movie.film) : 'Unknown',
    startTime: movie?.time ? String(movie.time) : formatPlannerTimeLabel(movie?.startMin),
    endTime: formatPlannerTimeLabel(movie?.endMin),
    runtime: formatRuntimeMinutes(movie?.runtime),
  };
}

/**
 * Short summary for share-link / URL-loaded prompts.
 *
 * @param {object} filters
 * @returns {string}
 */
export function formatPlannerSharedFiltersSummary(filters) {
  const parts = [];
  if (filters.selectedDate) parts.push(`date ${filters.selectedDate}`);
  if (filters.selectedTheaters?.length) {
    parts.push(`${filters.selectedTheaters.length} theater(s)`);
  }
  if (filters.filmCount && filters.filmCount !== 2) {
    parts.push(`${formatFilmCountLabel(filters.filmCount)} films`);
  }
  if (filters.startAfter) parts.push(`start after ${filters.startAfter}`);
  if (filters.finishBy) parts.push(`finish by ${filters.finishBy}`);
  if (filters.includeFilms?.length) parts.push(`${filters.includeFilms.length} required film(s)`);
  if (filters.excludeFilms?.length) parts.push(`${filters.excludeFilms.length} excluded film(s)`);
  if (filters.firstFilm) parts.push(`first: ${filters.firstFilm}`);
  if (filters.lastFilm) parts.push(`last: ${filters.lastFilm}`);
  if (filters.sort) parts.push(`sort: ${formatPlannerSortLabel(filters.sort)}`);
  return parts.length > 0 ? parts.join(' · ') : 'shared planner filters';
}
