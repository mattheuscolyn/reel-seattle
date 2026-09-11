/**
 * Shared Opening entry presentation — final product category + enrichment join.
 * Home shelf and dedicated Opening surface must call this for category parity.
 */

import {
  joinOpeningEntryOpportunities,
  openingCategoryForEntry,
} from '../adapters/buildOpeningThisWeek.js';
import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import { pacificTodayIso } from './openingDateCopy.js';

/**
 * Resolve final user-facing Opening category for one artifact entry.
 *
 * @param {object} entry normalized opening entry (artifact fields)
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   timezone?: string,
 *   todayIso?: string | null,
 *   currentYear?: number | null,
 * }} [options]
 */
export function resolveOpeningEntryPresentation(entry, options = {}) {
  const homeData = options.homeData ?? null;
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const timezone =
    options.timezone ??
    entry?.timezone ??
    homeData?.openingThisWeek?.timezone ??
    homeData?.timezone ??
    'America/Los_Angeles';
  const todayIso = options.todayIso ?? pacificTodayIso(timezone);
  const currentYear =
    typeof options.currentYear === 'number'
      ? options.currentYear
      : Number(todayIso.slice(0, 4));

  const resolved = resolveCanonicalFilmPresentation({
    filmKey: entry?.filmKey ?? entry?.showtimeFilmKey ?? entry?.parentFilmKey,
    filmId: entry?.filmId ?? entry?.film_id ?? null,
    homeData,
    enrichmentIndex,
    fallbackRecord: entry,
    context: 'opening',
  });
  const homeFilm = resolved.homeFilm;
  const enriched = resolved.enriched;

  const category = openingCategoryForEntry(entry, {
    releaseYear: enriched.canonicalYear,
    currentYear,
    openingDate: entry?.openingDate,
    visibleShowtimeCount: entry?.visibleShowtimeCount,
    todayIso,
  });

  return {
    entry,
    homeFilm,
    enriched,
    releaseYear: enriched.canonicalYear,
    categoryId: category.id,
    categoryLabel: category.label,
    categoryBadge: category.badge,
    sectionLabel: category.sectionLabel,
    timezone,
    todayIso,
    currentYear,
  };
}

// Re-export for callers that previously imported join helpers via this module path.
export { joinOpeningEntryOpportunities };
