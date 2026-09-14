/**
 * Home SHORT FILMS shelf + See-all presentation.
 *
 * Eligibility and ranking are pure: Short → membership → ShortsProgram →
 * existing program showtimes. Shorts never own screenings.
 */

import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import { formatShelfDetailMonthDay } from '../homeShelfDetail/formatShelfDetailMonthDay.js';
import { formatShortOpeningDate } from '../opening/openingDateCopy.js';
import { selectNextScreeningForFilm } from '../showtimes/screeningSelectors.js';
import {
  asText,
  getShort,
  getShortsProgram,
  programDisplayTitle,
  programMembershipsForShort,
  shortDisplayTitle,
} from './shortsProgramsModel.js';

export const HOME_SHORT_FILMS_MAX_CARDS = 6;
export const SHORT_FILMS_ENTITY_KIND = 'short';

/**
 * @param {unknown} directors
 * @returns {string | null}
 */
function formatShortDirectorLine(directors) {
  if (!Array.isArray(directors) || directors.length === 0) return null;
  const names = directors.map((d) => asText(d)).filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * @param {object | null | undefined} short
 * @returns {string | null}
 */
function shortFallbackPoster(short) {
  return asText(short?.imageUrl) || asText(short?.image_url) || null;
}

/**
 * Nearest future program screening context for a Short.
 * Does not invent Short-owned showtimes.
 *
 * @param {{
 *   shortId: string,
 *   shortsIndex: object | null,
 *   homeData: object | null,
 *   now?: Date | (() => Date) | string | number,
 * }} args
 * @returns {{
 *   shortId: string,
 *   short: object,
 *   primaryProgramId: string,
 *   primaryProgram: object,
 *   primaryProgramTitle: string,
 *   programFilmKey: string,
 *   nextOpportunity: object,
 *   membershipPosition: number,
 * } | null}
 */
export function resolveNearestFutureProgramContext({
  shortId,
  shortsIndex,
  homeData,
  now = new Date(),
}) {
  const id = asText(shortId);
  if (!id || !shortsIndex || !homeData) return null;
  const short = getShort(shortsIndex, id);
  if (!short) return null;

  /** @type {Array<{
   *   programId: string,
   *   program: object,
   *   programFilmKey: string,
   *   nextOpportunity: object,
   *   membershipPosition: number,
   * }>} */
  const contexts = [];

  for (const membership of programMembershipsForShort(shortsIndex, id)) {
    const programId = asText(membership?.shortsProgramId);
    if (!programId) continue;
    const program = getShortsProgram(shortsIndex, programId);
    if (!program) continue;
    const programFilmKey = asText(program.showtimeFilmKey);
    if (!programFilmKey) continue;
    const nextOpportunity = selectNextScreeningForFilm(
      homeData,
      programFilmKey,
      now,
    );
    if (!nextOpportunity) continue;
    contexts.push({
      programId,
      program,
      programFilmKey,
      nextOpportunity,
      membershipPosition: Number(membership?.position) || 0,
    });
  }

  if (contexts.length === 0) return null;

  contexts.sort((a, b) => {
    const aStart = String(a.nextOpportunity.sortableLocalDateTime ?? '');
    const bStart = String(b.nextOpportunity.sortableLocalDateTime ?? '');
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    if (a.membershipPosition !== b.membershipPosition) {
      return a.membershipPosition - b.membershipPosition;
    }
    return a.programId.localeCompare(b.programId);
  });

  const best = contexts[0];
  const title =
    programDisplayTitle(best.program.title) ||
    asText(best.program.title) ||
    'Shorts program';

  return {
    shortId: id,
    short,
    primaryProgramId: best.programId,
    primaryProgram: best.program,
    primaryProgramTitle: title,
    programFilmKey: best.programFilmKey,
    nextOpportunity: best.nextOpportunity,
    membershipPosition: best.membershipPosition,
  };
}

/**
 * Eligible Shorts for Home / See all: must belong to a ShortsProgram that has
 * at least one future screening in current schedule data.
 *
 * @param {{
 *   shortsIndex: object | null,
 *   homeData: object | null,
 *   now?: Date | (() => Date) | string | number,
 * }} args
 */
export function listEligibleHomeShortContexts({
  shortsIndex,
  homeData,
  now = new Date(),
}) {
  if (!shortsIndex || !homeData) return [];

  /** @type {ReturnType<typeof resolveNearestFutureProgramContext>[]} */
  const rows = [];
  for (const shortId of shortsIndex.shortById.keys()) {
    const context = resolveNearestFutureProgramContext({
      shortId,
      shortsIndex,
      homeData,
      now,
    });
    if (context) rows.push(context);
  }

  // Stable pre-diversify order: nearest program screening, then membership, then id.
  rows.sort((a, b) => {
    const aStart = String(a.nextOpportunity.sortableLocalDateTime ?? '');
    const bStart = String(b.nextOpportunity.sortableLocalDateTime ?? '');
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    if (a.primaryProgramId !== b.primaryProgramId) {
      return a.primaryProgramId.localeCompare(b.primaryProgramId);
    }
    if (a.membershipPosition !== b.membershipPosition) {
      return a.membershipPosition - b.membershipPosition;
    }
    return a.shortId.localeCompare(b.shortId);
  });

  return rows;
}

/**
 * Round-robin diversification: first pass at most one Short per ShortsProgram,
 * then additional Shorts while preserving membership order within a program.
 *
 * Program pass order follows nearest upcoming program screening.
 *
 * @param {ReturnType<typeof listEligibleHomeShortContexts>} contexts
 */
export function diversifyShortsAcrossPrograms(contexts) {
  const list = Array.isArray(contexts) ? contexts : [];
  if (list.length === 0) return [];

  /** @type {Map<string, typeof list>} */
  const queues = new Map();
  /** @type {Map<string, string>} */
  const programNextStart = new Map();

  for (const row of list) {
    const programId = row.primaryProgramId;
    if (!queues.has(programId)) {
      queues.set(programId, []);
      programNextStart.set(
        programId,
        String(row.nextOpportunity.sortableLocalDateTime ?? ''),
      );
    }
    queues.get(programId).push(row);
  }

  for (const [, queue] of queues) {
    queue.sort(
      (a, b) =>
        a.membershipPosition - b.membershipPosition ||
        a.shortId.localeCompare(b.shortId),
    );
  }

  const programOrder = [...queues.keys()].sort((a, b) => {
    const aStart = programNextStart.get(a) ?? '';
    const bStart = programNextStart.get(b) ?? '';
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    return a.localeCompare(b);
  });

  /** @type {typeof list} */
  const ranked = [];
  let remaining = list.length;
  while (remaining > 0) {
    let progressed = false;
    for (const programId of programOrder) {
      const queue = queues.get(programId);
      if (!queue || queue.length === 0) continue;
      ranked.push(queue.shift());
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return ranked;
}

/**
 * @param {ReturnType<typeof resolveNearestFutureProgramContext>} context
 * @param {object | null} [enrichmentIndex]
 * @param {object | null} [homeData]
 */
export function presentHomeShortShelfCard(
  context,
  enrichmentIndex = null,
  homeData = null,
) {
  if (!context) return null;
  const short = context.short;
  const title = shortDisplayTitle(short.title) || 'Untitled short';
  const filmId = asText(short.canonicalFilmId);
  const fallbackPoster = shortFallbackPoster(short);
  const resolved = resolveCanonicalFilmPresentation({
    filmKey: null,
    filmId,
    homeData,
    enrichmentIndex,
    fallbackRecord: {
      title,
      filmId,
      posterUrl: fallbackPoster,
      runtimeMin: short.runtimeMin ?? null,
      synopsis: asText(short.description),
    },
    context: 'home',
  });
  const enriched = resolved.enriched;
  const opportunity = context.nextOpportunity;
  const dateBadge = formatShortOpeningDate(opportunity?.localDate);
  const directorLine = formatShortDirectorLine(short.directors);
  const runtimeLabel = formatRuntimeLabel(
    enriched.runtimeMin ?? short.runtimeMin,
  );
  const year =
    enriched.canonicalYear != null
      ? String(enriched.canonicalYear)
      : short.year != null
        ? String(short.year)
        : null;
  const metaParts = [year, runtimeLabel, directorLine].filter(Boolean);

  return {
    id: context.shortId,
    filmKey: context.shortId,
    shortId: context.shortId,
    entityKind: SHORT_FILMS_ENTITY_KIND,
    filmId: enriched.filmId ?? filmId,
    title: enriched.displayTitle ?? title,
    badge: dateBadge,
    genre: null,
    metaLabel: metaParts.length > 0 ? metaParts.join(' · ') : null,
    posterUrl: enriched.posterUrl ?? fallbackPoster,
    runtimeMin: enriched.runtimeMin ?? short.runtimeMin ?? null,
    year: enriched.canonicalYear ?? short.year ?? null,
    directors: Array.isArray(short.directors) ? short.directors : [],
    synopsis: enriched.synopsisPreview ?? asText(short.description),
    nextOpportunityKey: opportunity?.opportunityKey ?? null,
    programFilmKey: context.programFilmKey,
    primaryShortsProgramId: context.primaryProgramId,
    primaryProgramTitle: context.primaryProgramTitle,
    membershipPosition: context.membershipPosition,
    surfaceReason: 'short-films',
    surfaceReasonLabel: `Screens as part of ${context.primaryProgramTitle}`,
    source: 'shorts-programs-current',
    hasEnrichment: Boolean(enriched.hasEnrichment),
    hasUpcomingShowtimes: true,
  };
}

/**
 * Ranked eligible Short cards (full set — See all / Home preview slice).
 *
 * @param {object | null} homeData
 * @param {object | null} shortsIndex
 * @param {object | null} [enrichmentIndex]
 * @param {{ now?: Date | (() => Date) | string | number, maxCards?: number | null }} [options]
 */
export function rankEligibleHomeShortFilms(
  homeData,
  shortsIndex,
  enrichmentIndex = null,
  options = {},
) {
  const diversified = diversifyShortsAcrossPrograms(
    listEligibleHomeShortContexts({
      shortsIndex,
      homeData,
      now: options.now ?? new Date(),
    }),
  );
  const cards = diversified
    .map((context) =>
      presentHomeShortShelfCard(context, enrichmentIndex, homeData),
    )
    .filter(Boolean);
  if (options.maxCards == null) return cards;
  return cards.slice(0, options.maxCards);
}

/**
 * Home shelf builder — omit empty shelf at the destination level.
 *
 * @param {object | null} homeData
 * @param {object | null} shortsIndex
 * @param {object | null} [enrichmentIndex]
 * @param {{ now?: Date | (() => Date) | string | number }} [options]
 */
export function buildShortFilmsShelf(
  homeData,
  shortsIndex,
  enrichmentIndex = null,
  options = {},
) {
  if (!homeData) {
    return {
      status: 'unavailable',
      reason: 'Home data not loaded.',
      emptyTitle: 'Short Films isn’t ready',
      emptyBody: 'Check back once showtimes finish loading.',
      semantics: 'short-films-unavailable',
      films: [],
    };
  }
  if (!shortsIndex) {
    return {
      status: 'unavailable',
      reason: 'Shorts aren’t available right now.',
      emptyTitle: 'Short Films isn’t available right now.',
      emptyBody: 'Check back later for short films screening in Seattle.',
      semantics: 'short-films-unavailable',
      films: [],
    };
  }

  const films = rankEligibleHomeShortFilms(
    homeData,
    shortsIndex,
    enrichmentIndex,
    {
      now: options.now,
      maxCards: HOME_SHORT_FILMS_MAX_CARDS,
    },
  );

  if (films.length === 0) {
    return {
      status: 'unavailable',
      reason: 'No upcoming short films right now.',
      emptyTitle: 'No short films right now',
      emptyBody: 'No short films have upcoming program screenings.',
      semantics: 'short-films-empty',
      films: [],
    };
  }

  return {
    status: 'ready',
    reason: null,
    semantics: 'short-films-eligible',
    films,
  };
}

/**
 * Inline expanded-detail adapter for a Short shelf card.
 * Program screening context is labeled as program exhibition, not Short ownership.
 *
 * @param {object | null} homeData
 * @param {object} shelfFilm
 * @param {object | null} [enrichmentIndex]
 */
export function buildShortInlineQuickDetail(
  homeData,
  shelfFilm,
  enrichmentIndex = null,
) {
  if (!shelfFilm?.shortId && shelfFilm?.entityKind !== SHORT_FILMS_ENTITY_KIND) {
    return null;
  }
  const shortId = asText(shelfFilm.shortId) || asText(shelfFilm.filmKey);
  if (!shortId) return null;

  const filmId = asText(shelfFilm.filmId);
  const resolved = resolveCanonicalFilmPresentation({
    filmKey: null,
    filmId,
    homeData,
    enrichmentIndex,
    fallbackRecord: shelfFilm,
    context: 'home',
  });
  const enriched = resolved.enriched;
  const opportunity =
    (shelfFilm.nextOpportunityKey &&
      (Array.isArray(homeData?.opportunities) ? homeData.opportunities : []).find(
        (opp) => opp.opportunityKey === shelfFilm.nextOpportunityKey,
      )) ||
    (shelfFilm.programFilmKey
      ? selectNextScreeningForFilm(homeData, shelfFilm.programFilmKey)
      : null);

  const programTitle =
    asText(shelfFilm.primaryProgramTitle) || 'a shorts program';
  const dateLabel = formatLocalShowingDate(opportunity);
  const timePart = opportunity?.timeDisplay ?? null;
  const showingParts = [
    programTitle,
    opportunity?.theaterName,
    [dateLabel, timePart].filter(Boolean).join(' '),
  ].filter(Boolean);

  const directorLine = formatShortDirectorLine(shelfFilm.directors);
  const metaParts = [
    formatRuntimeLabel(enriched.runtimeMin ?? shelfFilm.runtimeMin),
    enriched.canonicalYear != null
      ? String(enriched.canonicalYear)
      : shelfFilm.year != null
        ? String(shelfFilm.year)
        : null,
    directorLine,
  ].filter(Boolean);

  return {
    filmKey: shortId,
    shortId,
    entityKind: SHORT_FILMS_ENTITY_KIND,
    filmId: enriched.filmId ?? filmId,
    title: enriched.displayTitle ?? shelfFilm.title,
    posterUrl: enriched.posterUrl ?? shelfFilm.posterUrl ?? null,
    synopsis:
      enriched.synopsisPreview ??
      asText(shelfFilm.synopsis) ??
      asText(shelfFilm.description),
    rating: null,
    year: enriched.canonicalYear ?? shelfFilm.year ?? null,
    genre: null,
    metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
    opportunityKey: opportunity?.opportunityKey ?? null,
    showingLine: showingParts.length > 0 ? showingParts.join(' · ') : null,
    ticketUrl: opportunity?.ticketUrl ?? null,
    surfaceReasonLabel:
      shelfFilm.surfaceReasonLabel ?? `Screens as part of ${programTitle}`,
    alsoPlayingLabel: null,
    hasEnrichment: Boolean(enriched.hasEnrichment),
    primaryShortsProgramId: shelfFilm.primaryShortsProgramId ?? null,
    hideFilmActions: true,
  };
}

/**
 * @param {object | null | undefined} opportunity
 */
function formatLocalShowingDate(opportunity) {
  return (
    formatShelfDetailMonthDay(opportunity?.localDate) ||
    formatShortOpeningDate(opportunity?.localDate)
  );
}

/**
 * See-all presentation for Short Films.
 *
 * @param {object | null} homeData
 * @param {object | null} shortsIndex
 * @param {object | null} [enrichmentIndex]
 * @param {{ now?: Date | (() => Date) | string | number }} [options]
 */
export function buildLiveShortFilmsPresentation(
  homeData,
  shortsIndex,
  enrichmentIndex = null,
  options = {},
) {
  if (!homeData) {
    return {
      source: 'live-unavailable',
      pageTitle: 'Short Films',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Short Films isn’t ready',
      unavailableBody: 'Check back once showtimes finish loading.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }
  if (!shortsIndex) {
    return {
      source: 'live-unavailable',
      pageTitle: 'Short Films',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Short Films isn’t available right now.',
      unavailableBody: 'Check back later for short films screening in Seattle.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const films = rankEligibleHomeShortFilms(
    homeData,
    shortsIndex,
    enrichmentIndex,
    { now: options.now, maxCards: null },
  ).map((card) => {
    const opportunity =
      (card.nextOpportunityKey &&
        (Array.isArray(homeData.opportunities)
          ? homeData.opportunities
          : []
        ).find((opp) => opp.opportunityKey === card.nextOpportunityKey)) ||
      (card.programFilmKey
        ? selectNextScreeningForFilm(homeData, card.programFilmKey, options.now)
        : null);
    const dateLabel = formatLocalShowingDate(opportunity);
    return {
      ...card,
      metaLine: card.metaLabel,
      dateLabel: dateLabel ? `Screens ${dateLabel}` : null,
      timeLabel: opportunity?.timeDisplay ?? null,
      theaterName: opportunity?.theaterName ?? null,
      theaterId: opportunity?.theaterId ?? null,
      formatLabel: null,
      availabilityLabel: card.surfaceReasonLabel,
      whySeeIt: null,
      alsoPlaying: null,
      opportunityKey: card.nextOpportunityKey,
      hasUpcomingShowtimes: true,
      noCurrentShowtimes: false,
    };
  });

  if (films.length === 0) {
    return {
      source: 'live-empty',
      pageTitle: 'Short Films',
      pageSubtitle: null,
      countLabel: null,
      emptyTitle: 'No short films right now',
      emptyBody: 'No short films have upcoming program screenings.',
      sortLabel: 'Sort',
      filtersLabel: 'Filters',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  return {
    source: 'live-short-films',
    pageTitle: 'Short Films',
    pageSubtitle: null,
    countLabel: `${films.length} short${films.length === 1 ? '' : 's'}`,
    sortLabel: 'Sort',
    filtersLabel: 'Filters',
    films,
    sections: [{ id: 'short-films', label: 'Short Films', films }],
    categoryChips: [],
    showCategoryChips: false,
    totalCount: films.length,
  };
}

/**
 * @param {object | null | undefined} film
 */
export function isShortShelfFilm(film) {
  return (
    film?.entityKind === SHORT_FILMS_ENTITY_KIND ||
    (typeof film?.shortId === 'string' && film.shortId.trim().length > 0)
  );
}
