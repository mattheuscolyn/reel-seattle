/**
 * Recommended Experience presentation contract + resolver.
 *
 * Selection is owned by `recommendedExperienceEngine.js` (v1).
 * UI must not invent ranking; this module attaches presentation fields and
 * departure timing signals to the engine winner.
 */

import { listFilmOpportunities } from '../filmDetail/filmDetailModel.js';
import {
  classifyFormatLabel,
  opportunityMatchesCanonical,
} from '../formatsExperiences/formatNormalize.js';
import {
  compareScreeningsByStart,
  isActionableScreening,
} from '../showtimes/canonicalScreening.js';
import {
  ENGINE_SOURCE,
  describeEngineAvailabilityPattern,
  isSpecialtyVenue,
  listEngineFormatIdsOnOpportunity,
  selectRecommendedExperienceCandidate,
  summarizeCohort,
} from './recommendedExperienceEngine.js';

/** @typedef {'format' | 'venue'} RecommendedExperienceType */

/**
 * @typedef {object} RecommendedExperiencePresentation
 * @property {RecommendedExperienceType} type
 * @property {string} id
 * @property {string} label
 * @property {string | null} reason
 * @property {string[]} matchingPerformanceKeys
 * @property {number} venueCount
 * @property {number} showtimeCount
 * @property {string | null} firstShowDate
 * @property {string | null} bookedThroughLabel observed booking horizon
 * @property {string | null} availabilityPattern
 * @property {string | null} departureTimingLabel predicted leave copy
 * @property {'high' | 'moderate' | 'low' | null} urgencyConfidence
 * @property {'recommended_experience_engine_v1'} source
 * @property {string | null} seedOpportunityKey first matching performance key (debug)
 */

/**
 * Prefer most specific premium format id on an opportunity (IMAX 70mm > IMAX).
 * @param {object | null | undefined} opportunity
 * @returns {string | null}
 */
export function resolvePremiumFormatId(opportunity) {
  const ids = listEngineFormatIdsOnOpportunity(opportunity);
  if (ids.length === 0) return null;
  // Engine list already drops plain imax when imax-70mm present.
  return ids[0] ?? null;
}

/**
 * @param {string | null | undefined} theaterName
 * @param {string | null | undefined} [theaterId]
 * @param {object | null | undefined} [theaterMeta]
 */
export function isSpecialtyVenueName(theaterName, theaterId = null, theaterMeta = null) {
  return isSpecialtyVenue(theaterId, theaterName, theaterMeta);
}

/**
 * Observed availability pattern for a cohort of opportunities.
 * @param {object[]} opportunities
 * @returns {string | null}
 */
export function describeAvailabilityPattern(opportunities) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return null;
  const summary = summarizeCohort(opportunities);

  let weekend = 0;
  let weekday = 0;
  for (const opp of opportunities) {
    const date =
      typeof opp.localDate === 'string'
        ? opp.localDate
        : typeof opp.sortableLocalDateTime === 'string'
          ? opp.sortableLocalDateTime.slice(0, 10)
          : null;
    if (!date) continue;
    const day = new Date(`${date}T12:00:00`).getUTCDay();
    if (day === 0 || day === 6) weekend += 1;
    else weekday += 1;
  }
  if (weekend + weekday >= 3 && weekday === 0 && weekend > 0) {
    return 'Weekends only';
  }

  return describeEngineAvailabilityPattern(summary);
}

/**
 * @param {{
 *   homeData?: object | null,
 *   filmKey?: string | null,
 *   opportunityKey?: string | null,
 *   departureTiming?: {
 *     primaryLabel?: string | null,
 *     secondaryLabel?: string | null,
 *     confidence?: string | null,
 *   } | null,
 *   now?: Date | (() => Date),
 * }} params
 * @returns {RecommendedExperiencePresentation | null}
 */
export function resolveRecommendedExperience(params = {}) {
  const homeData = params.homeData ?? null;
  const filmKey = typeof params.filmKey === 'string' ? params.filmKey.trim() : '';
  if (!filmKey || !homeData) return null;

  const now =
    typeof params.now === 'function' ? params.now() : (params.now ?? new Date());
  const actionable = listFilmOpportunities(homeData, filmKey).filter((row) =>
    isActionableScreening(row, now),
  );
  if (actionable.length === 0) return null;

  const winner = selectRecommendedExperienceCandidate({
    opportunities: actionable,
    theatersById: homeData.theatersById ?? null,
    departureTiming: params.departureTiming ?? null,
  });
  if (!winner) return null;

  const matchedRows = actionable.filter((opp) => {
    if (winner.type === 'format') {
      return listEngineFormatIdsOnOpportunity(opp).includes(winner.id);
    }
    return String(opp.theaterId) === winner.id;
  });

  /** @type {RecommendedExperiencePresentation} */
  const experience = {
    type: winner.type,
    id: winner.id,
    label: winner.label,
    reason: winner.reason,
    matchingPerformanceKeys: winner.matchingPerformanceKeys,
    venueCount: winner.venueCount,
    showtimeCount: winner.showtimeCount,
    firstShowDate: winner.firstShowDate,
    bookedThroughLabel: null,
    availabilityPattern:
      describeAvailabilityPattern(matchedRows) ?? winner.availabilityPattern,
    departureTimingLabel: null,
    urgencyConfidence: null,
    source: ENGINE_SOURCE,
    seedOpportunityKey: winner.matchingPerformanceKeys[0] ?? null,
  };

  const departure = params.departureTiming;
  if (departure && typeof departure === 'object') {
    if (
      typeof departure.secondaryLabel === 'string' &&
      departure.secondaryLabel.trim()
    ) {
      experience.bookedThroughLabel = departure.secondaryLabel.trim();
    }
    if (
      typeof departure.primaryLabel === 'string' &&
      departure.primaryLabel.trim()
    ) {
      experience.departureTimingLabel = departure.primaryLabel.trim();
    }
    const conf = departure.confidence;
    if (conf === 'high' || conf === 'moderate' || conf === 'low') {
      experience.urgencyConfidence = conf;
    }
  }

  return experience;
}

/**
 * Re-resolve matching opportunities for a stored experience identity.
 * @param {{
 *   homeData?: object | null,
 *   filmKey?: string | null,
 *   type?: RecommendedExperienceType | null,
 *   id?: string | null,
 *   now?: Date | (() => Date),
 * }} params
 */
export function listMatchingOpportunitiesForExperience(params = {}) {
  const homeData = params.homeData ?? null;
  const filmKey = typeof params.filmKey === 'string' ? params.filmKey.trim() : '';
  const type =
    params.type === 'venue' ? 'venue' : params.type === 'format' ? 'format' : null;
  const id = typeof params.id === 'string' ? params.id.trim() : '';
  if (!homeData || !filmKey || !type || !id) return [];

  const now =
    typeof params.now === 'function' ? params.now() : (params.now ?? new Date());
  const actionable = listFilmOpportunities(homeData, filmKey).filter((row) =>
    isActionableScreening(row, now),
  );

  if (type === 'format') {
    return actionable
      .filter((opp) => opportunityMatchesCanonical(opp, id))
      .sort(compareScreeningsByStart);
  }
  return actionable
    .filter((opp) => String(opp.theaterId) === id)
    .sort(compareScreeningsByStart);
}

/**
 * Compact signal chips for Film Detail / destination headers.
 * Observed booking copy stays separate from predicted departure.
 * @param {RecommendedExperiencePresentation | null | undefined} experience
 * @returns {{ id: string, label: string, kind: 'observed' | 'predicted' | 'meta' }[]}
 */
export function buildRecommendedExperienceSignals(experience) {
  if (!experience) return [];
  /** @type {{ id: string, label: string, kind: 'observed' | 'predicted' | 'meta' }[]} */
  const signals = [];
  if (experience.venueCount > 0) {
    signals.push({
      id: 'venues',
      label:
        experience.venueCount === 1
          ? '1 venue'
          : `${experience.venueCount} venues`,
      kind: 'meta',
    });
  }
  if (experience.showtimeCount > 0) {
    signals.push({
      id: 'showtimes',
      label:
        experience.showtimeCount === 1
          ? '1 upcoming showtime'
          : `${experience.showtimeCount} upcoming showtimes`,
      kind: 'meta',
    });
  }
  if (experience.availabilityPattern) {
    signals.push({
      id: 'pattern',
      label: experience.availabilityPattern,
      kind: 'observed',
    });
  }
  if (experience.bookedThroughLabel) {
    signals.push({
      id: 'booked',
      label: experience.bookedThroughLabel,
      kind: 'observed',
    });
  }
  if (experience.departureTimingLabel) {
    signals.push({
      id: 'departure',
      label: experience.departureTimingLabel,
      kind: 'predicted',
    });
  }
  return signals.slice(0, 5);
}

// Re-export classify helper used by older tests / tooling.
export { classifyFormatLabel };
