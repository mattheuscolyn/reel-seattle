/**
 * Recommended Experience Engine v1 — deterministic cohort selection.
 *
 * Product goal: recommend the most worthwhile format/venue that is still
 * realistically available — not the rarest format alone, and not the earliest
 * premium screening.
 *
 * Scoring balances three axes (weights centralized in ENGINE_WEIGHTS):
 *   A. Experience value — how special / distinctive
 *   B. Availability — schedule breadth a typical user can fit
 *   C. Urgency — observed booking horizon / predicted leave pressure
 *
 * Candidates are EXPERIENCE cohorts (format or specialty venue), never generic
 * Digital / standard AMC venue recommendations.
 */

import {
  CANONICAL_BROWSE_LABEL,
  classifyFormatLabel,
} from '../formatsExperiences/formatNormalize.js';
import {
  RARE_EXPERIENCE_IDS,
  RARE_FORMAT_IDS,
  PREMIUM_FORMAT_IDS,
} from '../topOpportunities/opportunityFeatureVector.js';
import { compareScreeningsByStart } from '../showtimes/canonicalScreening.js';

export const ENGINE_SOURCE = 'recommended_experience_engine_v1';

/**
 * Centralized tunable weights. Keep magic numbers here — not scattered.
 */
export const ENGINE_WEIGHTS = Object.freeze({
  /**
   * Base experience value by format / rare experience id.
   * Rare film formats sit well above premium digital so volume of Dolby/IMAX
   * showtimes cannot erase a genuine 70mm/35mm engagement (audit 2026-09).
   */
  formatValue: Object.freeze({
    'imax-70mm': 100,
    '70mm': 94,
    '35mm': 90,
    'live-score': 86,
    imax: 64,
    'dolby-cinema': 58,
    'xl-amc': 46,
    'reald-3d': 34,
  }),
  /** Specialty venue with no overlapping rarer format on the same cohort. */
  venueSpecialtyValue: 56,
  /**
   * Availability contributions (capped). Caps are intentionally modest so
   * availability informs fit without dominating experience value.
   * Max ≈ showtime+venue+date+breadth ≈ 16+12+14+6 = 48.
   */
  showtimePointsPer: 1.8,
  showtimePointsCap: 16,
  venuePointsPer: 4,
  venuePointsCap: 12,
  datePointsPer: 3.5,
  datePointsCap: 14,
  timeBreadthBonus: 6,
  /**
   * Penalties — lighter for rare formats / specialty venues so a scarce
   * engagement can still recommend. Ordinary premium (Dolby/IMAX) is penalized
   * harder for single-show / morning-only schedules.
   */
  singleShowNonRarePenalty: -28,
  singleShowRarePenalty: -6,
  oneDayNonRarePenalty: -10,
  oneDayRarePenalty: -3,
  morningOnlyNonRarePenalty: -16,
  /**
   * Rare formats with at least two showtimes across 2+ dates get a small boost
   * recognizing that limited engagement is expected, not a defect.
   */
  rareEngagementBoost: 14,
  /** Urgency from departure timing confidence. */
  urgencyHigh: 18,
  urgencyModerate: 12,
  urgencyLow: 5,
  /**
   * Minimum total score to emit a recommendation (abstain below).
   * Tuned so a single specialty-venue screening still clears (~56−6+avail),
   * while ordinary RealD / thin XL without breadth does not.
   */
  minAcceptScore: 42,
});

const RARE_FORMAT_SET = new Set(RARE_FORMAT_IDS);
const RARE_EXPERIENCE_SET = new Set(RARE_EXPERIENCE_IDS);
const PREMIUM_FORMAT_SET = new Set(PREMIUM_FORMAT_IDS);

/** Formats/experiences the engine may recommend as FORMAT candidates. */
export const ENGINE_FORMAT_IDS = Object.freeze([
  ...RARE_FORMAT_IDS,
  ...PREMIUM_FORMAT_IDS,
  ...RARE_EXPERIENCE_IDS,
]);

const ENGINE_FORMAT_SET = new Set(ENGINE_FORMAT_IDS);

/**
 * Specialty venue theater ids (curated) + registry types indie/rep.
 * Chain multiplexes never become venue recommendations.
 */
export const SPECIALTY_VENUE_IDS = Object.freeze([
  'siff-cinema-downtown',
  'siff-cinema-uptown',
  'siff-egyptian',
  'siff-film-center',
  'the-beacon',
  'beacon',
  'northwest-film-forum',
  'nwff',
  'grand-illusion',
  'central-cinema',
]);

const SPECIALTY_VENUE_ID_SET = new Set(SPECIALTY_VENUE_IDS);

const SPECIALTY_VENUE_NAME_PATTERN =
  /\b(siff|beacon|grand illusion|nwff|northwest film|cinema seattle|central cinema|arkade)\b/i;

/**
 * @param {string | null | undefined} theaterId
 * @param {string | null | undefined} theaterName
 * @param {object | null | undefined} theaterMeta homeData.theatersById row
 */
export function isSpecialtyVenue(theaterId, theaterName, theaterMeta = null) {
  const id = typeof theaterId === 'string' ? theaterId.trim().toLowerCase() : '';
  if (id && SPECIALTY_VENUE_ID_SET.has(id)) return true;
  const type =
    typeof theaterMeta?.type === 'string' ? theaterMeta.type.trim().toLowerCase() : '';
  if (type === 'indie' || type === 'rep') return true;
  if (typeof theaterName === 'string' && SPECIALTY_VENUE_NAME_PATTERN.test(theaterName)) {
    return true;
  }
  return false;
}

/**
 * @param {object | null | undefined} opportunity
 * @returns {string[]}
 */
export function listEngineFormatIdsOnOpportunity(opportunity) {
  if (!opportunity) return [];
  const labels = Array.isArray(opportunity.formatLabels)
    ? opportunity.formatLabels
    : [];
  const exhibitorHint =
    typeof opportunity.theaterName === 'string' ? opportunity.theaterName : null;
  /** @type {string[]} */
  const ids = [];
  for (const raw of labels) {
    const { formatId, experienceId } = classifyFormatLabel(raw, { exhibitorHint });
    if (formatId && ENGINE_FORMAT_SET.has(formatId) && !ids.includes(formatId)) {
      ids.push(formatId);
    }
    if (
      experienceId &&
      ENGINE_FORMAT_SET.has(experienceId) &&
      !ids.includes(experienceId)
    ) {
      ids.push(experienceId);
    }
  }
  // Prefer more specific IMAX 70mm — drop plain imax if both present.
  if (ids.includes('imax-70mm') && ids.includes('imax')) {
    return ids.filter((id) => id !== 'imax');
  }
  return ids;
}

/**
 * @param {object[]} opportunities
 */
export function summarizeCohort(opportunities) {
  const keys = [];
  const theaters = new Set();
  const dates = new Set();
  let morning = 0;
  let afternoon = 0;
  let evening = 0;
  let firstShowDate = null;
  let firstSortable = null;

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
    if (date) {
      dates.add(date);
      if (!firstShowDate || date < firstShowDate) firstShowDate = date;
    }
    const sortable =
      typeof opp.sortableLocalDateTime === 'string'
        ? opp.sortableLocalDateTime
        : null;
    if (sortable && (!firstSortable || sortable < firstSortable)) {
      firstSortable = sortable;
    }
    const time =
      typeof opp.localTime === 'string'
        ? opp.localTime
        : sortable
          ? sortable.slice(11, 16)
          : null;
    const hour = time ? Number(time.slice(0, 2)) : NaN;
    if (Number.isFinite(hour)) {
      if (hour < 12) morning += 1;
      else if (hour < 17) afternoon += 1;
      else evening += 1;
    }
  }

  const uniqueDates = dates.size;
  let dateSpanDays = 0;
  if (uniqueDates >= 1) {
    const sorted = [...dates].sort();
    const first = Date.parse(`${sorted[0]}T12:00:00Z`);
    const last = Date.parse(`${sorted[sorted.length - 1]}T12:00:00Z`);
    if (Number.isFinite(first) && Number.isFinite(last)) {
      dateSpanDays = Math.max(0, Math.round((last - first) / 86400000));
    }
  }

  return {
    matchingPerformanceKeys: keys,
    venueCount: theaters.size,
    showtimeCount: opportunities.length,
    uniqueDates,
    dateSpanDays,
    firstShowDate,
    firstSortable,
    morning,
    afternoon,
    evening,
  };
}

/**
 * Improved availability pattern copy.
 * @param {ReturnType<typeof summarizeCohort> | object[]} input
 */
export function describeEngineAvailabilityPattern(input) {
  const summary = Array.isArray(input) ? summarizeCohort(input) : input;
  if (!summary || summary.showtimeCount === 0) return null;

  if (summary.uniqueDates === 1) return 'One day only';

  const morning = summary.morning ?? 0;
  const afternoon = summary.afternoon ?? 0;
  const evening = summary.evening ?? 0;
  const timed = morning + afternoon + evening;

  // Prefer time-of-day copy when the schedule has a clear shape; reserve
  // "Limited dates" for short calendars without a dominant daypart.
  if (timed > 0) {
    const eveShare = evening / timed;
    const aftShare = afternoon / timed;
    const mornShare = morning / timed;
    if (eveShare >= 0.6) return 'Mostly evenings';
    if (aftShare + eveShare >= 0.75 && mornShare < 0.2) {
      return 'Afternoons + evenings';
    }
    if (mornShare >= 0.6) return 'Mostly mornings';
    if (aftShare >= 0.6) return 'Mostly afternoons';
  }

  if (summary.uniqueDates === 2) return 'Limited dates';
  if (summary.uniqueDates >= 3 && summary.dateSpanDays <= 4) {
    return 'Limited dates';
  }

  return null;
}

/**
 * @param {string} formatId
 */
function isRareId(formatId) {
  return RARE_FORMAT_SET.has(formatId) || RARE_EXPERIENCE_SET.has(formatId);
}

/**
 * @param {ReturnType<typeof summarizeCohort>} summary
 * @param {boolean} rare
 * @param {typeof ENGINE_WEIGHTS} w
 */
function scoreAvailability(summary, rare, w) {
  let score = 0;
  score += Math.min(summary.showtimeCount * w.showtimePointsPer, w.showtimePointsCap);
  score += Math.min(summary.venueCount * w.venuePointsPer, w.venuePointsCap);
  score += Math.min(summary.uniqueDates * w.datePointsPer, w.datePointsCap);

  const buckets =
    (summary.morning > 0 ? 1 : 0) +
    (summary.afternoon > 0 ? 1 : 0) +
    (summary.evening > 0 ? 1 : 0);
  if (buckets >= 2 && summary.evening > 0) {
    score += w.timeBreadthBonus;
  }

  if (summary.showtimeCount === 1) {
    score += rare ? w.singleShowRarePenalty : w.singleShowNonRarePenalty;
  } else if (summary.uniqueDates === 1) {
    score += rare ? w.oneDayRarePenalty : w.oneDayNonRarePenalty;
  }

  const timed = summary.morning + summary.afternoon + summary.evening;
  if (
    !rare &&
    timed > 0 &&
    summary.morning === timed &&
    summary.showtimeCount <= 2
  ) {
    score += w.morningOnlyNonRarePenalty;
  }

  // Limited rare engagements are expected — do not treat scarcity as failure.
  if (
    rare &&
    summary.showtimeCount >= 2 &&
    summary.uniqueDates >= 2 &&
    typeof w.rareEngagementBoost === 'number'
  ) {
    score += w.rareEngagementBoost;
  }

  return score;
}

/**
 * @param {{ confidence?: string | null, mode?: string | null } | null} departureTiming
 * @param {typeof ENGINE_WEIGHTS} w
 */
function scoreUrgency(departureTiming, w) {
  if (!departureTiming || typeof departureTiming !== 'object') return 0;
  const conf = departureTiming.confidence;
  if (conf === 'high') return w.urgencyHigh;
  if (conf === 'moderate') return w.urgencyModerate;
  if (conf === 'low') return w.urgencyLow;
  return 0;
}

/**
 * @param {{
 *   type: 'format' | 'venue',
 *   id: string,
 *   label: string,
 *   rare: boolean,
 *   experienceValue: number,
 *   availabilityScore: number,
 *   urgencyScore: number,
 *   summary: ReturnType<typeof summarizeCohort>,
 * }} candidate
 */
export function buildRecommendationReason(candidate) {
  const { type, id, label, rare, summary, experienceValue, availabilityScore } =
    candidate;

  if (type === 'format') {
    if (rare) {
      if (id === 'live-score') return 'Rare live-score presentation';
      return `Rare ${CANONICAL_BROWSE_LABEL[id] ?? label} presentation`;
    }
    if (availabilityScore >= 28 && experienceValue >= 55) {
      return 'Best premium presentation with broad availability';
    }
    if (id === 'dolby-cinema') return 'Strongest picture and sound option';
    if (id === 'imax') return 'Largest premium screen with solid availability';
    if (id === 'xl-amc') return 'Expanded premium screen';
    if (id === 'reald-3d') return 'Premium 3D presentation';
    return `${CANONICAL_BROWSE_LABEL[id] ?? label} presentation`;
  }

  // Venue
  if (summary.uniqueDates <= 2 || summary.showtimeCount <= 3) {
    return `Limited engagement at ${label}`;
  }
  return 'Specialty theater presentation';
}

/**
 * Build and score format + specialty-venue candidates, pick a winner or null.
 *
 * @param {{
 *   opportunities: object[],
 *   theatersById?: object | null,
 *   departureTiming?: object | null,
 *   weights?: typeof ENGINE_WEIGHTS,
 * }} params
 * @returns {{
 *   type: 'format' | 'venue',
 *   id: string,
 *   label: string,
 *   reason: string,
 *   matchingPerformanceKeys: string[],
 *   venueCount: number,
 *   showtimeCount: number,
 *   firstShowDate: string | null,
 *   availabilityPattern: string | null,
 *   score: number,
 *   experienceValue: number,
 *   availabilityScore: number,
 *   urgencyScore: number,
 *   debug?: object,
 * } | null}
 */
export function selectRecommendedExperienceCandidate(params = {}) {
  const opportunities = Array.isArray(params.opportunities)
    ? params.opportunities
    : [];
  if (opportunities.length === 0) return null;

  const theatersById =
    params.theatersById && typeof params.theatersById === 'object'
      ? params.theatersById
      : {};
  const w = params.weights ?? ENGINE_WEIGHTS;
  const departureTiming = params.departureTiming ?? null;
  const urgencyScore = scoreUrgency(departureTiming, w);

  /** @type {Map<string, object[]>} */
  const byFormat = new Map();
  /** @type {Map<string, object[]>} */
  const byVenue = new Map();

  for (const opp of opportunities) {
    const formatIds = listEngineFormatIdsOnOpportunity(opp);
    for (const formatId of formatIds) {
      if (!byFormat.has(formatId)) byFormat.set(formatId, []);
      byFormat.get(formatId).push(opp);
    }

    const theaterId =
      typeof opp.theaterId === 'string' ? opp.theaterId.trim() : '';
    const meta = theaterId ? theatersById[theaterId] ?? null : null;
    if (isSpecialtyVenue(theaterId, opp.theaterName, meta) && theaterId) {
      if (!byVenue.has(theaterId)) byVenue.set(theaterId, []);
      byVenue.get(theaterId).push(opp);
    }
  }

  /** @type {object[]} */
  const candidates = [];

  for (const [formatId, rows] of byFormat) {
    const matching = rows.slice().sort(compareScreeningsByStart);
    if (matching.length === 0) continue;
    const summary = summarizeCohort(matching);
    // Usability gate: must have actionable performances (already filtered).
    if (summary.showtimeCount < 1) continue;

    const rare = isRareId(formatId);
    const experienceValue = w.formatValue[formatId] ?? 0;
    if (experienceValue <= 0) continue;

    const availabilityScore = scoreAvailability(summary, rare, w);
    const total = experienceValue + availabilityScore + urgencyScore;

    candidates.push({
      type: 'format',
      id: formatId,
      label: CANONICAL_BROWSE_LABEL[formatId] ?? formatId,
      rare,
      experienceValue,
      availabilityScore,
      urgencyScore,
      score: total,
      summary,
      matching,
    });
  }

  for (const [theaterId, rows] of byVenue) {
    const matching = rows.slice().sort(compareScreeningsByStart);
    if (matching.length === 0) continue;
    const summary = summarizeCohort(matching);
    if (summary.showtimeCount < 1) continue;

    // Specialty venues use rare-style availability penalties: a one-show SIFF /
    // Beacon / GI engagement is still product-meaningful (unlike one random Dolby).
    const experienceValue = w.venueSpecialtyValue;
    const availabilityScore = scoreAvailability(summary, true, w);
    const total = experienceValue + availabilityScore + urgencyScore;
    const label =
      matching[0]?.theaterName ??
      theatersById[theaterId]?.name ??
      theaterId;

    candidates.push({
      type: 'venue',
      id: theaterId,
      label,
      rare: false,
      experienceValue,
      availabilityScore,
      urgencyScore,
      score: total,
      summary,
      matching,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.experienceValue !== a.experienceValue) {
      return b.experienceValue - a.experienceValue;
    }
    const breadthA =
      a.summary.uniqueDates * 10 + a.summary.showtimeCount;
    const breadthB =
      b.summary.uniqueDates * 10 + b.summary.showtimeCount;
    if (breadthB !== breadthA) return breadthB - breadthA;
    if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
    const firstA = a.summary.firstSortable ?? a.summary.firstShowDate ?? '';
    const firstB = b.summary.firstSortable ?? b.summary.firstShowDate ?? '';
    if (firstA !== firstB) return firstA < firstB ? -1 : 1;
    const keyA = `${a.type}:${a.id}`;
    const keyB = `${b.type}:${b.id}`;
    return keyA.localeCompare(keyB);
  });

  const winner = candidates[0];
  if (winner.score < w.minAcceptScore) return null;

  // Abstain if the only candidates are weak RealD / XL with poor availability
  // and no specialty venue — minAcceptScore usually handles this.

  const reason = buildRecommendationReason(winner);
  const pattern =
    describeEngineAvailabilityPattern(winner.summary) ??
    null;

  return {
    type: winner.type,
    id: winner.id,
    label: winner.label,
    reason,
    matchingPerformanceKeys: winner.summary.matchingPerformanceKeys,
    venueCount: winner.summary.venueCount,
    showtimeCount: winner.summary.showtimeCount,
    firstShowDate: winner.summary.firstShowDate,
    availabilityPattern: pattern,
    score: winner.score,
    experienceValue: winner.experienceValue,
    availabilityScore: winner.availabilityScore,
    urgencyScore: winner.urgencyScore,
    debug: {
      candidateCount: candidates.length,
      topScores: candidates.slice(0, 5).map((c) => ({
        type: c.type,
        id: c.id,
        score: c.score,
        experienceValue: c.experienceValue,
        availabilityScore: c.availabilityScore,
      })),
    },
  };
}
