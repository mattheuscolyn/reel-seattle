import {
  pacificDateString,
  resolveWeekendRange,
} from './exploreCatalog.js';
import { createDefaultShowtimesBrowseUi } from '../showtimes/showtimesBrowseModel.js';

export const QUICK_START_ALL_SHOWTIMES_ID = 'all-showtimes';
export const QUICK_START_TODAY_ID = 'today-showtimes';
export const QUICK_START_WEEKEND_ID = 'this-weekend';

/** Quick Start shortcut definitions (data only). Temporal Showtimes launches. */
export const QUICK_START = Object.freeze([
  Object.freeze({
    id: QUICK_START_ALL_SHOWTIMES_ID,
    label: 'All showtimes',
    icon: 'showtimes',
  }),
  Object.freeze({
    id: QUICK_START_TODAY_ID,
    label: 'Today',
    icon: 'today',
  }),
  Object.freeze({
    id: QUICK_START_WEEKEND_ID,
    label: 'This weekend',
    icon: 'weekend',
  }),
]);

/**
 * Canonical Showtimes browse UI for an Explore Quick Start id.
 * Weekend dates are resolved at click time via resolveWeekendRange.
 *
 * @param {string} id
 * @param {Date | (() => Date) | string} [now]
 * @returns {object | null}
 */
function resolveTodayIso(now) {
  const resolved = typeof now === 'function' ? now() : now;
  if (typeof resolved === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
    return resolved;
  }
  return pacificDateString(resolved instanceof Date ? resolved : new Date());
}

export function browseUiForQuickStart(id, now = new Date()) {
  const base = createDefaultShowtimesBrowseUi();
  if (id === QUICK_START_ALL_SHOWTIMES_ID) {
    return { ...base, dateMode: 'week' };
  }
  if (id === QUICK_START_TODAY_ID) {
    return { ...base, dateMode: 'today' };
  }
  if (id === QUICK_START_WEEKEND_ID) {
    const weekend = resolveWeekendRange(resolveTodayIso(now));
    return {
      ...base,
      dateSelection: {
        mode: 'range',
        startDate: weekend.start,
        endDate: weekend.end,
      },
    };
  }
  return null;
}
