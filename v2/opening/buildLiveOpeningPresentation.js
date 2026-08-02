/**
 * Live Opening This Week page presentation from HomeData + enrichment (T-ENR-10).
 * Opening membership stays provisional newly-added — never TMDB release_date.
 */

import { resolveEnrichedFilmPresentation } from '../enrichment/resolveEnrichedFilmPresentation.js';
import {
  buildOpeningThisWeekShelf,
  findNextOpportunityForFilm,
  formatRuntimeLabel,
} from '../home/shelfData.js';
import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';

/**
 * @param {object} homeData
 * @param {object | null} [enrichmentIndex]
 */
export function buildLiveOpeningThisWeekPresentation(
  homeData,
  enrichmentIndex = null,
) {
  const shelf = buildOpeningThisWeekShelf(homeData, enrichmentIndex);
  if (shelf.status === 'unavailable') {
    return {
      source: 'live-unavailable',
      pageTitle: 'Opening This Week',
      countLabel: 'Opening This Week is unavailable right now.',
      sortLabel: 'Sort',
      sortValue: 'Opening date',
      filtersLabel: 'Filters',
      films: [],
      shelfStatus: shelf.status,
      shelfReason: shelf.reason,
    };
  }

  const filmsByKey = new Map(
    (Array.isArray(homeData.films) ? homeData.films : []).map((f) => [f.filmKey, f]),
  );

  const films = shelf.films.map((shelfFilm, index) => {
    const film = filmsByKey.get(shelfFilm.filmKey);
    const opportunity =
      (shelfFilm.nextOpportunityKey &&
        (Array.isArray(homeData.opportunities) ? homeData.opportunities : []).find(
          (opp) => opp.opportunityKey === shelfFilm.nextOpportunityKey,
        )) ||
      findNextOpportunityForFilm(homeData, shelfFilm.filmKey);

    const enriched = resolveEnrichedFilmPresentation({
      sourceFilm: {
        filmId: film?.filmId ?? shelfFilm.filmId ?? null,
        title: film?.title ?? shelfFilm.title ?? null,
        posterUrl: film?.posterUrl ?? shelfFilm.posterUrl ?? null,
        runtimeMin: film?.runtimeMin ?? shelfFilm.runtimeMin ?? null,
      },
      enrichmentIndex,
      context: 'opening',
    });

    const metaParts = [
      enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
      formatRuntimeLabel(film?.runtimeMin ?? shelfFilm.runtimeMin),
      enriched.genreLine,
    ].filter(Boolean);

    const formatLabels = Array.isArray(opportunity?.formatLabels)
      ? opportunity.formatLabels.map(formatUserFacingFormatLabel).filter(Boolean)
      : [];

    return {
      filmKey: shelfFilm.filmKey,
      filmId: enriched.filmId,
      title: enriched.displayTitle ?? shelfFilm.title,
      badge: shelfFilm.surfaceReasonLabel === 'Newly added' ? 'NEW' : null,
      metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
      synopsis: enriched.synopsisPreview,
      posterUrl: enriched.posterUrl,
      dateLabel: formatLocalDateLabel(opportunity?.localDate) ?? shelfFilm.metaLabel,
      theaterName: opportunity?.theaterName ?? null,
      timeLabel: opportunity?.timeDisplay ?? null,
      formatLabel: formatLabels[0] ?? null,
      whySeeIt: null,
      alsoPlaying:
        (film?.theaterCount ?? 0) >= 2
          ? {
              theaterName: `Also playing at ${film.theaterCount} theaters`,
              detailLabel: 'See showtimes',
            }
          : null,
      initiallyExpanded: index === 0,
      hasEnrichment: enriched.hasEnrichment,
      opportunityKey: opportunity?.opportunityKey ?? null,
    };
  });

  const count = films.length;
  return {
    source: 'live-home-data',
    pageTitle: 'Opening This Week',
    countLabel:
      count === 1
        ? '1 film recently added across Seattle.'
        : `${count} films recently added across Seattle.`,
    sortLabel: 'Sort',
    sortValue: 'Opening date',
    filtersLabel: 'Filters',
    films,
    shelfStatus: shelf.status,
    shelfReason: shelf.reason,
  };
}
