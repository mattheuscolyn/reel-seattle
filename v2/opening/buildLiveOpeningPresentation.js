/**
 * Opening This Week presentation model — artifact-backed cards, sections, and chips.
 */

import {
  OPENING_CATEGORY_SECTIONS,
  joinOpeningEntryOpportunities,
} from '../adapters/buildOpeningThisWeek.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { buildOpeningDateCopy, pacificTodayIso } from './openingDateCopy.js';
import { resolveOpeningEntryPresentation } from './resolveOpeningEntryPresentation.js';

import {
  formatCompactTheaterLine,
  aggregateTheatersFromRows,
  SHELF_DETAIL_THEATER_LIST_MAX_VISIBLE,
} from '../homeShelfDetail/compactTheaterLine.js';

export const OPENING_CATEGORY_CHIPS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  ...OPENING_CATEGORY_SECTIONS,
]);

/** @deprecated Prefer SHELF_DETAIL_THEATER_LIST_MAX_VISIBLE */
export const OPENING_THEATER_LIST_MAX_VISIBLE =
  SHELF_DETAIL_THEATER_LIST_MAX_VISIBLE;

export { formatCompactTheaterLine };

/**
 * Screening-level accessibility / experience labels that do not belong on
 * film-level Opening This Week cards (they belong on individual showtimes).
 */
const SCREENING_LEVEL_FORMAT_LABELS = new Set([
  'closed captions',
  'open captions',
  'audio description',
  'oc',
  'cc',
]);

/**
 * @param {string | null | undefined} label
 * @returns {boolean}
 */
export function isOpeningScreeningLevelFormatLabel(label) {
  if (typeof label !== 'string' || !label.trim()) return false;
  return SCREENING_LEVEL_FORMAT_LABELS.has(label.trim().toLowerCase());
}

/**
 * Unique theaters for an Opening film, preserving opportunity order.
 *
 * @param {object[]} filmOpportunities
 * @param {string[] | null | undefined} theatersOnOpeningDate
 * @param {Record<string, { name?: string }>} theatersById
 * @returns {{ id: string | null, name: string }[]}
 */
export function aggregateOpeningTheaters(
  filmOpportunities,
  theatersOnOpeningDate,
  theatersById = {},
) {
  const fromOpps = aggregateTheatersFromRows(
    (Array.isArray(filmOpportunities) ? filmOpportunities : []).map((opp) => ({
      theaterId: opp?.theaterId,
      theaterName: opp?.theaterName,
    })),
  );
  if (fromOpps.length > 0) return fromOpps;

  /** @type {{ id: string | null, name: string }[]} */
  const theaters = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const theaterId of Array.isArray(theatersOnOpeningDate)
    ? theatersOnOpeningDate
    : []) {
    const id = typeof theaterId === 'string' ? theaterId.trim() : '';
    if (!id || seen.has(`id:${id}`)) continue;
    seen.add(`id:${id}`);
    theaters.push({ id, name: theatersById[id]?.name ?? id });
  }
  return theaters;
}

/**
 * @param {unknown[]} rawLabels
 * @returns {string[]}
 */
function filmLevelFormatLabels(rawLabels) {
  if (!Array.isArray(rawLabels)) return [];
  return rawLabels
    .map(formatUserFacingFormatLabel)
    .filter(Boolean)
    .filter((label) => !isOpeningScreeningLevelFormatLabel(label));
}

/**
 * @param {object | null | undefined} homeData
 * @param {object | null} [enrichmentIndex]
 */
export function buildLiveOpeningThisWeekPresentation(
  homeData,
  enrichmentIndex = null,
) {
  const opening = homeData?.openingThisWeek;
  const timezone = opening?.timezone ?? homeData?.timezone ?? 'America/Los_Angeles';
  const todayIso = pacificTodayIso(timezone);
  const currentYear = Number(todayIso.slice(0, 4));

  if (!opening || opening.status === 'unavailable' || opening.status === 'invalid') {
    return {
      source: 'live-unavailable',
      pageTitle: 'Opening This Week',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Opening This Week isn’t available right now.',
      unavailableBody: 'Check back later or browse current showtimes.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      activeCategoryId: 'all',
      totalCount: 0,
      week: null,
    };
  }

  if (opening.status === 'empty' || opening.entries.length === 0) {
    return {
      source: 'live-empty',
      pageTitle: 'Opening This Week',
      pageSubtitle: null,
      countLabel: null,
      emptyTitle: 'Nothing opening in Seattle this week.',
      emptyBody: 'Browse current showtimes to see what’s playing.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      activeCategoryId: 'all',
      totalCount: 0,
      week: opening.week ?? null,
    };
  }

  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const theatersById = homeData?.theatersById ?? {};

  const presentationFilms = opening.entries.map((entry) => {
    const resolved = resolveOpeningEntryPresentation(entry, {
      homeData,
      enrichmentIndex,
      timezone,
      todayIso,
      currentYear,
    });
    const homeFilm = resolved.homeFilm;
    const enriched = resolved.enriched;
    const filmOpportunities = joinOpeningEntryOpportunities(
      entry,
      opportunities,
      films,
    );
    const nextOpportunity = filmOpportunities[0] ?? null;

    const hasUpcomingShowtimes = (entry.visibleShowtimeCount ?? 0) > 0;
    const { dateLabel, availabilityLabel } = buildOpeningDateCopy({
      openingDate: entry.openingDate,
      engagementDays: entry.engagementDays,
      categoryId: resolved.categoryId,
      timezone,
      todayIso,
      hasUpcomingShowtimes,
    });

    const theaters = aggregateOpeningTheaters(
      filmOpportunities,
      entry.theatersOnOpeningDate,
      theatersById,
    );
    const theaterNames = theaters.map((theater) => theater.name);
    const theaterLine = formatCompactTheaterLine(theaterNames);
    const primaryTheater = theaters[0] ?? null;

    const formatLabels = filmLevelFormatLabels(nextOpportunity?.formatLabels);

    const metaParts = [
      enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
      formatRuntimeLabel(homeFilm?.runtimeMin ?? enriched.runtimeMin),
      enriched.genreLine,
    ].filter(Boolean);

    const theaterCount =
      theaters.length > 0
        ? theaters.length
        : (homeFilm?.theaterCount ??
          (hasUpcomingShowtimes
            ? new Set(filmOpportunities.map((o) => o.theaterId)).size
            : 0));

    return {
      filmKey: homeFilm?.filmKey ?? entry.filmKey,
      filmId: enriched.filmId,
      title: enriched.displayTitle ?? entry.title,
      badge: resolved.categoryBadge,
      categoryId: resolved.categoryId,
      sectionLabel: resolved.sectionLabel,
      metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
      synopsis: enriched.synopsisPreview,
      posterUrl: enriched.posterUrl,
      openingDate: entry.openingDate,
      dateLabel,
      availabilityLabel,
      theaterId: primaryTheater?.id ?? nextOpportunity?.theaterId ?? null,
      theaterName: theaterLine,
      theaters,
      timeLabel: nextOpportunity?.timeDisplay ?? null,
      formatLabel: formatLabels[0] ?? null,
      formatLabels,
      showtimeCount:
        homeFilm?.showtimeCount ??
        (hasUpcomingShowtimes ? filmOpportunities.length : 0),
      theaterCount,
      visibleShowtimeCount: entry.visibleShowtimeCount ?? 0,
      hasUpcomingShowtimes,
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
      hasEnrichment: enriched.hasEnrichment,
      opportunityKey: nextOpportunity?.opportunityKey ?? null,
      engagementDays: entry.engagementDays,
      openingType: entry.openingType,
      noCurrentShowtimes: !hasUpcomingShowtimes,
    };
  });

  const categoryIdsPresent = new Set(
    presentationFilms.map((film) => film.categoryId).filter(Boolean),
  );
  const showCategoryChips = categoryIdsPresent.size > 1;
  const categoryChips = showCategoryChips ? [...OPENING_CATEGORY_CHIPS] : [];

  const totalCount = presentationFilms.length;

  return {
    source: 'live-opening-artifact',
    pageTitle: 'Opening This Week',
    pageSubtitle: null,
    countLabel: null,
    sortLabel: 'Sort',
    filtersLabel: 'Filters',
    films: presentationFilms,
    sections: buildOpeningSections(presentationFilms),
    categoryChips,
    showCategoryChips,
    activeCategoryId: 'all',
    totalCount,
    week: opening.week ?? null,
  };
}

/**
 * @param {object[]} films
 * @param {string} [activeCategoryId]
 */
export function buildOpeningSections(films, activeCategoryId = 'all') {
  const list = Array.isArray(films) ? films : [];
  const sectionOrder = OPENING_CATEGORY_SECTIONS;

  if (activeCategoryId !== 'all') {
    const section = sectionOrder.find((item) => item.id === activeCategoryId);
    const sectionFilms = list.filter((film) => film.categoryId === activeCategoryId);
    if (!section || sectionFilms.length === 0) return [];
    return [
      {
        id: section.id,
        label: section.label,
        films: sectionFilms,
      },
    ];
  }

  return sectionOrder
    .map((section) => ({
      id: section.id,
      label: section.label,
      films: list.filter((film) => film.categoryId === section.id),
    }))
    .filter((section) => section.films.length > 0);
}

/**
 * @param {object[]} films
 * @param {string} categoryId
 */
export function filterOpeningFilmsByCategory(films, categoryId) {
  const list = Array.isArray(films) ? films : [];
  if (!categoryId || categoryId === 'all') return list;
  return list.filter((film) => film.categoryId === categoryId);
}
