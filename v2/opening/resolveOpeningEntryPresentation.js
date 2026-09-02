/**
 * Shared Opening entry presentation — final product category + enrichment join.
 * Home shelf and dedicated Opening surface must call this for category parity.
 */

import {
  joinOpeningEntryToHomeFilm,
  openingCategoryForEntry,
} from '../adapters/buildOpeningThisWeek.js';
import { resolveEnrichedFilmPresentation } from '../enrichment/resolveEnrichedFilmPresentation.js';
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

  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const homeFilm = joinOpeningEntryToHomeFilm(entry, films);
  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: homeFilm?.filmId ?? entry?.filmId ?? null,
      title: homeFilm?.title ?? entry?.title ?? null,
      posterUrl: homeFilm?.posterUrl ?? null,
      runtimeMin: homeFilm?.runtimeMin ?? null,
    },
    enrichmentIndex,
    context: 'opening',
  });

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
