import {
  buildMovieSequenceItems,
  formatPlannerMovieDisplay,
  formatPlannerScheduleSummary,
  formatTheaterName,
} from './plannerDisplay.js';
import { encodePlannerFilters } from './plannerUrlState.js';
import { getShareUrlFromLocation } from './shareLinkUtils.js';

export const PLANNER_LINEUP_SHARE_SITE_NAME = 'Reel Seattle';

/**
 * @param {number | null | undefined} gapMin
 */
function formatShareGapLine(gapMin) {
  if (gapMin == null || !Number.isFinite(gapMin)) return null;
  if (gapMin <= 0) return 'Gap: Back-to-back';
  if (gapMin === 1) return 'Gap: 1 min';
  return `Gap: ${gapMin} min`;
}

/**
 * @param {object | null | undefined} schedule
 */
function scheduleDateLabel(schedule) {
  const date = schedule?.movies?.[0]?.date;
  if (date && String(date).trim()) return String(date).trim();
  return null;
}

/**
 * @param {object} movie
 * @param {number} index
 */
function formatFilmShareLine(movie, index) {
  const display = formatPlannerMovieDisplay(movie);
  const runtime =
    movie?.runtime != null && Number.isFinite(movie.runtime)
      ? `${movie.runtime} min`
      : display.runtime;
  return `${index + 1}. ${display.film} — ${display.startTime}–${display.endTime} (${runtime})`;
}

/**
 * Build the current Planner filter share URL from page state.
 *
 * @param {object} plannerState
 * @param {{ origin?: string, pathname?: string, href?: string }} location
 */
export function buildPlannerFilterShareUrl(plannerState, location = {}) {
  const params = encodePlannerFilters(plannerState);
  const search = params.toString() ? `?${params.toString()}` : '';
  return getShareUrlFromLocation({
    origin: location.origin ?? '',
    pathname: location.pathname ?? '/planner',
    search,
    href: location.href,
  });
}

/**
 * Human-readable lineup text for SMS, iMessage, or clipboard sharing.
 *
 * @param {object | null | undefined} schedule
 * @param {{ filterUrl?: string, siteName?: string }} options
 */
export function formatPlannerLineupShareText(
  schedule,
  { filterUrl = '', siteName = PLANNER_LINEUP_SHARE_SITE_NAME } = {},
) {
  const movies = schedule?.movies ?? [];
  if (movies.length === 0) return '';

  const summary = formatPlannerScheduleSummary(schedule);
  const theater = formatTheaterName(schedule?.theater ?? summary.theater);
  const date = scheduleDateLabel(schedule);
  const headerLine = date ? `${theater} · ${date}` : theater;

  const filmWord = movies.length === 1 ? 'film' : 'films';
  const statsLine = `${movies.length} ${filmWord} · ${summary.totalSpan} total · ${summary.totalGap} between films`;

  const lines = [`${siteName} movie plan`, headerLine, statsLine, ''];

  for (const item of buildMovieSequenceItems(schedule)) {
    if (item.type === 'film') {
      lines.push(formatFilmShareLine(item.movie, item.index));
    } else {
      const gapLine = formatShareGapLine(item.gapMin);
      if (gapLine) lines.push(`   ${gapLine}`);
    }
  }

  lines.push('');
  if (filterUrl) {
    lines.push(`Find similar plans: ${filterUrl}`);
  }

  return lines.join('\n').trimEnd();
}
