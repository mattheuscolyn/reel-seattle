export const REVIEW_DECISIONS = Object.freeze({
  matched: 'matched',
  notFilm: 'not_film',
  multipleShorts: 'multiple_shorts',
  needsFollowUp: 'needs_follow_up',
});

export const REVIEW_TABS = Object.freeze({
  unmatched: 'unmatched',
  reviewMatched: 'review-matched',
  flagged: 'flagged',
  needsFollowUp: 'needs-follow-up',
});

export const REVIEW_DECISION_LABELS = Object.freeze({
  matched: 'Matched',
  confirmed_match: 'Matched',
  not_film: 'Not a film',
  multiple_shorts: 'Multiple shorts',
  needs_follow_up: 'Needs follow-up',
});

/** Pipeline entity kinds that are definitive non-movie/program identities. */
export const DEFINITIVE_NON_MOVIE_ENTITY_KINDS = Object.freeze(
  new Set([
    'shorts_program',
    'double_feature',
    'composite_event',
    'festival_program',
    'mystery_screening',
    'live_event',
    'broadcast_event',
    'unknown_program',
  ]),
);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeReviewDecision(value) {
  if (value === 'confirmed_match') return REVIEW_DECISIONS.matched;
  if (
    value === REVIEW_DECISIONS.matched ||
    value === REVIEW_DECISIONS.notFilm ||
    value === REVIEW_DECISIONS.multipleShorts ||
    value === REVIEW_DECISIONS.needsFollowUp
  ) {
    return value;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasCanonicalTmdbFilmId(value) {
  return (
    typeof value === 'string' && /^tmdb:[1-9][0-9]*$/.test(value.trim())
  );
}

/**
 * True when the matcher/public pipeline already classified this identity as a
 * definitive non-movie/program entity (no TMDB movie confirm required).
 * @param {{
 *   contentClassification?: string | null,
 *   entityKind?: string | null,
 *   matcherMatchStatus?: string | null,
 * } | null | undefined} identity
 */
export function isDefinitiveNonMovieIdentity(identity) {
  const kind = String(
    identity?.contentClassification || identity?.entityKind || '',
  )
    .trim()
    .toLowerCase();
  if (kind && DEFINITIVE_NON_MOVIE_ENTITY_KINDS.has(kind)) {
    return true;
  }
  const status = String(identity?.matcherMatchStatus || '')
    .trim()
    .toLowerCase();
  return status === 'non_film' || status === 'multiple_shorts';
}

/**
 * Queue tab for a composed identity.
 * Manual review decisions win. Otherwise a live `tmdb:<id>` film_id is
 * Review Matched — including automatic pipeline matches with no admin row.
 * Definitive pipeline non-movie/program classifications are Flagged, not
 * actionable Unmatched (null film_id alone is not enough to require review).
 * @param {{
 *   review?: { decision?: string | null } | null,
 *   canonicalFilmId?: string | null,
 *   contentClassification?: string | null,
 *   entityKind?: string | null,
 *   matcherMatchStatus?: string | null,
 * }} identity
 */
export function tabForIdentity(identity) {
  const decision = normalizeReviewDecision(identity?.review?.decision);
  if (decision === REVIEW_DECISIONS.needsFollowUp) {
    return REVIEW_TABS.needsFollowUp;
  }
  if (
    decision === REVIEW_DECISIONS.notFilm ||
    decision === REVIEW_DECISIONS.multipleShorts
  ) {
    return REVIEW_TABS.flagged;
  }
  if (
    decision === REVIEW_DECISIONS.matched ||
    hasCanonicalTmdbFilmId(identity?.canonicalFilmId)
  ) {
    return REVIEW_TABS.reviewMatched;
  }
  if (isDefinitiveNonMovieIdentity(identity)) {
    return REVIEW_TABS.flagged;
  }
  return REVIEW_TABS.unmatched;
}
