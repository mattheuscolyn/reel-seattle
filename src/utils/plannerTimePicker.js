import { parseTimeToMinutes } from './timeUtils.js';

export const PLANNER_TIME_HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
export const PLANNER_TIME_MINUTES = ['00', '15', '30', '45'];
export const PLANNER_TIME_PERIODS = ['AM', 'PM'];

const DEFAULT_PARTS = {
  hour: '12',
  minute: '00',
  period: 'PM',
};

/**
 * @param {string} value
 * @returns {{ hour: string, minute: string, period: string }}
 */
export function parsePlannerTimeParts(value) {
  if (!value) return { ...DEFAULT_PARTS };
  const match = String(value).match(/(\d+):(\d+)(AM|PM)/i);
  if (!match) return { ...DEFAULT_PARTS };

  const minute = match[2].padStart(2, '0');
  const normalizedMinute = PLANNER_TIME_MINUTES.includes(minute) ? minute : '00';

  return {
    hour: String(parseInt(match[1], 10)),
    minute: normalizedMinute,
    period: match[3].toUpperCase(),
  };
}

/**
 * @param {string} hour
 * @param {string} minute
 * @param {string} period
 * @returns {string}
 */
export function formatPlannerCompactTime(hour, minute, period) {
  if (!hour || !minute || !period) return '';
  const compact = `${hour}:${minute}${period}`;
  return parseTimeToMinutes(compact) !== null ? compact : '';
}
