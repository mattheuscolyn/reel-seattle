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

  const { startDate, endDate, today } = resolveShowtimesBrowseDateWindow(
    options.dateMode,
    options.now,
  );
  if (localDate < startDate || localDate > endDate) return false;

  const nowKey = pacificSortableDateTime(options.now);
  // Drop anything already started (Today and the "today" portion of This week).
  if (localDate === today && sortable < nowKey) return false;
  // Never include past calendar days.
  if (localDate < today) return false;

  return true;
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
