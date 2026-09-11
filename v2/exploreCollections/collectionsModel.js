/**
 * Indie Explore collections — display labels, listing-join keys, and
 * default-visible rules. Membership/screening joins are listing-level only.
 */

import { addIsoDays, pacificDateString } from '../explore/exploreCatalog.js';

export const COLLECTIONS_PAGE_TITLE = 'Collections';
export const COLLECTIONS_PAGE_TAGLINE =
  'Curated film series and programs from Seattle theaters.';
export const COLLECTIONS_FILTERS_LABEL = 'Filters';
export const COLLECTION_LOOKAHEAD_DAYS = 14;

export const COLLECTION_SOURCE_LABELS = Object.freeze({
  siff: 'SIFF',
  beacon: 'The Beacon',
  nwff: 'NW Film Forum',
});

export const COLLECTION_TYPE_LABELS = Object.freeze({
  series: 'Series',
  program: 'Program',
});

export const COLLECTION_FILTER_THEATERS = Object.freeze([
  Object.freeze({ id: 'siff', label: COLLECTION_SOURCE_LABELS.siff }),
  Object.freeze({ id: 'beacon', label: COLLECTION_SOURCE_LABELS.beacon }),
  Object.freeze({ id: 'nwff', label: COLLECTION_SOURCE_LABELS.nwff }),
]);

export const COLLECTION_FILTER_TYPES = Object.freeze([
  Object.freeze({ id: 'series', label: COLLECTION_TYPE_LABELS.series }),
  Object.freeze({ id: 'program', label: COLLECTION_TYPE_LABELS.program }),
]);

const MONTH_INDEX = Object.freeze({
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
});

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} source
 * @returns {string}
 */
export function collectionSourceLabel(source) {
  const key = asText(source)?.toLowerCase();
  if (key && COLLECTION_SOURCE_LABELS[key]) return COLLECTION_SOURCE_LABELS[key];
  return key ? key.toUpperCase() : '';
}

/**
 * @param {unknown} type
 * @returns {string | null}
 */
export function collectionTypeLabel(type) {
  const key = asText(type)?.toLowerCase();
  if (!key) return null;
  if (COLLECTION_TYPE_LABELS[key]) return COLLECTION_TYPE_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Listing-level join key. Never use canonical filmId for collection upcoming.
 * @param {unknown} source
 * @param {unknown} sourceFilmId
 * @returns {string | null}
 */
export function listingJoinKey(source, sourceFilmId) {
  const src = asText(source)?.toLowerCase();
  const id = asText(sourceFilmId);
  if (!src || !id) return null;
  return `${src}|id|${id}`;
}

/**
 * @param {object | null | undefined} membership
 * @returns {string | null}
 */
export function membershipListingKey(membership) {
  const explicit = asText(membership?.sourceListingKey);
  if (explicit) return explicit.toLowerCase();
  return listingJoinKey(membership?.source, membership?.sourceFilmId);
}

/**
 * @param {object | null | undefined} opportunity
 * @returns {string | null}
 */
export function opportunityListingKey(opportunity) {
  return listingJoinKey(opportunity?.source, opportunity?.sourceFilmId);
}

/**
 * Display title for a collection member. Presentation only — not identity matching.
 * @param {object | null | undefined} membership
 * @returns {string}
 */
export function memberDisplayTitle(membership) {
  const identity = asText(membership?.identityTitleCandidate);
  if (identity) return identity;

  const raw = asText(membership?.rawTitle);
  if (raw && !/^https?:\/\//i.test(raw)) {
    const colon = raw.indexOf(': ');
    if (colon > 2 && colon < 48 && raw.length - colon > 2) {
      const rest = raw.slice(colon + 2).trim();
      if (rest) return rest;
    }
    return raw;
  }

  const sourceId = asText(membership?.sourceFilmId);
  if (sourceId) {
    const slug = sourceId.split('/').filter(Boolean).pop();
    if (slug) return humanizeSlug(slug);
  }
  return 'Untitled film';
}

/**
 * @param {string} slug
 * @returns {string}
 */
function humanizeSlug(slug) {
  return slug
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\(\s*/g, '(')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string | null}
 */
function toIsoDate(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * @param {unknown} generatedAt
 * @returns {number | null}
 */
export function yearFromGeneratedAt(generatedAt) {
  const text = asText(generatedAt);
  if (!text) return null;
  const match = text.match(/^(\d{4})-/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

/**
 * Parse a loose collection date fragment from the artifact.
 * @param {unknown} value
 * @param {{ year?: number | null, month?: number | null }} [inherit]
 * @returns {{ iso: string | null, year: number | null, month: number | null, day: number | null }}
 */
export function parseCollectionDatePart(value, inherit = {}) {
  const empty = { iso: null, year: null, month: null, day: null };
  const text = asText(value);
  if (!text) return empty;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return { iso: text, year, month, day };
  }

  const monthDayYear = text.match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/,
  );
  if (monthDayYear) {
    const month = MONTH_INDEX[monthDayYear[1].toLowerCase()] ?? null;
    const day = Number(monthDayYear[2]);
    const year = monthDayYear[3]
      ? Number(monthDayYear[3])
      : inherit.year ?? null;
    const iso = month && year ? toIsoDate(year, month, day) : null;
    return { iso, year: year ?? null, month, day };
  }

  const dayYear = text.match(/^(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (dayYear && inherit.month) {
    const day = Number(dayYear[1]);
    const year = Number(dayYear[2]);
    return {
      iso: toIsoDate(year, inherit.month, day),
      year,
      month: inherit.month,
      day,
    };
  }

  return empty;
}

/**
 * @param {unknown} startDate
 * @param {unknown} endDate
 * @param {unknown} [generatedAt]
 * @returns {{ startIso: string | null, endIso: string | null }}
 */
export function parseCollectionDateRange(startDate, endDate, generatedAt) {
  const fallbackYear = yearFromGeneratedAt(generatedAt);
  const startFirst = parseCollectionDatePart(startDate, { year: fallbackYear });
  const end = parseCollectionDatePart(endDate, {
    year: startFirst.year ?? fallbackYear,
    month: startFirst.month,
  });
  const start = parseCollectionDatePart(startDate, {
    year: end.year ?? startFirst.year ?? fallbackYear,
  });
  return {
    startIso: start.iso,
    endIso: end.iso,
  };
}

/**
 * Compact range for stats, e.g. "Sep 16 – Nov 17".
 * @param {unknown} startDate
 * @param {unknown} endDate
 * @param {unknown} [generatedAt]
 * @returns {string | null}
 */
export function formatCollectionDateRangeLabel(
  startDate,
  endDate,
  generatedAt,
) {
  const range = parseCollectionDateRange(startDate, endDate, generatedAt);
  if (range.startIso && range.endIso) {
    return `${formatShortDate(range.startIso)} – ${formatShortDate(range.endIso)}`;
  }
  if (range.startIso) return formatShortDate(range.startIso);
  if (range.endIso) return formatShortDate(range.endIso);
  const start = asText(startDate);
  const end = asText(endDate);
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

/**
 * @param {string} iso
 * @returns {string}
 */
function formatShortDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * True when the parsed range overlaps today…today+lookahead, or today is inside it.
 * @param {{ startIso: string | null, endIso: string | null }} range
 * @param {string} todayIso
 * @param {number} [lookaheadDays]
 */
export function collectionDateRangeIsCurrent(
  range,
  todayIso,
  lookaheadDays = COLLECTION_LOOKAHEAD_DAYS,
) {
  if (!range || typeof todayIso !== 'string') return false;
  if (!range.startIso && !range.endIso) return false;
  const start = range.startIso ?? range.endIso;
  const end = range.endIso ?? range.startIso;
  if (!start || !end) return false;
  const windowEnd = addIsoDays(todayIso, lookaheadDays);
  return start <= windowEnd && end >= todayIso;
}

/**
 * Default index visibility: hide archive-only rows.
 * Show when there is a live/artifact upcoming screening, or a current date range.
 *
 * `status === 'active'` alone is not enough — most archive collections stay active
 * on the provider site.
 *
 * @param {object | null | undefined} collection
 * @param {{
 *   upcomingCount?: number,
 *   artifactShowtimeCount?: number,
 *   todayIso?: string,
 *   generatedAt?: string | null,
 * }} [options]
 */
export function isDefaultVisibleCollection(collection, options = {}) {
  if (!collection || typeof collection !== 'object') return false;
  const status = asText(collection.status);
  if (status && status !== 'active') return false;

  const upcoming = Number(options.upcomingCount) || 0;
  const artifactCount =
    Number(options.artifactShowtimeCount ?? collection.currentShowtimeCount) ||
    0;
  if (upcoming > 0 || artifactCount > 0) return true;

  const todayIso = options.todayIso ?? pacificDateString();
  const range = parseCollectionDateRange(
    collection.startDate,
    collection.endDate,
    options.generatedAt ?? null,
  );
  return collectionDateRangeIsCurrent(range, todayIso);
}

/**
 * @param {object | null | undefined} opportunity
 * @param {string} todayIso
 */
export function isUpcomingOpportunity(opportunity, todayIso) {
  const date = asText(opportunity?.localDate);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= todayIso;
}

/**
 * Collection-associated upcoming opportunities only (listing join).
 * @param {object[]} memberships
 * @param {object[]} opportunities
 * @param {string} todayIso
 * @returns {object[]}
 */
export function collectionAssociatedUpcoming(
  memberships,
  opportunities,
  todayIso,
) {
  const keys = new Set();
  for (const membership of Array.isArray(memberships) ? memberships : []) {
    const key = membershipListingKey(membership);
    if (key) keys.add(key);
  }
  if (keys.size === 0) return [];

  return (Array.isArray(opportunities) ? opportunities : []).filter((opp) => {
    const key = opportunityListingKey(opp);
    return Boolean(key && keys.has(key) && isUpcomingOpportunity(opp, todayIso));
  });
}

/**
 * @param {unknown} url
 * @returns {string | null}
 */
export function safeExternalHttpUrl(url) {
  const text = asText(url);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {unknown} source
 * @returns {string}
 */
export function collectionSourceLinkLabel(source) {
  const name = collectionSourceLabel(source);
  return name ? `View on ${name} ↗` : 'View source ↗';
}

/**
 * @param {{ sources?: string[], types?: string[] } | null | undefined} filters
 */
export function normalizeCollectionFilters(filters) {
  const sources = Array.isArray(filters?.sources)
    ? filters.sources.map((s) => asText(s)?.toLowerCase()).filter(Boolean)
    : [];
  const types = Array.isArray(filters?.types)
    ? filters.types.map((t) => asText(t)?.toLowerCase()).filter(Boolean)
    : [];
  return { sources, types };
}

/**
 * @param {object} collection
 * @param {{ sources: string[], types: string[] }} filters
 */
export function collectionMatchesFilters(collection, filters) {
  const normalized = normalizeCollectionFilters(filters);
  if (normalized.sources.length > 0) {
    const source = asText(collection?.source)?.toLowerCase();
    if (!source || !normalized.sources.includes(source)) return false;
  }
  if (normalized.types.length > 0) {
    const type = asText(collection?.sourceCollectionType)?.toLowerCase();
    if (!type || !normalized.types.includes(type)) return false;
  }
  return true;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function activeCollectionsCountLabel(count) {
  const n = Number.isFinite(count) ? count : 0;
  return n === 1 ? '1 active collection' : `${n} active collections`;
}

/**
 * Compare two collection index rows.
 * 1. upcoming screenings desc
 * 2. nearest upcoming date
 * 3. title A–Z
 * @param {object} a
 * @param {object} b
 */
export function compareCollectionIndexRows(a, b) {
  const upcomingA = Number(a?.upcomingScreeningCount) || 0;
  const upcomingB = Number(b?.upcomingScreeningCount) || 0;
  if (upcomingA !== upcomingB) return upcomingB - upcomingA;

  const dateA = asText(a?.nearestUpcomingDate) ?? '9999-12-31';
  const dateB = asText(b?.nearestUpcomingDate) ?? '9999-12-31';
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  const titleA = asText(a?.title)?.toLowerCase() ?? '';
  const titleB = asText(b?.title)?.toLowerCase() ?? '';
  if (titleA < titleB) return -1;
  if (titleA > titleB) return 1;
  return 0;
}
