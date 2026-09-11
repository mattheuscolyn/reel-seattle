/**
 * Leaving Soon full-list presentation model — artifact-backed cards for
 * HomeShelfDetailSurface. Uses leaving_soon_current via homeData.leavingSoon.
 */

import { joinLeavingSoonEntryToHomeFilm } from '../adapters/buildLeavingSoon.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import {
  aggregateTheatersFromRows,
  formatCompactTheaterLine,
} from '../homeShelfDetail/compactTheaterLine.js';
import { formatShelfDetailMonthDay } from '../homeShelfDetail/formatShelfDetailMonthDay.js';
import { selectNextScreeningForFilm } from '../showtimes/screeningSelectors.js';

/** @deprecated Prefer formatShelfDetailMonthDay — kept as Leaving alias. */
export function formatLeavingDateShort(isoDate) {
  return formatShelfDetailMonthDay(isoDate);
}

/**
 * @param {string | null | undefined} maxShowDate
 * @returns {string | null}
 */
export function buildLeavingDateLabel(maxShowDate) {
  const short = formatShelfDetailMonthDay(maxShowDate);
  return short ? `Last screening ${short}` : null;
}

/**
 * @param {object} homeData
 * @param {string} filmKey
 */
function opportunitiesForFilm(homeData, filmKey) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  return opportunities
    .filter((opp) => opp?.filmKey === filmKey)
    .slice()
    .sort((a, b) =>
      String(a.sortableLocalDateTime ?? '').localeCompare(
        String(b.sortableLocalDateTime ?? ''),
      ),
    );
}

/**
 * @param {object | null | undefined} homeData
 * @param {object | null} [enrichmentIndex]
 */
export function buildLiveLeavingSoonPresentation(
  homeData,
  enrichmentIndex = null,
) {
  const leaving = homeData?.leavingSoon;

  if (!leaving || leaving.status === 'unavailable' || leaving.status === 'invalid') {
    return {
      source: 'live-unavailable',
      pageTitle: 'Leaving Soon',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Leaving Soon isn’t available right now.',
      unavailableBody:
        'We’ll highlight films nearing the end of their theatrical run when that data is ready.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const entries = Array.isArray(leaving.entries) ? leaving.entries : [];
  if (leaving.status === 'empty' || entries.length === 0) {
    return {
      source: 'live-empty',
      pageTitle: 'Leaving Soon',
      pageSubtitle: null,
      countLabel: null,
      emptyTitle: 'Nothing leaving soon right now.',
      emptyBody:
        'No theatrical runs currently look like they are winding down. Absence of a badge is not a guarantee a film will stay.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const films = Array.isArray(homeData?.films) ? homeData.films : [];

  const presentationFilms = entries.map((entry) => {
    const joined = joinLeavingSoonEntryToHomeFilm(entry, films);
    const resolved = resolveCanonicalFilmPresentation({
      filmKey: entry.filmKey ?? joined?.filmKey ?? null,
      filmId: entry.filmId ?? joined?.filmId ?? null,
      homeData,
      enrichmentIndex,
      fallbackRecord: {
        ...(entry && typeof entry === 'object' ? entry : {}),
        title: joined?.title ?? entry.title,
        posterUrl: joined?.posterUrl ?? entry.posterUrl ?? null,
        runtimeMin: joined?.runtimeMin ?? entry.runtimeMin ?? null,
        filmId: entry.filmId ?? joined?.filmId ?? null,
      },
      context: 'home',
    });
    const homeFilm = resolved.homeFilm ?? joined;
    const enriched = resolved.enriched;
    const filmKey = homeFilm?.filmKey ?? entry.filmKey;
    const filmOpportunities = opportunitiesForFilm(homeData, filmKey);
    const nextOpportunity =
      filmOpportunities[0] ??
      selectNextScreeningForFilm(homeData, filmKey) ??
      null;

    const artifactTheaters = Array.isArray(entry.theaters)
      ? entry.theaters.map((theater) => ({
          theaterId: theater.id,
          theaterName: theater.name,
        }))
      : [];
    const theaters =
      artifactTheaters.length > 0
        ? aggregateTheatersFromRows(artifactTheaters)
        : aggregateTheatersFromRows(filmOpportunities);
    const theaterNames = theaters.map((theater) => theater.name);
    const theaterLine = formatCompactTheaterLine(theaterNames);
    const primaryTheater = theaters[0] ?? null;

    const metaParts = [
      enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
      formatRuntimeLabel(
        enriched.runtimeMin ?? homeFilm?.runtimeMin ?? entry.runtimeMin,
      ),
      enriched.genreLine,
    ].filter(Boolean);

    const hasUpcomingShowtimes =
      (entry.totalVisibleShowtimes ?? 0) > 0 || filmOpportunities.length > 0;

    return {
      filmKey,
      filmId: enriched.filmId ?? homeFilm?.filmId ?? null,
      title: enriched.displayTitle ?? homeFilm?.title ?? entry.title,
      badge: entry.bucketLabel,
      categoryId: entry.bucket,
      metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
      synopsis: enriched.synopsisPreview,
      posterUrl:
        enriched.posterUrl ?? homeFilm?.posterUrl ?? entry.posterUrl ?? null,
      maxShowDate: entry.maxShowDate ?? null,
      dateLabel: buildLeavingDateLabel(entry.maxShowDate),
      availabilityLabel: null,
      theaterId: primaryTheater?.id ?? nextOpportunity?.theaterId ?? null,
      theaterName: theaterLine,
      theaters,
      timeLabel: nextOpportunity?.timeDisplay ?? null,
      // Browse-level cards omit screening accessibility/format chips.
      formatLabel: null,
      formatLabels: [],
      showtimeCount:
        homeFilm?.showtimeCount ?? entry.totalVisibleShowtimes ?? 0,
      theaterCount:
        theaters.length > 0
          ? theaters.length
          : (entry.totalVisibleTheaters ?? homeFilm?.theaterCount ?? 0),
      hasUpcomingShowtimes,
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
      hasEnrichment: enriched.hasEnrichment,
      opportunityKey: nextOpportunity?.opportunityKey ?? null,
      leavingSoonBucket: entry.bucket,
      surfaceReason: 'leaving-soon',
      surfaceReasonLabel: entry.bucketLabel,
      source: 'leaving-soon-model',
      noCurrentShowtimes: !hasUpcomingShowtimes,
    };
  });

  return {
    source: 'live-leaving-soon-artifact',
    pageTitle: 'Leaving Soon',
    pageSubtitle: null,
    countLabel: null,
    sortLabel: 'Sort',
    filtersLabel: 'Filters',
    films: presentationFilms,
    sections: [
      {
        id: 'leaving-soon',
        label: 'Leaving Soon',
        films: presentationFilms,
      },
    ],
    categoryChips: [],
    showCategoryChips: false,
    totalCount: presentationFilms.length,
  };
}
