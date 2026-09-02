/**
 * Planner Saved Films mockup fixture — `?plannerMockup=1`.
 *
 * Canonical references:
 * - Planner Main Page Saved Films.png
 * - Planner Main Page Saved Films Choose Showtime Interaction.png
 * - Planner Main Page Saved Films Three Dot Interaction.png
 */

import {
  PLANNER_SAVED_FILTER_OPTIONS,
  PLANNER_SAVED_SORT_OPTIONS,
} from '../planner/plannerSavedFilmsConfig.js';
import { PLANNER_SAVED_URGENCY } from '../planner/plannerSavedFilmsUrgency.js';

export const PLANNER_SAVED_MOCKUP_SCHEDULED_FILM_KEY = 'mock:heat';
export const PLANNER_SAVED_MOCKUP_NO_SHOWTIMES_FILM_KEY = 'mock:no-showtimes';

/**
 * @param {object[]} rows
 * @param {{ scheduledFilmKeys?: string[] }} [options]
 */
export function filterMockupSavedFilmsQueueRows(rows, options = {}) {
  const scheduled = new Set(options.scheduledFilmKeys ?? []);
  return rows.filter((row) => {
    if (row.showtimeCount <= 0) return false;
    if (scheduled.has(row.filmKey)) return false;
    return true;
  });
}

function posterSvg(title, from, to) {
  const safe = String(title).replace(/[<>&']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180"><rect width="120" height="180" rx="8" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><text x="12" y="148" fill="#f5f5f7" font-family="Georgia, serif" font-size="14">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const POSTER_BOTTOMS = posterSvg('Bottoms', '#2a1840', '#8b3a6a');
const POSTER_POSSESSION = posterSvg('Possession', '#1a2030', '#4a3050');
const POSTER_HEAT = posterSvg('Heat', '#281818', '#6a3030');
const POSTER_YI_YI = posterSvg('Yi Yi', '#182830', '#3a5a6a');
const POSTER_PARIS = posterSvg('Paris, Texas', '#3a2818', '#8a6a3a');
const POSTER_PERFECT = posterSvg('Perfect Blue', '#181828', '#4a3a7a');

const BOTTOMS_SHOWTIMES = Object.freeze([
  Object.freeze({
    opportunityKey: 'mock-opp-bottoms-thu',
    performanceKey: 'mock-perf-bottoms-thu',
    rowLabel: 'Thu, May 29 • 7:00 PM • NWFF',
    sortable: '2025-05-29T19:00',
    inPlanner: false,
  }),
  Object.freeze({
    opportunityKey: 'mock-opp-bottoms-beacon',
    performanceKey: 'mock-perf-bottoms-beacon',
    rowLabel: 'Thu, May 29 • 7:30 PM • The Beacon',
    sortable: '2025-05-29T19:30',
    inPlanner: true,
  }),
  Object.freeze({
    opportunityKey: 'mock-opp-bottoms-siff-700',
    performanceKey: 'mock-perf-bottoms-siff-700',
    rowLabel: 'Thu, May 29 • 7:00 PM • SIFF Uptown',
    sortable: '2025-05-29T19:00',
    inPlanner: false,
  }),
  Object.freeze({
    opportunityKey: 'mock-opp-bottoms-siff-430',
    performanceKey: 'mock-perf-bottoms-siff-430',
    rowLabel: 'Thu, May 29 • 4:30 PM • SIFF Uptown',
    sortable: '2025-05-29T16:30',
    inPlanner: false,
  }),
  Object.freeze({
    opportunityKey: 'mock-opp-bottoms-siff-945',
    performanceKey: 'mock-perf-bottoms-siff-945',
    rowLabel: 'Thu, May 29 • 9:45 PM • SIFF Uptown',
    sortable: '2025-05-29T21:45',
    inPlanner: false,
  }),
]);

/** @type {Readonly<object[]>} */
const MOCK_ROWS = Object.freeze([
  Object.freeze({
    id: 'saved:mock-bottoms',
    filmKey: 'mock:bottoms',
    filmId: 'tmdb:bottoms',
    title: 'Bottoms',
    sortTitle: 'bottoms',
    posterUrl: POSTER_BOTTOMS,
    urgencyId: PLANNER_SAVED_URGENCY.lastChance,
    urgencyBadge: 'Last chance',
    urgencyRank: 0,
    showtimeCount: 1,
    showtimeSummary: '1 showtime left',
    nextShowtimeLine: 'Thu, May 29 • 7:00 PM • NWFF',
    nextSortable: '2025-05-29T19:00',
    savedAt: '2025-05-07T12:00:00.000Z',
    savedLabel: 'Saved May 7',
    hasShowtimes: true,
    chooseShowtimeEnabled: true,
    sheetShowtimes: BOTTOMS_SHOWTIMES,
    moreShowtimeCount: 0,
    nextOpportunityKey: 'mock-opp-bottoms-thu',
    origin: 'catalog',
  }),
  Object.freeze({
    id: 'saved:mock-possession',
    filmKey: 'mock:possession',
    filmId: 'tmdb:possession',
    title: 'Possession',
    sortTitle: 'possession',
    posterUrl: POSTER_POSSESSION,
    urgencyId: PLANNER_SAVED_URGENCY.leavingSoon,
    urgencyBadge: 'Leaving soon',
    urgencyRank: 1,
    showtimeCount: 2,
    showtimeSummary: '2 showtimes left',
    nextShowtimeLine: 'Thu, May 29 • 7:00 PM • NWFF',
    nextSortable: '2025-05-29T19:00',
    savedAt: '2025-05-20T12:00:00.000Z',
    savedLabel: 'Saved May 20',
    hasShowtimes: true,
    chooseShowtimeEnabled: true,
    sheetShowtimes: Object.freeze([
      Object.freeze({
        opportunityKey: 'mock-opp-possession-1',
        performanceKey: 'mock-perf-possession-1',
        rowLabel: 'Thu, May 29 • 7:00 PM • NWFF',
        sortable: '2025-05-29T19:00',
        inPlanner: false,
      }),
      Object.freeze({
        opportunityKey: 'mock-opp-possession-2',
        performanceKey: 'mock-perf-possession-2',
        rowLabel: 'Fri, May 30 • 9:30 PM • The Beacon',
        sortable: '2025-05-30T21:30',
        inPlanner: false,
      }),
    ]),
    moreShowtimeCount: 0,
    nextOpportunityKey: 'mock-opp-possession-1',
    origin: 'catalog',
  }),
  Object.freeze({
    id: 'saved:mock-heat',
    filmKey: 'mock:heat',
    filmId: 'tmdb:heat',
    title: 'Heat',
    sortTitle: 'heat',
    posterUrl: POSTER_HEAT,
    urgencyId: PLANNER_SAVED_URGENCY.none,
    urgencyBadge: null,
    urgencyRank: 10,
    showtimeCount: 12,
    showtimeSummary: '12 showtimes this week',
    nextShowtimeLine: 'Next: Tue, May 27 • 7:15 PM • AMC Alderwood',
    nextSortable: '2025-05-27T19:15',
    savedAt: '2025-05-20T12:00:00.000Z',
    savedLabel: 'Saved May 20',
    hasShowtimes: true,
    chooseShowtimeEnabled: true,
    sheetShowtimes: Object.freeze([]),
    moreShowtimeCount: 7,
    nextOpportunityKey: 'mock-opp-heat-1',
    origin: 'catalog',
  }),
  Object.freeze({
    id: 'saved:mock-yi-yi',
    filmKey: 'mock:yi-yi',
    filmId: 'tmdb:yi-yi',
    title: 'Yi Yi',
    sortTitle: 'yi yi',
    posterUrl: POSTER_YI_YI,
    urgencyId: PLANNER_SAVED_URGENCY.none,
    urgencyBadge: null,
    urgencyRank: 10,
    showtimeCount: 12,
    showtimeSummary: '12 showtimes this week',
    nextShowtimeLine: 'Next: Wed, May 28 • 6:30 PM • SIFF Uptown',
    nextSortable: '2025-05-28T18:30',
    savedAt: '2025-05-18T12:00:00.000Z',
    savedLabel: 'Saved May 18',
    hasShowtimes: true,
    chooseShowtimeEnabled: true,
    sheetShowtimes: Object.freeze([]),
    moreShowtimeCount: 7,
    nextOpportunityKey: 'mock-opp-yi-yi-1',
    origin: 'catalog',
  }),
  Object.freeze({
    id: 'saved:mock-paris',
    filmKey: 'mock:paris-texas',
    filmId: 'tmdb:paris',
    title: 'Paris, Texas',
    sortTitle: 'paris, texas',
    posterUrl: POSTER_PARIS,
    urgencyId: PLANNER_SAVED_URGENCY.none,
    urgencyBadge: null,
    urgencyRank: 10,
    showtimeCount: 10,
    showtimeSummary: '10 showtimes this week',
    nextShowtimeLine: 'Next: Sat, May 31 • 4:00 PM • SIFF Downtown',
    nextSortable: '2025-05-31T16:00',
    savedAt: '2025-05-18T12:00:00.000Z',
    savedLabel: 'Saved May 18',
    hasShowtimes: true,
    chooseShowtimeEnabled: true,
    sheetShowtimes: Object.freeze([]),
    moreShowtimeCount: 5,
    nextOpportunityKey: 'mock-opp-paris-1',
    origin: 'catalog',
  }),
  Object.freeze({
    id: 'saved:mock-perfect-blue',
    filmKey: 'mock:perfect-blue',
    filmId: 'tmdb:perfect-blue',
    title: 'Perfect Blue',
    sortTitle: 'perfect blue',
    posterUrl: POSTER_PERFECT,
    urgencyId: PLANNER_SAVED_URGENCY.none,
    urgencyBadge: null,
    urgencyRank: 10,
    showtimeCount: 3,
    showtimeSummary: '3 showtimes next week',
    nextShowtimeLine: 'Next: Tue, Jun 3 • 7:00 PM • Grand Illusion',
    nextSortable: '2025-06-03T19:00',
    savedAt: '2025-05-15T12:00:00.000Z',
    savedLabel: 'Saved May 15',
    hasShowtimes: true,
    chooseShowtimeEnabled: true,
    sheetShowtimes: Object.freeze([]),
    moreShowtimeCount: 0,
    nextOpportunityKey: 'mock-opp-perfect-1',
    origin: 'catalog',
  }),
  Object.freeze({
    id: 'saved:mock-no-showtimes',
    filmKey: PLANNER_SAVED_MOCKUP_NO_SHOWTIMES_FILM_KEY,
    filmId: 'tmdb:no-showtimes',
    title: 'Archived Title',
    sortTitle: 'archived title',
    posterUrl: POSTER_PERFECT,
    urgencyId: PLANNER_SAVED_URGENCY.none,
    urgencyBadge: null,
    urgencyRank: 50,
    showtimeCount: 0,
    showtimeSummary: 'No showtimes currently scheduled',
    nextShowtimeLine: null,
    nextSortable: null,
    savedAt: '2025-05-01T12:00:00.000Z',
    savedLabel: 'Saved May 1',
    hasShowtimes: false,
    chooseShowtimeEnabled: false,
    sheetShowtimes: Object.freeze([]),
    moreShowtimeCount: 0,
    nextOpportunityKey: null,
    origin: 'catalog',
  }),
]);

/**
 * @param {{ sortId?: string, filterId?: string }} [options]
 */
export function getPlannerSavedFilmsMockupPresentation(options = {}) {
  const sortId =
    PLANNER_SAVED_SORT_OPTIONS.some((o) => o.id === options.sortId)
      ? options.sortId
      : 'urgent';
  const filterId =
    PLANNER_SAVED_FILTER_OPTIONS.some((o) => o.id === options.filterId)
      ? options.filterId
      : 'all';

  let rows = filterMockupSavedFilmsQueueRows([...MOCK_ROWS], {
    scheduledFilmKeys: options.scheduledFilmKeys ?? [],
  });
  if (filterId === 'leaving_soon') {
    rows = rows.filter(
      (r) =>
        r.urgencyId === PLANNER_SAVED_URGENCY.lastChance ||
        r.urgencyId === PLANNER_SAVED_URGENCY.leavingSoon,
    );
  }

  if (sortId === 'title') {
    rows.sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
  } else if (sortId === 'recent') {
    rows.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  } else {
    rows.sort((a, b) => {
      if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
      const aStart = a.nextSortable ?? 'z';
      const bStart = b.nextSortable ?? 'z';
      if (aStart !== bStart) return aStart < bStart ? -1 : 1;
      return a.sortTitle.localeCompare(b.sortTitle);
    });
  }

  const totalSavedLibraryCount = MOCK_ROWS.length;

  return Object.freeze({
    source: 'planner-saved-films-mockup',
    sectionTitle: 'Saved films to plan',
    intro:
      rows.length > 0
        ? 'These saved films have showtimes available and still need a screening added to Planner.'
        : null,
    count: rows.length,
    queueCount: filterMockupSavedFilmsQueueRows([...MOCK_ROWS], {
      scheduledFilmKeys: options.scheduledFilmKeys ?? [],
    }).length,
    totalSavedLibraryCount,
    sortId,
    sortOptions: PLANNER_SAVED_SORT_OPTIONS,
    filterId,
    filterOptions: PLANNER_SAVED_FILTER_OPTIONS,
    rows: Object.freeze(rows),
    emptyTitle:
      totalSavedLibraryCount > 0
        ? "You're all caught up"
        : 'No saved films yet',
    emptyBody:
      totalSavedLibraryCount > 0
        ? 'None of your saved films with available showtimes still need to be added to Planner.'
        : 'Save films from Explore or Film Detail to plan showtimes here.',
    filteredEmptyTitle: 'No films match this filter',
    filteredEmptyBody: 'Try another filter or save more films with showtimes.',
    isCaughtUp:
      filterMockupSavedFilmsQueueRows([...MOCK_ROWS], {
        scheduledFilmKeys: options.scheduledFilmKeys ?? [],
      }).length === 0 && totalSavedLibraryCount > 0,
  });
}

export function getPlannerSavedFilmsMockupRow(filmKey) {
  return MOCK_ROWS.find((row) => row.filmKey === filmKey) ?? null;
}
