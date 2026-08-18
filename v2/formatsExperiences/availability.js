/**
 * Current Seattle availability for formats / experiences.
 *
 * Definition (used everywhere in this feature):
 * Count distinct theaters that have at least one eligible showtime matching
 * the canonical format/experience within the active showtimes browse window
 * (default: this week from “now”).
 *
 * Capability-only theater registry metadata is NOT counted.
 */

import { listEligibleBrowseOpportunities } from '../showtimes/showtimeEligibility.js';
import { opportunityMatchesCanonical } from './formatNormalize.js';

/**
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date), dateMode?: 'today' | 'tomorrow' | 'week' }} [opts]
 * @returns {object[]}
 */
export function listAvailabilityOpportunities(homeData, opts = {}) {
  const dateMode = opts.dateMode ?? 'week';
  return listEligibleBrowseOpportunities(homeData, dateMode, opts.now);
}

/**
 * @param {object[]} opportunities
 * @param {string} canonicalId
 * @returns {{ theaterCount: number, showtimeCount: number, theaterIds: string[] }}
 */
export function countAvailabilityForCanonical(opportunities, canonicalId) {
  const theaterIds = new Set();
  let showtimeCount = 0;
  for (const opp of opportunities) {
    if (!opportunityMatchesCanonical(opp, canonicalId)) continue;
    showtimeCount += 1;
    if (typeof opp.theaterId === 'string' && opp.theaterId) {
      theaterIds.add(opp.theaterId);
    }
  }
  const ids = [...theaterIds].sort();
  return {
    theaterCount: ids.length,
    showtimeCount,
    theaterIds: ids,
  };
}

/**
 * @param {number} count
 * @returns {string}
 */
export function formatTheaterAvailabilityLabel(count) {
  if (!Number.isFinite(count) || count <= 0) {
    return 'No current showtimes';
  }
  return count === 1
    ? '1 theater in Seattle'
    : `${count} theaters in Seattle`;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function formatAvailableAtLabel(count) {
  if (!Number.isFinite(count) || count <= 0) {
    return 'No current Seattle showtimes';
  }
  return count === 1
    ? 'Available at 1 theater'
    : `Available at ${count} theaters`;
}

/**
 * @param {object | null | undefined} homeData
 * @param {string} canonicalId
 * @param {{ now?: Date | (() => Date), dateMode?: 'today' | 'tomorrow' | 'week' }} [opts]
 */
export function resolveCanonicalAvailability(homeData, canonicalId, opts = {}) {
  const opportunities = listAvailabilityOpportunities(homeData, opts);
  const counts = countAvailabilityForCanonical(opportunities, canonicalId);
  return {
    ...counts,
    availabilityLabel: formatTheaterAvailabilityLabel(counts.theaterCount),
    availableAtLabel: formatAvailableAtLabel(counts.theaterCount),
    hasCurrentShowtimes: counts.theaterCount > 0,
  };
}

/**
 * Map of canonicalId → availability summary for many ids.
 * @param {object | null | undefined} homeData
 * @param {readonly string[]} canonicalIds
 * @param {{ now?: Date | (() => Date), dateMode?: 'today' | 'tomorrow' | 'week' }} [opts]
 */
export function resolveAvailabilityMap(homeData, canonicalIds, opts = {}) {
  const opportunities = listAvailabilityOpportunities(homeData, opts);
  /** @type {Record<string, ReturnType<typeof resolveCanonicalAvailability>>} */
  const map = {};
  for (const id of canonicalIds) {
    const counts = countAvailabilityForCanonical(opportunities, id);
    map[id] = {
      ...counts,
      availabilityLabel: formatTheaterAvailabilityLabel(counts.theaterCount),
      availableAtLabel: formatAvailableAtLabel(counts.theaterCount),
      hasCurrentShowtimes: counts.theaterCount > 0,
    };
  }
  return map;
}
