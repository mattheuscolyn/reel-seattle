/**
 * Pure helpers for Browse Filters sheet time inputs.
 */

/**
 * @param {number | null | undefined} minutes
 * @returns {string}
 */
export function browseMinutesToTimeInput(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '';
  const clamped = Math.max(0, Math.min(1439, Math.trunc(minutes)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * @param {string} value
 * @returns {number | null}
 */
export function browseTimeInputToMinutes(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * @param {{ customStartMin: number | null, customEndMin: number | null }} time
 */
export function formatBrowseCustomTimeSummary(time) {
  const start =
    typeof time?.customStartMin === 'number'
      ? browseMinutesToTimeInput(time.customStartMin)
      : null;
  const end =
    typeof time?.customEndMin === 'number'
      ? browseMinutesToTimeInput(time.customEndMin)
      : null;
  const left = start || 'Any start';
  const right = end || 'Any end';
  return `${left} – ${right}`;
}
