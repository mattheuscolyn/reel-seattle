/**
 * Clock helpers for Adjust Time Window (display strings like "2:15 PM").
 * Delegates unbounded / overnight semantics to buildPlanTimeWindow.
 */

import {
  formatBuildPlanTimeWindowSummary,
  isValidBuildPlanTimeWindow,
  normalizeBuildPlanClock,
  parseBuildPlanClockToSameDayMinutes,
  resolveBuildPlanFinishByMin,
  resolveBuildPlanStartAfterMin,
} from './buildPlanTimeWindow.js';

/**
 * @param {string | null | undefined} value
 * @returns {number | null} minutes from midnight (same day)
 */
export function parseClockToMinutes(value) {
  return parseBuildPlanClockToSameDayMinutes(value);
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
 * @param {string | null | undefined} clock
 * @param {number} deltaMinutes
 * @returns {string | null}
 */
export function addMinutesToClock(clock, deltaMinutes) {
  const base = parseClockToMinutes(clock);
  if (base == null) {
    // Unbounded start: treat quick-add as from noon so the control becomes custom.
    const fromNoon = 12 * 60 + deltaMinutes;
    return formatMinutesToClock(fromNoon);
  }
  return formatMinutesToClock(base + deltaMinutes);
}

/**
 * End must be strictly later than start in extended planner minutes.
 * Null on either side (no limit) is valid.
 *
 * @param {string | null | undefined} startAfter
 * @param {string | null | undefined} endBefore
 * @param {{ finishBeforeNextDay?: boolean | null }} [options]
 * @returns {boolean}
 */
export function isValidTimeWindow(startAfter, endBefore, options = {}) {
  return isValidBuildPlanTimeWindow(startAfter, endBefore, options);
}

export {
  formatBuildPlanTimeWindowSummary,
  normalizeBuildPlanClock,
  resolveBuildPlanFinishByMin,
  resolveBuildPlanStartAfterMin,
};
