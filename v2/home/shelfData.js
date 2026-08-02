/**
 * Pure helpers: Home shelf cards + inline quick-detail view models.
 * Uses real HomeData only — no fictional film fixtures.
 */

import { resolveEnrichedFilmPresentation } from '../enrichment/resolveEnrichedFilmPresentation.js';
import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';

/**
 * Format runtime minutes as "2h 14m" when possible.
 * @param {number | null | undefined} runtimeMin
 */
export function formatRuntimeLabel(runtimeMin) {
  if (typeof runtimeMin !== 'number' || !Number.isFinite(runtimeMin) || runtimeMin <= 0) {
    return null;
  }
  const hours = Math.floor(runtimeMin / 60);
  const minutes = Math.round(runtimeMin % 60);
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Next upcoming opportunity for a film (earliest chronological).
 * @param {object} homeData
 * @param {string} filmKey
 */
export function findNextOpportunityForFilm(homeData, filmKey) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const matches = opportunities
    .filter((opp) => opp.filmKey === filmKey)
    .sort((a, b) => {
      if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
        return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
      }
      return a.opportunityKey < b.opportunityKey ? -1 : 1;
    });
  return matches[0] ?? null;
}

/**
 * Opening This Week Home shelf — development / provisional state.
 *
 * There is no approved opening-this-week classification artifact.
 * We surface real newly_added films with an explicit provisional flag —
 * never as production Opening This Week truth, and never as fictional titles.
 *
 * @param {object | null} homeData
 * @param {object | null} [enrichmentIndex]
 */
export function buildOpeningThisWeekShelf(homeData, enrichmentIndex = null) {
  if (!homeData) {
    return {
      status: 'unavailable',
      reason: 'Home data not loaded.',
      emptyTitle: 'Opening This Week isn’t ready',
      emptyBody: 'Check back once showtimes finish loading.',
      semantics: 'opening-this-week-unavailable',
      films: [],
    };
  }

  const newlyAdded = Array.isArray(homeData.newlyAdded) ? homeData.newlyAdded : [];
  if (newlyAdded.length === 0) {
    return {
      status: 'unavailable',
      reason: 'No recently added films to show right now.',
      emptyTitle: 'Nothing to show yet',
      emptyBody:
        'Recently added films will appear here when available. A verified opening-week list is not ready yet.',
      semantics: 'opening-this-week-unavailable',
      films: [],
    };
  }

  const filmsByKey = new Map(
    (Array.isArray(homeData.films) ? homeData.films : []).map((f) => [f.filmKey, f]),
  );

  const films = newlyAdded.slice(0, 8).map((entry) => {
    const film = filmsByKey.get(entry.filmKey);
    const next = findNextOpportunityForFilm(homeData, entry.filmKey);
    const enriched = resolveEnrichedFilmPresentation({
      sourceFilm: {
        filmId: film?.filmId ?? null,
        title: film?.title ?? entry.title ?? null,
        posterUrl: film?.posterUrl ?? entry.posterUrl ?? null,
        runtimeMin: film?.runtimeMin ?? null,
      },
      enrichmentIndex,
      context: 'opening',
    });
    const runtimeLabel = formatRuntimeLabel(film?.runtimeMin);
    const dateLabel =
      formatLocalDateLabel(entry.firstObservedAt) ??
      formatLocalDateLabel(entry.lastSeenDate);
    // Prefer runtime (mockup-aligned) when known; otherwise an honest date cue.
    const metaLabel = runtimeLabel ?? dateLabel ?? 'Recently added';
    const genrePrimary = enriched.genreLine
      ? String(enriched.genreLine).split(',')[0].trim()
      : null;
    return {
      id: entry.filmKey,
      filmKey: entry.filmKey,
      filmId: enriched.filmId,
      title: enriched.displayTitle ?? 'Untitled',
      genre: genrePrimary,
      metaLabel,
      posterUrl: enriched.posterUrl,
      runtimeMin: film?.runtimeMin ?? null,
      theaterCount: film?.theaterCount ?? 0,
      showtimeCount: film?.showtimeCount ?? 0,
      nextOpportunityKey: next?.opportunityKey ?? null,
      surfaceReason: 'newly_added',
      surfaceReasonLabel: 'Newly added',
      source: 'newly-added-provisional',
      hasEnrichment: enriched.hasEnrichment,
    };
  });

  return {
    status: 'provisional',
    reason:
      'Showing recently added films — not a verified opening-week list.',
    semantics: 'newly-added-provisional',
    films,
  };
}

/**
 * Leaving Soon Home shelf — gated artifact; honest unavailable empty state.
 * @param {object | null} homeData
 */
export function buildLeavingSoonShelf(homeData) {
  const excluded = homeData?.leavingSoonExcluded !== false;
  return {
    status: 'unavailable',
    reason: excluded
      ? 'Leaving Soon isn’t available yet.'
      : 'Leaving Soon data is unavailable.',
    emptyTitle: 'Leaving Soon isn’t available yet',
    emptyBody:
      'We’ll highlight films nearing the end of their theatrical run when that data is ready.',
    semantics: 'leaving-soon-gated',
    films: [],
  };
}

/**
 * Concise inline quick-detail model — “Is this worth investigating?”
 * Omits unavailable fields; never fabricates synopsis/rating/year/genre.
 *
 * @param {object} homeData
 * @param {object} shelfFilm
 * @param {object | null} [enrichmentIndex]
 */
export function buildInlineQuickDetail(homeData, shelfFilm, enrichmentIndex = null) {
  if (!shelfFilm?.filmKey) return null;
  const film =
    (Array.isArray(homeData?.films) ? homeData.films : []).find(
      (item) => item.filmKey === shelfFilm.filmKey,
    ) ?? null;
  const opportunity =
    (shelfFilm.nextOpportunityKey &&
      (Array.isArray(homeData?.opportunities) ? homeData.opportunities : []).find(
        (opp) => opp.opportunityKey === shelfFilm.nextOpportunityKey,
      )) ||
    findNextOpportunityForFilm(homeData, shelfFilm.filmKey);

  const formatLabels = Array.isArray(opportunity?.formatLabels)
    ? opportunity.formatLabels.map(formatUserFacingFormatLabel).filter(Boolean)
    : [];

  const dateLabel = formatLocalDateLabel(opportunity?.localDate);
  const timePart = opportunity?.timeDisplay ?? null;
  const showingParts = [
    opportunity?.theaterName,
    [dateLabel, timePart].filter(Boolean).join(' '),
    formatLabels[0] ?? null,
  ].filter(Boolean);

  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: film?.filmId ?? shelfFilm.filmId ?? null,
      title: film?.title ?? shelfFilm.title ?? null,
      posterUrl: film?.posterUrl ?? shelfFilm.posterUrl ?? null,
      runtimeMin: film?.runtimeMin ?? shelfFilm.runtimeMin ?? null,
    },
    enrichmentIndex,
    context: 'home',
  });

  const metaParts = [
    formatRuntimeLabel(film?.runtimeMin ?? shelfFilm.runtimeMin),
    enriched.genreLine,
    enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
  ].filter(Boolean);

  const theaterCount = film?.theaterCount ?? shelfFilm.theaterCount ?? 0;

  return {
    filmKey: shelfFilm.filmKey,
    filmId: enriched.filmId,
    title: enriched.displayTitle ?? shelfFilm.title,
    posterUrl: enriched.posterUrl,
    synopsis: enriched.synopsisPreview,
    rating: null,
    year: enriched.canonicalYear,
    genre: enriched.genreLine,
    metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
    opportunityKey: opportunity?.opportunityKey ?? null,
    showingLine: showingParts.length > 0 ? showingParts.join(' · ') : null,
    /** Next showtime ticket URL for future consumers; inline UI does not open tickets. */
    ticketUrl: opportunity?.ticketUrl ?? null,
    surfaceReasonLabel: shelfFilm.surfaceReasonLabel ?? null,
    alsoPlayingLabel:
      theaterCount >= 2 ? `Also playing at ${theaterCount} theaters` : null,
    hasEnrichment: enriched.hasEnrichment,
  };
}
