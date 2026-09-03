/**
 * Browse All Showtimes filter evaluation engine — single path for page, sheet preview, counts.
 */

import { formatCompactDateLabel } from '../explore/exploreCatalog.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import { getFavoriteTheaters } from '../stores/favoriteTheatersStore.js';
import { isFilmNotInterested } from '../stores/notInterestedFilmsStore.js';
import { isFilmSaved } from '../stores/savedFilmsStore.js';
import { isFilmSeen } from '../stores/seenFilmsStore.js';
import {
  normalizeBrowseFilters,
} from './browseFilterState.js';
import {
  clampBrowseDateBounds,
  getBrowseOpportunityDateHorizon,
  listEligibleBrowseOpportunitiesForDateSelection,
  parseLocalTimeMinutes,
  resolveBrowseDateBounds,
} from './showtimeEligibility.js';
import {
  groupBrowseOpportunitiesByFilm,
  normalizeBrowseFormat,
  SHOWTIMES_BROWSE_TIME_RANGES,
} from './showtimesBrowseModel.js';

/** @typedef {import('./browseFilterState.js').BrowseFilters} BrowseFilters */

const TIME_PRESET_LABELS = Object.freeze({
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  late: 'Late',
});

const SAVED_MODE_LABELS = Object.freeze({
  saved: 'Saved',
  not_saved: 'Not saved',
});

const SEEN_MODE_LABELS = Object.freeze({
  seen: 'Seen',
  not_seen: 'Not seen',
});

const NOT_INTERESTED_MODE_LABELS = Object.freeze({
  hide: 'Hide Not Interested',
  only: 'Not Interested only',
});

/**
 * @param {Storage | null | undefined} storage
 * @returns {string[]}
 */
export function getFavoriteTheaterIds(storage) {
  return getFavoriteTheaters(storage)
    .map((item) => item?.theaterRef?.theaterId)
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim());
}

/**
 * @param {{ preset: string, customStartMin: number | null, customEndMin: number | null }} time
 */
export function isValidBrowseCustomTimeRange(time) {
  if (!time || time.preset !== 'custom') return true;
  const { customStartMin, customEndMin } = time;
  if (customStartMin == null || customEndMin == null) return true;
  return customStartMin <= customEndMin;
}

/**
 * @param {object} opportunity
 * @param {{ preset: string, customStartMin: number | null, customEndMin: number | null }} time
 */
export function opportunityMatchesBrowseTime(opportunity, time) {
  if (!time || time.preset === 'any') return true;
  const mins = parseLocalTimeMinutes(opportunity.localTime);
  if (mins == null) return false;

  if (time.preset === 'custom') {
    if (!isValidBrowseCustomTimeRange(time)) return false;
    if (time.customStartMin != null && mins < time.customStartMin) return false;
    if (time.customEndMin != null && mins > time.customEndMin) return false;
    return true;
  }

  const range = SHOWTIMES_BROWSE_TIME_RANGES.find((r) => r.id === time.preset);
  if (!range || range.minMin == null || range.maxMin == null) return true;
  return mins >= range.minMin && mins <= range.maxMin;
}

/**
 * @param {object} opportunity
 * @param {string[]} formatKeys
 */
export function opportunityMatchesBrowseFormats(opportunity, formatKeys) {
  const keys = Array.isArray(formatKeys)
    ? formatKeys.map((k) => String(k).toLowerCase()).filter(Boolean)
    : [];
  if (!keys.length) return true;
  const formatSet = new Set(keys);
  const labels = Array.isArray(opportunity.formatLabels) ? opportunity.formatLabels : [];
  const normalized = labels
    .map((raw) => normalizeBrowseFormat(raw)?.key)
    .filter(Boolean);
  return normalized.some((k) => formatSet.has(k));
}

/**
 * @param {string[]} theaterIds
 * @param {boolean} favoritesOnly
 * @param {string[]} favoriteTheaterIds
 * @returns {Set<string> | null} null = all theaters allowed
 */
export function resolveAllowedTheaterIds(
  theaterIds,
  favoritesOnly,
  favoriteTheaterIds,
) {
  const selected = Array.isArray(theaterIds)
    ? theaterIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const favorites = Array.isArray(favoriteTheaterIds)
    ? favoriteTheaterIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (favoritesOnly) {
    const favSet = new Set(favorites);
    if (selected.length === 0) return favSet;
    return new Set(selected.filter((id) => favSet.has(id)));
  }

  if (selected.length === 0) return null;
  return new Set(selected);
}

/**
 * @param {object} opportunity
 * @param {Set<string> | null} allowedTheaterIds
 */
export function opportunityMatchesBrowseTheater(opportunity, allowedTheaterIds) {
  if (!allowedTheaterIds) return true;
  const theaterId = opportunity?.theaterId;
  return typeof theaterId === 'string' && allowedTheaterIds.has(theaterId);
}

/**
 * @param {object} film
 * @param {Storage | null | undefined} storage
 * @param {Pick<BrowseFilters, 'savedMode' | 'seenMode' | 'notInterestedMode'>} modes
 */
export function filmPassesBrowseUserStateFilters(film, storage, modes) {
  const ref = filmRefFromHomeFilm(film);
  if (!ref) {
    return (
      modes.savedMode === 'any' &&
      modes.seenMode === 'any' &&
      modes.notInterestedMode === 'any'
    );
  }

  const saved = isFilmSaved(storage, ref);
  const seen = isFilmSeen(storage, ref);
  const notInterested = isFilmNotInterested(storage, ref);

  if (modes.savedMode === 'saved' && !saved) return false;
  if (modes.savedMode === 'not_saved' && saved) return false;
  if (modes.seenMode === 'seen' && !seen) return false;
  if (modes.seenMode === 'not_seen' && seen) return false;
  if (modes.notInterestedMode === 'hide' && notInterested) return false;
  if (modes.notInterestedMode === 'only' && !notInterested) return false;
  return true;
}

/**
 * @param {object[]} opportunities
 * @param {object | null | undefined} homeData
 * @param {Storage | null | undefined} storage
 * @param {Pick<BrowseFilters, 'savedMode' | 'seenMode' | 'notInterestedMode'>} modes
 */
export function filterBrowseOpportunitiesByFilmState(
  opportunities,
  homeData,
  storage,
  modes,
) {
  if (
    modes.savedMode === 'any' &&
    modes.seenMode === 'any' &&
    modes.notInterestedMode === 'any'
  ) {
    return opportunities;
  }

  const filmsByKey = new Map(
    (Array.isArray(homeData?.films) ? homeData.films : []).map((f) => [
      f.filmKey,
      f,
    ]),
  );

  return opportunities.filter((opp) => {
    const film = filmsByKey.get(opp.filmKey);
    if (!film) return false;
    return filmPassesBrowseUserStateFilters(film, storage, modes);
  });
}

/**
 * @param {object[]} filmGroups
 * @param {BrowseFilters['sortMode']} sortMode
 */
export function sortBrowseFilmGroups(filmGroups, sortMode) {
  const films = [...filmGroups];
  const runtimeValue = (film) =>
    typeof film.runtimeMin === 'number' && Number.isFinite(film.runtimeMin)
      ? film.runtimeMin
      : null;

  films.sort((a, b) => {
    if (sortMode === 'title_az') {
      const titleCmp = String(a.title).localeCompare(String(b.title));
      if (titleCmp !== 0) return titleCmp;
      if (a.earliestSortable !== b.earliestSortable) {
        return a.earliestSortable < b.earliestSortable ? -1 : 1;
      }
      return String(a.filmKey).localeCompare(String(b.filmKey));
    }

    if (sortMode === 'shortest' || sortMode === 'longest') {
      const aRuntime = runtimeValue(a);
      const bRuntime = runtimeValue(b);
      const aMissing = aRuntime == null;
      const bMissing = bRuntime == null;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing && !bMissing && aRuntime !== bRuntime) {
        return sortMode === 'shortest'
          ? aRuntime - bRuntime
          : bRuntime - aRuntime;
      }
      if (a.earliestSortable !== b.earliestSortable) {
        return a.earliestSortable < b.earliestSortable ? -1 : 1;
      }
      return String(a.title).localeCompare(String(b.title));
    }

    // earliest (default)
    if (a.earliestSortable !== b.earliestSortable) {
      return a.earliestSortable < b.earliestSortable ? -1 : 1;
    }
    return String(a.title).localeCompare(String(b.title));
  });

  return films;
}

/**
 * @param {BrowseFilters} filters
 */
export function countActiveBrowseFilterDimensions(filters) {
  let count = 0;
  if (filters.time.preset !== 'any') count += 1;
  if (filters.theaterIds.length > 0 || filters.favoritesOnly) count += 1;
  if (filters.formatKeys.length > 0) count += 1;
  if (filters.savedMode !== 'any') count += 1;
  if (filters.seenMode !== 'any') count += 1;
  if (filters.notInterestedMode !== 'any') count += 1;
  return count;
}

/**
 * @param {BrowseFilters} filters
 * @param {{
 *   theaterNameById?: Map<string, string> | Record<string, string>,
 *   maxPhrases?: number,
 * }} [options]
 */
export function buildBrowseFilterSummaryPhrases(filters, options = {}) {
  const maxPhrases = options.maxPhrases ?? 4;
  /** @type {string[]} */
  const phrases = [];

  const { dateSelection, time } = filters;
  if (dateSelection.mode === 'today') {
    phrases.push('Today');
  } else if (dateSelection.mode === 'tomorrow') {
    phrases.push('Tomorrow');
  } else if (dateSelection.mode === 'week') {
    phrases.push('This week');
  } else if (dateSelection.startDate === dateSelection.endDate) {
    phrases.push(formatCompactDateLabel(dateSelection.startDate));
  } else {
    phrases.push(
      `${formatCompactDateLabel(dateSelection.startDate)}–${formatCompactDateLabel(dateSelection.endDate)}`,
    );
  }

  if (time.preset !== 'any') {
    if (time.preset === 'custom') {
      phrases.push('Custom time');
    } else {
      phrases.push(TIME_PRESET_LABELS[time.preset] ?? time.preset);
    }
  }

  if (filters.favoritesOnly && filters.theaterIds.length === 0) {
    phrases.push('Favorites');
  } else if (filters.theaterIds.length === 1) {
    const id = filters.theaterIds[0];
    const name =
      options.theaterNameById instanceof Map
        ? options.theaterNameById.get(id)
        : options.theaterNameById?.[id];
    phrases.push(name ?? '1 theater');
  } else if (filters.theaterIds.length > 1) {
    phrases.push(`${filters.theaterIds.length} theaters`);
  } else if (filters.favoritesOnly) {
    phrases.push('Favorites');
  }

  if (filters.formatKeys.length === 1) {
    const key = filters.formatKeys[0];
    phrases.push(
      normalizeBrowseFormat(key)?.label ??
        key.charAt(0).toUpperCase() + key.slice(1),
    );
  } else if (filters.formatKeys.length > 1) {
    phrases.push(`${filters.formatKeys.length} formats`);
  }

  if (filters.savedMode !== 'any') {
    phrases.push(SAVED_MODE_LABELS[filters.savedMode] ?? filters.savedMode);
  }
  if (filters.seenMode !== 'any') {
    phrases.push(SEEN_MODE_LABELS[filters.seenMode] ?? filters.seenMode);
  }
  if (filters.notInterestedMode !== 'any') {
    phrases.push(
      NOT_INTERESTED_MODE_LABELS[filters.notInterestedMode] ??
        filters.notInterestedMode,
    );
  }

  if (phrases.length <= maxPhrases) {
    return { phrases, overflowCount: 0, summary: phrases.join(' · ') };
  }

  const visible = phrases.slice(0, maxPhrases);
  const overflowCount = phrases.length - maxPhrases;
  return {
    phrases: visible,
    overflowCount,
    summary: `${visible.join(' · ')} · +${overflowCount} more`,
  };
}

/**
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} rawFilters
 * @param {{
 *   now?: Date | (() => Date),
 *   storage?: Storage | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 * }} [options]
 */
export function evaluateBrowseFilters(homeData, rawFilters, options = {}) {
  const filters = normalizeBrowseFilters(rawFilters, options.now);
  const dataHorizon = getBrowseOpportunityDateHorizon(homeData);
  const dateBounds = resolveBrowseDateBounds(filters.dateSelection, options.now);
  const clampedDateBounds = clampBrowseDateBounds(dateBounds, dataHorizon);
  const favoriteTheaterIds = getFavoriteTheaterIds(options.storage ?? null);
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';

  const base = {
    filters,
    dataHorizon,
    dateBounds: clampedDateBounds,
    eligibleOpportunities: [],
    opportunities: [],
    filmGroups: [],
    resultCount: 0,
    filmCount: 0,
    emptyReason: null,
    activeFilterCount: countActiveBrowseFilterDimensions(filters),
    invalidCustomTimeRange: !isValidBrowseCustomTimeRange(filters.time),
  };

  if (!homeData) {
    return { ...base, emptyReason: 'unavailable' };
  }

  if (!clampedDateBounds.hasIntersection) {
    return { ...base, emptyReason: 'no_date_results' };
  }

  const eligible = listEligibleBrowseOpportunitiesForDateSelection(
    homeData,
    {
      mode: 'range',
      startDate: clampedDateBounds.startDate,
      endDate: clampedDateBounds.endDate,
    },
    options.now,
  );
  base.eligibleOpportunities = eligible;

  if (filters.favoritesOnly && favoriteTheaterIds.length === 0) {
    return { ...base, emptyReason: 'favorites_empty' };
  }

  if (base.invalidCustomTimeRange && filters.time.preset === 'custom') {
    return { ...base, emptyReason: 'filtered_zero' };
  }

  const allowedTheaterIds = resolveAllowedTheaterIds(
    filters.theaterIds,
    filters.favoritesOnly,
    favoriteTheaterIds,
  );

  let filtered = eligible.filter(
    (opp) =>
      opportunityMatchesBrowseTheater(opp, allowedTheaterIds) &&
      opportunityMatchesBrowseTime(opp, filters.time) &&
      opportunityMatchesBrowseFormats(opp, filters.formatKeys),
  );

  filtered = filterBrowseOpportunitiesByFilmState(
    filtered,
    homeData,
    options.storage ?? null,
    filters,
  );

  const grouped = groupBrowseOpportunitiesByFilm(
    filtered,
    homeData,
    filters.dateSelection.mode === 'range' ? 'week' : filters.dateSelection.mode,
    enrichmentIndex,
    timeFormatId,
  );
  const filmGroups = sortBrowseFilmGroups(grouped, filters.sortMode);

  base.opportunities = filtered;
  base.filmGroups = filmGroups;
  base.resultCount = filtered.length;
  base.filmCount = filmGroups.length;

  if (eligible.length === 0) {
    base.emptyReason = 'no_date_results';
  } else if (filtered.length === 0) {
    if (filters.savedMode === 'saved') base.emptyReason = 'saved_zero';
    else if (filters.formatKeys.length > 0) base.emptyReason = 'format_zero';
    else base.emptyReason = 'filtered_zero';
  }

  return base;
}
