/**
 * My Schedule Week presentation mode switch (T-PLAN-01).
 *
 * Live default: accepted-plans store.
 * Mockup: `?scheduleMockup=1` or localStorage flag (Stage 1 visual QC).
 */

import {
  getMyScheduleWeekMockupPresentation,
  resolveMyScheduleWeekPresentation as resolveMockupWeek,
} from './myScheduleWeekMockupFixture.js';
import { composeMyScheduleWeekFromAcceptedPlans } from '../planner/composeMyScheduleWeekFromAcceptedPlans.js';

export const MY_SCHEDULE_MOCKUP_FLAG_QUERY = 'scheduleMockup';
export const MY_SCHEDULE_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.scheduleMockup';

/**
 * @returns {boolean}
 */
export function isMyScheduleMockupMode() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get(MY_SCHEDULE_MOCKUP_FLAG_QUERY);
    if (q === '1' || q === 'true') return true;
    if (q === '0' || q === 'false') return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(MY_SCHEDULE_MOCKUP_STORAGE_KEY);
      return v === '1' || v === 'true';
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * @param {{
 *   weekOffset?: number,
 *   storage?: Storage | null,
 *   now?: Date | (() => Date),
 *   hideCompleted?: boolean,
 *   showBreaks?: boolean,
 *   timelineZoomId?: string,
 *   timeFormatId?: string,
 *   settings?: object | null,
 *   forceMockup?: boolean,
 * }} [options]
 */
export function resolveMyScheduleWeekPagePresentation(options = {}) {
  const mockup = options.forceMockup === true || isMyScheduleMockupMode();
  if (mockup) {
    const root = getMyScheduleWeekMockupPresentation();
    const weekIndex = options.weekOffset ?? 0;
    const week = resolveMockupWeek(weekIndex);
    return {
      mode: 'mockup-fixture',
      source: 'mockup-fixture',
      ...root,
      week,
      canNavigateUnbounded: false,
      weekCount: root.weeks.length,
    };
  }

  const settings = options.settings ?? null;
  const live = composeMyScheduleWeekFromAcceptedPlans({
    storage: options.storage,
    weekOffset: options.weekOffset ?? 0,
    now: options.now,
    hideCompleted:
      options.hideCompleted ?? settings?.hideCompleted ?? true,
    showBreaks: options.showBreaks ?? settings?.showBreaks ?? true,
    timelineZoomId:
      options.timelineZoomId ?? settings?.timelineZoomId ?? '12-24',
    timeFormatId: options.timeFormatId ?? settings?.timeFormatId ?? '12h',
  });

  return {
    mode: 'accepted-plans',
    ...live,
    weekCount: null,
  };
}
