/**
 * Shared opening/first-screening date resolution for Just Announced.
 *
 * Prefers Opening This Week `openingDate` when the film is also in that
 * artifact; otherwise uses the earliest active screening date.
 * Never uses first_announced_date / firstObservedAt — that explains shelf
 * membership (announcement recency), not when the film screens.
 */

import { formatShelfDetailMonthDay } from '../homeShelfDetail/formatShelfDetailMonthDay.js';

/**
 * @param {object} entry newlyAdded summary
 * @param {object} homeData
 * @returns {string | null} YYYY-MM-DD
 */
export function resolveJustAnnouncedOpeningDate(entry, homeData) {
  const filmKey = entry?.filmKey;
  if (!filmKey) return null;

  const openingEntries = Array.isArray(homeData?.openingThisWeek?.entries)
    ? homeData.openingThisWeek.entries
    : [];
  for (const opening of openingEntries) {
    if (
      opening?.filmKey === filmKey ||
      opening?.showtimeFilmKey === filmKey ||
      opening?.parentFilmKey === filmKey
    ) {
      const openingDate =
        typeof opening.openingDate === 'string' ? opening.openingDate.trim() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(openingDate)) return openingDate;
    }
  }

  const next = entry.nextShowtimeAt;
  if (typeof next === 'string' && next.length >= 10) {
    const datePart = next.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }

  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  let earliest = null;
  for (const opportunity of opportunities) {
    if (opportunity?.filmKey !== filmKey) continue;
    const localDate =
      typeof opportunity.localDate === 'string'
        ? opportunity.localDate.trim()
        : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) continue;
    if (!earliest || localDate < earliest) earliest = localDate;
  }
  return earliest;
}

/** @deprecated Prefer formatShelfDetailMonthDay — kept as JA alias. */
export function formatJustAnnouncedMonthDay(isoDate) {
  return formatShelfDetailMonthDay(isoDate);
}

/**
 * User-facing opening/first-screening line for Just Announced cards.
 * Examples: "Opens Sep 12", "Opens today", "Opened Sep 5"
 *
 * @param {string | null | undefined} openingDate YYYY-MM-DD
 * @param {string | null | undefined} [todayIso] YYYY-MM-DD
 * @returns {string | null}
 */
export function buildJustAnnouncedOpeningDateLabel(openingDate, todayIso = null) {
  const short = formatShelfDetailMonthDay(openingDate);
  if (!short || typeof openingDate !== 'string') return null;
  if (todayIso && openingDate === todayIso) return 'Opens today';
  if (todayIso && openingDate > todayIso) return `Opens ${short}`;
  if (todayIso && openingDate < todayIso) return `Opened ${short}`;
  return `Opens ${short}`;
}
