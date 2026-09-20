/**
 * Recommended Experience presentation contract + temporary selection adapter.
 *
 * TEMPORARY SELECTION (replace with recommendation engine later):
 * 1. Reuse existing `selectBestOpportunity` (premium-then-earliest / entry emphasis).
 * 2. If that seed has a premium presentation format (Dolby / IMAX / 70mm / 35mm / XL),
 *    recommend that FORMAT and expand to all matching actionable performances.
 * 3. Else if the seed theater looks like a specialty venue (SIFF / Beacon / Grand Illusion /
 *    NWFF / etc.), recommend that VENUE and expand to matching theater performances.
 * 4. Otherwise return null — do not manufacture a generic Digital/AMC recommendation.
 *
 * UI must not invent ranking; later engines populate the same contract shape.
 */

import {
  listFilmOpportunities,
  selectBestOpportunity,
} from '../filmDetail/filmDetailModel.js';
import {
  CANONICAL_BROWSE_LABEL,
  classifyFormatLabel,
  opportunityMatchesCanonical,
} from '../formatsExperiences/formatNormalize.js';
import {
  compareScreeningsByStart,
  isActionableScreening,
} from '../showtimes/canonicalScreening.js';

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
 * @property {'temporary_best_way_seed'} source documents temporary adapter
 * @property {string | null} seedOpportunityKey debug / replacement seam
 */

const PREMIUM_FORMAT_IDS = new Set([
  'dolby-cinema',
  'imax',
  'imax-70mm',
  '70mm',
  '35mm',
  'xl-amc',
]);

const FORMAT_REASONS = Object.freeze({
  'dolby-cinema': 'Best for sound and picture',
  imax: 'Largest premium screen',
  'imax-70mm': 'Largest premium film presentation',
  '70mm': 'Film print presentation',
  '35mm': 'Film print presentation',
  'xl-amc': 'Expanded premium screen',
});

const SPECIALTY_VENUE_PATTERN =
  /\b(siff|beacon|grand illusion|nwff|northwest film|cinema seattle|arkade)\b/i;

/**
 * @param {object | null | undefined} opportunity
 * @returns {string | null}
 */
export function resolvePremiumFormatId(opportunity) {
  if (!opportunity) return null;
  const labels = Array.isArray(opportunity.formatLabels)
    ? opportunity.formatLabels
    : [];
  const exhibitorHint =
    typeof opportunity.theaterName === 'string' ? opportunity.theaterName : null;
  /** Prefer more specific IMAX 70mm over IMAX when both present. */
  let found = null;
  for (const raw of labels) {
    const { formatId } = classifyFormatLabel(raw, { exhibitorHint });
    if (!formatId || !PREMIUM_FORMAT_IDS.has(formatId)) continue;
    if (formatId === 'imax-70mm') return 'imax-70mm';
    if (!found) found = formatId;
  }
  return found;
}

/**
 * @param {string | null | undefined} theaterName
 */
export function isSpecialtyVenueName(theaterName) {
  return typeof theaterName === 'string' && SPECIALTY_VENUE_PATTERN.test(theaterName);
}

/**
 * @param {object[]} opportunities
 * @returns {string | null}
 */
export function describeAvailabilityPattern(opportunities) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return null;
  let morning = 0;
  let afternoon = 0;
  let evening = 0;
  let weekend = 0;
  let weekday = 0;
  for (const opp of opportunities) {
    const time =
      typeof opp.localTime === 'string'
        ? opp.localTime
        : typeof opp.sortableLocalDateTime === 'string'
          ? opp.sortableLocalDateTime.slice(11, 16)
          : null;
    const hour = time ? Number(time.slice(0, 2)) : NaN;
    if (Number.isFinite(hour)) {
      if (hour < 12) morning += 1;
      else if (hour < 17) afternoon += 1;
      else evening += 1;
    }
    const date =
      typeof opp.localDate === 'string'
        ? opp.localDate
        : typeof opp.sortableLocalDateTime === 'string'
          ? opp.sortableLocalDateTime.slice(0, 10)
          : null;
    if (date) {
      const day = new Date(`${date}T12:00:00`).getUTCDay();
      if (day === 0 || day === 6) weekend += 1;
      else weekday += 1;
    }
  }
  const timed = morning + afternoon + evening;
  if (timed === 0 && weekend + weekday === 0) return null;

  if (weekend + weekday >= 3 && weekday === 0 && weekend > 0) {
    return 'Weekends only';
  }

  if (timed === 0) return null;
  const eveShare = evening / timed;
  const aftShare = afternoon / timed;
  const mornShare = morning / timed;
  if (eveShare >= 0.6) return 'Mostly evenings';
  if (aftShare + eveShare >= 0.75 && mornShare < 0.2) {
    return 'Mostly afternoons + evenings';
  }
  if (mornShare >= 0.6) return 'Mostly mornings';
  if (aftShare >= 0.6) return 'Mostly afternoons';
  return null;
}

/**
 * @param {object[]} opportunities
 */
function summarizeMatching(opportunities) {
  const keys = [];
  const theaters = new Set();
  let firstShowDate = null;
  for (const opp of opportunities) {
    if (typeof opp.opportunityKey === 'string' && opp.opportunityKey) {
      keys.push(opp.opportunityKey);
    }
    const tid = opp.theaterId ?? opp.theaterName;
    if (tid) theaters.add(String(tid));
    const date =
      typeof opp.localDate === 'string'
        ? opp.localDate
        : typeof opp.sortableLocalDateTime === 'string'
          ? opp.sortableLocalDateTime.slice(0, 10)
          : null;
    if (date && (!firstShowDate || date < firstShowDate)) firstShowDate = date;
  }
  return {
    matchingPerformanceKeys: keys,
    venueCount: theaters.size,
    showtimeCount: keys.length,
    firstShowDate,
  };
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

  const seed = selectBestOpportunity(
    homeData,
    filmKey,
    params.opportunityKey ?? null,
    { now: params.now },
  );
  if (!seed) return null;

  const now = typeof params.now === 'function' ? params.now() : (params.now ?? new Date());
  const actionable = listFilmOpportunities(homeData, filmKey).filter((row) =>
    isActionableScreening(row, now),
  );

  const formatId = resolvePremiumFormatId(seed);
  /** @type {RecommendedExperiencePresentation | null} */
  let experience = null;

  if (formatId) {
    const matching = actionable
      .filter((opp) => opportunityMatchesCanonical(opp, formatId))
      .sort(compareScreeningsByStart);
    if (matching.length === 0) return null;
    const summary = summarizeMatching(matching);
    experience = {
      type: 'format',
      id: formatId,
      label: CANONICAL_BROWSE_LABEL[formatId] ?? formatId,
      reason: FORMAT_REASONS[formatId] ?? null,
      ...summary,
      bookedThroughLabel: null,
      availabilityPattern: describeAvailabilityPattern(matching),
      departureTimingLabel: null,
      urgencyConfidence: null,
      source: 'temporary_best_way_seed',
      seedOpportunityKey: seed.opportunityKey ?? null,
    };
  } else if (isSpecialtyVenueName(seed.theaterName) && seed.theaterId) {
    const matching = actionable
      .filter((opp) => opp.theaterId === seed.theaterId)
      .sort(compareScreeningsByStart);
    if (matching.length === 0) return null;
    const summary = summarizeMatching(matching);
    experience = {
      type: 'venue',
      id: String(seed.theaterId),
      label: seed.theaterName ?? 'Theater',
      reason: 'Focused venue selection',
      ...summary,
      bookedThroughLabel: null,
      availabilityPattern: describeAvailabilityPattern(matching),
      departureTimingLabel: null,
      urgencyConfidence: null,
      source: 'temporary_best_way_seed',
      seedOpportunityKey: seed.opportunityKey ?? null,
    };
  } else {
    return null;
  }

  const departure = params.departureTiming;
  if (departure && typeof departure === 'object') {
    if (typeof departure.secondaryLabel === 'string' && departure.secondaryLabel.trim()) {
      experience.bookedThroughLabel = departure.secondaryLabel.trim();
    }
    if (typeof departure.primaryLabel === 'string' && departure.primaryLabel.trim()) {
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
  const type = params.type === 'venue' ? 'venue' : params.type === 'format' ? 'format' : null;
  const id = typeof params.id === 'string' ? params.id.trim() : '';
  if (!homeData || !filmKey || !type || !id) return [];

  const now = typeof params.now === 'function' ? params.now() : (params.now ?? new Date());
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
