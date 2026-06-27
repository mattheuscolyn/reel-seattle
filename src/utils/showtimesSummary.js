import { formatDateRange } from './dateUtils.js';

const FALLBACK_TEXT = 'Showing current showtimes';

function positiveCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Build user-facing current-window summary text from showtimes metadata.
 *
 * @param {{ sourceInfo?: object|null, rowCount?: number, loading?: boolean, error?: unknown, locale?: string }} options
 * @returns {{ text: string, loading?: boolean } | null}
 */
export function buildCurrentWindowSummary({
  sourceInfo = null,
  rowCount = 0,
  loading = false,
  error = null,
  locale = undefined,
} = {}) {
  if (loading) {
    return { text: 'Loading current window…', loading: true };
  }

  if (error) {
    return null;
  }

  const window = sourceInfo?.window;
  const startDate = window?.start_date ?? null;
  const endDate = window?.end_date ?? null;
  const dateRange = formatDateRange(startDate, endDate, locale);

  const showtimeCount =
    positiveCount(sourceInfo?.stats?.showtime_count) ?? positiveCount(rowCount);
  const theaterCount = positiveCount(sourceInfo?.stats?.theater_count);

  if (showtimeCount != null && theaterCount != null && dateRange) {
    const showtimeLabel = showtimeCount === 1 ? 'showtime' : 'showtimes';
    const theaterLabel = theaterCount === 1 ? 'theater' : 'theaters';
    return {
      text: `Showing ${showtimeCount} ${showtimeLabel} across ${theaterCount} ${theaterLabel} · ${dateRange}`,
    };
  }

  if (showtimeCount != null && dateRange) {
    const showtimeLabel = showtimeCount === 1 ? 'showtime' : 'showtimes';
    return { text: `Showing ${showtimeCount} ${showtimeLabel} from ${dateRange}` };
  }

  if (dateRange) {
    return { text: `Showing showtimes for ${dateRange}` };
  }

  return { text: FALLBACK_TEXT };
}
