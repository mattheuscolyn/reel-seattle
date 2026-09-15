/**
 * Build the TMDB Match Review queue from live Home data + admin reviews.
 * Does not invent catalog confidence fields the public artifact lacks.
 *
 * Production homeData exposes `films` as an array (see buildHomeData).
 * Older fixtures may pass `filmsByKey`; both are supported.
 */

import {
  REVIEW_DECISIONS,
  REVIEW_TABS,
  hasCanonicalTmdbFilmId,
  isDefinitiveNonMovieIdentity,
  tabForIdentity,
} from './reviewDecisions.js';
import { parseSourceIdentityKey, sourceIdentityKey } from './sourceIdentity.js';
import { filmsByKeyFromHomeData } from '../../showtimes/qualifyingShowtimes.js';

const MAX_SHOWTIMES = 8;

/**
 * Canonical public film_id is only `tmdb:<positive-int>`.
 * @param {unknown} value
 * @returns {string | null}
 */
export function asQueueCanonicalFilmId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^tmdb:[1-9][0-9]*$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @param {object | null | undefined} homeData
 * @returns {Map<string, object>}
 */
export function resolveFilmsByKeyForReviewQueue(homeData) {
  if (homeData?.filmsByKey instanceof Map) {
    return homeData.filmsByKey;
  }
  return filmsByKeyFromHomeData(homeData);
}

/**
 * @param {object | null | undefined} film
 * @returns {string | null}
 */
function contentClassificationFromFilm(film) {
  if (!film || typeof film !== 'object') return null;
  const value =
    film.content_classification ??
    film.contentClassification ??
    film.entity_kind ??
    film.entityKind ??
    null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {Map<string, object> | null | undefined} matcherByKey
 * @param {string} key
 * @returns {{ entityKind: string | null, matcherMatchStatus: string | null }}
 */
function matcherHintsForKey(matcherByKey, key) {
  const film = matcherByKey?.get?.(key);
  if (!film || typeof film !== 'object') {
    return { entityKind: null, matcherMatchStatus: null };
  }
  const entityKind =
    typeof film.entity_kind === 'string' && film.entity_kind.trim()
      ? film.entity_kind.trim()
      : null;
  const matcherMatchStatus =
    typeof film.match_status === 'string' && film.match_status.trim()
      ? film.match_status.trim()
      : null;
  return { entityKind, matcherMatchStatus };
}

/**
 * @param {object | null | undefined} homeData
 * @param {object[]} [reviews]
 * @param {{ getFilm?: (filmId: string) => object | null } | null} [enrichmentIndex]
 * @param {Map<string, object> | null} [matcherByKey]
 */
export function buildTmdbReviewQueue(
  homeData,
  reviews = [],
  enrichmentIndex = null,
  matcherByKey = null,
) {
  const reviewByKey = new Map();
  for (const review of reviews) {
    if (!review || typeof review !== 'object') continue;
    const key =
      typeof review.source_identity_key === 'string'
        ? review.source_identity_key
        : sourceIdentityKey(review);
    if (!key) continue;
    reviewByKey.set(key, review);
  }

  const theatersById =
    homeData?.theatersById && typeof homeData.theatersById === 'object'
      ? homeData.theatersById
      : {};
  const filmsByKey = resolveFilmsByKeyForReviewQueue(homeData);
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];

  /** @type {Map<string, object>} */
  const byKey = new Map();

  for (const opportunity of opportunities) {
    const key = sourceIdentityKey({
      source: opportunity?.source,
      sourceFilmId: opportunity?.sourceFilmId,
      showtimeFilmKey: opportunity?.filmKey,
    });
    if (!key) continue;
    const film = filmsByKey.get(opportunity.filmKey) ?? null;
    const matcherHints = matcherHintsForKey(matcherByKey, key);
    let row = byKey.get(key);
    if (!row) {
      row = {
        sourceIdentityKey: key,
        source: String(opportunity.source || '').trim() || 'unknown',
        sourceFilmId: opportunity.sourceFilmId ?? null,
        showtimeFilmKey: opportunity.filmKey ?? null,
        rawTitle:
          film?.sourceTitle ||
          opportunity.parentDisplayTitle ||
          film?.title ||
          opportunity.filmKey,
        displayTitle: film?.title || opportunity.parentDisplayTitle || key,
        normalizedTitle: film?.title || opportunity.parentDisplayTitle || key,
        runtimeMin: film?.runtimeMin ?? null,
        canonicalFilmId: asQueueCanonicalFilmId(film?.filmId),
        posterUrl: film?.posterUrl ?? null,
        sourceUrl: opportunity.sourceUrl ?? null,
        contentClassification: contentClassificationFromFilm(film),
        entityKind: matcherHints.entityKind,
        matcherMatchStatus: matcherHints.matcherMatchStatus,
        theaters: [],
        theaterIds: new Set(),
        showtimes: [],
        firstShowtimeAt: opportunity.sortableLocalDateTime ?? null,
        lastShowtimeAt: opportunity.sortableLocalDateTime ?? null,
      };
      byKey.set(key, row);
    } else {
      if (!row.contentClassification) {
        row.contentClassification = contentClassificationFromFilm(film);
      }
      if (!row.entityKind && matcherHints.entityKind) {
        row.entityKind = matcherHints.entityKind;
      }
      if (!row.matcherMatchStatus && matcherHints.matcherMatchStatus) {
        row.matcherMatchStatus = matcherHints.matcherMatchStatus;
      }
    }
    if (
      opportunity.theaterId &&
      !row.theaterIds.has(opportunity.theaterId)
    ) {
      row.theaterIds.add(opportunity.theaterId);
      const theater = theatersById[opportunity.theaterId];
      row.theaters.push(
        theater?.name || opportunity.theaterName || opportunity.theaterId,
      );
    }
    if (row.showtimes.length < MAX_SHOWTIMES) {
      row.showtimes.push({
        date: opportunity.localDate,
        time: opportunity.timeDisplay || opportunity.localTime,
        theaterName:
          theatersById[opportunity.theaterId]?.name ||
          opportunity.theaterName ||
          opportunity.theaterId,
        ticketUrl: opportunity.ticketUrl ?? null,
      });
    }
    if (
      opportunity.sortableLocalDateTime &&
      (!row.firstShowtimeAt ||
        opportunity.sortableLocalDateTime < row.firstShowtimeAt)
    ) {
      row.firstShowtimeAt = opportunity.sortableLocalDateTime;
    }
    if (
      opportunity.sortableLocalDateTime &&
      (!row.lastShowtimeAt ||
        opportunity.sortableLocalDateTime > row.lastShowtimeAt)
    ) {
      row.lastShowtimeAt = opportunity.sortableLocalDateTime;
    }
    if (!row.canonicalFilmId) {
      const nextId = asQueueCanonicalFilmId(film?.filmId);
      if (nextId) row.canonicalFilmId = nextId;
    }
    if (!row.sourceUrl && opportunity.sourceUrl) {
      row.sourceUrl = opportunity.sourceUrl;
    }
  }

  for (const [key, review] of reviewByKey) {
    if (byKey.has(key)) continue;
    const parsed = parseSourceIdentityKey(key);
    const snapshot =
      review.snapshot && typeof review.snapshot === 'object'
        ? review.snapshot
        : {};
    const snapshotTheaters = Array.isArray(snapshot.theaters)
      ? snapshot.theaters.filter(Boolean)
      : [];
    const matcherHints = matcherHintsForKey(matcherByKey, key);
    byKey.set(key, {
      sourceIdentityKey: key,
      source: String(review.source || parsed?.source || '').trim() || 'unknown',
      sourceFilmId: review.source_film_id ?? parsed?.sourceFilmId ?? null,
      showtimeFilmKey:
        review.showtime_film_key ?? parsed?.showtimeFilmKey ?? null,
      rawTitle: snapshot.raw_title || snapshot.display_title || key,
      displayTitle: snapshot.display_title || snapshot.raw_title || key,
      normalizedTitle:
        snapshot.normalized_title || snapshot.display_title || key,
      runtimeMin: snapshot.runtime_min ?? null,
      canonicalFilmId:
        asQueueCanonicalFilmId(snapshot.canonical_film_id) ||
        (typeof review.tmdb_id === 'number' && review.tmdb_id >= 1
          ? `tmdb:${review.tmdb_id}`
          : null),
      posterUrl: null,
      sourceUrl: snapshot.source_url ?? null,
      contentClassification:
        typeof snapshot.content_classification === 'string'
          ? snapshot.content_classification
          : null,
      entityKind: matcherHints.entityKind,
      matcherMatchStatus: matcherHints.matcherMatchStatus,
      theaters: snapshotTheaters,
      theaterIds: new Set(),
      showtimes: [],
      firstShowtimeAt: review.reviewed_at ?? null,
      lastShowtimeAt: review.reviewed_at ?? null,
    });
  }

  const identities = [...byKey.values()].map((row) => {
    const review = reviewByKey.get(row.sourceIdentityKey) ?? null;
    const enrichment =
      row.canonicalFilmId && enrichmentIndex?.getFilm
        ? enrichmentIndex.getFilm(row.canonicalFilmId)
        : null;
    const identity = {
      ...row,
      theaterIds: [...row.theaterIds],
      theaters: row.theaters,
      review,
      matchOrigin: review
        ? 'manual'
        : row.canonicalFilmId
          ? 'pipeline'
          : isDefinitiveNonMovieIdentity(row)
            ? 'pipeline'
            : 'none',
      enrichment: enrichment
        ? {
            title: enrichment.title ?? null,
            year: enrichment.releaseYear ?? enrichment.year ?? null,
            runtimeMin: enrichment.runtimeMinutes ?? enrichment.runtimeMin ?? null,
            overview: enrichment.overview ?? null,
            posterUrl: enrichment.poster?.url ?? enrichment.posterUrl ?? null,
          }
        : null,
    };
    identity.tab = tabForIdentity(identity);
    identity.statusLabel = statusLabelFor(identity);
    return identity;
  });

  identities.sort((a, b) => {
    const aTime = a.lastShowtimeAt || '';
    const bTime = b.lastShowtimeAt || '';
    if (aTime !== bTime) return aTime < bTime ? 1 : -1;
    return a.displayTitle.localeCompare(b.displayTitle);
  });

  const counts = {
    unmatched: 0,
    'review-matched': 0,
    flagged: 0,
    'needs-follow-up': 0,
  };
  for (const identity of identities) {
    counts[identity.tab] = (counts[identity.tab] || 0) + 1;
  }

  return { identities, counts };
}

function statusLabelFor(identity) {
  const decision = identity.review?.decision;
  if (decision === REVIEW_DECISIONS.matched) return 'Manual match';
  if (decision === REVIEW_DECISIONS.notFilm) return 'Not a film';
  if (decision === REVIEW_DECISIONS.multipleShorts) return 'Multiple shorts';
  if (decision === REVIEW_DECISIONS.needsFollowUp) return 'Needs follow-up';
  if (hasCanonicalTmdbFilmId(identity.canonicalFilmId)) return 'Matched';
  if (isDefinitiveNonMovieIdentity(identity)) {
    const kind =
      identity.contentClassification || identity.entityKind || 'program';
    if (kind === 'shorts_program') return 'Shorts program (auto)';
    if (kind === 'mystery_screening') return 'Mystery screening (auto)';
    if (kind === 'live_event' || kind === 'broadcast_event') {
      return 'Live/broadcast event (auto)';
    }
    return 'Program (auto)';
  }
  return 'Unmatched';
}

/**
 * @param {ReturnType<typeof buildTmdbReviewQueue>['identities']} identities
 * @param {{
 *   tab?: string,
 *   query?: string,
 *   source?: string,
 * }} [filters]
 */
export function filterReviewIdentities(identities, filters = {}) {
  const tab = filters.tab || REVIEW_TABS.unmatched;
  const query = String(filters.query || '')
    .trim()
    .toLowerCase();
  const source = String(filters.source || '')
    .trim()
    .toLowerCase();
  return identities.filter((identity) => {
    if (identity.tab !== tab) return false;
    if (source && identity.source !== source) return false;
    if (!query) return true;
    const haystack = [
      identity.displayTitle,
      identity.rawTitle,
      identity.sourceFilmId,
      identity.showtimeFilmKey,
      identity.sourceIdentityKey,
      ...(identity.theaters || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/**
 * @param {object[]} identities
 */
export function listReviewSources(identities) {
  return [...new Set(identities.map((row) => row.source).filter(Boolean))].sort();
}

/**
 * Advance to the next visible queue item after saving the current one.
 * @param {object[]} visible
 * @param {string | null} currentKey
 */
export function nextReviewKeyAfterSave(visible, currentKey) {
  const remaining = (visible || []).filter(
    (row) => row.sourceIdentityKey !== currentKey,
  );
  return remaining[0]?.sourceIdentityKey ?? null;
}
