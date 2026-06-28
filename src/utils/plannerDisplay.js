import {
  formatGapMinutes,
  formatRuntimeMinutes,
  formatScheduleDuration,
  formatTheaterName,
} from './doubleFeatureDisplay.js';
import { DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES } from './plannerEngine.js';
import { formatMinutesToTime, parseTimeToMinutes } from './timeUtils.js';

/** UI options for the film-count control on `/planner`. */
export const FILM_COUNT_OPTIONS = [
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 'max', label: 'As many as possible' },
];

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
 * Gap defaults: 2-film mode uses maxGapMin 59 (legacy Double Feature uses gap < 60).
 * 3, 4, and max modes leave maxGapMin unset.
 *
 * @param {object} options
 * @param {string} options.date
 * @param {string[]} options.theaters
 * @param {number | string} options.filmCount
 * @param {string} [options.startAfter]
 * @param {string} [options.finishBy]
 */
export function buildPlannerSearchFilters({ date, theaters, filmCount, startAfter, finishBy }) {
  const safeCount =
    filmCount === 'max'
      ? 'max'
      : filmCount === 2 || filmCount === 3 || filmCount === 4
        ? filmCount
        : Number(filmCount) === 2 || Number(filmCount) === 3 || Number(filmCount) === 4
          ? Number(filmCount)
          : 2;

  const filters = {
    date,
    theaters: Array.isArray(theaters) ? theaters : [],
    filmCount: safeCount,
    startAfterMin: parsePlannerTimeInput(startAfter),
    finishByMin: parsePlannerTimeInput(finishBy),
    minGapMin: null,
    maxGapMin: null,
  };

  if (safeCount === 2) {
    filters.maxGapMin = DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES - 1;
  }

  return filters;
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
