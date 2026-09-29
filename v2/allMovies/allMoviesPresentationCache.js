/**
 * Last All Movies presentation, kept above the surface remount.
 *
 * Invalidates when home data, enrichment, load status, query, availability,
 * sort, genres, time format, visibility revision/flags, or the Pacific minute
 * change. One entry only.
 */

let presentationCache = null;

/**
 * @param {{
 *   homeData: object | null,
 *   enrichmentIndex: object | null,
 *   loadStatus: string,
 *   query: string,
 *   availability: string,
 *   sort: string,
 *   genreKeySig: string,
 *   timeFormatId: string,
 *   revision: number,
 *   hideNotInterested: boolean,
 *   hideSeen: boolean,
 *   nowMinute: string,
 * }} key
 * @param {() => object} build
 */
export function readAllMoviesPresentation(key, build) {
  if (
    presentationCache &&
    presentationCache.homeData === key.homeData &&
    presentationCache.enrichmentIndex === key.enrichmentIndex &&
    presentationCache.loadStatus === key.loadStatus &&
    presentationCache.query === key.query &&
    presentationCache.availability === key.availability &&
    presentationCache.sort === key.sort &&
    presentationCache.genreKeySig === key.genreKeySig &&
    presentationCache.timeFormatId === key.timeFormatId &&
    presentationCache.revision === key.revision &&
    presentationCache.hideNotInterested === key.hideNotInterested &&
    presentationCache.hideSeen === key.hideSeen &&
    presentationCache.nowMinute === key.nowMinute
  ) {
    return presentationCache.presentation;
  }
  const presentation = build();
  presentationCache = { ...key, presentation };
  return presentation;
}
