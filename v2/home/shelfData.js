/**
 * Pure helpers: Home shelf cards + inline quick-detail view models.
 * Uses real HomeData only — no fictional film fixtures.
 */

import {
  joinOpeningEntryOpportunities,
} from '../adapters/buildOpeningThisWeek.js';
import {
  joinLeavingSoonEntryToHomeFilm,
} from '../adapters/buildLeavingSoon.js';
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
import {
  CANONICAL_BROWSE_LABEL,
  EXPERIENCE_CANONICAL_IDS,
  FORMAT_CANONICAL_IDS,
  opportunityMatchesCanonical,
} from '../formatsExperiences/formatNormalize.js';

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

export const HOME_LEAVING_SOON_MAX_CARDS = 6;

/**
 * Leaving Soon Home shelf — frozen-model public artifact, bucketed copy only.
 * @param {object | null} homeData
 * @param {object | null} [enrichmentIndex]
 * @param {{ maxCards?: number }} [options]
 */
export function buildLeavingSoonShelf(homeData, enrichmentIndex = null, options = {}) {
  const maxCards = options.maxCards ?? HOME_LEAVING_SOON_MAX_CARDS;
  if (!homeData) {
    return {
      status: 'unavailable',
      reason: 'Home data not loaded.',
      emptyTitle: 'Leaving Soon isn’t ready',
      emptyBody: 'Check back once showtimes finish loading.',
      semantics: 'leaving-soon-unavailable',
      films: [],
    };
  }

  const leaving = homeData.leavingSoon;
  if (!leaving || leaving.status === 'unavailable' || leaving.status === 'invalid') {
    return {
      status: 'unavailable',
      reason: 'Leaving Soon data is unavailable.',
      emptyTitle: 'Leaving Soon isn’t available right now',
      emptyBody:
        'We’ll highlight films nearing the end of their theatrical run when that data is ready.',
      semantics: 'leaving-soon-unavailable',
      films: [],
    };
  }

  const entries = Array.isArray(leaving.entries) ? leaving.entries : [];
  if (leaving.status === 'empty' || entries.length === 0) {
    return {
      status: 'unavailable',
      reason: 'Nothing looks like it is leaving soon right now.',
      emptyTitle: 'Nothing leaving soon right now',
      emptyBody:
        'No theatrical runs currently look like they are winding down. Absence of a badge is not a guarantee a film will stay.',
      semantics: 'leaving-soon-empty',
      films: [],
    };
  }

  const films = Array.isArray(homeData.films) ? homeData.films : [];
  const selected =
    Number.isFinite(maxCards) && maxCards >= 0
      ? entries.slice(0, maxCards)
      : entries;
  const shelfFilms = selected.map((entry) => {
    const homeFilm = joinLeavingSoonEntryToHomeFilm(entry, films);
    const filmKey = homeFilm?.filmKey ?? entry.filmKey;
    const nextOpportunity = findNextOpportunityForFilm(homeData, filmKey);
    const enriched = resolveEnrichedFilmPresentation({
      sourceFilm: {
        filmId: homeFilm?.filmId ?? null,
        title: homeFilm?.title ?? entry.title,
        posterUrl: homeFilm?.posterUrl ?? entry.posterUrl ?? null,
        runtimeMin: homeFilm?.runtimeMin ?? entry.runtimeMin ?? null,
      },
      enrichmentIndex,
      context: 'home',
    });
    const runtimeLabel = formatRuntimeLabel(
      enriched.runtimeMin ?? homeFilm?.runtimeMin ?? entry.runtimeMin,
    );
    return {
      id: filmKey,
      filmKey,
      filmId: enriched.filmId ?? homeFilm?.filmId ?? null,
      title: enriched.displayTitle ?? homeFilm?.title ?? entry.title,
      badge: entry.bucketLabel,
      genre: null,
      metaLabel: runtimeLabel,
      posterUrl: enriched.posterUrl ?? homeFilm?.posterUrl ?? entry.posterUrl ?? null,
      runtimeMin: enriched.runtimeMin ?? homeFilm?.runtimeMin ?? entry.runtimeMin ?? null,
      theaterCount: homeFilm?.theaterCount ?? 0,
      showtimeCount: homeFilm?.showtimeCount ?? entry.totalVisibleShowtimes ?? 0,
      nextOpportunityKey: nextOpportunity?.opportunityKey ?? null,
      surfaceReason: 'leaving-soon',
      surfaceReasonLabel: entry.bucketLabel,
      source: 'leaving-soon-model',
      leavingSoonBucket: entry.bucket,
      hasEnrichment: enriched.hasEnrichment,
    };
  });

  return {
    status: 'ready',
    reason: null,
    semantics: 'leaving-soon-model',
    films: shelfFilms,
  };
}

export const HOME_SPECIAL_PRESENTATIONS_MAX_CARDS = 6;
export const HOME_JUST_ANNOUNCED_MAX_CARDS = 6;
export const JUST_ANNOUNCED_WINDOW_DAYS = 7;

/** Prefer rarer / more premium specials when a film has multiple. */
export const SPECIAL_PRESENTATION_PRIORITY = Object.freeze([
  'imax-70mm',
  '70mm',
  '35mm',
  'imax',
  'dolby-cinema',
  'xl-amc',
  'reald-3d',
  'live-score',
  'open-caption',
  'audio-description',
]);

export const SPECIAL_PRESENTATION_CANONICAL_IDS = Object.freeze([
  ...FORMAT_CANONICAL_IDS,
  ...EXPERIENCE_CANONICAL_IDS,
]);

/**
 * @param {object} opportunity
 * @returns {string | null}
 */
export function resolveBestSpecialCanonicalId(opportunity) {
  const matches = SPECIAL_PRESENTATION_CANONICAL_IDS.filter((id) =>
    opportunityMatchesCanonical(opportunity, id),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const ai = SPECIAL_PRESENTATION_PRIORITY.indexOf(a);
    const bi = SPECIAL_PRESENTATION_PRIORITY.indexOf(b);
    const ap = ai === -1 ? 99 : ai;
    const bp = bi === -1 ? 99 : bi;
    return ap - bp;
  });
  return matches[0];
}

/**
 * Films with notable format/experience showtimes (IMAX, 70mm, OC, etc.).
 * Dedupes by film; prefers soonest qualifying showtime among ties on priority.
 *
 * @param {object | null} homeData
 * @param {object | null} [enrichmentIndex]
 * @param {{ maxCards?: number }} [options]
 */
export function buildSpecialPresentationsShelf(
  homeData,
  enrichmentIndex = null,
  options = {},
) {
  const maxCards = options.maxCards ?? HOME_SPECIAL_PRESENTATIONS_MAX_CARDS;
  if (!homeData) {
    return {
      status: 'unavailable',
      reason: 'Home data not loaded.',
      emptyTitle: 'Special Presentations isn’t ready',
      emptyBody: 'Check back once showtimes finish loading.',
      semantics: 'special-presentations-unavailable',
      films: [],
    };
  }

  const opportunities = Array.isArray(homeData.opportunities)
    ? homeData.opportunities
    : [];
  const films = Array.isArray(homeData.films) ? homeData.films : [];
  /** @type {Map<string, { opportunity: object, canonicalId: string }>} */
  const bestByFilm = new Map();

  for (const opportunity of opportunities) {
    const filmKey =
      typeof opportunity?.filmKey === 'string' ? opportunity.filmKey.trim() : '';
    if (!filmKey) continue;
    const canonicalId = resolveBestSpecialCanonicalId(opportunity);
    if (!canonicalId) continue;

    const existing = bestByFilm.get(filmKey);
    if (!existing) {
      bestByFilm.set(filmKey, { opportunity, canonicalId });
      continue;
    }
    const existingPri = SPECIAL_PRESENTATION_PRIORITY.indexOf(
      existing.canonicalId,
    );
    const nextPri = SPECIAL_PRESENTATION_PRIORITY.indexOf(canonicalId);
    const existingRank = existingPri === -1 ? 99 : existingPri;
    const nextRank = nextPri === -1 ? 99 : nextPri;
    if (nextRank < existingRank) {
      bestByFilm.set(filmKey, { opportunity, canonicalId });
      continue;
    }
    if (nextRank === existingRank) {
      const a = existing.opportunity.sortableLocalDateTime ?? '';
      const b = opportunity.sortableLocalDateTime ?? '';
      if (b && (!a || b < a)) {
        bestByFilm.set(filmKey, { opportunity, canonicalId });
      }
    }
  }

  if (bestByFilm.size === 0) {
    return {
      status: 'unavailable',
      reason: 'No special presentations right now.',
      emptyTitle: 'No special presentations right now',
      emptyBody:
        'When IMAX, film, Dolby, captions, or other special screenings are playing, they’ll show up here.',
      semantics: 'special-presentations-empty',
      films: [],
    };
  }

  const ranked = [...bestByFilm.entries()]
    .map(([filmKey, value]) => ({ filmKey, ...value }))
    .sort((a, b) => {
      const ap = SPECIAL_PRESENTATION_PRIORITY.indexOf(a.canonicalId);
      const bp = SPECIAL_PRESENTATION_PRIORITY.indexOf(b.canonicalId);
      const aRank = ap === -1 ? 99 : ap;
      const bRank = bp === -1 ? 99 : bp;
      if (aRank !== bRank) return aRank - bRank;
      const at = a.opportunity.sortableLocalDateTime ?? '';
      const bt = b.opportunity.sortableLocalDateTime ?? '';
      if (at !== bt) return at < bt ? -1 : 1;
      return a.filmKey < b.filmKey ? -1 : 1;
    })
    .slice(0, Math.max(0, maxCards));

  const shelfFilms = ranked.map(({ filmKey, opportunity, canonicalId }) => {
    const homeFilm = films.find((film) => film.filmKey === filmKey) ?? null;
    const enriched = resolveEnrichedFilmPresentation({
      sourceFilm: {
        filmId: homeFilm?.filmId ?? null,
        title: homeFilm?.title ?? opportunity.filmTitle ?? filmKey,
        posterUrl: homeFilm?.posterUrl ?? null,
        runtimeMin: homeFilm?.runtimeMin ?? null,
      },
      enrichmentIndex,
      context: 'home',
    });
    const badge =
      CANONICAL_BROWSE_LABEL[canonicalId] ??
      formatUserFacingFormatLabel(canonicalId) ??
      canonicalId;
    const runtimeLabel = formatRuntimeLabel(
      enriched.runtimeMin ?? homeFilm?.runtimeMin,
    );
    const genrePrimary = enriched.genreLine
      ? String(enriched.genreLine).split(',')[0].trim()
      : null;

    return {
      id: filmKey,
      filmKey,
      filmId: enriched.filmId ?? homeFilm?.filmId ?? null,
      title: enriched.displayTitle ?? homeFilm?.title ?? filmKey,
      badge,
      genre: genrePrimary,
      metaLabel: runtimeLabel,
      posterUrl: enriched.posterUrl ?? homeFilm?.posterUrl ?? null,
      runtimeMin: enriched.runtimeMin ?? homeFilm?.runtimeMin ?? null,
      theaterCount: homeFilm?.theaterCount ?? 0,
      showtimeCount: homeFilm?.showtimeCount ?? 0,
      nextOpportunityKey: opportunity.opportunityKey ?? null,
      surfaceReason: 'special-presentations',
      surfaceReasonLabel: badge,
      specialCanonicalId: canonicalId,
      source: 'special-presentations',
      hasEnrichment: enriched.hasEnrichment,
    };
  });

  return {
    status: 'ready',
    reason: null,
    semantics: 'special-presentations',
    films: shelfFilms,
  };
}

/**
 * Films whose earliest newly-added observation falls within the last N days
 * and that still have at least one valid future showtime.
 *
 * Uses `homeData.newlyAdded` (pipeline `newly_added_current`, default 7-day window).
 *
 * @param {object | null} homeData
 * @param {object | null} [enrichmentIndex]
 * @param {{ maxCards?: number, windowDays?: number, now?: Date }} [options]
 */
export function buildJustAnnouncedShelf(
  homeData,
  enrichmentIndex = null,
  options = {},
) {
  const maxCards = options.maxCards ?? HOME_JUST_ANNOUNCED_MAX_CARDS;
  const windowDays = options.windowDays ?? JUST_ANNOUNCED_WINDOW_DAYS;
  if (!homeData) {
    return {
      status: 'unavailable',
      reason: 'Home data not loaded.',
      emptyTitle: 'Just Announced isn’t ready',
      emptyBody: 'Check back once showtimes finish loading.',
      semantics: 'just-announced-unavailable',
      films: [],
    };
  }

  const newlyAdded = Array.isArray(homeData.newlyAdded)
    ? homeData.newlyAdded
    : [];
  if (newlyAdded.length === 0) {
    return {
      status: 'unavailable',
      reason: 'No newly announced films right now.',
      emptyTitle: 'Nothing just announced',
      emptyBody:
        'When new showtimes are first observed in the last week, they’ll appear here.',
      semantics: 'just-announced-empty',
      films: [],
    };
  }

  const timezone = homeData.timezone ?? 'America/Los_Angeles';
  const todayIso = pacificTodayIso(timezone);
  const now = options.now instanceof Date ? options.now : new Date();
  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  const films = Array.isArray(homeData.films) ? homeData.films : [];
  const eligible = newlyAdded
    .filter((entry) => entry?.hasActiveShowtimes === true)
    .filter((entry) => {
      const first =
        typeof entry.firstObservedAt === 'string'
          ? entry.firstObservedAt.trim()
          : '';
      if (!first) return false;
      // first_announced_date is typically an ISO date (YYYY-MM-DD).
      const parsed = Date.parse(
        first.length <= 10 ? `${first}T12:00:00` : first,
      );
      if (!Number.isFinite(parsed)) return false;
      return parsed >= cutoffMs;
    })
    .sort((a, b) => {
      if (a.firstObservedAt !== b.firstObservedAt) {
        return a.firstObservedAt < b.firstObservedAt ? 1 : -1;
      }
      const at = a.nextShowtimeAt ?? '';
      const bt = b.nextShowtimeAt ?? '';
      if (at !== bt) return at < bt ? -1 : 1;
      return String(a.title ?? '') < String(b.title ?? '') ? -1 : 1;
    })
    .slice(0, Math.max(0, maxCards));

  if (eligible.length === 0) {
    return {
      status: 'unavailable',
      reason: 'No newly announced films right now.',
      emptyTitle: 'Nothing just announced',
      emptyBody:
        'When new showtimes are first observed in the last week, they’ll appear here.',
      semantics: 'just-announced-empty',
      films: [],
    };
  }

  const shelfFilms = eligible.map((entry) => {
    const filmKey = entry.filmKey;
    const homeFilm = films.find((film) => film.filmKey === filmKey) ?? null;
    const nextOpportunity = findNextOpportunityForFilm(homeData, filmKey);
    const enriched = resolveEnrichedFilmPresentation({
      sourceFilm: {
        filmId: homeFilm?.filmId ?? null,
        title: homeFilm?.title ?? entry.title ?? filmKey,
        posterUrl: homeFilm?.posterUrl ?? entry.posterUrl ?? null,
        runtimeMin: homeFilm?.runtimeMin ?? null,
      },
      enrichmentIndex,
      context: 'home',
    });
    const runtimeLabel = formatRuntimeLabel(
      enriched.runtimeMin ?? homeFilm?.runtimeMin,
    );
    const genrePrimary = enriched.genreLine
      ? String(enriched.genreLine).split(',')[0].trim()
      : null;
    const dateLabel = formatLocalDateLabel(entry.firstObservedAt) ?? todayIso;

    return {
      id: filmKey,
      filmKey,
      filmId: enriched.filmId ?? homeFilm?.filmId ?? null,
      title: enriched.displayTitle ?? homeFilm?.title ?? entry.title ?? filmKey,
      badge: 'Just announced',
      genre: genrePrimary,
      metaLabel: runtimeLabel ?? dateLabel,
      posterUrl:
        enriched.posterUrl ?? homeFilm?.posterUrl ?? entry.posterUrl ?? null,
      runtimeMin: enriched.runtimeMin ?? homeFilm?.runtimeMin ?? null,
      theaterCount: entry.theaterCount ?? homeFilm?.theaterCount ?? 0,
      showtimeCount: entry.opportunityCount ?? homeFilm?.showtimeCount ?? 0,
      nextOpportunityKey: nextOpportunity?.opportunityKey ?? null,
      firstObservedAt: entry.firstObservedAt,
      surfaceReason: 'just-announced',
      surfaceReasonLabel: 'Just announced',
      source: 'newly-added',
      hasEnrichment: enriched.hasEnrichment,
    };
  });

  return {
    status: 'ready',
    reason: null,
    semantics: 'just-announced',
    films: shelfFilms,
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
