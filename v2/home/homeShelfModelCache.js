/**
 * Last Home shelf model, kept above the Home remount.
 *
 * Invalidates when any of these change:
 * - homeData, enrichmentIndex, or shortsIndex reference
 * - visibility revision or hide-seen / hide-not-interested flags
 * - the Pacific minute (`YYYY-MM-DDTHH:MM`), so time-sensitive shelves recompute
 *
 * One entry only. A different key replaces it.
 */

let shelfCache = null;

/**
 * @param {{
 *   homeData: object | null,
 *   enrichmentIndex: object | null,
 *   shortsIndex: object | null,
 *   revision: number,
 *   hideNotInterested: boolean,
 *   hideSeen: boolean,
 *   nowMinute: string,
 * }} key
 * @param {() => object} build
 */
export function readHomeShelfModels(key, build) {
  if (
    shelfCache &&
    shelfCache.homeData === key.homeData &&
    shelfCache.enrichmentIndex === key.enrichmentIndex &&
    shelfCache.shortsIndex === key.shortsIndex &&
    shelfCache.revision === key.revision &&
    shelfCache.hideNotInterested === key.hideNotInterested &&
    shelfCache.hideSeen === key.hideSeen &&
    shelfCache.nowMinute === key.nowMinute
  ) {
    return shelfCache.models;
  }
  const models = build();
  shelfCache = { ...key, models };
  return models;
}
