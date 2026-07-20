/**
 * Opportunity identity for the v2 Home adapter.
 *
 * Identity limitations (I-02):
 * - No global canonical film_id. Film identity is showtime_film_key (+ optional parent_film_key).
 * - Distinct performances that differ by time, venue, format, or source-owned id stay distinct.
 * - Deduplicate only when a strong identity key matches (documented below).
 */

/**
 * Build the deduplication / opportunity key for a normalized showtime row.
 *
 * Preference order:
 * 1. source + source_showtime_id (when source_showtime_id is non-empty)
 * 2. artifact showtime `id` (when present)
 * 3. composite of theater|date|time|filmKey|sorted format labels
 *
 * @param {{
 *   id?: string | null,
 *   source?: string | null,
 *   sourceShowtimeId?: string | null,
 *   theaterId: string,
 *   localDate: string,
 *   localTime: string,
 *   filmKey: string,
 *   formatLabels: string[],
 * }} parts
 * @returns {string}
 */
export function buildOpportunityKey(parts) {
  const source = typeof parts.source === 'string' ? parts.source.trim() : '';
  const sourceShowtimeId =
    typeof parts.sourceShowtimeId === 'string' ? parts.sourceShowtimeId.trim() : '';
  if (source && sourceShowtimeId) {
    return `src:${source}:${sourceShowtimeId}`;
  }

  const id = typeof parts.id === 'string' ? parts.id.trim() : '';
  if (id) {
    return `id:${id}`;
  }

  const formats = [...parts.formatLabels].map(String).sort().join(',');
  return `cmp:${parts.theaterId}|${parts.localDate}|${parts.localTime}|${parts.filmKey}|${formats}`;
}

/**
 * Local Seattle cinema sortable datetime — date + 24h time, no timezone shift.
 * @param {string} localDate YYYY-MM-DD
 * @param {string} localTime HH:mm or HH:mm:ss
 * @returns {string | null}
 */
export function buildSortableLocalDateTime(localDate, localTime) {
  if (!isIsoDate(localDate) || !isLocalTime(localTime)) return null;
  const hhmm = localTime.length >= 5 ? localTime.slice(0, 5) : localTime;
  return `${localDate}T${hhmm}`;
}

/** @param {unknown} value */
export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** @param {unknown} value */
export function isLocalTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}
