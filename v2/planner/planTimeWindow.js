/**
 * Clock helpers for Adjust Time Window (display strings like "2:15 PM").
 */

/**
 * @param {string | null | undefined} value
 * @returns {number | null} minutes from midnight
 */
export function parseClockToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (meridiem === 'AM') {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour * 60 + minute;
}

/**
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatMinutesToClock(totalMinutes) {
  const day = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let hour24 = Math.floor(day / 60);
  const minute = day % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

/**
 * @param {string} clock
 * @param {number} deltaMinutes
 * @returns {string}
 */
export function addMinutesToClock(clock, deltaMinutes) {
  const base = parseClockToMinutes(clock);
  if (base == null) return clock;
  return formatMinutesToClock(base + deltaMinutes);
}

/**
 * End must be strictly later than start (no overnight in this shell).
 * @param {string} startAfter
 * @param {string} endBefore
 * @returns {boolean}
 */
export function isValidTimeWindow(startAfter, endBefore) {
  const start = parseClockToMinutes(startAfter);
  const end = parseClockToMinutes(endBefore);
  if (start == null || end == null) return false;
  return end > start;
}
