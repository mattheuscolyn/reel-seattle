/**
 * Showtimes browse presentation model — film-grouped, filterable, live HomeData.
 */

import { formatRuntimeLabel } from '../home/shelfData.js';
import {
  formatCompactDateLabel,
  formatCompactDateRange,
} from '../explore/exploreCatalog.js';
import {
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import {
  listEligibleBrowseOpportunities,
  opportunitySortableKey,
  parseLocalTimeMinutes,
  resolveShowtimesBrowseDateWindow,
} from './showtimeEligibility.js';

export const SHOWTIMES_BROWSE_DATE_MODES = Object.freeze([
  Object.freeze({ id: 'today', label: 'Today' }),
  Object.freeze({ id: 'tomorrow', label: 'Tomorrow' }),
  Object.freeze({ id: 'week', label: 'This week' }),
]);

export const SHOWTIMES_BROWSE_TIME_RANGES = Object.freeze([
  Object.freeze({ id: 'any', label: 'Any time' }),
  Object.freeze({ id: 'morning', label: 'Before noon', minMin: 0, maxMin: 11 * 60 + 59 }),
  Object.freeze({
    id: 'afternoon',
    label: 'Afternoon',
    minMin: 12 * 60,
    maxMin: 16 * 60 + 59,
  }),
  Object.freeze({
    id: 'evening',
    label: 'Evening',
    minMin: 17 * 60,
    maxMin: 20 * 60 + 59,
  }),
  Object.freeze({
    id: 'late',
    label: 'Late night',
    minMin: 21 * 60,
    maxMin: 23 * 60 + 59,
  }),
]);

export const SHOWTIMES_BROWSE_QUICK_START_ID = 'all-showtimes';

/**
 * @returns {{
 *   dateMode: 'today' | 'tomorrow' | 'week',
 *   theaterIds: string[],
 *   formatKeys: string[],
 *   timeRangeId: string,
 *   expandedFilmKey: string | null,
 *   scrollY: number,
 * }}
 */
export function createDefaultShowtimesBrowseUi() {
  return {
    dateMode: 'today',
    theaterIds: [],
    formatKeys: [],
    timeRangeId: 'any',
    expandedFilmKey: null,
    scrollY: 0,
  };
}

/**
 * @param {unknown} raw
 * @returns {{ key: string, label: string } | null}
 */
export function normalizeBrowseFormat(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const facing = formatUserFacingFormatLabel(trimmed);
  if (facing) {
    return { key: facing.toLowerCase(), label: facing };
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, '-');
  return { key, label: trimmed };
}

/**
 * @param {object} opportunity
 * @param {string} timeRangeId
 */
export function opportunityMatchesTimeRange(opportunity, timeRangeId) {
  if (!timeRangeId || timeRangeId === 'any') return true;
  const range = SHOWTIMES_BROWSE_TIME_RANGES.find((r) => r.id === timeRangeId);
  if (!range || range.minMin == null) return true;
  const mins = parseLocalTimeMinutes(opportunity.localTime);
  if (mins == null) return false;
  return mins >= range.minMin && mins <= range.maxMin;
}

/**
 * @param {object[]} opportunities
 * @param {{
 *   theaterIds?: string[],
 *   formatKeys?: string[],
 *   timeRangeId?: string,
 * }} filters
 */
export function filterBrowseOpportunities(opportunities, filters = {}) {
  const theaterIds = Array.isArray(filters.theaterIds)
    ? filters.theaterIds.filter(Boolean)
    : [];
  const formatKeys = Array.isArray(filters.formatKeys)
    ? filters.formatKeys.map((k) => String(k).toLowerCase()).filter(Boolean)
    : [];
  const timeRangeId = filters.timeRangeId ?? 'any';
  const theaterSet = theaterIds.length ? new Set(theaterIds) : null;
  const formatSet = formatKeys.length ? new Set(formatKeys) : null;

  return opportunities.filter((opp) => {
    if (theaterSet && !theaterSet.has(opp.theaterId)) return false;
    if (!opportunityMatchesTimeRange(opp, timeRangeId)) return false;
    if (formatSet) {
      const labels = Array.isArray(opp.formatLabels) ? opp.formatLabels : [];
      const keys = labels
        .map((raw) => normalizeBrowseFormat(raw)?.key)
        .filter(Boolean);
      if (!keys.some((k) => formatSet.has(k))) return false;
    }
    return true;
  });
}

/**
 * @param {object[]} opportunities
 */
export function listBrowseTheaterFilterOptions(opportunities) {
  /** @type {Map<string, { id: string, label: string, count: number }>} */
  const map = new Map();
  for (const opp of opportunities) {
    const id = opp.theaterId;
    if (typeof id !== 'string' || !id) continue;
    const label = opp.theaterName || id;
    const prev = map.get(id);
    if (prev) prev.count += 1;
    else map.set(id, { id, label, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {object[]} opportunities
 */
export function listBrowseFormatFilterOptions(opportunities) {
  /** @type {Map<string, { key: string, label: string, count: number }>} */
  const map = new Map();
  for (const opp of opportunities) {
    for (const raw of opp.formatLabels ?? []) {
      const norm = normalizeBrowseFormat(raw);
      if (!norm) continue;
      const prev = map.get(norm.key);
      if (prev) prev.count += 1;
      else map.set(norm.key, { key: norm.key, label: norm.label, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {object} opportunity
 * @param {Map<string, object>} filmsByKey
 */
function toShowtimeRow(opportunity, filmsByKey) {
  const film = filmsByKey.get(opportunity.filmKey);
  const formats = (opportunity.formatLabels ?? [])
    .map((raw) => normalizeBrowseFormat(raw))
    .filter(Boolean);
  const uniqueFormats = [];
  const seen = new Set();
  for (const f of formats) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    uniqueFormats.push(f);
  }
  const ticketUrl = normalizeExternalTicketUrl(opportunity.ticketUrl);
  return {
    opportunityKey: opportunity.opportunityKey,
    filmKey: opportunity.filmKey,
    theaterId: opportunity.theaterId ?? null,
    theaterName: opportunity.theaterName ?? 'Theater',
    localDate: opportunity.localDate,
    localTime: opportunity.localTime,
    timeDisplay:
      opportunity.timeDisplay ?? opportunity.localTime ?? '',
    sortableKey: opportunitySortableKey(opportunity),
    formatLabels: uniqueFormats.map((f) => f.label),
    formatKeys: uniqueFormats.map((f) => f.key),
    ticketUrl,
    filmTitle: film?.title ?? opportunity.filmKey,
  };
}

/**
 * Group filtered opportunities into film cards.
 * @param {object[]} opportunities
 * @param {object | null | undefined} homeData
 * @param {'today' | 'tomorrow' | 'week'} dateMode
 */
export function groupBrowseOpportunitiesByFilm(
  opportunities,
  homeData,
  dateMode,
) {
  const filmsByKey = new Map(
    (Array.isArray(homeData?.films) ? homeData.films : []).map((f) => [
      f.filmKey,
      f,
    ]),
  );

  /** @type {Map<string, object[]>} */
  const byFilm = new Map();
  for (const opp of opportunities) {
    const list = byFilm.get(opp.filmKey) ?? [];
    list.push(opp);
    byFilm.set(opp.filmKey, list);
  }

  /** @type {object[]} */
  const films = [];
  for (const [filmKey, opps] of byFilm) {
    const film = filmsByKey.get(filmKey);
    if (!film) continue;
    const rows = opps
      .map((o) => toShowtimeRow(o, filmsByKey))
      .sort((a, b) => {
        if (a.sortableKey !== b.sortableKey) {
          return a.sortableKey < b.sortableKey ? -1 : 1;
        }
        return String(a.opportunityKey).localeCompare(String(b.opportunityKey));
      });

    /** @type {Map<string, object[]>} */
    const byDate = new Map();
    for (const row of rows) {
      const bucket = byDate.get(row.localDate) ?? [];
      bucket.push(row);
      byDate.set(row.localDate, bucket);
    }

    const dateGroups = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([localDate, dateRows]) => {
        /** @type {Map<string, object[]>} */
        const byTheater = new Map();
        for (const row of dateRows) {
          const tid = row.theaterId ?? row.theaterName;
          const bucket = byTheater.get(tid) ?? [];
          bucket.push(row);
          byTheater.set(tid, bucket);
        }
        const theaters = [...byTheater.values()].map((theaterRows) => ({
          theaterId: theaterRows[0].theaterId,
          theaterName: theaterRows[0].theaterName,
          showtimes: theaterRows,
        }));
        return {
          localDate,
          dateLabel: formatCompactDateLabel(localDate),
          theaters,
        };
      });

    const theaterIds = new Set(rows.map((r) => r.theaterId).filter(Boolean));
    films.push({
      filmKey,
      filmId: film.filmId ?? null,
      parentFilmKey: film.parentFilmKey ?? null,
      title: film.title,
      posterUrl: film.posterUrl ?? null,
      runtimeMin: film.runtimeMin ?? null,
      runtimeLabel: formatRuntimeLabel(film.runtimeMin),
      ratingLabel: film.rating ?? film.mpaaRating ?? null,
      earliestSortable: rows[0]?.sortableKey ?? '',
      earliestTimeDisplay: rows[0]?.timeDisplay ?? '',
      showtimeCount: rows.length,
      theaterCount: theaterIds.size,
      dateGroups,
      // Flat list for simple Today/Tomorrow rendering
      showtimes: rows,
    });
  }

  films.sort((a, b) => {
    if (a.earliestSortable !== b.earliestSortable) {
      return a.earliestSortable < b.earliestSortable ? -1 : 1;
    }
    return String(a.title).localeCompare(String(b.title));
  });

  return films;
}

/**
 * Full browse page presentation.
 * @param {object | null | undefined} homeData
 * @param {ReturnType<typeof createDefaultShowtimesBrowseUi>} [ui]
 * @param {{ now?: Date | (() => Date) }} [options]
 */
export function buildShowtimesBrowsePresentation(
  homeData,
  ui = createDefaultShowtimesBrowseUi(),
  options = {},
) {
  const dateMode = ui?.dateMode ?? 'today';
  const now = options.now ?? new Date();
  const window = resolveShowtimesBrowseDateWindow(dateMode, now);
  const eligible = listEligibleBrowseOpportunities(homeData, dateMode, now);
  const theaterOptions = listBrowseTheaterFilterOptions(eligible);
  const formatOptions = listBrowseFormatFilterOptions(eligible);

  const filters = {
    theaterIds: ui?.theaterIds ?? [],
    formatKeys: ui?.formatKeys ?? [],
    timeRangeId: ui?.timeRangeId ?? 'any',
  };
  const filtered = filterBrowseOpportunities(eligible, filters);
  const films = groupBrowseOpportunitiesByFilm(filtered, homeData, dateMode);

  const hasActiveFilters =
    (filters.theaterIds?.length ?? 0) > 0 ||
    (filters.formatKeys?.length ?? 0) > 0 ||
    (filters.timeRangeId && filters.timeRangeId !== 'any');

  let emptyMessage = null;
  if (!homeData) {
    emptyMessage = null; // surface uses loadStatus
  } else if (eligible.length === 0) {
    if (dateMode === 'today') emptyMessage = 'No more showtimes today.';
    else if (dateMode === 'tomorrow') emptyMessage = 'No showtimes tomorrow.';
    else emptyMessage = 'No showtimes found in the next 7 days.';
  } else if (filtered.length === 0) {
    emptyMessage = 'No showtimes match these filters.';
  }

  const dateModeMeta = SHOWTIMES_BROWSE_DATE_MODES.find((m) => m.id === dateMode);
  let windowLabel = dateModeMeta?.label ?? 'Showtimes';
  if (dateMode === 'week') {
    windowLabel = `${formatCompactDateRange(window.startDate, window.endDate)}`;
  } else if (dateMode === 'today' || dateMode === 'tomorrow') {
    windowLabel = formatCompactDateLabel(window.startDate);
  }

  return {
    dateMode,
    window,
    windowLabel,
    eligibleCount: eligible.length,
    filteredCount: filtered.length,
    filmCount: films.length,
    films,
    theaterOptions,
    formatOptions,
    timeRangeOptions: SHOWTIMES_BROWSE_TIME_RANGES,
    filters,
    hasActiveFilters,
    emptyMessage,
    showResetFilters: Boolean(emptyMessage && hasActiveFilters && eligible.length > 0),
  };
}
