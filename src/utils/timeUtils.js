/**
 * Frontend time/runtime helpers for legacy showtime rows.
 *
 * Canonical pipeline time is stored as `time` / `time_24h` in `HH:MM` (24-hour).
 * Legacy React rows expose display time in `Time` as a compact 12-hour string with
 * no space before AM/PM (e.g. `7:30PM`), normalized by `showtimesAdapter` from
 * `time_display`. Double Feature and other planners consume that legacy row shape.
 */

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

/** Format minutes since midnight as compact legacy Time (e.g. "7:30PM"). */
export function formatMinutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, '0')}${period}`;
}

/**
 * End time in minutes since midnight from legacy `Time` start + runtime.
 * Returns null when start or runtime cannot be parsed.
 */
export function getMovieEndTime(startTimeStr, runtimeStr) {
  const startMinutes = parseTimeToMinutes(startTimeStr);
  if (startMinutes === null) return null;
  const runtime = parseRuntimeMinutes(runtimeStr);
  if (runtime === null) return null;
  const endMinutes = startMinutes + runtime;
  return Number.isFinite(endMinutes) ? endMinutes : null;
}
