/**
 * Live Build a Plan form defaults (T-V2-LAUNCH-PLANNER-01).
 *
 * Production defaults are explicit — they do not inherit mockup fixture
 * theaterPrefId / allowRepeats / film buckets.
 */

import {
  formatCompactDateLabel,
  pacificDateString,
} from '../explore/exploreCatalog.js';

/**
 * @param {string} isoDate
 */
export function formatBuildPlanDateDisplay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Production live Build a Plan defaults.
 * @param {Date | (() => Date)} [now]
 */
export function createLiveBuildPlanFormState(now = new Date()) {
  const nowFn = typeof now === 'function' ? now : () => now;
  const dateIso = pacificDateString(nowFn());
  return {
    selectedPresetId: null,
    flexible: false,
    dateIso,
    dateDisplay: formatBuildPlanDateDisplay(dateIso),
    dateShort: formatCompactDateLabel(dateIso),
    startAfter: '11:00 AM',
    finishBefore: '11:00 PM',
    mustInclude: [],
    wouldLove: [],
    notInterested: [],
    theaterPrefId: 'any',
    selectedTheaters: [],
    locationDisplay: 'Seattle, WA',
    locationShort: 'Seattle',
    planSize: '1–3 movies',
    maxGap: '90 min',
    minGap: 'Any',
    walking: 'Deferred',
    premiumFormats: 'Any',
    budget: 'Any',
    accessibility: 'Any',
    includeSpecialEvents: false,
    allowRepeats: false,
    excludeSoldOut: false,
  };
}
