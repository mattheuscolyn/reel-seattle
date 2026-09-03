/**
 * Shared Pacific showtime eligibility helpers for the Showtimes browse surface.
 * Centralized so Film Detail / Theater Detail can reuse later.
 */

import {
  addIsoDays,
  pacificDateString,
} from '../explore/exploreCatalog.js';

/**
 * @param {Date | (() => Date)} [now]
 * @returns {Date}
 */
function resolveNow(now = new Date()) {
  return typeof now === 'function' ? now() : now;
}

/**
 * Pacific calendar YYYY-MM-DD + HH:MM as `YYYY-MM-DDTHH:MM` (hourCycle h23).
 * @param {Date | (() => Date)} [now]
 */
export function pacificSortableDateTime(now = new Date()) {
  const instant = resolveNow(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = get('year');
  const m = get('month');
  const d = get('day');
  let hour = get('hour');
  const minute = get('minute');
  if (!y || !m || !d || hour == null || minute == null) {
    return `${pacificDateString(instant)}T00:00`;
  }
  // Some engines emit "24" for midnight under h23 — normalize.
  if (hour === '24') hour = '00';
  return `${y}-${m}-${d}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/**
 * @param {unknown} localTime
 * @returns {number | null} minutes from midnight
 */
export function parseLocalTimeMinutes(localTime) {
  if (typeof localTime !== 'string') return null;
  const trimmed = localTime.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * @param {object} opportunity
 * @returns {string | null} `YYYY-MM-DDTHH:MM`
 */
export function opportunitySortableKey(opportunity) {
  const raw = opportunity?.sortableLocalDateTime;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 16);
  }
  const date = opportunity?.localDate;
  const mins = parseLocalTimeMinutes(opportunity?.localTime);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || mins == null) {
    return null;
  }
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}`;
}

/**
 * Stable dedupe identity for an opportunity.
 * Prefers opportunityKey; falls back to film/theater/date/time/formats.
 * @param {object} opportunity
 */
export function opportunityDedupeKey(opportunity) {
  const key = opportunity?.opportunityKey;
  if (typeof key === 'string' && key.trim()) return `id:${key.trim()}`;
  const formats = Array.isArray(opportunity?.formatLabels)
    ? opportunity.formatLabels.map((t) => String(t).toLowerCase()).sort().join(',')
    : '';
  return [
    opportunity?.filmKey ?? '',
    opportunity?.theaterId ?? '',
    opportunity?.localDate ?? '',
    opportunity?.localTime ?? '',
    formats,
  ].join('|');
}

/**
 * @typedef {'today' | 'tomorrow' | 'week'} ShowtimesBrowseDateMode
 */

/**
 * @param {ShowtimesBrowseDateMode} dateMode
 * @param {Date | (() => Date)} [now]
 */
export function resolveShowtimesBrowseDateWindow(dateMode, now = new Date()) {
  const today = pacificDateString(resolveNow(now));
  const tomorrow = addIsoDays(today, 1);
  const weekEnd = addIsoDays(today, 6);
  if (dateMode === 'tomorrow') {
    return { startDate: tomorrow, endDate: tomorrow, today };
  }
  if (dateMode === 'week') {
    return { startDate: today, endDate: weekEnd, today };
  }
  return { startDate: today, endDate: today, today };
}

/**
 * @typedef {{ minDate: string | null, maxDate: string | null }} BrowseDateHorizon
 * @typedef {{ startDate: string, endDate: string, today: string }} BrowseDateBounds
 */

/**
 * @param {object | null | undefined} homeData
 * @returns {BrowseDateHorizon}
 */
export function getBrowseOpportunityDateHorizon(homeData) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  /** @type {string | null} */
  let minDate = null;
  /** @type {string | null} */
  let maxDate = null;
  for (const opp of opportunities) {
    const localDate = opp?.localDate;
    if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      continue;
    }
    if (!minDate || localDate < minDate) minDate = localDate;
    if (!maxDate || localDate > maxDate) maxDate = localDate;
  }
  return { minDate, maxDate };
}

/**
 * @param {{ mode?: string, startDate?: string, endDate?: string }} dateSelection
 * @param {Date | (() => Date)} [now]
 * @returns {BrowseDateBounds}
 */
export function resolveBrowseDateBounds(dateSelection, now = new Date()) {
  const today = pacificDateString(resolveNow(now));
  const mode =
    typeof dateSelection?.mode === 'string' ? dateSelection.mode : 'today';
  if (mode === 'tomorrow') {
    return resolveShowtimesBrowseDateWindow('tomorrow', now);
  }
  if (mode === 'week') {
    return resolveShowtimesBrowseDateWindow('week', now);
  }
  if (mode === 'range') {
    let startDate =
      typeof dateSelection.startDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateSelection.startDate)
        ? dateSelection.startDate
        : today;
    let endDate =
      typeof dateSelection.endDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateSelection.endDate)
        ? dateSelection.endDate
        : startDate;
    if (endDate < startDate) {
      const swap = startDate;
      startDate = endDate;
      endDate = swap;
    }
    return { startDate, endDate, today };
  }
  return resolveShowtimesBrowseDateWindow('today', now);
}

/**
 * Clamp requested bounds to available opportunity dates.
 * @param {BrowseDateBounds} bounds
 * @param {BrowseDateHorizon} horizon
 * @returns {BrowseDateBounds & { hasIntersection: boolean }}
 */
export function clampBrowseDateBounds(bounds, horizon) {
  if (!horizon.minDate || !horizon.maxDate) {
    return { ...bounds, hasIntersection: true };
  }
  const startDate =
    bounds.startDate < horizon.minDate ? horizon.minDate : bounds.startDate;
  const endDate =
    bounds.endDate > horizon.maxDate ? horizon.maxDate : bounds.endDate;
  return {
    startDate,
    endDate,
    today: bounds.today,
    hasIntersection: startDate <= endDate,
  };
}

/**
 * Whether an opportunity is eligible under inclusive date bounds.
 * Excludes past Pacific dates, already-passed times on Pacific today only,
 * unparseable times, and opportunities without a resolvable filmKey.
 *
 * @param {object} opportunity
 * @param {{
 *   startDate: string,
 *   endDate: string,
 *   today: string,
 *   filmsByKey: Map<string, object> | Record<string, object>,
 *   now?: Date | (() => Date),
 * }} options
 */
export function isEligibleBrowseOpportunityForDateBounds(opportunity, options) {
  if (!opportunity || typeof opportunity !== 'object') return false;
  const filmKey =
    typeof opportunity.filmKey === 'string' ? opportunity.filmKey.trim() : '';
  if (!filmKey) return false;

  const filmsByKey = options.filmsByKey;
  const film =
    filmsByKey instanceof Map
      ? filmsByKey.get(filmKey)
      : filmsByKey?.[filmKey];
  if (!film) return false;

  const localDate = opportunity.localDate;
  if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return false;
  }

  const sortable = opportunitySortableKey(opportunity);
  if (!sortable) return false;

  const { startDate, endDate, today } = options;
  if (localDate < startDate || localDate > endDate) return false;

  const nowKey = pacificSortableDateTime(options.now);
  if (localDate === today && sortable < nowKey) return false;
  if (localDate < today) return false;

  return true;
}

/**
 * Whether an opportunity is eligible for the browse surface under a date mode.
 * Excludes past Pacific dates, already-passed Today times, unparseable times,
 * and opportunities without a resolvable filmKey in filmsByKey.
 *
 * @param {object} opportunity
 * @param {{
 *   dateMode: ShowtimesBrowseDateMode,
 *   filmsByKey: Map<string, object> | Record<string, object>,
 *   now?: Date | (() => Date),
 * }} options
 */
export function isEligibleBrowseOpportunity(opportunity, options) {
  const bounds = resolveShowtimesBrowseDateWindow(options.dateMode, options.now);
  return isEligibleBrowseOpportunityForDateBounds(opportunity, {
    ...bounds,
    filmsByKey: options.filmsByKey,
    now: options.now,
  });
}

/**
 * Filter + dedupe eligible opportunities for a canonical date selection.
 * @param {object | null | undefined} homeData
 * @param {{ mode?: string, startDate?: string, endDate?: string }} dateSelection
 * @param {Date | (() => Date)} [now]
 * @returns {object[]}
 */
export function listEligibleBrowseOpportunitiesForDateSelection(
  homeData,
  dateSelection,
  now = new Date(),
) {
  const horizon = getBrowseOpportunityDateHorizon(homeData);
  const bounds = resolveBrowseDateBounds(dateSelection, now);
  const clamped = clampBrowseDateBounds(bounds, horizon);
  if (!clamped.hasIntersection) return [];

  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const filmsByKey = new Map(
    (Array.isArray(homeData?.films) ? homeData.films : []).map((f) => [
      f.filmKey,
      f,
    ]),
  );

  /** @type {Map<string, object>} */
  const seen = new Map();
  for (const opp of opportunities) {
    if (
      !isEligibleBrowseOpportunityForDateBounds(opp, {
        startDate: clamped.startDate,
        endDate: clamped.endDate,
        today: clamped.today,
        filmsByKey,
        now,
      })
    ) {
      continue;
    }
    const dedupe = opportunityDedupeKey(opp);
    if (seen.has(dedupe)) continue;
    seen.set(dedupe, opp);
  }

  return [...seen.values()].sort((a, b) => {
    const ka = opportunitySortableKey(a) ?? '';
    const kb = opportunitySortableKey(b) ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.opportunityKey ?? '').localeCompare(
      String(b.opportunityKey ?? ''),
    );
  });
}

/**
 * Filter + dedupe eligible opportunities for a date mode.
 * @param {object | null | undefined} homeData
 * @param {ShowtimesBrowseDateMode} dateMode
 * @param {Date | (() => Date)} [now]
 * @returns {object[]}
 */
export function listEligibleBrowseOpportunities(homeData, dateMode, now = new Date()) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const filmsByKey = new Map(
    (Array.isArray(homeData?.films) ? homeData.films : []).map((f) => [
      f.filmKey,
      f,
    ]),
  );

  /** @type {Map<string, object>} */
  const seen = new Map();
  for (const opp of opportunities) {
    if (!isEligibleBrowseOpportunity(opp, { dateMode, filmsByKey, now })) {
      continue;
    }
    const dedupe = opportunityDedupeKey(opp);
    if (seen.has(dedupe)) continue;
    seen.set(dedupe, opp);
  }

  return [...seen.values()].sort((a, b) => {
    const ka = opportunitySortableKey(a) ?? '';
    const kb = opportunitySortableKey(b) ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.opportunityKey ?? '').localeCompare(
      String(b.opportunityKey ?? ''),
    );
  });
}
