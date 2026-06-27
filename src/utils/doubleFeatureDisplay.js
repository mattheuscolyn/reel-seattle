import { formatMinutesToTime, getMovieEndTime, parseTimeToMinutes } from './timeUtils.js';

/** Display-only threshold; does not affect pairing acceptance rules. */
export const TIGHT_GAP_THRESHOLD_MINUTES = 15;

/**
 * @param {number | null | undefined} gapMinutes
 * @returns {{ text: string, variant: 'tight' | 'comfortable' | 'unknown' }}
 */
export function getGapLabel(gapMinutes) {
  if (gapMinutes == null || !Number.isFinite(gapMinutes)) {
    return { text: 'Unknown gap', variant: 'unknown' };
  }
  if (gapMinutes < TIGHT_GAP_THRESHOLD_MINUTES) {
    return { text: 'Tight gap', variant: 'tight' };
  }
  return { text: 'Comfortable gap', variant: 'comfortable' };
}

/**
 * @param {number | null | undefined} totalMinutes
 * @returns {string}
 */
export function formatScheduleDuration(totalMinutes) {
  if (totalMinutes == null || !Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return 'Unknown';
  }
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Total schedule minutes from first film start to second film end.
 *
 * @param {{ movieA?: { showtime?: string, runtime?: number }, movieB?: { showtime?: string, runtime?: number } }} pair
 * @returns {number | null}
 */
export function computePairTotalMinutes(pair) {
  if (!pair?.movieA || !pair?.movieB) return null;

  const startMinutes = parseTimeToMinutes(pair.movieA.showtime);
  const endMinutes = getMovieEndTime(pair.movieB.showtime, pair.movieB.runtime);
  if (startMinutes == null || endMinutes == null) return null;

  const total = endMinutes - startMinutes;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

export function formatGapMinutes(gapMinutes) {
  if (gapMinutes == null || !Number.isFinite(gapMinutes)) {
    return 'Unknown';
  }
  return `${gapMinutes} min`;
}

export function formatRuntimeMinutes(runtime) {
  if (runtime == null || !Number.isFinite(runtime)) {
    return 'Unknown';
  }
  return `${runtime} min`;
}

export function formatShowtime(showtime) {
  if (!showtime || (typeof showtime === 'string' && !showtime.trim())) {
    return 'Unknown';
  }
  return String(showtime);
}

/**
 * @param {string | undefined} showtime
 * @param {number | string | undefined} runtime
 * @returns {string}
 */
export function formatFilmEndTime(showtime, runtime) {
  const endMinutes = getMovieEndTime(showtime, runtime);
  if (endMinutes == null) return 'Unknown';
  return formatMinutesToTime(endMinutes);
}

export function formatFilmTitle(film) {
  if (!film || (typeof film === 'string' && !film.trim())) {
    return 'Unknown';
  }
  return String(film);
}

export function formatTheaterName(theater) {
  if (!theater || (typeof theater === 'string' && !theater.trim())) {
    return 'Unknown';
  }
  return String(theater);
}
