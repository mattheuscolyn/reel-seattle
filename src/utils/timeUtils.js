/**
 * Frontend time/runtime helpers for legacy showtime rows.
 *
 * Canonical pipeline time is stored as `time` / `time_24h` in `HH:MM` (24-hour).
 * Legacy React rows expose display time in `Time` as a compact 12-hour string with
 * no space before AM/PM (e.g. `7:30PM`), normalized by `showtimesAdapter` from
 * `time_display`. Double Feature and other planners consume that legacy row shape.
 *
 * Planner scheduling uses **extended minutes**: same-calendar-date showtimes may
 * extend past midnight (end > 1440). Early-morning AM times before 6:00 on the
 * same date are treated as next-day (+1440) so gaps stay chronological.
 */

export const MINUTES_PER_DAY = 1440;

/** AM showtimes before this (same date row) are treated as after midnight (+1 day). */
export const PLANNER_NEXT_DAY_AM_CUTOFF_MIN = 6 * 60;

/** Parse compact legacy `Time` string (e.g. "7:30PM") to minutes since midnight. */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const total = hours * 60 + minutes;
  return Number.isFinite(total) ? total : null;
}

/**
 * Parse showtime minutes for planner scheduling on a single calendar date.
 * Early AM (before 6:00) is bumped by one day so post-midnight showtimes sort
 * after late PM showtimes on the same date row.
 *
 * @param {string} timeStr
 * @returns {number | null}
 */
export function parsePlannerShowtimeMinutes(timeStr) {
  const minutes = parseTimeToMinutes(timeStr);
  if (minutes === null) return null;
  const match = String(timeStr).match(/(\d+):(\d+)(AM|PM)/i);
  if (!match) return minutes;
  if (match[3].toUpperCase() === 'AM' && minutes < PLANNER_NEXT_DAY_AM_CUTOFF_MIN) {
    return minutes + MINUTES_PER_DAY;
  }
  return minutes;
}

/**
 * Parse planner filter time (start after / finish by) with the same next-day AM rule.
 *
 * @param {string} timeStr
 * @returns {number | null}
 */
export function parsePlannerFilterMinutes(timeStr) {
  return parsePlannerShowtimeMinutes(timeStr);
}

/**
 * Parse runtime to finite positive integer minutes.
 * Accepts integer strings ("90") or whole numbers (90). Rejects text, decimals,
 * zero, and negatives.
 */
export function parseRuntimeMinutes(runtime) {
  if (runtime === null || runtime === undefined) return null;

  if (typeof runtime === 'number') {
    if (!Number.isFinite(runtime) || !Number.isInteger(runtime) || runtime <= 0) return null;
    return runtime;
  }

  if (typeof runtime !== 'string') return null;

  const trimmed = runtime.trim();
  if (!trimmed || trimmed === 'Unknown' || trimmed === 'None' || trimmed === 'N/A') {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) return null;

  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

/** Format minutes within a single 24h clock (wraps values >= 1440). */
function formatMinutesToTimeWithinDay(minutes) {
  const withinDay = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(withinDay / 60);
  const mins = withinDay % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')}${period}`;
}

/**
 * Format minutes as compact legacy Time (e.g. "7:30PM").
 *
 * @param {number} minutes
 * @param {{ showNextDayOffset?: boolean }} [options]
 * @returns {string}
 */
export function formatMinutesToTime(minutes, options = {}) {
  const { showNextDayOffset = false } = options;
  const base = formatMinutesToTimeWithinDay(minutes);
  if (showNextDayOffset && Number.isFinite(minutes) && minutes >= MINUTES_PER_DAY) {
    const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
    return `${base} (+${dayOffset})`;
  }
  return base;
}

/**
 * End time in extended minutes from legacy `Time` start + runtime.
 * When `planner` is true, early AM starts use the next-day offset before adding runtime.
 *
 * @param {string} startTimeStr
 * @param {string | number} runtimeStr
 * @param {{ planner?: boolean }} [options]
 * @returns {number | null}
 */
export function getMovieEndTime(startTimeStr, runtimeStr, { planner = false } = {}) {
  const startMinutes = planner
    ? parsePlannerShowtimeMinutes(startTimeStr)
    : parseTimeToMinutes(startTimeStr);
  if (startMinutes === null) return null;
  const runtime = parseRuntimeMinutes(runtimeStr);
  if (runtime === null) return null;
  const endMinutes = startMinutes + runtime;
  return Number.isFinite(endMinutes) ? endMinutes : null;
}
