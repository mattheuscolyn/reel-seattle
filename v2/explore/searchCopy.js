/**
 * Production Search copy contract (T-SEARCH-01).
 *
 * Supported today: movies (title / sourceTitle / parentDisplayTitle),
 * theaters (name / neighborhood / city), and format labels from showtimes.
 * Person, cast, director, collections, and enrichment search are deferred.
 */

/** Canonical search-field placeholder and accessible name. */
export const SEARCH_PLACEHOLDER = 'Search movies, theaters, and formats';

/** Short capability line under the result summary. */
export const SEARCH_CAPABILITY_NOTE =
  'Search matches movie titles, theaters, and formats — including films not yet playing in Seattle.';

/** Empty normalized query — no misleading “all results” claim. */
export const SEARCH_EMPTY_QUERY_SUMMARY =
  'Enter a movie, theater, or format keyword to search.';

/** Body under a zero-result summary. */
export const SEARCH_EMPTY_BODY =
  'Try another movie, theater, or format.';

/** Secondary section for TMDB-only film matches. */
export const SEARCH_MORE_FILMS_TITLE = 'More films';

/** Availability copy for films without Seattle showtimes. */
export const SEARCH_NO_SEATTLE_SHOWTIMES = 'No Seattle showtimes yet';

/** Explore landing honesty note (dev details). */
export const SEARCH_EXPLORE_HONESTY_NOTE =
  'Search matches movie titles, theaters, and formats — not people, cast, or directors.';

/**
 * @param {string} query — already-normalized display query
 * @param {number} totalCount — visible supported results only
 */
export function formatSearchSummary(query, totalCount) {
  const q = typeof query === 'string' ? query : '';
  if (!q) return SEARCH_EMPTY_QUERY_SUMMARY;
  if (totalCount === 0) return `No results for ‘${q}’`;
  if (totalCount === 1) return `1 result for ‘${q}’`;
  return `${totalCount} results for ‘${q}’`;
}

/**
 * Assert production UI strings do not promise unsupported person search.
 * @param {string} text
 */
export function productionSearchCopyPromisesPeople(text) {
  const lower = String(text ?? '').toLowerCase();
  // Match “person/people/cast/actor(s)/director(s)” as search targets, not
  // incidental words like “personalization” in unrelated docs.
  return (
    /\bpeople\b/.test(lower) ||
    /\bperson\b/.test(lower) ||
    /\bcast\b/.test(lower) ||
    /\bactors?\b/.test(lower) ||
    /\bdirectors?\b/.test(lower)
  );
}
