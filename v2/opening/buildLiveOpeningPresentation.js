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

export const OPENING_CATEGORY_CHIPS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  ...OPENING_CATEGORY_SECTIONS,
]);

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
      pageSubtitle: 'Films opening in Seattle this week',
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
      pageSubtitle: 'Films opening in Seattle this week',
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

    const openingTheaterId = entry.theatersOnOpeningDate?.[0] ?? null;
    const openingTheaterName =
      (openingTheaterId && theatersById[openingTheaterId]?.name) ||
      (entry.theaterCountOnOpeningDate > 1
        ? `${entry.theaterCountOnOpeningDate} theaters`
        : openingTheaterId) ||
      null;

    const formatLabels = Array.isArray(nextOpportunity?.formatLabels)
      ? nextOpportunity.formatLabels
          .map(formatUserFacingFormatLabel)
          .filter(Boolean)
      : [];

    const metaParts = [
      enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
      formatRuntimeLabel(homeFilm?.runtimeMin ?? enriched.runtimeMin),
      enriched.genreLine,
    ].filter(Boolean);

    const theaterCount =
      homeFilm?.theaterCount ??
      (hasUpcomingShowtimes ? new Set(filmOpportunities.map((o) => o.theaterId)).size : 0);

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
      theaterId: nextOpportunity?.theaterId ?? openingTheaterId,
      theaterName: nextOpportunity?.theaterName ?? openingTheaterName,
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
      alsoPlaying:
        theaterCount >= 2
          ? {
              theaterName: `Also playing at ${theaterCount} theaters`,
              detailLabel: 'See showtimes',
            }
          : null,
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
  const countLabel = `Films opening in Seattle this week · ${totalCount}`;

  return {
    source: 'live-opening-artifact',
    pageTitle: 'Opening This Week',
    pageSubtitle: 'Films opening in Seattle this week',
    countLabel,
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
