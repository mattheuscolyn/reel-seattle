/**
 * Pure helpers: Home shelf cards + inline quick-detail view models.
 * Uses real HomeData only — no fictional film fixtures.
 */

import {
  joinOpeningEntryOpportunities,
} from '../adapters/buildOpeningThisWeek.js';
import { resolveEnrichedFilmPresentation } from '../enrichment/resolveEnrichedFilmPresentation.js';
import { buildOpeningDateCopy, pacificTodayIso } from '../opening/openingDateCopy.js';
import { resolveOpeningEntryPresentation } from '../opening/resolveOpeningEntryPresentation.js';
import {
  HOME_OPENING_SHELF_MAX_CARDS,
  rankOpeningShelfEntries,
} from './openingShelfRanking.js';
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
 * Opening This Week Home shelf — verified artifact membership.
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

  const opening = homeData.openingThisWeek;
  if (!opening || opening.status === 'unavailable' || opening.status === 'invalid') {
    return {
      status: 'unavailable',
      reason: 'Opening This Week isn’t available right now.',
      emptyTitle: 'Opening This Week isn’t available right now.',
      emptyBody: 'Check back later for films opening in Seattle this week.',
      semantics: 'opening-this-week-unavailable',
      films: [],
    };
  }

  const entries = Array.isArray(opening.entries) ? opening.entries : [];
  if (opening.status === 'empty' || entries.length === 0) {
    return {
      status: 'unavailable',
      reason: 'Nothing opening in Seattle this week.',
      emptyTitle: 'Nothing opening this week',
      emptyBody: 'No films are opening in Seattle theaters this week.',
      semantics: 'opening-this-week-empty',
      films: [],
    };
  }

  const timezone = opening.timezone ?? homeData.timezone ?? 'America/Los_Angeles';
  const todayIso = pacificTodayIso(timezone);
  const currentYear = Number(todayIso.slice(0, 4));
  const films = Array.isArray(homeData.films) ? homeData.films : [];
  const opportunities = Array.isArray(homeData.opportunities)
    ? homeData.opportunities
    : [];

  const enrichedEntries = entries.map((entry) => {
    const resolved = resolveOpeningEntryPresentation(entry, {
      homeData,
      enrichmentIndex,
      timezone,
      todayIso,
      currentYear,
    });
    return {
      ...entry,
      categoryId: resolved.categoryId,
      categoryLabel: resolved.categoryLabel,
      categoryBadge: resolved.categoryBadge,
      sectionLabel: resolved.sectionLabel,
      homeFilm: resolved.homeFilm,
      enriched: resolved.enriched,
    };
  });

  const ranked = rankOpeningShelfEntries(enrichedEntries, {
    maxCards: HOME_OPENING_SHELF_MAX_CARDS,
  });

  const shelfFilms = ranked.map((entry) => {
    const homeFilm = entry.homeFilm;
    const filmOpportunities = joinOpeningEntryOpportunities(
      entry,
      opportunities,
      films,
    );
    const nextOpportunity = filmOpportunities[0] ?? null;
    const hasUpcomingShowtimes = (entry.visibleShowtimeCount ?? 0) > 0;
    const { dateLabel } = buildOpeningDateCopy({
      openingDate: entry.openingDate,
      engagementDays: entry.engagementDays,
      categoryId: entry.categoryId,
      timezone,
      todayIso,
      hasUpcomingShowtimes,
      compact: true,
    });

    const genrePrimary = entry.enriched.genreLine
      ? String(entry.enriched.genreLine).split(',')[0].trim()
      : null;

    return {
      id: homeFilm?.filmKey ?? entry.filmKey,
      filmKey: homeFilm?.filmKey ?? entry.filmKey,
      filmId: entry.enriched.filmId,
      title: entry.enriched.displayTitle ?? entry.title,
      badge: entry.categoryBadge,
      genre: genrePrimary,
      metaLabel: dateLabel,
      posterUrl: entry.enriched.posterUrl,
      runtimeMin: entry.enriched.runtimeMin ?? null,
      theaterCount:
        homeFilm?.theaterCount ?? entry.theaterCountOnOpeningDate ?? 0,
      showtimeCount:
        homeFilm?.showtimeCount ?? entry.visibleShowtimeCount ?? 0,
      visibleShowtimeCount: entry.visibleShowtimeCount ?? 0,
      openingDate: entry.openingDate,
      categoryId: entry.categoryId,
      nextOpportunityKey: nextOpportunity?.opportunityKey ?? null,
      surfaceReason: 'opening-this-week',
      surfaceReasonLabel: entry.categoryBadge,
      source: 'opening-this-week-verified',
      hasEnrichment: entry.enriched.hasEnrichment,
      hasUpcomingShowtimes,
    };
  });

  return {
    status: 'ready',
    reason: null,
    semantics: 'opening-this-week-verified',
    films: shelfFilms,
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
    formatRuntimeLabel(enriched.runtimeMin),
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
    rating: enriched.usCertification,
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
