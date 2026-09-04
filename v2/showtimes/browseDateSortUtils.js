/**
 * Browse Dates / Sort helpers — pure, testable.
 */

import {
  formatCompactDateLabel,
  formatCompactDateRange,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import { dateModeToDateSelection } from './browseFilterState.js';

export const BROWSE_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'earliest', label: 'Earliest showtime' }),
  Object.freeze({ id: 'title_az', label: 'A–Z' }),
  Object.freeze({ id: 'shortest', label: 'Shortest' }),
  Object.freeze({ id: 'longest', label: 'Longest' }),
]);

/**
 * @param {string} iso
 */
function parseIsoParts(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/**
 * Compact range for summary: `Sep 4–6` or `Sep 29–Oct 2`.
 * @param {string} startIso
 * @param {string} endIso
 */
export function formatBrowseShortDateRange(startIso, endIso) {
  const start = parseIsoParts(startIso);
  const end = parseIsoParts(endIso);
  if (!start || !end) return formatCompactDateRange(startIso, endIso);

  const monthFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
  });
  const startDate = new Date(Date.UTC(start.y, start.m - 1, start.d, 12));
  const endDate = new Date(Date.UTC(end.y, end.m - 1, end.d, 12));
  const startMonth = monthFmt.format(startDate);
  const endMonth = monthFmt.format(endDate);

  if (start.y === end.y && start.m === end.m) {
    return `${startMonth} ${start.d}–${end.d}`;
  }
  return `${startMonth} ${start.d}–${endMonth} ${end.d}`;
}

/**
 * Summary date phrase (Today / Tomorrow / This week / Fri, Sep 4 / Sep 4–6).
 * @param {{ mode?: string, startDate?: string, endDate?: string }} dateSelection
 */
export function formatBrowseDateSummaryPhrase(dateSelection) {
  const mode =
    typeof dateSelection?.mode === 'string' ? dateSelection.mode : 'today';
  if (mode === 'today') return 'Today';
  if (mode === 'tomorrow') return 'Tomorrow';
  if (mode === 'week') return 'This week';
  const start = dateSelection?.startDate;
  const end = dateSelection?.endDate ?? start;
  if (typeof start !== 'string') return 'Dates';
  if (start === end) return formatCompactDateLabel(start);
  return formatBrowseShortDateRange(start, end);
}

/**
 * Horizon copy: `Showtimes available Sep 3–16`.
 * @param {{ minDate: string | null, maxDate: string | null }} horizon
 */
export function formatBrowseHorizonLabel(horizon) {
  if (!horizon?.minDate || !horizon?.maxDate) {
    return 'Showtimes availability unknown';
  }
  if (horizon.minDate === horizon.maxDate) {
    return `Showtimes available ${formatCompactDateLabel(horizon.minDate).replace(/^[^,]+,\s*/, '')}`;
  }
  return `Showtimes available ${formatBrowseShortDateRange(horizon.minDate, horizon.maxDate)}`;
}

/**
 * @param {string} iso
 * @param {{ minDate: string | null, maxDate: string | null }} horizon
 */
export function clampIsoDateToHorizon(iso, horizon) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return horizon?.minDate ?? null;
  }
  if (horizon?.minDate && iso < horizon.minDate) return horizon.minDate;
  if (horizon?.maxDate && iso > horizon.maxDate) return horizon.maxDate;
  return iso;
}

/**
 * @param {{
 *   pickerMode: 'single' | 'range',
 *   startDate: string | null,
 *   endDate: string | null,
 * }} draft
 * @param {{ minDate: string | null, maxDate: string | null }} horizon
 */
export function validateBrowseDateDraft(draft, horizon) {
  const start = clampIsoDateToHorizon(draft?.startDate, horizon);
  const endRaw = clampIsoDateToHorizon(
    draft?.pickerMode === 'single' ? draft?.startDate : draft?.endDate,
    horizon,
  );
  if (!start || !endRaw) {
    return {
      ok: false,
      error: 'Pick a date within available showtimes.',
      startDate: start,
      endDate: endRaw,
    };
  }
  if (draft?.pickerMode === 'range' && endRaw < start) {
    return {
      ok: false,
      error: 'End date must be on or after the start date.',
      startDate: start,
      endDate: endRaw,
    };
  }
  const endDate = draft?.pickerMode === 'single' ? start : endRaw;
  return {
    ok: true,
    error: null,
    startDate: start,
    endDate,
  };
}

/**
 * Build applied dateSelection from a validated date draft.
 * @param {{ pickerMode: 'single' | 'range', startDate: string, endDate: string }} draft
 */
export function dateSelectionFromBrowseDateDraft(draft) {
  const start = draft.startDate;
  const end = draft.pickerMode === 'single' ? draft.startDate : draft.endDate;
  return {
    mode: 'range',
    startDate: start,
    endDate: end,
  };
}

/**
 * Initialize date-sheet draft from applied filters.
 * @param {import('./browseFilterState.js').BrowseFilters} applied
 * @param {{ minDate: string | null, maxDate: string | null }} horizon
 * @param {Date | (() => Date)} [now]
 */
export function createBrowseDateDraftFromApplied(applied, horizon, now = new Date()) {
  const selection = applied?.dateSelection;
  const today = pacificDateString(typeof now === 'function' ? now() : now);
  const fallback = clampIsoDateToHorizon(
    selection?.startDate ?? today,
    horizon,
  ) ?? today;

  if (selection?.mode === 'range') {
    const start = clampIsoDateToHorizon(selection.startDate, horizon) ?? fallback;
    const end = clampIsoDateToHorizon(selection.endDate, horizon) ?? start;
    const single = start === end;
    return {
      pickerMode: single ? 'single' : 'range',
      startDate: start,
      endDate: end,
    };
  }

  const presetStart = clampIsoDateToHorizon(
    selection?.startDate ?? today,
    horizon,
  ) ?? fallback;
  return {
    pickerMode: 'single',
    startDate: presetStart,
    endDate: presetStart,
  };
}

/**
 * Reset date draft to Today (clamped to horizon).
 * @param {{ minDate: string | null, maxDate: string | null }} horizon
 * @param {Date | (() => Date)} [now]
 */
export function resetBrowseDateDraftToToday(horizon, now = new Date()) {
  const todaySel = dateModeToDateSelection('today', now);
  const start =
    clampIsoDateToHorizon(todaySel.startDate, horizon) ?? todaySel.startDate;
  return {
    pickerMode: 'single',
    startDate: start,
    endDate: start,
  };
}

/**
 * @param {string} sortMode
 */
export function browseSortOptionLabel(sortMode) {
  return (
    BROWSE_SORT_OPTIONS.find((option) => option.id === sortMode)?.label ??
    'Earliest showtime'
  );
}
