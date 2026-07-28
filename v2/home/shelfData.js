/**
 * Pure helpers: Home shelf cards + inline quick-detail view models.
 * Uses real HomeData only — no fictional film fixtures.
 */

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
 */
export function buildOpeningThisWeekShelf(homeData) {
  if (!homeData) {
    return {
      status: 'unavailable',
      reason: 'Home data not loaded.',
      semantics: 'opening-this-week-unavailable',
      films: [],
    };
  }

  const newlyAdded = Array.isArray(homeData.newlyAdded) ? homeData.newlyAdded : [];
  if (newlyAdded.length === 0) {
    return {
      status: 'unavailable',
      reason:
        'Opening This Week classification is not available, and no recently added films were found.',
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
    const metaLabel =
      formatLocalDateLabel(entry.firstObservedAt) ??
      formatLocalDateLabel(entry.lastSeenDate) ??
      'Recently added';
    return {
      id: entry.filmKey,
      filmKey: entry.filmKey,
      title: film?.title ?? entry.title ?? 'Untitled',
      genre: null,
      metaLabel,
      posterUrl: film?.posterUrl ?? entry.posterUrl ?? null,
      runtimeMin: film?.runtimeMin ?? null,
      theaterCount: film?.theaterCount ?? 0,
      showtimeCount: film?.showtimeCount ?? 0,
      nextOpportunityKey: next?.opportunityKey ?? null,
      surfaceReason: 'newly_added',
      surfaceReasonLabel: 'Newly added',
      source: 'newly-added-provisional',
    };
  });

  return {
    status: 'provisional',
    reason:
      'Opening-week classification is not available. Showing recently added films provisionally — not equivalent to theatrical openings.',
    semantics: 'newly-added-provisional',
    films,
  };
}

/**
 * Leaving Soon Home shelf — gated artifact; honest unavailable.
 * @param {object | null} homeData
 */
export function buildLeavingSoonShelf(homeData) {
  const excluded = homeData?.leavingSoonExcluded !== false;
  return {
    status: 'unavailable',
    reason: excluded
      ? 'Leaving Soon production data remains gated and is not consumed by v2.'
      : 'Leaving Soon data is unavailable.',
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
 */
export function buildInlineQuickDetail(homeData, shelfFilm) {
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

  const metaParts = [
    formatRuntimeLabel(film?.runtimeMin ?? shelfFilm.runtimeMin),
  ].filter(Boolean);

  const theaterCount = film?.theaterCount ?? shelfFilm.theaterCount ?? 0;

  return {
    filmKey: shelfFilm.filmKey,
    title: film?.title ?? shelfFilm.title,
    posterUrl: film?.posterUrl ?? shelfFilm.posterUrl ?? null,
    /** Synopsis / rating / year / genre absent in current public artifacts. */
    synopsis: null,
    rating: null,
    year: null,
    genre: null,
    metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
    opportunityKey: opportunity?.opportunityKey ?? null,
    showingLine: showingParts.length > 0 ? showingParts.join(' · ') : null,
    /** Next showtime ticket URL for future consumers; inline UI does not open tickets. */
    ticketUrl: opportunity?.ticketUrl ?? null,
    surfaceReasonLabel: shelfFilm.surfaceReasonLabel ?? null,
    alsoPlayingLabel:
      theaterCount >= 2 ? `Also playing at ${theaterCount} theaters` : null,
  };
}
