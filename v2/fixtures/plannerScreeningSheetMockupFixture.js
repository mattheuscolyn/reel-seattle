/**
 * Planner screening detail sheet mockup fixture — `?plannerMockup=1`.
 *
 * Visual authority: Canonical Mockup Images/Planner Main Page Upcoming Showtime Clickthrough.png
 * Pairs with plannerLandingMockupFixture mock plan/performance ids.
 */

import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';

const POSTER_CONVERSATION =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180"><rect width="120" height="180" rx="8" fill="#1a2430"/><text x="12" y="148" fill="#f5f5f7" font-family="Georgia, serif" font-size="15">The Conversation</text></svg>`,
  );

/** @type {Readonly<Record<string, object>>} */
const MOCK_SCREENINGS = Object.freeze({
  'mock-plan-conversation::mock-perf-conversation': Object.freeze({
    planId: 'mock-plan-conversation',
    performanceKey: 'mock-perf-conversation',
    title: 'The Conversation',
    posterUrl: POSTER_CONVERSATION,
    dateLabel: 'Monday, May 26',
    localDate: '2025-05-26',
    timeLabel: '7:00 PM',
    localTime: '19:00',
    theaterName: 'SIFF Uptown',
    theaterId: 'siff-uptown',
    formatLabel: '35mm',
    ticketUrl: 'https://example.com/tickets/conversation-700',
    filmId: 'tmdb:101',
    filmKey: 'mock:conversation',
    opportunityKey: 'mock-opp-conversation-700',
    runtimeMin: 113,
    expectedEndsAt: '2025-05-26T21:08:00-07:00',
    startsAt: '2025-05-26T19:00:00-07:00',
    source: 'siff',
    sourceShowtimeId: 'mock-st-conv-700',
    ticketsPurchased: false,
    performanceCount: 1,
    otherShowtimes: Object.freeze({
      theaterName: 'SIFF Uptown',
      visibleItems: Object.freeze([
        Object.freeze({
          opportunityKey: 'mock-opp-conversation-430',
          filmKey: 'mock:conversation',
          theaterId: 'siff-uptown',
          theaterName: 'SIFF Uptown',
          localDate: '2025-05-26',
          localTime: '16:30',
          timeLabel: '4:30 PM',
          formatLabel: '35mm',
          ticketUrl: 'https://example.com/tickets/conversation-430',
          sortable: '2025-05-26T16:30',
        }),
        Object.freeze({
          opportunityKey: 'mock-opp-conversation-945',
          filmKey: 'mock:conversation',
          theaterId: 'siff-uptown',
          theaterName: 'SIFF Uptown',
          localDate: '2025-05-26',
          localTime: '21:45',
          timeLabel: '9:45 PM',
          formatLabel: '35mm',
          ticketUrl: 'https://example.com/tickets/conversation-945',
          sortable: '2025-05-26T21:45',
        }),
      ]),
      items: Object.freeze([]),
      moreCount: 2,
    }),
  }),
});

/**
 * @param {string} planId
 * @param {string} performanceKey
 * @param {{ timeFormatId?: string }} [options]
 */
export function resolvePlannedScreeningMockupPresentation(
  planId,
  performanceKey,
  options = {},
) {
  const key = `${planId}::${performanceKey}`;
  const hit = MOCK_SCREENINGS[key];
  if (!hit) {
    return { ok: false, reason: 'mock_not_found', screening: null };
  }
  const timeFormatId = options.timeFormatId ?? '12h';
  const timeLabel =
    formatDisplayClock(hit.localTime, timeFormatId) ?? hit.timeLabel;
  const other = hit.otherShowtimes;
  const visibleItems = (other.visibleItems ?? []).map((row) => ({
    ...row,
    timeLabel:
      formatDisplayClock(row.localTime, timeFormatId) ?? row.timeLabel,
  }));
  return {
    ok: true,
    reason: null,
    screening: {
      ...hit,
      timeLabel,
      ticketsPurchased: hit.ticketsPurchased === true,
    },
    otherShowtimes: {
      theaterName: other.theaterName,
      visibleItems,
      items: visibleItems,
      moreCount: other.moreCount ?? 0,
    },
  };
}

export const PLANNER_SCREENING_MOCKUP_IDS = Object.freeze({
  planId: 'mock-plan-conversation',
  performanceKey: 'mock-perf-conversation',
});
