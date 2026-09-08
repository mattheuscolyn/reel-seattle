/**
 * Canonical screening identity, Seattle time, and presentation labels.
 *
 * HomeData.opportunities is the single screening list. Recommendations and
 * newly generated plans must reference those rows — not approximate copies.
 *
 * Time rules:
 * - Wall-clock date/time is America/Los_Angeles unless a source supplies a
 *   more specific valid timezone (none currently do).
 * - “Today” is the Seattle calendar date.
 * - Actionable cutoff is the actual current Pacific time
 *   (`ACTIONABLE_CUTOFF_MINUTES = 0`). Ranking may still penalize imminence.
 * - Daily schedules that are meant to be complete keep already-started times.
 */

import { pacificDateString } from '../explore/exploreCatalog.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import {
  opportunitySortableKey,
  pacificSortableDateTime,
} from './showtimeEligibility.js';

export const SEATTLE_TIMEZONE = 'America/Los_Angeles';

/** Minutes before start when a screening is no longer actionable. */
export const ACTIONABLE_CUTOFF_MINUTES = 0;

/** User-facing state for an already-started screening on a complete schedule. */
export const STARTED_SCREENING_LABEL = 'Started';

/** User-facing state when a screening cannot be booked. */
export const UNAVAILABLE_SCREENING_LABEL = 'Unavailable';

const DST_BEHIND_UTC_MS = Object.freeze([
  7 * 60 * 60 * 1000, // PDT
  8 * 60 * 60 * 1000, // PST
]);

/**
 * @param {Date | (() => Date) | string | number | null | undefined} now
 * @returns {Date}
 */
export function resolveClock(now = new Date()) {
  if (typeof now === 'function') return now();
  if (now instanceof Date) return now;
  if (typeof now === 'string' || typeof now === 'number') {
    const parsed = new Date(now);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Convert a Seattle wall-clock date + time to epoch ms.
 * Spring-forward gaps snap to the next valid instant. Fall-back overlaps
 * prefer the first (daylight) occurrence.
 *
 * @param {string} localDate YYYY-MM-DD
 * @param {string} localTime HH:MM or HH:MM:SS
 * @returns {number | null}
 */
export function seattleWallTimeToUtcMs(localDate, localTime, options = {}) {
  const date = asTrimmed(localDate);
  const time = asTrimmed(localTime);
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    ![year, month, day, hour, minute].every((n) => Number.isInteger(n)) ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const target = `${date}T${hhmm}`;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);

  /** @type {number[]} */
  const matches = [];
  for (const behind of DST_BEHIND_UTC_MS) {
    const instant = asUtc + behind;
    if (pacificSortableDateTime(new Date(instant)) === target) {
      matches.push(instant);
    }
  }
  if (matches.length > 0) {
    const index = options.occurrence === 'second' ? matches.length - 1 : 0;
    return matches[index];
  }

  // Non-existent spring-forward time: walk forward in 15-minute steps.
  for (let add = 15; add <= 180; add += 15) {
    const nextMin = hour * 60 + minute + add;
    const nextHour = Math.floor(nextMin / 60);
    if (nextHour > 23) break;
    const nextTime = `${String(nextHour).padStart(2, '0')}:${String(
      nextMin % 60,
    ).padStart(2, '0')}`;
    const snapped = seattleWallTimeToUtcMs(date, nextTime);
    if (snapped != null) return snapped;
  }
  return null;
}

/**
 * ISO-8601 local Seattle timestamp with numeric offset, e.g. 2026-09-07T19:30:00-07:00.
 *
 * @param {string} localDate
 * @param {string} localTime
 * @returns {string | null}
 */
export function seattleStartsAtIso(localDate, localTime, options = {}) {
  const ms = seattleWallTimeToUtcMs(localDate, localTime, options);
  if (ms == null) return null;
  const date = asTrimmed(localDate);
  const time = asTrimmed(localTime);
  if (!date || !time) return null;
  const hhmm = time.slice(0, 5);
  const asUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Number(hhmm.slice(0, 2)),
    Number(hhmm.slice(3, 5)),
  );
  const offsetMin = Math.round((asUtc - ms) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offH = String(Math.floor(abs / 60)).padStart(2, '0');
  const offM = String(abs % 60).padStart(2, '0');
  return `${date}T${hhmm}:00${sign}${offH}:${offM}`;
}

/**
 * User-facing format / accessibility label. Raw slugs never pass through.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function formatPresentationLabel(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const mapped = formatUserFacingFormatLabel(trimmed);
  if (mapped) return mapped;
  const collapsed = trimmed.toLowerCase().replace(/[_]+/g, '-');
  return formatUserFacingFormatLabel(collapsed);
}

/**
 * @param {unknown} rawLabels
 * @returns {string[]}
 */
export function formatPresentationLabels(rawLabels) {
  if (!Array.isArray(rawLabels)) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of rawLabels) {
    const label = formatPresentationLabel(raw);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * @param {unknown} rawLabels
 * @returns {string | null}
 */
export function primaryPresentationLabel(rawLabels) {
  return formatPresentationLabels(rawLabels)[0] ?? null;
}

const ACCESSIBILITY_LABELS = new Set([
  'closed captions',
  'open captions',
  'audio description',
  'oc',
  'cc',
]);

/**
 * @param {unknown} rawLabels
 * @returns {string[]}
 */
export function accessibilityPresentationLabels(rawLabels) {
  return formatPresentationLabels(rawLabels).filter((label) =>
    ACCESSIBILITY_LABELS.has(label.toLowerCase()),
  );
}

/**
 * Content identity that ignores source-owned ids and equivalent format slugs.
 *
 * @param {object | null | undefined} screening
 * @returns {string}
 */
export function screeningContentKey(screening) {
  const formats = formatPresentationLabels(screening?.formatLabels)
    .map((label) => label.toLowerCase())
    .sort()
    .join(',');
  return [
    asTrimmed(screening?.filmKey) ?? '',
    asTrimmed(screening?.theaterId) ?? '',
    asTrimmed(screening?.localDate) ?? '',
    (asTrimmed(screening?.localTime) ?? '').slice(0, 5),
    formats,
  ].join('|');
}

/**
 * Stable screening identity.
 *
 * Preference:
 * 1. Trustworthy source + source_showtime_id
 * 2. Composite of film, theater, start instant (offset included), and
 *    normalized presentation labels
 *
 * Does not use artifact array position, ingestion order, display copy,
 * or raw format slugs. Artifact `id` hashes are not used here because they
 * omit format and DST offset. `opportunityKey` may still use them for
 * backward-compatible lookups.
 *
 * @param {object | null | undefined} parts
 * @returns {string | null}
 */
export function buildStableScreeningId(parts) {
  const source = asTrimmed(parts?.source);
  const sourceShowtimeId = asTrimmed(parts?.sourceShowtimeId);
  if (source && sourceShowtimeId) {
    return `src:${source}:${sourceShowtimeId}`;
  }

  const filmKey = asTrimmed(parts?.filmKey);
  const theaterId = asTrimmed(parts?.theaterId);
  const startsAt =
    asTrimmed(parts?.startsAt) ??
    seattleStartsAtIso(
      parts?.localDate,
      parts?.localTime,
      parts?.occurrence ? { occurrence: parts.occurrence } : {},
    );
  if (!filmKey || !theaterId || !startsAt) return null;

  const formats = formatPresentationLabels(parts?.formatLabels)
    .map((label) => label.toLowerCase())
    .sort()
    .join(',');
  return `scr:${filmKey}|${theaterId}|${startsAt}|${formats}`;
}

/**
 * @param {string | null | undefined} status
 * @returns {'available' | 'sold_out' | 'canceled' | 'unknown'}
 */
export function resolveAvailability(status) {
  const key = asTrimmed(status)?.toLowerCase() ?? '';
  if (key === 'sold_out' || key === 'almost_sold_out') return 'sold_out';
  if (key === 'canceled' || key === 'cancelled') return 'canceled';
  if (key === 'available' || key === 'active' || key === '') return 'available';
  return 'unknown';
}

/**
 * Attach canonical fields onto a HomeData opportunity (mutates a shallow copy).
 *
 * @param {object} opportunity
 * @returns {object}
 */
export function attachCanonicalScreeningFields(opportunity) {
  const localDate = asTrimmed(opportunity.localDate);
  const localTime = asTrimmed(opportunity.localTime)?.slice(0, 5) ?? null;
  const startsAt =
    opportunity.startsAt ??
    (localDate && localTime ? seattleStartsAtIso(localDate, localTime) : null);
  const availability = resolveAvailability(opportunity.status);
  return {
    ...opportunity,
    screeningId:
      buildStableScreeningId({
        source: opportunity.source,
        sourceShowtimeId: opportunity.sourceShowtimeId,
        filmKey: opportunity.filmKey,
        theaterId: opportunity.theaterId,
        localDate,
        localTime,
        startsAt,
        formatLabels: opportunity.formatLabels,
      }) ??
      asTrimmed(opportunity.opportunityKey) ??
      opportunity.screeningId,
    startsAt,
    startsAtMs:
      opportunity.startsAtMs ??
      (localDate && localTime ? seattleWallTimeToUtcMs(localDate, localTime) : null),
    availability,
    lastUpdatedAt:
      asTrimmed(opportunity.lastSeenAt) ?? asTrimmed(opportunity.lastUpdatedAt),
    presentationLabels: formatPresentationLabels(opportunity.formatLabels),
    accessibilityLabels: accessibilityPresentationLabels(opportunity.formatLabels),
    contentKey: screeningContentKey(opportunity),
  };
}

/**
 * @param {object | null | undefined} screening
 * @param {Date | (() => Date) | string | number} [now]
 * @returns {boolean}
 */
export function isPastScreening(screening, now = new Date()) {
  const sortable = opportunitySortableKey(screening);
  if (!sortable) return true;
  const localDate =
    asTrimmed(screening?.localDate) ?? sortable.slice(0, 10);
  const today = pacificDateString(resolveClock(now));
  if (localDate < today) return true;
  if (localDate > today) return false;
  const nowKey = pacificSortableDateTime(resolveClock(now));
  return sortable < nowKey;
}

/**
 * Eligible for recommendations and newly generated plans.
 * Canceled / sold-out rows are not actionable. Complete daily schedules
 * should not use this filter.
 *
 * @param {object | null | undefined} screening
 * @param {Date | (() => Date) | string | number} [now]
 */
export function isActionableScreening(screening, now = new Date()) {
  if (!screening || typeof screening !== 'object') return false;
  const availability = resolveAvailability(screening.status);
  if (availability === 'canceled' || availability === 'sold_out') return false;
  if (!opportunitySortableKey(screening)) return false;
  if (isPastScreening(screening, now)) return false;
  return true;
}

/**
 * Schedule-row state for complete daily lists.
 * Past rows stay visible but are not bookable.
 *
 * @param {object | null | undefined} screening
 * @param {Date | (() => Date) | string | number} [now]
 */
export function scheduleScreeningState(screening, now = new Date()) {
  const availability = resolveAvailability(screening?.status);
  const past = isPastScreening(screening, now);
  const actionable = isActionableScreening(screening, now);
  let stateLabel = null;
  if (availability === 'canceled') stateLabel = UNAVAILABLE_SCREENING_LABEL;
  else if (availability === 'sold_out') stateLabel = UNAVAILABLE_SCREENING_LABEL;
  else if (past) stateLabel = STARTED_SCREENING_LABEL;
  return { past, actionable, stateLabel };
}

/**
 * Timestamp sort: startsAtMs, then sortable local string, then screening id.
 *
 * @param {object} a
 * @param {object} b
 */
export function compareScreeningsByStart(a, b) {
  const aMs =
    typeof a?.startsAtMs === 'number'
      ? a.startsAtMs
      : seattleWallTimeToUtcMs(a?.localDate, a?.localTime);
  const bMs =
    typeof b?.startsAtMs === 'number'
      ? b.startsAtMs
      : seattleWallTimeToUtcMs(b?.localDate, b?.localTime);
  if (aMs != null && bMs != null && aMs !== bMs) return aMs - bMs;
  const ka = opportunitySortableKey(a) ?? '';
  const kb = opportunitySortableKey(b) ?? '';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return String(a?.opportunityKey ?? a?.screeningId ?? '').localeCompare(
    String(b?.opportunityKey ?? b?.screeningId ?? ''),
  );
}

/**
 * Keep the first screening for each content identity.
 *
 * @param {object[]} screenings
 * @returns {object[]}
 */
export function dedupeScreeningsByContent(screenings) {
  if (!Array.isArray(screenings)) return [];
  const seen = new Set();
  /** @type {object[]} */
  const out = [];
  for (const screening of screenings) {
    const key = screeningContentKey(screening);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(screening);
  }
  return out;
}
