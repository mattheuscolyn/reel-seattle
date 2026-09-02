/**
 * Planner conflict review mockup fixture — `?plannerMockup=1`.
 *
 * Visual authority: Canonical Mockup Images/Planner Main Page Upcoming Conflict Clickthrough.png
 */

import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';

const POSTER_BOTTOMS =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180"><rect width="120" height="180" rx="8" fill="#2a1840"/><text x="12" y="148" fill="#f8e8ff" font-family="Georgia, serif" font-size="15">Bottoms</text></svg>`,
  );

const POSTER_MYSTERIOUS =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180"><rect width="120" height="180" rx="8" fill="#142848"/><text x="12" y="130" fill="#f5f5f7" font-family="Georgia, serif" font-size="15">Mysterious Skin</text></svg>`,
  );

export const PLANNER_CONFLICT_REVIEW_MOCKUP_ID =
  'conflict-mock-bottoms__mock-mysterious-skin';

/**
 * @param {string} conflictId
 * @param {{ timeFormatId?: string }} [options]
 */
export function resolvePlannerConflictReviewMockupPresentation(
  conflictId,
  options = {},
) {
  const id =
    typeof conflictId === 'string' && conflictId.trim()
      ? conflictId.trim()
      : '';
  if (id !== PLANNER_CONFLICT_REVIEW_MOCKUP_ID) {
    return { ok: false, reason: 'conflict_not_found', presentation: null };
  }

  const timeFormatId = options.timeFormatId ?? '12h';

  const mysteriousAlternates = Object.freeze([
    Object.freeze({
      opportunityKey: 'mock-opp-mysterious-sat-915',
      filmKey: 'mock:mysterious-skin',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2025-05-31',
      localTime: '21:15',
      timeLabel: formatDisplayClock('21:15', timeFormatId) ?? '9:15 PM',
      dayShort: 'Sat',
      dateShort: 'May 31',
      rowLabel: 'Sat, May 31 • 9:15 PM • The Beacon',
      formatLabel: null,
      ticketUrl: 'https://example.com/tickets/mysterious-sat',
      source: 'beacon',
      sourceShowtimeId: 'mock-st-mysterious-sat',
      runtimeMin: 99,
      sortable: '2025-05-31T21:15',
      startMs: Date.parse('2025-05-31T21:15:00-07:00'),
      endMs: Date.parse('2025-05-31T22:54:00-07:00'),
    }),
    Object.freeze({
      opportunityKey: 'mock-opp-mysterious-sun-430',
      filmKey: 'mock:mysterious-skin',
      theaterId: 'beacon',
      theaterName: 'The Beacon',
      localDate: '2025-06-01',
      localTime: '16:30',
      timeLabel: formatDisplayClock('16:30', timeFormatId) ?? '4:30 PM',
      dayShort: 'Sun',
      dateShort: 'Jun 1',
      rowLabel: 'Sun, Jun 1 • 4:30 PM • The Beacon',
      formatLabel: null,
      ticketUrl: 'https://example.com/tickets/mysterious-sun',
      source: 'beacon',
      sourceShowtimeId: 'mock-st-mysterious-sun',
      runtimeMin: 99,
      sortable: '2025-06-01T16:30',
      startMs: Date.parse('2025-06-01T16:30:00-07:00'),
      endMs: Date.parse('2025-06-01T18:09:00-07:00'),
    }),
  ]);

  const members = Object.freeze([
    Object.freeze({
      planId: 'mock-plan-bottoms',
      performanceKey: 'mock-perf-bottoms',
      title: 'Bottoms',
      posterUrl: POSTER_BOTTOMS,
      dateLabel: 'Thursday, May 29',
      weekdayLabel: 'Thursday',
      localDate: '2025-05-29',
      timeLabel: '7:00 PM',
      localTime: '19:00',
      theaterName: 'NWFF',
      theaterId: 'nwff',
      formatLabel: null,
      ticketUrl: null,
      filmKey: 'mock:bottoms',
      filmId: 'tmdb:bottoms',
      currentScreeningLabel: '7:00 PM • NWFF',
      viableAlternates: Object.freeze([]),
      visibleAlternates: Object.freeze([]),
      moreAlternateCount: 0,
      hasAlternatives: false,
      startMs: Date.parse('2025-05-29T19:00:00-07:00'),
      endMs: Date.parse('2025-05-29T20:32:00-07:00'),
    }),
    Object.freeze({
      planId: 'mock-plan-mysterious',
      performanceKey: 'mock-perf-mysterious',
      title: 'Mysterious Skin',
      posterUrl: POSTER_MYSTERIOUS,
      dateLabel: 'Thursday, May 29',
      weekdayLabel: 'Thursday',
      localDate: '2025-05-29',
      timeLabel: '7:30 PM',
      localTime: '19:30',
      theaterName: 'The Beacon',
      theaterId: 'beacon',
      formatLabel: null,
      ticketUrl: null,
      filmKey: 'mock:mysterious-skin',
      filmId: 'tmdb:mysterious',
      currentScreeningLabel: '7:30 PM • The Beacon',
      viableAlternates: mysteriousAlternates,
      visibleAlternates: mysteriousAlternates,
      moreAlternateCount: 0,
      hasAlternatives: true,
      startMs: Date.parse('2025-05-29T19:30:00-07:00'),
      endMs: Date.parse('2025-05-29T21:09:00-07:00'),
    }),
  ]);

  return {
    ok: true,
    reason: null,
    presentation: Object.freeze({
      source: 'planner-conflict-review-mockup',
      conflictId: PLANNER_CONFLICT_REVIEW_MOCKUP_ID,
      dateLabel: 'Thursday, May 29',
      weekdayLabel: 'Thursday',
      title: 'These showtimes overlap',
      subtitle:
        'Review each film below. Move a film to another showtime, or remove it from Planner.',
      members,
      bestPath: Object.freeze({
        kind: 'move-one',
        text: 'Keep Bottoms on Thursday and move Mysterious Skin to Saturday or Sunday.',
        moveTarget: Object.freeze({
          planId: 'mock-plan-mysterious',
          performanceKey: 'mock-perf-mysterious',
        }),
      }),
    }),
  };
}
