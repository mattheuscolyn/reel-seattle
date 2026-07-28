import { COLLECTION_IDS } from './exploreIds.js';
import {
  addIsoDays,
  formatCompactDateLabel,
  formatCompactDateRange,
  pacificDateString,
  resolveWeekendRange,
} from './exploreCatalog.js';

/**
 * Suggested Starts discovery shortcuts (time scopes, not film recommendations).
 */
export function buildSuggestedStarts(now = new Date()) {
  const today = pacificDateString(now);
  const weekEnd = addIsoDays(today, 6);
  const weekend = resolveWeekendRange(today);

  return Object.freeze([
    Object.freeze({
      id: COLLECTION_IDS.allMovies,
      title: 'Everything',
      subtitle: 'All dates',
      tone: 'everything',
      ariaLabel: 'Everything — all dates',
    }),
    Object.freeze({
      id: COLLECTION_IDS.today,
      title: 'Today',
      subtitle: formatCompactDateLabel(today),
      tone: 'today',
      ariaLabel: `Today — ${formatCompactDateLabel(today)}`,
    }),
    Object.freeze({
      id: COLLECTION_IDS.thisWeek,
      title: 'This Week',
      subtitle: formatCompactDateRange(today, weekEnd),
      tone: 'week',
      ariaLabel: `This Week — ${formatCompactDateRange(today, weekEnd)}`,
    }),
    Object.freeze({
      id: COLLECTION_IDS.weekend,
      title: 'Weekend',
      subtitle: formatCompactDateRange(weekend.start, weekend.end),
      tone: 'weekend',
      ariaLabel: `Weekend — ${formatCompactDateRange(weekend.start, weekend.end)}`,
    }),
  ]);
}

export const SUGGESTED_STARTS_VIEW_ALL_ID = COLLECTION_IDS.suggestedStarts;
