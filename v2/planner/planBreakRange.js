/**
 * Break length draft helpers for Adjust Break Length.
 */

export const BREAK_STEP_MINUTES = 15;

export const MIN_BREAK_PRESETS = Object.freeze([
  Object.freeze({ id: '30m', label: '30m', minutes: 30 }),
  Object.freeze({ id: '45m', label: '45m', minutes: 45 }),
  Object.freeze({ id: '1h', label: '1h', minutes: 60 }),
  Object.freeze({ id: '1h30m', label: '1h 30m', minutes: 90 }),
  Object.freeze({ id: '2h', label: '2h', minutes: 120 }),
]);

export const MAX_BREAK_PRESETS = Object.freeze([
  Object.freeze({ id: '1h', label: '1h', minutes: 60 }),
  Object.freeze({ id: '1h30m', label: '1h 30m', minutes: 90 }),
  Object.freeze({ id: '2h', label: '2h', minutes: 120 }),
  Object.freeze({ id: '2h30m', label: '2h 30m', minutes: 150 }),
  Object.freeze({ id: 'any', label: 'Any', minutes: null }),
]);

/**
 * @param {number | null | undefined} minutes
 * @returns {string}
 */
export function formatBreakMinutes(minutes) {
  if (minutes == null) return 'Any';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

/**
 * @param {string | null | undefined} raw
 * @returns {number | null} null = Any
 */
export function parseBreakLabelToMinutes(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text || /^any$/i.test(text)) return null;
  text = text.replace(/^break\s+/i, '').replace(/\s+break$/i, '').trim();
  const hourMin = text.match(/^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i);
  if (hourMin) {
    const h = Number(hourMin[1]);
    const m = hourMin[2] ? Number(hourMin[2]) : 0;
    return h * 60 + m;
  }
  const minOnly = text.match(/^(\d+)\s*m(?:in(?:utes?)?)?$/i);
  if (minOnly) return Number(minOnly[1]);
  const digits = text.match(/(\d+)/);
  return digits ? Number(digits[1]) : null;
}

/**
 * @param {number | null} minMinutes
 * @param {number | null} maxMinutes null = Any
 * @returns {boolean}
 */
export function isValidBreakRange(minMinutes, maxMinutes) {
  if (minMinutes == null || !Number.isFinite(minMinutes) || minMinutes < 0) {
    return false;
  }
  if (maxMinutes == null) return true;
  return maxMinutes >= minMinutes;
}

/**
 * @param {number} minutes
 * @param {number} delta
 * @param {{ min?: number, max?: number | null }} [bounds]
 */
export function stepBreakMinutes(minutes, delta, bounds = {}) {
  const floor = bounds.min ?? 0;
  const ceiling = bounds.max == null ? 12 * 60 : bounds.max;
  const next = minutes + delta;
  return Math.min(ceiling, Math.max(floor, next));
}
