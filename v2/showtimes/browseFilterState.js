/**
 * Canonical Browse All Showtimes filter state — normalization and defaults.
 */

import { pacificDateString } from '../explore/exploreCatalog.js';
import { resolveShowtimesBrowseDateWindow } from './showtimeEligibility.js';

/** @typedef {'today' | 'tomorrow' | 'week' | 'range'} BrowseDateSelectionMode */
/** @typedef {'any' | 'morning' | 'afternoon' | 'evening' | 'late' | 'custom'} BrowseTimePreset */
/** @typedef {'any' | 'saved' | 'not_saved'} BrowseSavedMode */
/** @typedef {'any' | 'not_seen' | 'seen'} BrowseSeenMode */
/** @typedef {'any' | 'hide' | 'only'} BrowseNotInterestedMode */
/** @typedef {'earliest' | 'title_az' | 'shortest' | 'longest'} BrowseSortMode */

export const BROWSE_SAVED_MODES = Object.freeze(['any', 'saved', 'not_saved']);
export const BROWSE_SEEN_MODES = Object.freeze(['any', 'not_seen', 'seen']);
export const BROWSE_NOT_INTERESTED_MODES = Object.freeze([
  'any',
  'hide',
  'only',
]);
export const BROWSE_SORT_MODES = Object.freeze([
  'earliest',
  'title_az',
  'shortest',
  'longest',
]);

/**
 * @param {Date | (() => Date)} [now]
 */
function resolveNow(now = new Date()) {
  return typeof now === 'function' ? now() : now;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asIsoDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} fallback
 */
function asEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/**
 * @typedef {object} BrowseFilters
 * @property {{ mode: string, startDate: string, endDate: string }} dateSelection
 * @property {{ preset: string, customStartMin: number | null, customEndMin: number | null }} time
 * @property {string[]} theaterIds
 * @property {boolean} favoritesOnly
 * @property {string[]} formatKeys
 * @property {string} savedMode
 * @property {string} seenMode
 * @property {string} notInterestedMode
 * @property {string} sortMode
 * @property {string | null} expandedFilmKey
 * @property {number} scrollY
 */

/**
 * @param {Date | (() => Date)} [now]
 * @returns {BrowseFilters}
 */
export function createDefaultBrowseFilters(now = new Date()) {
  const today = pacificDateString(resolveNow(now));
  return {
    dateSelection: {
      mode: 'today',
      startDate: today,
      endDate: today,
    },
    time: {
      preset: 'any',
      customStartMin: null,
      customEndMin: null,
    },
    theaterIds: [],
    favoritesOnly: false,
    formatKeys: [],
    savedMode: 'any',
    seenMode: 'any',
    notInterestedMode: 'any',
    sortMode: 'earliest',
    expandedFilmKey: null,
    scrollY: 0,
  };
}

/**
 * Map legacy `dateMode` to canonical dateSelection.
 * @param {'today' | 'tomorrow' | 'week'} dateMode
 * @param {Date | (() => Date)} [now]
 */
export function dateModeToDateSelection(dateMode, now = new Date()) {
  const window = resolveShowtimesBrowseDateWindow(dateMode, now);
  return {
    mode: dateMode === 'week' ? 'week' : dateMode,
    startDate: window.startDate,
    endDate: window.endDate,
  };
}

/**
 * Map legacy `timeRangeId` to canonical time filter.
 * @param {string | null | undefined} timeRangeId
 */
export function legacyTimeRangeToTime(timeRangeId) {
  const id = typeof timeRangeId === 'string' ? timeRangeId.trim() : '';
  if (!id || id === 'any') {
    return { preset: 'any', customStartMin: null, customEndMin: null };
  }
  const presets = new Set(['morning', 'afternoon', 'evening', 'late']);
  if (presets.has(id)) {
    return { preset: id, customStartMin: null, customEndMin: null };
  }
  return { preset: 'any', customStartMin: null, customEndMin: null };
}

/**
 * Normalize legacy ShowtimesBrowseUiState into canonical BrowseFilters.
 * @param {object | null | undefined} ui
 * @param {Date | (() => Date)} [now]
 */
export function normalizeLegacyBrowseUi(ui, now = new Date()) {
  const base = createDefaultBrowseFilters(now);
  if (!ui || typeof ui !== 'object') return base;

  const dateMode = asEnum(
    ui.dateMode,
    ['today', 'tomorrow', 'week'],
    'today',
  );
  base.dateSelection = dateModeToDateSelection(dateMode, now);
  base.time = legacyTimeRangeToTime(ui.timeRangeId);
  base.theaterIds = Array.isArray(ui.theaterIds)
    ? ui.theaterIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  base.formatKeys = Array.isArray(ui.formatKeys)
    ? ui.formatKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
    : [];
  base.expandedFilmKey =
    typeof ui.expandedFilmKey === 'string' ? ui.expandedFilmKey : null;
  base.scrollY =
    typeof ui.scrollY === 'number' && Number.isFinite(ui.scrollY)
      ? ui.scrollY
      : 0;
  return base;
}

/**
 * Normalize partial / persisted filter state into canonical BrowseFilters.
 * Accepts legacy browseUi fields and new canonical fields.
 * @param {object | null | undefined} raw
 * @param {Date | (() => Date)} [now]
 */
export function normalizeBrowseFilters(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') {
    return createDefaultBrowseFilters(now);
  }

  const base = createDefaultBrowseFilters(now);
  const today = pacificDateString(resolveNow(now));

  if (raw.dateSelection && typeof raw.dateSelection === 'object') {
    const mode = asEnum(
      raw.dateSelection.mode,
      ['today', 'tomorrow', 'week', 'range'],
      'today',
    );
    if (mode === 'today' || mode === 'tomorrow' || mode === 'week') {
      base.dateSelection = dateModeToDateSelection(mode, now);
    } else {
      let startDate = asIsoDate(raw.dateSelection.startDate) ?? today;
      let endDate = asIsoDate(raw.dateSelection.endDate) ?? startDate;
      if (endDate < startDate) {
        const swap = startDate;
        startDate = endDate;
        endDate = swap;
      }
      base.dateSelection = { mode: 'range', startDate, endDate };
    }
  } else if (raw.dateMode) {
    base.dateSelection = dateModeToDateSelection(
      asEnum(raw.dateMode, ['today', 'tomorrow', 'week'], 'today'),
      now,
    );
  }

  if (raw.time && typeof raw.time === 'object') {
    const preset = asEnum(
      raw.time.preset,
      ['any', 'morning', 'afternoon', 'evening', 'late', 'custom'],
      'any',
    );
    const customStartMin =
      typeof raw.time.customStartMin === 'number' &&
      Number.isFinite(raw.time.customStartMin)
        ? Math.max(0, Math.min(1439, Math.trunc(raw.time.customStartMin)))
        : null;
    const customEndMin =
      typeof raw.time.customEndMin === 'number' &&
      Number.isFinite(raw.time.customEndMin)
        ? Math.max(0, Math.min(1439, Math.trunc(raw.time.customEndMin)))
        : null;
    if (preset === 'custom') {
      base.time = {
        preset: 'custom',
        customStartMin,
        customEndMin,
      };
    } else {
      base.time = {
        preset,
        customStartMin: null,
        customEndMin: null,
      };
    }
  } else if (raw.timeRangeId !== undefined) {
    base.time = legacyTimeRangeToTime(raw.timeRangeId);
  }

  base.theaterIds = Array.isArray(raw.theaterIds)
    ? raw.theaterIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  base.favoritesOnly = raw.favoritesOnly === true;
  base.formatKeys = Array.isArray(raw.formatKeys)
    ? raw.formatKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
    : [];
  base.savedMode = asEnum(raw.savedMode, BROWSE_SAVED_MODES, 'any');
  base.seenMode = asEnum(raw.seenMode, BROWSE_SEEN_MODES, 'any');
  base.notInterestedMode = asEnum(
    raw.notInterestedMode,
    BROWSE_NOT_INTERESTED_MODES,
    'any',
  );
  base.sortMode = asEnum(raw.sortMode, BROWSE_SORT_MODES, 'earliest');
  base.expandedFilmKey =
    typeof raw.expandedFilmKey === 'string' ? raw.expandedFilmKey : null;
  base.scrollY =
    typeof raw.scrollY === 'number' && Number.isFinite(raw.scrollY)
      ? raw.scrollY
      : 0;

  return base;
}

/**
 * Project canonical filters to legacy browseUi for unchanged surface wiring.
 * @param {BrowseFilters} filters
 */
export function browseFiltersToLegacyUi(filters) {
  const dateMode =
    filters.dateSelection.mode === 'range'
      ? 'week'
      : filters.dateSelection.mode;
  const timeRangeId =
    filters.time.preset === 'custom' ? 'any' : filters.time.preset;
  return {
    dateMode,
    theaterIds: [...filters.theaterIds],
    formatKeys: [...filters.formatKeys],
    timeRangeId,
    expandedFilmKey: filters.expandedFilmKey,
    scrollY: filters.scrollY,
  };
}

/**
 * Persistable Browse UI: legacy fields + canonical sheet fields.
 * @param {BrowseFilters} filters
 */
export function browseFiltersToNavUi(filters) {
  return {
    ...browseFiltersToLegacyUi(filters),
    dateSelection: {
      mode: filters.dateSelection.mode,
      startDate: filters.dateSelection.startDate,
      endDate: filters.dateSelection.endDate,
    },
    time: {
      preset: filters.time.preset,
      customStartMin: filters.time.customStartMin,
      customEndMin: filters.time.customEndMin,
    },
    favoritesOnly: filters.favoritesOnly === true,
    savedMode: filters.savedMode,
    seenMode: filters.seenMode,
    notInterestedMode: filters.notInterestedMode,
    sortMode: filters.sortMode,
  };
}

/**
 * Sheet-editable fields only (date + sort stay on the main page).
 * @param {BrowseFilters} filters
 */
export function cloneBrowseSheetDraft(filters) {
  const normalized = normalizeBrowseFilters(filters);
  return {
    time: {
      preset: normalized.time.preset,
      customStartMin: normalized.time.customStartMin,
      customEndMin: normalized.time.customEndMin,
    },
    theaterIds: [...normalized.theaterIds],
    favoritesOnly: normalized.favoritesOnly === true,
    formatKeys: [...normalized.formatKeys],
    savedMode: normalized.savedMode,
    seenMode: normalized.seenMode,
    notInterestedMode: normalized.notInterestedMode,
  };
}

/**
 * Reset sheet draft fields to defaults while preserving applied date/sort.
 * @param {BrowseFilters} applied
 */
export function resetBrowseSheetDraft(applied) {
  const base = normalizeBrowseFilters(applied);
  return {
    time: { preset: 'any', customStartMin: null, customEndMin: null },
    theaterIds: [],
    favoritesOnly: false,
    formatKeys: [],
    savedMode: 'any',
    seenMode: 'any',
    notInterestedMode: 'any',
    // Carry date/sort only for preview merge convenience when callers need them.
    dateSelection: { ...base.dateSelection },
    sortMode: base.sortMode,
  };
}

/**
 * Merge applied filters with an in-sheet draft (Apply / preview).
 * @param {BrowseFilters} applied
 * @param {ReturnType<typeof cloneBrowseSheetDraft>} draft
 */
export function mergeBrowseSheetDraft(applied, draft) {
  const base = normalizeBrowseFilters(applied);
  const sheet = draft && typeof draft === 'object' ? draft : {};
  return normalizeBrowseFilters({
    ...base,
    time: sheet.time ?? base.time,
    theaterIds: Array.isArray(sheet.theaterIds)
      ? sheet.theaterIds
      : base.theaterIds,
    favoritesOnly: sheet.favoritesOnly === true,
    formatKeys: Array.isArray(sheet.formatKeys)
      ? sheet.formatKeys
      : base.formatKeys,
    savedMode: sheet.savedMode ?? base.savedMode,
    seenMode: sheet.seenMode ?? base.seenMode,
    notInterestedMode: sheet.notInterestedMode ?? base.notInterestedMode,
  });
}

/**
 * @param {string | null | undefined} emptyReason
 * @param {'today' | 'tomorrow' | 'week' | 'range' | string} [dateMode]
 * @returns {string | null}
 */
export function browseEmptyMessageForReason(emptyReason, dateMode = 'today') {
  if (!emptyReason || emptyReason === 'unavailable') return null;
  if (emptyReason === 'no_date_results') {
    if (dateMode === 'tomorrow') return 'No showtimes tomorrow.';
    if (dateMode === 'range') return 'No showtimes on these dates.';
    if (dateMode === 'week') {
      return 'No showtimes found in the next 7 days.';
    }
    return 'No more showtimes today.';
  }
  if (emptyReason === 'saved_zero') {
    return 'No saved films have showtimes in this period.';
  }
  if (emptyReason === 'favorites_empty') {
    return 'Add favorite theaters to use this filter.';
  }
  if (
    emptyReason === 'filtered_zero' ||
    emptyReason === 'format_zero'
  ) {
    return 'No showtimes match these filters.';
  }
  return 'No showtimes match these filters.';
}
