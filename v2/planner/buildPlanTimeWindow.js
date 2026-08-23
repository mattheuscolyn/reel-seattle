/**
 * Build a Plan time-window domain (PLAN-03 / PLAN-04).
 *
 * Form representation:
 * - startAfter: null | "h:mm AM/PM"  (same calendar day; never next-day bumped)
 * - finishBefore: null | "h:mm AM/PM"
 * - finishBeforeNextDay: boolean — when true, finish is the following calendar day
 *   relative to the plan date (extended planner minutes += 1440).
 *
 * Null on either side means no constraint ("Any time" when both null).
 */

import {
  MINUTES_PER_DAY,
  PLANNER_NEXT_DAY_AM_CUTOFF_MIN,
  parseTimeToMinutes,
} from '../../src/utils/timeUtils.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeBuildPlanClock(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Spaced 12h: "1:37 PM"
  const spaced = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (spaced) {
    const hour = Number(spaced[1]);
    const minute = Number(spaced[2]);
    const period = spaced[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
  }

  // Compact 12h: "1:37PM"
  const compact = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (compact) {
    const hour = Number(compact[1]);
    const minute = Number(compact[2]);
    const period = compact[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
  }

  // HTML time / 24h: "13:37"
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    let hour24 = Number(hhmm[1]);
    const minute = Number(hhmm[2]);
    if (
      !Number.isInteger(hour24) ||
      hour24 < 0 ||
      hour24 > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    const period = hour24 >= 12 ? 'PM' : 'AM';
    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  }

  return null;
}

/**
 * Same-day minutes since midnight (0–1439). Never applies next-day AM bump.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseBuildPlanClockToSameDayMinutes(value) {
  const clock = normalizeBuildPlanClock(value);
  if (!clock) return null;
  const minutes = parseTimeToMinutes(clock.replace(/\s+/g, ''));
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return minutes;
}

/**
 * Whether an early-morning finish clock should default to next calendar day.
 * Matches planner extended-minute convention (AM before 6:00 → +1 day).
 * @param {unknown} clock
 * @returns {boolean}
 */
export function defaultFinishBeforeNextDay(clock) {
  const minutes = parseBuildPlanClockToSameDayMinutes(clock);
  if (minutes == null) return false;
  return minutes < PLANNER_NEXT_DAY_AM_CUTOFF_MIN;
}

/**
 * @param {unknown} startAfter
 * @returns {number | null}
 */
export function resolveBuildPlanStartAfterMin(startAfter) {
  return parseBuildPlanClockToSameDayMinutes(startAfter);
}

/**
 * Resolve whether finish is next-day.
 * Explicit boolean always wins; only infer when the flag is missing (legacy).
 * @param {unknown} finishBefore
 * @param {boolean | null | undefined} finishBeforeNextDay
 * @returns {boolean}
 */
export function resolveFinishBeforeNextDayFlag(
  finishBefore,
  finishBeforeNextDay,
) {
  if (!normalizeBuildPlanClock(finishBefore)) return false;
  if (finishBeforeNextDay != null) return Boolean(finishBeforeNextDay);
  return defaultFinishBeforeNextDay(finishBefore);
}

/**
 * @param {unknown} finishBefore
 * @param {boolean | null | undefined} finishBeforeNextDay
 * @returns {number | null}
 */
export function resolveBuildPlanFinishByMin(finishBefore, finishBeforeNextDay) {
  const sameDay = parseBuildPlanClockToSameDayMinutes(finishBefore);
  if (sameDay == null) return null;
  const nextDay = resolveFinishBeforeNextDayFlag(
    finishBefore,
    finishBeforeNextDay,
  );
  return nextDay ? sameDay + MINUTES_PER_DAY : sameDay;
}

/**
 * Canonical minutes for hard constraints + Generate Results.
 * @param {object | null | undefined} form
 * @returns {{ startAfterMin: number | null, finishByMin: number | null }}
 */
export function resolveBuildPlanTimeWindowMinutes(form) {
  const startAfterMin = resolveBuildPlanStartAfterMin(form?.startAfter);
  const finishByMin = resolveBuildPlanFinishByMin(
    form?.finishBefore,
    form?.finishBeforeNextDay,
  );
  return {
    startAfterMin:
      startAfterMin == null || !Number.isFinite(startAfterMin)
        ? null
        : startAfterMin,
    finishByMin:
      finishByMin == null || !Number.isFinite(finishByMin) ? null : finishByMin,
  };
}

/**
 * Normalize time-window fields on a form (session / presets / apply).
 * @param {object | null | undefined} form
 * @returns {object}
 */
export function normalizeBuildPlanTimeWindowFields(form) {
  const base = form && typeof form === 'object' ? form : {};
  const startAfter = normalizeBuildPlanClock(base.startAfter);
  const finishBefore = normalizeBuildPlanClock(base.finishBefore);
  let finishBeforeNextDay = Boolean(base.finishBeforeNextDay);
  if (!finishBefore) {
    finishBeforeNextDay = false;
  } else if (base.finishBeforeNextDay == null && base.finishBefore != null) {
    finishBeforeNextDay = defaultFinishBeforeNextDay(finishBefore);
  }
  return {
    ...base,
    startAfter,
    finishBefore,
    finishBeforeNextDay,
  };
}

/**
 * Collapsed / chip / summary label for the time window.
 * @param {object | null | undefined} form
 * @returns {string}
 */
export function formatBuildPlanTimeWindowSummary(form) {
  const start = normalizeBuildPlanClock(form?.startAfter);
  const finish = normalizeBuildPlanClock(form?.finishBefore);

  if (!start && !finish) return 'Any time';
  if (start && !finish) return `After ${start}`;
  if (!start && finish) return `Finish by ${finish}`;
  return `${start} – ${finish}`;
}

/**
 * Display clock → HTML `input type="time"` value (HH:MM).
 * @param {unknown} clock
 * @returns {string}
 */
export function buildPlanClockToHtmlTime(clock) {
  const minutes = parseBuildPlanClockToSameDayMinutes(clock);
  if (minutes == null) return '';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * HTML time value → form clock + suggested next-day flag for finish.
 * @param {string} htmlTime
 * @returns {{ clock: string | null, finishBeforeNextDay: boolean }}
 */
export function htmlTimeToBuildPlanFinish(htmlTime) {
  const clock = normalizeBuildPlanClock(htmlTime);
  return {
    clock,
    finishBeforeNextDay: defaultFinishBeforeNextDay(clock),
  };
}

/**
 * HTML time value → start-after clock (never next-day).
 * @param {string} htmlTime
 * @returns {string | null}
 */
export function htmlTimeToBuildPlanStart(htmlTime) {
  return normalizeBuildPlanClock(htmlTime);
}

/**
 * Whether a start/finish pair is a coherent window.
 * Unbounded sides are always valid. Both set → finish must be strictly later
 * in extended planner minutes.
 *
 * @param {unknown} startAfter
 * @param {unknown} endBefore
 * @param {{ finishBeforeNextDay?: boolean | null }} [options]
 * @returns {boolean}
 */
export function isValidBuildPlanTimeWindow(startAfter, endBefore, options = {}) {
  const start = resolveBuildPlanStartAfterMin(startAfter);
  const finish = resolveBuildPlanFinishByMin(
    endBefore,
    options.finishBeforeNextDay,
  );
  if (start == null && finish == null) return true;
  if (start == null || finish == null) return true;
  return finish > start;
}
