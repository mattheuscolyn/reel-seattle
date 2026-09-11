/**
 * Special Presentations full-list presentation — Home opportunities via
 * collectSpecialPresentationsByFilm (same qualification as Home shelf).
 */

import { formatRuntimeLabel } from '../home/shelfData.js';
import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import {
  aggregateTheatersFromRows,
  formatCompactTheaterLine,
} from '../homeShelfDetail/compactTheaterLine.js';
import { formatShelfDetailMonthDay } from '../homeShelfDetail/formatShelfDetailMonthDay.js';
import {
  collectSpecialPresentationsByFilm,
  specialPresentationBrowseLabel,
  SPECIAL_PRESENTATION_PRIORITY,
} from './collectSpecialPresentations.js';

/** @deprecated Prefer formatShelfDetailMonthDay — kept as SP alias. */
export function formatSpecialPresentationDateShort(isoDate) {
  return formatShelfDetailMonthDay(isoDate);
}

/**
 * Compact presentation-label line (deduped ids already ordered).
 * @param {string[]} labels
 * @returns {string | null}
 */
export function formatCompactPresentationLabelLine(labels) {
  return formatCompactTheaterLine(labels);
}

/**
 * @param {object | null | undefined} homeData
 * @param {object | null} [enrichmentIndex]
 */
export function buildLiveSpecialPresentationsPresentation(
  homeData,
  enrichmentIndex = null,
) {
  if (!homeData) {
    return {
      source: 'live-unavailable',
      pageTitle: 'Special Presentations',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Special Presentations isn’t available right now.',
      unavailableBody: 'Check back later or browse current showtimes.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const rows = collectSpecialPresentationsByFilm(homeData);
  if (rows.length === 0) {
    return {
      source: 'live-empty',
      pageTitle: 'Special Presentations',
      pageSubtitle: null,
      countLabel: null,
      emptyTitle: 'No special presentations right now',
      emptyBody:
        'When IMAX, film, Dolby, captions, or other special screenings are playing, they’ll show up here.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const presentationFilms = rows.map((row) => {
    const { filmKey, bestOpportunity, bestCanonicalId } = row;
    const resolved = resolveCanonicalFilmPresentation({
      filmKey,
      filmId: bestOpportunity?.filmId ?? null,
      homeData,
      enrichmentIndex,
      fallbackRecord: {
        filmKey,
        filmId: bestOpportunity?.filmId ?? null,
        title: bestOpportunity?.filmTitle ?? filmKey,
      },
      context: 'home',
    });
    const homeFilm = resolved.homeFilm;
    const enriched = resolved.enriched;

    const presentationLabels = row.presentationCanonicalIds.map((id) =>
      specialPresentationBrowseLabel(id),
    );
    const primaryLabel = specialPresentationBrowseLabel(bestCanonicalId);
    const formatLabel = formatCompactPresentationLabelLine(presentationLabels);

    const theaters = aggregateTheatersFromRows(
      row.qualifyingOpportunities.map((opportunity) => ({
        theaterId: opportunity.theaterId ?? null,
        theaterName: opportunity.theaterName ?? null,
      })),
    );
    const theaterLine = formatCompactTheaterLine(
      theaters.map((theater) => theater.name),
    );
    const primaryTheater = theaters[0] ?? null;
    const dateLabel = formatShelfDetailMonthDay(row.earliestLocalDate);

    const metaParts = [
      enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
      formatRuntimeLabel(enriched.runtimeMin ?? homeFilm?.runtimeMin),
      enriched.genreLine,
    ].filter(Boolean);

    const priorityIndex = SPECIAL_PRESENTATION_PRIORITY.indexOf(bestCanonicalId);

    return {
      filmKey,
      filmId: enriched.filmId ?? homeFilm?.filmId ?? null,
      title: enriched.displayTitle ?? homeFilm?.title ?? filmKey,
      badge: null,
      metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
      synopsis: enriched.synopsisPreview,
      posterUrl: enriched.posterUrl ?? homeFilm?.posterUrl ?? null,
      earliestLocalDate: row.earliestLocalDate,
      earliestSortableLocalDateTime: row.earliestSortableLocalDateTime,
      dateLabel,
      availabilityLabel: null,
      theaterId:
        primaryTheater?.id ?? bestOpportunity?.theaterId ?? null,
      theaterName: theaterLine,
      theaters,
      timeLabel: bestOpportunity?.timeDisplay ?? null,
      // Qualifying special-presentation labels only (includes OC/AD when they
      // are what made an opportunity special — never generic Closed Captions).
      formatLabel,
      formatLabels: presentationLabels,
      presentationCanonicalIds: row.presentationCanonicalIds,
      specialCanonicalId: bestCanonicalId,
      presentationPriorityRank: priorityIndex === -1 ? 99 : priorityIndex,
      showtimeCount:
        homeFilm?.showtimeCount ?? row.qualifyingOpportunities.length,
      theaterCount: theaters.length,
      hasUpcomingShowtimes: row.qualifyingOpportunities.length > 0,
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
      hasEnrichment: enriched.hasEnrichment,
      opportunityKey: bestOpportunity?.opportunityKey ?? null,
      surfaceReason: 'special-presentations',
      surfaceReasonLabel: primaryLabel,
      source: 'special-presentations',
      noCurrentShowtimes: false,
    };
  });

  return {
    source: 'live-special-presentations',
    pageTitle: 'Special Presentations',
    pageSubtitle: null,
    countLabel: null,
    sortLabel: 'Sort',
    filtersLabel: 'Filters',
    films: presentationFilms,
    sections: [
      {
        id: 'special-presentations',
        label: 'Special Presentations',
        films: presentationFilms,
      },
    ],
    categoryChips: [],
    showCategoryChips: false,
    totalCount: presentationFilms.length,
  };
}
