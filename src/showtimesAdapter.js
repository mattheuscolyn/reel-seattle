/**
 * Map showtimes_current.json into legacy CSV-like rows for App.jsx.
 */

const isViteDev =
  typeof import.meta !== 'undefined' &&
  import.meta.env != null &&
  import.meta.env.DEV === true;

export const CURRENT_URL = isViteDev
  ? '/data/showtimes_current.json'
  : './data/showtimes_current.json';

export const PIPELINE_REPORT_URL = isViteDev
  ? '/data/pipeline_report.json'
  : './data/pipeline_report.json';

export const SHOWTIMES_LOAD_ERROR =
  'Showtimes data is unavailable. Please try again later.';

/** Convert ISO date (YYYY-MM-DD) to history CSV date (MM/DD/YYYY). */
export function isoDateToCsvDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return '';
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

/** Match legacy CSV Time column (e.g. 7:30PM) from time_display (e.g. 7:30 PM). */
export function normalizeTimeDisplay(timeDisplay) {
  if (!timeDisplay || typeof timeDisplay !== 'string') return '';
  return timeDisplay.trim().replace(/\s+(AM|PM)$/i, '$1');
}

export function buildTheaterNameIndex(theaters) {
  const index = Object.create(null);
  for (const entry of theaters || []) {
    if (entry?.id && entry?.name) {
      index[entry.id] = entry.name;
    }
  }
  return index;
}

export function mapCurrentShowtimeToLegacyRow(showtime, theaterNameById) {
  const formatTags = Array.isArray(showtime.format_tags) ? showtime.format_tags : [];
  const runtime = showtime.runtime_min;

  return {
    Date: isoDateToCsvDate(showtime.date),
    Time: normalizeTimeDisplay(showtime.time_display),
    Theater: theaterNameById[showtime.theater_id] || '',
    Film: showtime.film_title || '',
    Runtime: runtime == null || runtime === '' ? '' : String(runtime),
    posterDynamic: showtime.poster_url || '',
    isCanceled: 'False',
    premiumFormat: formatTags.filter(Boolean).join(', '),
    source: showtime.source || '',
    theater_id: showtime.theater_id || '',
    showtime_film_key: showtime.showtime_film_key || '',
    time_24h: showtime.time || '',
    parent_film_key: showtime.parent_film_key || showtime.showtime_film_key || '',
    parent_display_title: showtime.parent_display_title || showtime.film_title || '',
    screening_variant_type: showtime.screening_variant_type || 'none',
    is_special_screening: showtime.is_special_screening || false,
  };
}

export function rowsFromShowtimesCurrent(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('Invalid showtimes_current.json shape');
  }
  const theaterNameById = buildTheaterNameIndex(artifact.theaters);
  return (artifact.showtimes || [])
    .map((showtime) => mapCurrentShowtimeToLegacyRow(showtime, theaterNameById))
    .filter((row) => row.Date && row.Film && row.Theater && row.Time);
}

export async function fetchShowtimesArtifact(url = CURRENT_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(SHOWTIMES_LOAD_ERROR);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(SHOWTIMES_LOAD_ERROR);
  }
}

export function sourceInfoFromArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') return null;
  return {
    generatedAt: artifact.generated_at ?? null,
    window: artifact.window ?? null,
    sources: artifact.sources ?? null,
    stats: artifact.stats ?? null,
  };
}

export async function fetchShowtimeRows(url = CURRENT_URL) {
  const artifact = await fetchShowtimesArtifact(url);
  return rowsFromShowtimesCurrent(artifact);
}

export async function fetchPipelineReportArtifact(url = PIPELINE_REPORT_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Pipeline report unavailable');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('Pipeline report unavailable');
  }
}
