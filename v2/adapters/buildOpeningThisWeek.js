/**
 * Opening This Week artifact adapter — normalizes opening_this_week_current.json
 * into homeData.openingThisWeek. Presentation category mapping for `limited`
 * uses artifact type first, then minimal deterministic metadata (not theater source).
 */

import { createHomeWarning } from './homeWarnings.js';
import { isIsoDate } from './opportunityIdentity.js';

/** @typedef {'new' | 'revival' | 'event'} OpeningCategoryId */

export const OPENING_CATEGORY_SECTIONS = Object.freeze([
  Object.freeze({ id: 'new', label: 'New' }),
  Object.freeze({ id: 'revival', label: 'Revivals' }),
  Object.freeze({ id: 'event', label: 'Special Events' }),
]);

const EVENT_TITLE_HINT = /(?:\+|presents:|q\s*&\s*a|early access|live from|tour\b|screen unseen|scream unseen|mystery|double feature)/i;
const REVIVAL_TITLE_HINT = /(?:anniversary|restored|restoration|retrospective|\(HPD\d+\))/i;
const CONTEMPORARY_YEAR_HINT = /(?:^|[-\s(])(202[4-9]|203\d)(?:\)|$|\b)/;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asCanonicalFilmId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^tmdb:[1-9][0-9]*$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asPositiveInt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 ? n : null;
}

/**
 * @param {unknown} payload
 */
export function assertOpeningThisWeekShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('opening_this_week_current must be a JSON object');
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error('opening_this_week_current must include an entries array');
  }
}

/**
 * User-facing category for a normalized opening entry.
 *
 * @param {{
 *   openingType?: string | null,
 *   title?: string | null,
 *   showtimeFilmKey?: string | null,
 *   engagementDays?: number | null,
 * }} entry
 * @param {{ releaseYear?: number | null, currentYear?: number }} [context]
 * @returns {{ id: OpeningCategoryId, label: string, badge: string, sectionLabel: string }}
 */
export function openingCategoryForEntry(entry, context = {}) {
  const type = asTrimmedString(entry?.openingType) ?? 'unknown';
  const title = asTrimmedString(entry?.title) ?? '';
  const showtimeFilmKey = asTrimmedString(entry?.showtimeFilmKey) ?? '';
  const engagementDays = asPositiveInt(entry?.engagementDays);

  if (type === 'repertory') {
    return {
      id: 'revival',
      label: 'Revival',
      badge: 'Revival',
      sectionLabel: 'Revivals',
    };
  }
  if (type === 'event') {
    return {
      id: 'event',
      label: 'Special Event',
      badge: 'Special Event',
      sectionLabel: 'Special Events',
    };
  }
  if (type === 'theatrical' || type === 'unknown') {
    return {
      id: 'new',
      label: 'New',
      badge: 'New',
      sectionLabel: 'New',
    };
  }

  // `limited` — minimum product-level distinction without duplicating emitter heuristics.
  if (EVENT_TITLE_HINT.test(title)) {
    return {
      id: 'event',
      label: 'Special Event',
      badge: 'Special Event',
      sectionLabel: 'Special Events',
    };
  }
  if (REVIVAL_TITLE_HINT.test(title)) {
    return {
      id: 'revival',
      label: 'Revival',
      badge: 'Revival',
      sectionLabel: 'Revivals',
    };
  }
  if (
    CONTEMPORARY_YEAR_HINT.test(title) ||
    CONTEMPORARY_YEAR_HINT.test(showtimeFilmKey)
  ) {
    return {
      id: 'new',
      label: 'New',
      badge: 'New',
      sectionLabel: 'New',
    };
  }

  const releaseYear = context.releaseYear;
  const currentYear =
    typeof context.currentYear === 'number'
      ? context.currentYear
      : new Date().getFullYear();
  if (
    typeof releaseYear === 'number' &&
    releaseYear < currentYear - 3 &&
    engagementDays === 1
  ) {
    return {
      id: 'revival',
      label: 'Revival',
      badge: 'Revival',
      sectionLabel: 'Revivals',
    };
  }

  return {
    id: 'new',
    label: 'New',
    badge: 'New',
    sectionLabel: 'New',
  };
}

/**
 * Identity-safe join from artifact entry to HomeData film rows (no title matching).
 *
 * @param {object} entry normalized opening entry
 * @param {object[]} films homeData.films
 * @returns {object | null}
 */
export function joinOpeningEntryToHomeFilm(entry, films) {
  const list = Array.isArray(films) ? films : [];
  const parentKey = asTrimmedString(entry?.parentFilmKey);
  const showtimeKey = asTrimmedString(entry?.showtimeFilmKey);
  const filmId = asCanonicalFilmId(entry?.filmId);

  const keysToTry = [parentKey, showtimeKey].filter(Boolean);
  for (const key of keysToTry) {
    const direct = list.find((film) => film.filmKey === key);
    if (direct) return direct;
    const variant = list.find((film) => film.parentFilmKey === key);
    if (variant) return variant;
  }

  if (filmId) {
    const byId =
      list.find((film) => film.filmId === filmId && !film.parentFilmKey) ??
      list.find((film) => film.filmId === filmId);
    if (byId) return byId;
  }

  return null;
}

/**
 * @param {object} entry
 * @param {object[]} opportunities
 * @param {object[]} [films]
 */
export function joinOpeningEntryOpportunities(entry, opportunities, films = []) {
  const list = Array.isArray(opportunities) ? opportunities : [];
  const parentKey = asTrimmedString(entry?.parentFilmKey);
  const showtimeKey = asTrimmedString(entry?.showtimeFilmKey);
  const filmId = asCanonicalFilmId(entry?.filmId);
  const homeFilm = joinOpeningEntryToHomeFilm(entry, films);

  /** @type {Set<string>} */
  const keys = new Set(
    [parentKey, showtimeKey, homeFilm?.filmKey]
      .map((value) => asTrimmedString(value))
      .filter(Boolean),
  );

  for (const film of films) {
    const filmKey = asTrimmedString(film?.filmKey);
    if (!filmKey) continue;
    if (parentKey && (filmKey === parentKey || film.parentFilmKey === parentKey)) {
      keys.add(filmKey);
    }
    if (filmId && film.filmId === filmId) {
      keys.add(filmKey);
    }
  }

  return list
    .filter(
      (opp) =>
        keys.has(opp.filmKey) ||
        (parentKey && opp.parentFilmKey === parentKey),
    )
    .sort((a, b) => {
      if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
        return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
      }
      return a.opportunityKey < b.opportunityKey ? -1 : 1;
    });
}

/**
 * @param {unknown} raw
 */
function normalizeEntry(raw) {
  if (raw == null || typeof raw !== 'object') return null;

  const showtimeFilmKey = asTrimmedString(raw.showtime_film_key);
  const parentFilmKey =
    asTrimmedString(raw.parent_film_key) ?? showtimeFilmKey;
  const title = asTrimmedString(raw.film_title);
  const openingDate = asTrimmedString(raw.opening_date);

  if (!showtimeFilmKey || !title || !openingDate || !isIsoDate(openingDate)) {
    return null;
  }

  const theatersOnOpeningDate = Array.isArray(raw.theaters_on_opening_date)
    ? raw.theaters_on_opening_date
        .map((id) => asTrimmedString(id))
        .filter(Boolean)
    : [];

  const category = openingCategoryForEntry({
    openingType: raw.opening_type,
    title,
    showtimeFilmKey,
    engagementDays: raw.engagement_days,
  });

  return {
    filmKey: parentFilmKey ?? showtimeFilmKey,
    parentFilmKey,
    showtimeFilmKey,
    filmId: asCanonicalFilmId(raw.film_id),
    title,
    openingDate,
    openingType: asTrimmedString(raw.opening_type) ?? 'unknown',
    categoryId: category.id,
    categoryLabel: category.label,
    categoryBadge: category.badge,
    sectionLabel: category.sectionLabel,
    theaterCountOnOpeningDate:
      asPositiveInt(raw.theater_count_on_opening_date) ?? theatersOnOpeningDate.length,
    theatersOnOpeningDate,
    visibleShowtimeCount: asPositiveInt(raw.visible_showtime_count) ?? 0,
    engagementDays: asPositiveInt(raw.engagement_days),
    confidence: asTrimmedString(raw.confidence),
  };
}

/**
 * @param {unknown | null | undefined} artifact
 * @param {{ warnings?: object[] }} [options]
 */
export function buildOpeningThisWeek(artifact, options = {}) {
  const warnings = options.warnings ?? [];

  if (artifact == null) {
    warnings.push(
      createHomeWarning(
        'informational',
        'opening_this_week_missing',
        'opening_this_week_current unavailable; Opening This Week list is empty.',
      ),
    );
    return {
      status: 'unavailable',
      reason: 'opening_this_week_current unavailable',
      generatedAt: null,
      timezone: 'America/Los_Angeles',
      week: null,
      stats: null,
      entries: [],
    };
  }

  try {
    assertOpeningThisWeekShape(artifact);
  } catch (error) {
    warnings.push(
      createHomeWarning(
        'recoverable',
        'opening_this_week_invalid',
        error instanceof Error ? error.message : String(error),
      ),
    );
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : String(error),
      generatedAt: null,
      timezone: 'America/Los_Angeles',
      week: null,
      stats: null,
      entries: [],
    };
  }

  /** @type {object[]} */
  const entries = [];
  for (let index = 0; index < artifact.entries.length; index += 1) {
    const normalized = normalizeEntry(artifact.entries[index]);
    if (!normalized) {
      warnings.push(
        createHomeWarning(
          'record_skipped',
          'opening_entry_invalid',
          'Opening entry skipped due to missing identity or opening date.',
          { index },
        ),
      );
      continue;
    }
    entries.push(normalized);
  }

  entries.sort((a, b) => {
    if (a.openingDate !== b.openingDate) {
      return a.openingDate < b.openingDate ? -1 : 1;
    }
    const theaterDiff =
      (b.theaterCountOnOpeningDate ?? 0) - (a.theaterCountOnOpeningDate ?? 0);
    if (theaterDiff !== 0) return theaterDiff;
    const showtimeDiff =
      (b.visibleShowtimeCount ?? 0) - (a.visibleShowtimeCount ?? 0);
    if (showtimeDiff !== 0) return showtimeDiff;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  const week =
    artifact.week && typeof artifact.week === 'object'
      ? {
          startDate: asTrimmedString(artifact.week.start_date),
          endDate: asTrimmedString(artifact.week.end_date),
        }
      : null;

  return {
    status: entries.length > 0 ? 'available' : 'empty',
    reason: entries.length > 0 ? null : 'No films opening this week.',
    generatedAt: asTrimmedString(artifact.generated_at),
    timezone: asTrimmedString(artifact.timezone) ?? 'America/Los_Angeles',
    week,
    stats:
      artifact.stats && typeof artifact.stats === 'object' ? artifact.stats : null,
    entries,
  };
}

/**
 * Re-apply category labels when enrichment release year is known (limited refinement).
 *
 * @param {object} entry
 * @param {{ releaseYear?: number | null, currentYear?: number }} context
 */
export function refineOpeningCategory(entry, context = {}) {
  const category = openingCategoryForEntry(entry, context);
  return {
    ...entry,
    categoryId: category.id,
    categoryLabel: category.label,
    categoryBadge: category.badge,
    sectionLabel: category.sectionLabel,
  };
}
