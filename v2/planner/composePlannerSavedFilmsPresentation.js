/**
 * Compose Planner Saved Films tab presentation.
 */

import {
  buildHomeFilmIdentityIndex,
  dedupePreferenceItemsByIdentity,
  resolveHomeFilmForPreferenceRef,
} from '../collections/personalCollectionModel.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { listQualifyingFutureOpportunitiesForFilm } from '../showtimes/qualifyingShowtimes.js';
import { getSavedFilms } from '../stores/savedFilmsStore.js';
import {
  buildPerformanceKeyForOpportunity,
  listPlannedPerformanceKeys,
} from './addSavedFilmShowtimeToPlanner.js';
import {
  deriveSavedFilmUrgency,
  formatPlannerSavedDateLabel,
  formatSavedFilmNextShowtimeLine,
  formatSavedFilmShowtimeSummary,
  PLANNER_SAVED_URGENCY,
} from './plannerSavedFilmsUrgency.js';
import { getPlannerSavedFilmsMockupPresentation } from '../fixtures/plannerSavedFilmsMockupFixture.js';
import { isPlannerMockupMode } from '../fixtures/plannerLandingMockupFixture.js';
import { opportunitySortableKey } from '../showtimes/showtimeEligibility.js';

import {
  PLANNER_SAVED_FILTER_OPTIONS,
  PLANNER_SAVED_SHEET_VISIBLE,
  PLANNER_SAVED_SORT_OPTIONS,
} from './plannerSavedFilmsConfig.js';
import { savedFilmRefHasFuturePlannedScreening } from './plannerSavedFilmsQueue.js';

/**
 * @param {object} row
 * @param {'urgent' | 'recent' | 'title'} sortId
 */
export function sortPlannerSavedFilmRows(rows, sortId) {
  const list = [...(rows ?? [])];
  if (sortId === 'title') {
    list.sort((a, b) => {
      const cmp = String(a.sortTitle).localeCompare(String(b.sortTitle));
      if (cmp !== 0) return cmp;
      return String(a.id).localeCompare(String(b.id));
    });
    return list;
  }
  if (sortId === 'recent') {
    list.sort((a, b) => {
      const at = a.savedAt || '';
      const bt = b.savedAt || '';
      if (at !== bt) return at < bt ? 1 : -1;
      return String(a.sortTitle).localeCompare(String(b.sortTitle));
    });
    return list;
  }
  // Most urgent (default)
  list.sort((a, b) => {
    if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
    const aStart = a.nextSortable ?? 'z';
    const bStart = b.nextSortable ?? 'z';
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    const at = a.savedAt || '';
    const bt = b.savedAt || '';
    if (at !== bt) return at < bt ? 1 : -1;
    return String(a.sortTitle).localeCompare(String(b.sortTitle));
  });
  return list;
}

/**
 * @param {object[]} rows
 * @param {'all' | 'leaving_soon'} filterId
 */
export function filterPlannerSavedFilmRows(rows, filterId) {
  if (filterId === 'leaving_soon') {
    return rows.filter(
      (row) =>
        row.urgencyId === PLANNER_SAVED_URGENCY.lastChance ||
        row.urgencyId === PLANNER_SAVED_URGENCY.leavingSoon,
    );
  }
  return rows;
}

/**
 * @param {object | null | undefined} homeData
 * @param {string} filmKey
 * @param {Date} now
 */
export function listSavedFilmChooseShowtimes(homeData, filmKey, now = new Date()) {
  return listQualifyingFutureOpportunitiesForFilm(homeData, filmKey, now);
}

/**
 * @param {{
 *   storage?: Storage | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   sortId?: string,
 *   filterId?: string,
 *   now?: Date,
 *   mockupMode?: boolean,
 *   plannedPerformanceKeys?: Set<string>,
 * }} [options]
 */
export function composePlannerSavedFilmsPresentation(options = {}) {
  if (options.mockupMode || isPlannerMockupMode()) {
    return getPlannerSavedFilmsMockupPresentation(options);
  }

  const storage =
    options.storage ??
    (typeof localStorage !== 'undefined' ? localStorage : null);
  const homeData = options.homeData ?? null;
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const now = options.now ?? new Date();
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';
  const sortId =
    PLANNER_SAVED_SORT_OPTIONS.some((o) => o.id === options.sortId)
      ? options.sortId
      : 'urgent';
  const filterId =
    PLANNER_SAVED_FILTER_OPTIONS.some((o) => o.id === options.filterId)
      ? options.filterId
      : 'all';

  const plannedKeys =
    options.plannedPerformanceKeys ?? listPlannedPerformanceKeys(storage);
  const savedItems = dedupePreferenceItemsByIdentity(
    getSavedFilms(storage),
    (item) => item.savedAt,
  );
  const index = buildHomeFilmIdentityIndex(homeData);

  /** @type {object[]} */
  const rows = [];
  for (const item of savedItems) {
    const homeFilm = resolveHomeFilmForPreferenceRef(item.filmRef, index);
    const filmKey =
      homeFilm?.filmKey ??
      item.filmRef?.showtimeFilmKey ??
      null;
    if (!filmKey) continue;

    const enriched = homeFilm
      ? enrichHomeFilm(homeFilm, enrichmentIndex, 'planner', homeData)
      : null;
    const opportunities = homeFilm
      ? listQualifyingFutureOpportunitiesForFilm(homeData, filmKey, now)
      : [];
    const showtimeCount = opportunities.length;
    if (showtimeCount <= 0) continue;
    if (savedFilmRefHasFuturePlannedScreening(item.filmRef, storage, now)) {
      continue;
    }

    const urgency = deriveSavedFilmUrgency(showtimeCount);
    const next = opportunities[0] ?? null;
    const title =
      enriched?.displayTitle ??
      homeFilm?.title ??
      item.title ??
      'Untitled';

    const sheetShowtimes = opportunities.slice(0, PLANNER_SAVED_SHEET_VISIBLE).map(
      (opp) => {
        const performanceKey = homeFilm
          ? buildPerformanceKeyForOpportunity(
              opp,
              homeFilm,
              enrichmentIndex,
              homeData,
            )
          : null;
        const inPlanner = performanceKey
          ? plannedKeys.has(performanceKey)
          : false;
        return {
          opportunityKey: opp.opportunityKey ?? null,
          performanceKey,
          rowLabel: formatSavedFilmNextShowtimeLine(opp, timeFormatId),
          sortable: opportunitySortableKey(opp),
          inPlanner,
          opportunity: opp,
        };
      },
    );

    rows.push({
      id: `saved:${filmKey}`,
      filmKey,
      filmId: item.filmRef?.filmId ?? homeFilm?.filmId ?? null,
      filmRef: item.filmRef,
      title,
      sortTitle: title.toLowerCase(),
      posterUrl: enriched?.posterUrl ?? item.posterUrl ?? null,
      urgencyId: urgency.id,
      urgencyBadge: urgency.badge,
      urgencyRank: urgency.rank,
      showtimeCount,
      showtimeSummary: formatSavedFilmShowtimeSummary(
        showtimeCount,
        opportunities,
        now,
      ),
      nextShowtimeLine: next
        ? (showtimeCount > 2
            ? `Next: ${formatSavedFilmNextShowtimeLine(next, timeFormatId)}`
            : formatSavedFilmNextShowtimeLine(next, timeFormatId))
        : null,
      nextSortable: next ? opportunitySortableKey(next) : null,
      savedAt: item.savedAt ?? null,
      savedLabel: formatPlannerSavedDateLabel(item.savedAt),
      hasShowtimes: true,
      chooseShowtimeEnabled: true,
      sheetShowtimes,
      moreShowtimeCount: Math.max(
        0,
        opportunities.length - PLANNER_SAVED_SHEET_VISIBLE,
      ),
      nextOpportunityKey: next?.opportunityKey ?? null,
      origin: homeFilm ? 'catalog' : 'snapshot',
    });
  }

  const filtered = filterPlannerSavedFilmRows(rows, filterId);
  const sorted = sortPlannerSavedFilmRows(filtered, sortId);
  const totalSavedLibraryCount = savedItems.length;

  return {
    source: 'saved-films',
    sectionTitle: 'Saved films to plan',
    intro:
      sorted.length > 0
        ? 'These saved films have showtimes available and still need a screening added to Planner.'
        : null,
    count: sorted.length,
    queueCount: rows.length,
    totalSavedLibraryCount,
    sortId,
    sortOptions: PLANNER_SAVED_SORT_OPTIONS,
    filterId,
    filterOptions: PLANNER_SAVED_FILTER_OPTIONS,
    rows: sorted,
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
    isCaughtUp: totalSavedLibraryCount > 0 && rows.length === 0,
  };
}
