/**
 * Canonical screening / performance identity.
 * Shared by accepted plans and Planner locked showtimes.
 *
 * Priority:
 * 1. src:source:theaterId:sourceShowtimeId
 * 2. opp:opportunityKey
 * 3. comp:filmKey:theaterId:date:time
 *
 * Never title-only.
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Durable performance identity. Never title-only.
 * @param {Record<string, unknown> | null | undefined} input
 * @returns {string | null}
 */
export function buildPerformanceKey(input) {
  if (!input || typeof input !== 'object') return null;
  const source = asOptionalString(input.source);
  const sourceShowtimeId =
    asOptionalString(input.sourceShowtimeId) ??
    asOptionalString(input.source_showtime_id);
  const theaterId =
    asOptionalString(input.theaterId) ?? asOptionalString(input.theater_id);
  if (source && sourceShowtimeId) {
    return `src:${source}:${theaterId ?? 'theater'}:${sourceShowtimeId}`;
  }
  const opportunityKey = asOptionalString(input.opportunityKey);
  if (opportunityKey) return `opp:${opportunityKey}`;

  const filmKey =
    asOptionalString(input.filmKey) ?? asOptionalString(input.showtimeFilmKey);
  const date =
    asOptionalString(input.localDate) ??
    asOptionalString(input.date) ??
    asOptionalString(input.showDate);
  const time =
    asOptionalString(input.localTime) ??
    asOptionalString(input.time) ??
    asOptionalString(input.startTime);
  if (filmKey && theaterId && date && time) {
    return `comp:${filmKey}:${theaterId}:${date}:${time}`;
  }
  return null;
}

/**
 * Build a performance key from a plannerEngine legacy row.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string | null}
 */
export function buildPerformanceKeyFromPlannerRow(row) {
  if (!row || typeof row !== 'object') return null;
  return buildPerformanceKey({
    source: row.source,
    sourceShowtimeId: row.source_showtime_id ?? row.sourceShowtimeId,
    theaterId: row.theater_id ?? row.theaterId,
    opportunityKey: row.opportunityKey,
    filmKey: row.filmKey ?? row.showtime_film_key,
    showtimeFilmKey: row.showtime_film_key,
    localDate: row.localDate ?? row.Date,
    date: row.Date,
    localTime: row.localTime,
    time: row.localTime ?? row.Time,
  });
}
