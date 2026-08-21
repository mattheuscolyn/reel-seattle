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
 * Queue tab for a composed identity.
 * Manual review decisions win. Otherwise a live `tmdb:<id>` film_id is
 * Review Matched — including automatic pipeline matches with no admin row.
 * @param {{
 *   review?: { decision?: string | null } | null,
 *   canonicalFilmId?: string | null,
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
  return REVIEW_TABS.unmatched;
}
