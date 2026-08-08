/**
 * My Schedule Month presentation mode switch (T-SCH-01).
 *
 * Live default: accepted-plans heatmap.
 * Mockup: `?scheduleMockup=1` (shared with Week).
 */

import {
  getMyScheduleMonthMockupPresentation,
  resolveMyScheduleMonthPresentation as resolveMockupMonth,
} from '../fixtures/myScheduleMonthMockupFixture.js';
import { isMyScheduleMockupMode } from '../fixtures/resolveMyScheduleWeekPresentation.js';
import { composeMyScheduleMonthFromAcceptedPlans } from './composeMyScheduleMonthFromAcceptedPlans.js';
import { getScheduleSettings } from '../stores/scheduleSettingsStore.js';

/**
 * @param {{
 *   monthOffset?: number,
 *   storage?: Storage | null,
 *   now?: Date | (() => Date),
 *   forceMockup?: boolean,
 *   settings?: object | null,
 *   enrichmentIndex?: object | null,
 *   homeData?: object | null,
 * }} [options]
 */
export function resolveMyScheduleMonthPagePresentation(options = {}) {
  const mockup = options.forceMockup === true || isMyScheduleMockupMode();
  if (mockup) {
    const presentation = resolveMockupMonth();
    return {
      mode: 'mockup-fixture',
      source: 'mockup-fixture',
      ...getMyScheduleMonthMockupPresentation(),
      ...presentation,
      canNavigateUnbounded: false,
    };
  }

  const settings =
    options.settings ?? getScheduleSettings(options.storage ?? null);
  const live = composeMyScheduleMonthFromAcceptedPlans({
    storage: options.storage,
    monthOffset: options.monthOffset ?? 0,
    now: options.now,
    hideCompleted: settings.hideCompleted !== false,
    enrichmentIndex: options.enrichmentIndex ?? null,
    homeData: options.homeData ?? null,
  });

  return {
    ...live,
    mode: 'accepted-plans',
  };
}
