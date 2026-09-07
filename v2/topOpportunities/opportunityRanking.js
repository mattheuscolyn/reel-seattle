/**
 * Deterministic Top Opportunities ranking (feature vectors → ranked Top N).
 *
 * Pipeline:
 *   feature vectors → eligibility → scoring → film dedupe → diversification → reason attribution
 *
 * Not wired into live Home / selectTopOpportunities. Diagnostics-only for now.
 *
 * No randomness, LLM, popularity, accessibility specialness, or venue prestige.
 */

import {
  buildAllOpportunityFeatureVectors,
  buildOpportunityFeatureContext,
  TOO_IMMINENT_MINUTES,
} from './opportunityFeatureVector.js';

/** @typedef {ReturnType<typeof scoreOpportunityFeatureVector>} ScoredOpportunity */

/**
 * Tunable ranking constants — keep literals here, not scattered in formulas.
 *
 * Intended rarity ordering (intrinsic):
 *   IMAX 70mm > 70mm ≈ 35mm ≈ Live Score > IMAX > Dolby > XL ≈ RealD
 *
 * Anti-double-counting:
 * - Model-backed leaving-soon is primary *run urgency*.
 * - When a model bucket is present, film-window scarcity increments in urgency
 *   are discounted (overlapDiscountWithModel).
 * - Presentation uniqueness lives mainly in scarcity/rarity, not urgency.
 * - Component caps: urgencyCap, scarcityCap, urgencyPlusScarcityCap.
 * - Novelty channels share combinedCap.
 *
 * Novelty evidence classes (ranking-only; vector unchanged):
 *   distinctive_new_screening — rare/premium/event row recently first-seen
 *   new_film_at_theater       — genuine film×theater announcement
 *   ordinary_recent_row       — schedule-refresh freshness; ~zero contribution
 *   stale                     — no recent novelty evidence
 *
 * Reason salience is score × specificity so a slightly larger generic
 * component does not outrank an explicit event/format/model reason.
 */
export const DEFAULT_TOP_OPPORTUNITY_WEIGHTS = Object.freeze({
  /** Final diversified list size. */
  topN: 3,

  urgency: Object.freeze({
    /** Model-backed run-end (primary). */
    lastChance: 18,
    leavingSoon: 12,
    /**
     * Window-scoped film remaining — full strength when *no* model signal
     * (indie one-nighters). Discounted when model bucket already present.
     */
    filmRemainingMax: 14,
    filmRemainingHalfCount: 1.8,
    filmLastInWindow: 5,
    /** Applied only when no leaving-soon model bucket. */
    overlapDiscountWithModel: 0.28,
    /** Hard cap after stacking. */
    componentCap: 26,
  }),

  presentationRarity: Object.freeze({
    /**
     * Intrinsic format value (independent of how many shows of that format).
     * Hierarchy: imax-70mm > 70mm/35mm/live-score > imax > dolby > xl/reald.
     */
    formatBase: Object.freeze({
      'imax-70mm': 30,
      '70mm': 26,
      '35mm': 26,
      'live-score': 25,
      imax: 11,
      'dolby-cinema': 9,
      'reald-3d': 7,
      'xl-amc': 7,
    }),
    /** Scarcity *modifier* on top of intrinsic (max at count=1). */
    scarcityMax: 8,
    scarcityHalfCount: 6,
    rareRelativeToFilm: 3,
    componentCap: 38,
  }),

  event: Object.freeze({
    variantBase: Object.freeze({
      anniversary: 12,
      anniversary_re_release: 11,
      classic_revival: 11,
      fan_event: 11,
      special_event: 10,
      live_encore: 10,
      concert_live_encore: 10,
      early_access: 9,
      opening_night: 8,
      double_feature: 8,
      holiday_re_release: 8,
      sensory_friendly: 6,
      anime_special_engagement: 7,
      awards_season_limited: 6,
      special_limited_run: 7,
    }),
    genericSpecialCap: 5,
  }),

  novelty: Object.freeze({
    /**
     * Aggressive decay: meaningful mainly days 0–2; near-zero by day 4+.
     * Tier multipliers applied after linear envelope.
     */
    screeningMax: 10,
    screeningHorizonDays: 4,
    screeningDayMultipliers: Object.freeze({
      0: 1,
      1: 0.85,
      2: 0.45,
      3: 0.2,
      4: 0.08,
    }),
    /**
     * Ordinary row freshness is not opportunity novelty. Keep at 0 unless
     * classifyOpportunityNovelty says the pairing itself is new.
     */
    ordinaryScreeningNoveltyScale: 0,
    /**
     * When an explicit event variant already describes the engagement,
     * screening novelty is a correlated “just announced” signal.
     * Rare formats are exempt (see applySpecialEngagementOverlap).
     */
    eventOverlapScreeningScale: 0.4,
    theaterAnnounceMax: 5,
    theaterAnnounceHorizonDays: 5,
    combinedCap: 11,
  }),

  /**
   * Cap correlated event + novelty + premium-format (not rare film) stack.
   * Rare presentations are excluded so a new 70mm is not suppressed.
   */
  specialEngagementStackCap: 22,

  scarcity: Object.freeze({
    /** Presentation-level remaining (complements rarity; not run urgency). */
    presentationMax: 14,
    presentationHalfCount: 2,
    uniquePresentationBonus: 3,
    /** Film-level remaining — lower when model urgency already fired. */
    filmMax: 8,
    filmHalfCount: 2.2,
    filmMaxWithModel: 3,
    componentCap: 18,
  }),

  /** Cap correlated urgency+scarcity paths (prevents last_chance×1-show blowups). */
  urgencyPlusScarcityCap: 34,

  temporal: Object.freeze({
    sweetSpotHours: 60,
    sweetSpotSigmaHours: 52,
    peak: 7,
    farFutureFloor: 2,
    farFutureHours: 168,
    eveningBoost: 0.75,
    weekendBoost: 1,
    /**
     * Exceptional opportunities (rare / event / model urgency) keep at least
     * this temporal contribution so 8–14d horizons are not erased.
     */
    exceptionalFloor: 4,
  }),

  penalties: Object.freeze({
    ubiquityMax: 12,
    ubiquityHalfShowtimes: 40,
    ubiquityTheaterShareScale: 8,
    theatricalOrdinaryExtra: 2,
    tooImminent: 8,
    /** Fraction of imminence penalty kept when opportunity is exceptional. */
    tooImminentExceptionalScale: 0.35,
  }),

  repertory: Object.freeze({
    openingRepertory: 3,
    openingEvent: 3.5,
    classicRevivalAlreadyInEvent: 0,
    olderFilmAtRepVenue: 2.5,
  }),

  diversity: Object.freeze({
    lambda: 0.38,
    sameDominantReason: 0.55,
    sameFormatFamily: 0.4,
    sameEventFamily: 0.35,
    sameTheater: 0.22,
    sameOpeningType: 0.18,
    sameNewlyAnnounced: 0.12,
  }),

  /**
   * Specificity multipliers for reason salience (not ranking).
   * Generic reasons only beat specific ones when contribution is much larger.
   */
  reasonSalience: Object.freeze({
    lastChance: 1.4,
    leavingSoon: 1.25,
    rarePresentation: 1.4,
    specialEvent: 1.35,
    distinctiveAnnouncement: 1.2,
    theaterAnnouncement: 1.15,
    ordinaryAnnouncement: 0.5,
    limitedPresentationGeneric: 1.0,
    limitedPresentationWithSpecific: 0.55,
    limitedRunGeneric: 1.05,
    limitedRunWithSpecific: 0.55,
    repertory: 0.85,
    showingSoon: 0.4,
  }),
});

const RARE_FORMAT_SET = new Set([
  'imax-70mm',
  '70mm',
  '35mm',
  'live-score',
]);

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to 2 decimals for stable diagnostics (no float noise in assertions).
 * @param {number} value
 */
export function roundScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Soft inverse boost: max at count=1, halves near halfCount, →0 for large counts.
 * @param {number} count
 * @param {number} maxBoost
 * @param {number} halfCount
 */
export function inverseCountBoost(count, maxBoost, halfCount) {
  const c = Number.isFinite(count) && count > 0 ? count : Infinity;
  if (!Number.isFinite(c) || c === Infinity) return 0;
  const half = halfCount > 0 ? halfCount : 2;
  return roundScore(maxBoost / (1 + (c - 1) / half));
}

/**
 * Linear decay over horizon days (inclusive of day 0).
 * @param {number | null} days
 * @param {number} maxBoost
 * @param {number} horizonDays
 */
export function linearDayDecay(days, maxBoost, horizonDays) {
  if (days == null || !Number.isFinite(days) || days < 0) return 0;
  if (days > horizonDays) return 0;
  return roundScore(maxBoost * (1 - days / (horizonDays + 0.0001)));
}

/**
 * Screening novelty with aggressive day tiers (0–2 strong; 4+ near zero).
 *
 * Third argument: boolean distinctive (legacy) or options:
 *   { distinctive, noveltyClass, eventOverlapScale }
 *
 * Ordinary recent rows contribute 0. Distinctive/new-at-theater screening
 * novelty uses the day envelope. Event overlap (non-rare) scales screening.
 *
 * @param {number | null} days
 * @param {typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS.novelty} cfg
 * @param {boolean | {
 *   distinctive?: boolean,
 *   noveltyClass?: string,
 *   eventOverlapScale?: number,
 * }} [distinctiveOrOpts]
 */
export function screeningNoveltyContribution(days, cfg, distinctiveOrOpts = false) {
  if (days == null || !Number.isFinite(days) || days < 0) return 0;
  const opts =
    distinctiveOrOpts && typeof distinctiveOrOpts === 'object'
      ? distinctiveOrOpts
      : { distinctive: Boolean(distinctiveOrOpts) };
  const noveltyClass =
    opts.noveltyClass ??
    (opts.distinctive ? 'distinctive_new_screening' : 'ordinary_recent_row');
  if (
    noveltyClass === 'stale' ||
    noveltyClass === 'ordinary_recent_row'
  ) {
    return 0;
  }
  // Ordinary film×theater announcements use the theater channel, not row first-seen.
  if (noveltyClass === 'new_film_at_theater' && !opts.distinctive) {
    return 0;
  }
  const day = Math.floor(days);
  const multMap = cfg.screeningDayMultipliers ?? {};
  const mult =
    day in multMap
      ? multMap[day]
      : day > cfg.screeningHorizonDays
        ? 0
        : 0.05;
  if (mult <= 0) return 0;
  const envelope = linearDayDecay(
    days,
    cfg.screeningMax,
    cfg.screeningHorizonDays,
  );
  let score = envelope * mult;
  if (Number.isFinite(opts.eventOverlapScale) && opts.eventOverlapScale < 1) {
    score *= opts.eventOverlapScale;
  }
  return roundScore(score);
}

/**
 * Ranking-only novelty evidence class. Does not mutate the feature vector.
 *
 * @param {object} vector
 * @param {typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS} [weights]
 * @returns {'distinctive_new_screening' | 'new_film_at_theater' | 'ordinary_recent_row' | 'stale'}
 */
export function classifyOpportunityNovelty(
  vector,
  weights = DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
) {
  const distinctive = isDistinctivePresentation(vector);
  const screeningDays = vector?.novelty?.daysSinceScreeningFirstSeen;
  const theaterDays = vector?.novelty?.daysSinceFilmTheaterAnnouncement;
  const screeningHorizon = weights.novelty.screeningHorizonDays;
  const theaterHorizon = weights.novelty.theaterAnnounceHorizonDays;
  const screeningRecent =
    screeningDays != null &&
    Number.isFinite(screeningDays) &&
    screeningDays >= 0 &&
    screeningDays <= screeningHorizon;
  const theaterRecent =
    vector?.novelty?.isNewlyAddedAtTheater === true &&
    theaterDays != null &&
    Number.isFinite(theaterDays) &&
    theaterDays >= 0 &&
    theaterDays <= theaterHorizon;

  if (distinctive && screeningRecent) return 'distinctive_new_screening';
  if (theaterRecent) return 'new_film_at_theater';
  if (screeningRecent) return 'ordinary_recent_row';
  return 'stale';
}

/**
 * Rare format / premium / event presentation (not ordinary digital).
 * @param {object} vector
 */
export function isDistinctivePresentation(vector) {
  return Boolean(
    vector?.presentation?.hasRareFormat ||
      vector?.presentation?.hasPremiumFormat ||
      vector?.event?.isEventVariant ||
      vector?.event?.isSpecialScreening === true,
  );
}

function hasExplicitEventVariant(vector) {
  const variant = vector?.event?.screeningVariantType;
  return Boolean(variant && variant !== 'none');
}

function scaleReasonContributions(reasons, scale) {
  if (!(scale < 1) || !Array.isArray(reasons)) return;
  for (const r of reasons) {
    r.contribution = roundScore(r.contribution * scale);
  }
}

/**
 * Event + novelty + premium (non-rare) often describe one engagement.
 * Reduce screening novelty first, then cap the remaining stack.
 * Rare film presentations are not discounted this way.
 *
 * @param {{
 *   vector: object,
 *   eventScore: number,
 *   novelty: number,
 *   noveltyReasons: { key: string, contribution: number }[],
 *   premiumIntrinsic: number,
 *   weights: typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
 * }} args
 */
export function applySpecialEngagementOverlap({
  vector,
  eventScore,
  novelty,
  noveltyReasons,
  premiumIntrinsic,
  weights,
}) {
  const hasRare = vector?.presentation?.hasRareFormat === true;
  if (hasRare || eventScore <= 0) {
    return { novelty, eventScore, premiumIntrinsic };
  }
  let nextNovelty = novelty;
  const screeningReason = noveltyReasons.find(
    (r) => r.key === 'screening_first_seen',
  );
  const eventScale = weights.novelty.eventOverlapScreeningScale ?? 1;
  if (screeningReason && eventScale < 1) {
    const before = screeningReason.contribution;
    const after = roundScore(before * eventScale);
    nextNovelty = roundScore(nextNovelty - (before - after));
    screeningReason.contribution = after;
  }
  const cap = weights.specialEngagementStackCap;
  if (Number.isFinite(cap)) {
    const stack = eventScore + nextNovelty + premiumIntrinsic;
    if (stack > cap && nextNovelty > 0) {
      const overflow = stack - cap;
      const cut = Math.min(nextNovelty, overflow);
      const scale = (nextNovelty - cut) / nextNovelty;
      nextNovelty = roundScore(nextNovelty - cut);
      scaleReasonContributions(noveltyReasons, scale);
    }
  }
  return { novelty: nextNovelty, eventScore, premiumIntrinsic };
}

/**
 * Rare / event / model-urgency opportunities get a temporal floor so far-horizon
 * exceptional shows are not erased. Ordinary shows keep the raw curve.
 * @param {object} vector
 */
export function isExceptionalOpportunity(vector) {
  const ls = vector?.leavingSoon?.leavingSoonBucket;
  return Boolean(
    vector?.presentation?.hasRareFormat ||
      vector?.event?.isEventVariant ||
      vector?.event?.isSpecialScreening === true ||
      ls === 'last_chance' ||
      ls === 'leaving_soon',
  );
}

/**
 * Temporal actionability curve from hoursUntil (Pacific wall delta).
 * Peak near sweetSpotHours; downweights far future; does not reward past.
 * @param {number | null} hoursUntil
 * @param {typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS.temporal} cfg
 * @param {{ exceptional?: boolean }} [opts]
 */
export function temporalActionabilityScore(hoursUntil, cfg, opts = {}) {
  if (hoursUntil == null || !Number.isFinite(hoursUntil) || hoursUntil < 0) {
    return 0;
  }
  const peak = cfg.peak;
  const mu = cfg.sweetSpotHours;
  const sigma = cfg.sweetSpotSigmaHours;
  const gauss = Math.exp(-((hoursUntil - mu) ** 2) / (2 * sigma * sigma));
  let score = peak * gauss;
  if (hoursUntil > cfg.farFutureHours) {
    score = Math.min(score, cfg.farFutureFloor);
  } else if (hoursUntil > 120) {
    score = Math.max(score * 0.55, cfg.farFutureFloor);
  }
  // Mild uplift for later-today / tomorrow band if gauss under-emphasizes near term.
  if (hoursUntil >= 1.5 && hoursUntil <= 36) {
    score = Math.max(score, peak * 0.55);
  }
  if (opts.exceptional && Number.isFinite(cfg.exceptionalFloor)) {
    // Hold a full floor through ~14 days; soft decay only beyond that.
    const holdHours = 14 * 24;
    const distanceScale =
      hoursUntil <= holdHours
        ? 1
        : Math.max(0.55, 1 - (hoursUntil - holdHours) / 336);
    score = Math.max(score, cfg.exceptionalFloor * distanceScale);
  }
  return roundScore(clamp(score, 0, peak));
}

/**
 * Format family for diversity (rare film / premium digital / standard).
 * @param {object} presentation
 */
export function formatFamily(presentation) {
  const rare = presentation?.rareFormats ?? [];
  const rareExp = presentation?.rareExperiences ?? [];
  const premium = presentation?.premiumFormats ?? [];
  if (rare.includes('imax-70mm') || rareExp.includes('live-score')) {
    return 'ultra_rare';
  }
  if (rare.includes('70mm') || rare.includes('35mm')) return 'film_print';
  if (premium.includes('imax')) return 'imax';
  if (premium.includes('dolby-cinema')) return 'dolby';
  if (premium.includes('xl-amc') || premium.includes('reald-3d')) {
    return 'premium_other';
  }
  return 'standard';
}

/**
 * @param {object} vector
 * @returns {{ eligible: boolean, exclusionReason: string | null }}
 */
export function evaluateOpportunityEligibility(vector) {
  const elig = vector?.eligibilityInputs ?? {};
  if (!elig.hasFilmKey) {
    return { eligible: false, exclusionReason: 'missing_film_key' };
  }
  if (!elig.hasTheaterId) {
    return { eligible: false, exclusionReason: 'missing_theater_id' };
  }
  if (elig.theaterNameIsUnknown) {
    return { eligible: false, exclusionReason: 'unknown_theater' };
  }
  if (!elig.hasTheaterName) {
    return { eligible: false, exclusionReason: 'missing_theater_name' };
  }
  if (!elig.hasValidLocalDate || !elig.hasValidLocalTime) {
    return { eligible: false, exclusionReason: 'invalid_datetime' };
  }
  if (!elig.hasSortableLocalDateTime) {
    return { eligible: false, exclusionReason: 'unsortable_datetime' };
  }
  if (elig.isCanceled) {
    return { eligible: false, exclusionReason: 'canceled' };
  }
  if (elig.isSoldOut) {
    return { eligible: false, exclusionReason: 'sold_out' };
  }
  if (elig.isPast || vector?.temporal?.isPast) {
    return { eligible: false, exclusionReason: 'past' };
  }
  if (elig.isNonFilmEvent) {
    return { eligible: false, exclusionReason: 'non_film_event' };
  }
  if (!elig.hasCurrentOpportunity) {
    return { eligible: false, exclusionReason: 'not_current_opportunity' };
  }
  return { eligible: true, exclusionReason: null };
}

/**
 * @param {object} vector
 * @param {typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS} [weights]
 */
export function scoreOpportunityFeatureVector(
  vector,
  weights = DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
) {
  const eligibility = evaluateOpportunityEligibility(vector);
  if (!eligibility.eligible) {
    return {
      vector,
      eligible: false,
      exclusionReason: eligibility.exclusionReason,
      totalScore: 0,
      components: null,
      diversityProfile: null,
    };
  }

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const urgencyReasons = [];
  let urgency = 0;
  const ls = vector.leavingSoon ?? {};
  const hasModelUrgency =
    ls.leavingSoonBucket === 'last_chance' ||
    ls.leavingSoonBucket === 'leaving_soon';

  if (ls.leavingSoonBucket === 'last_chance') {
    urgency += weights.urgency.lastChance;
    urgencyReasons.push({
      key: 'leaving_soon_bucket',
      value: 'last_chance',
      contribution: weights.urgency.lastChance,
    });
  } else if (ls.leavingSoonBucket === 'leaving_soon') {
    urgency += weights.urgency.leavingSoon;
    urgencyReasons.push({
      key: 'leaving_soon_bucket',
      value: 'leaving_soon',
      contribution: weights.urgency.leavingSoon,
    });
  }

  /**
   * Run urgency from window-scoped film remaining.
   * Full strength without model coverage (indie one-nights).
   * Overlap-discounted when model already provides run-end evidence.
   */
  const filmCount = vector.filmWindow?.filmWindowShowtimeCount ?? 0;
  const filmOverlapScale = hasModelUrgency
    ? weights.urgency.overlapDiscountWithModel
    : 1;
  const filmBoost = roundScore(
    inverseCountBoost(
      filmCount,
      weights.urgency.filmRemainingMax,
      weights.urgency.filmRemainingHalfCount,
    ) * filmOverlapScale,
  );
  if (filmBoost > 0) {
    urgency += filmBoost;
    urgencyReasons.push({
      key: 'film_remaining_showtimes',
      value: filmCount,
      contribution: filmBoost,
    });
  }
  if (vector.filmWindow?.isFilmLastKnownScreeningInWindow) {
    const lastBoost = roundScore(
      weights.urgency.filmLastInWindow * filmOverlapScale,
    );
    if (lastBoost > 0) {
      urgency += lastBoost;
      urgencyReasons.push({
        key: 'film_last_in_window',
        value: true,
        contribution: lastBoost,
      });
    }
  }
  // Presentation uniqueness is presentation scarcity, not run urgency.
  if (urgency > weights.urgency.componentCap) {
    const scale = weights.urgency.componentCap / urgency;
    urgency = weights.urgency.componentCap;
    for (const r of urgencyReasons) {
      r.contribution = roundScore(r.contribution * scale);
    }
  }

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const rarityReasons = [];
  let presentationRarity = 0;
  const fmtBase = weights.presentationRarity.formatBase;
  const rareIds = [
    ...(vector.presentation?.rareFormats ?? []),
    ...(vector.presentation?.rareExperiences ?? []),
  ];
  const premiumIds = [...(vector.presentation?.premiumFormats ?? [])];
  let bestFormat = null;
  let bestFormatScore = 0;
  for (const id of [...rareIds, ...premiumIds]) {
    const base = fmtBase[id] ?? 0;
    if (base > bestFormatScore) {
      bestFormatScore = base;
      bestFormat = id;
    }
  }
  if (bestFormatScore > 0) {
    // Intrinsic format value — independent of how many shows of that format.
    presentationRarity += bestFormatScore;
    rarityReasons.push({
      key: RARE_FORMAT_SET.has(bestFormat) ? 'rare_format' : 'premium_format',
      value: bestFormat,
      contribution: bestFormatScore,
    });
  }
  const pCount = vector.presentation?.presentationShowtimeCount ?? 0;
  if (bestFormatScore > 0 || vector.presentation?.hasRareFormat) {
    const scarcityExtra = inverseCountBoost(
      pCount,
      weights.presentationRarity.scarcityMax,
      weights.presentationRarity.scarcityHalfCount,
    );
    if (scarcityExtra > 0) {
      presentationRarity += scarcityExtra;
      rarityReasons.push({
        key: 'presentation_count',
        value: pCount,
        contribution: scarcityExtra,
      });
    }
  }
  if (vector.presentation?.isRareRelativeToFilm && bestFormatScore > 0) {
    presentationRarity += weights.presentationRarity.rareRelativeToFilm;
    rarityReasons.push({
      key: 'rare_relative_to_film',
      value: true,
      contribution: weights.presentationRarity.rareRelativeToFilm,
    });
  }
  if (presentationRarity > weights.presentationRarity.componentCap) {
    const scale = weights.presentationRarity.componentCap / presentationRarity;
    presentationRarity = weights.presentationRarity.componentCap;
    for (const r of rarityReasons) {
      r.contribution = roundScore(r.contribution * scale);
    }
  }

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const eventReasons = [];
  let eventScore = 0;
  const variant = vector.event?.screeningVariantType;
  if (variant && variant !== 'none') {
    const base = weights.event.variantBase[variant] ?? 0;
    if (base > 0) {
      eventScore = base;
      eventReasons.push({
        key: 'screening_variant',
        value: variant,
        contribution: base,
      });
    }
  }
  if (
    eventScore === 0 &&
    vector.event?.isSpecialScreening === true
  ) {
    eventScore = weights.event.genericSpecialCap;
    eventReasons.push({
      key: 'is_special_screening',
      value: true,
      contribution: weights.event.genericSpecialCap,
    });
  }

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const noveltyReasons = [];
  let novelty = 0;
  const distinctivePresentation = isDistinctivePresentation(vector);
  const noveltyClass = classifyOpportunityNovelty(vector, weights);
  const screeningNovelty = screeningNoveltyContribution(
    vector.novelty?.daysSinceScreeningFirstSeen,
    weights.novelty,
    {
      distinctive: distinctivePresentation,
      noveltyClass,
      eventOverlapScale: 1, // overlap applied after theater channel + cap
    },
  );
  if (screeningNovelty > 0) {
    novelty += screeningNovelty;
    noveltyReasons.push({
      key: 'screening_first_seen',
      value: vector.novelty?.daysSinceScreeningFirstSeen,
      contribution: screeningNovelty,
    });
  }
  const theaterNovelty = linearDayDecay(
    vector.novelty?.daysSinceFilmTheaterAnnouncement,
    weights.novelty.theaterAnnounceMax,
    weights.novelty.theaterAnnounceHorizonDays,
  );
  if (theaterNovelty > 0 && vector.novelty?.isNewlyAddedAtTheater) {
    novelty += theaterNovelty;
    noveltyReasons.push({
      key: 'film_theater_announced',
      value: vector.novelty?.daysSinceFilmTheaterAnnouncement,
      contribution: theaterNovelty,
    });
  }
  if (novelty > weights.novelty.combinedCap) {
    const scale = weights.novelty.combinedCap / novelty;
    novelty = weights.novelty.combinedCap;
    scaleReasonContributions(noveltyReasons, scale);
  }

  const premiumIntrinsic =
    !vector.presentation?.hasRareFormat && bestFormatScore > 0
      ? bestFormatScore
      : 0;
  ({ novelty } = applySpecialEngagementOverlap({
    vector,
    eventScore,
    novelty,
    noveltyReasons,
    premiumIntrinsic,
    weights,
  }));

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const scarcityReasons = [];
  let scarcity = 0;
  const pScarce = inverseCountBoost(
    pCount,
    weights.scarcity.presentationMax,
    weights.scarcity.presentationHalfCount,
  );
  if (pScarce > 0) {
    scarcity += pScarce;
    scarcityReasons.push({
      key: 'presentation_showtime_count',
      value: pCount,
      contribution: pScarce,
    });
  }
  if (vector.presentation?.isUniquePresentation) {
    scarcity += weights.scarcity.uniquePresentationBonus;
    scarcityReasons.push({
      key: 'unique_presentation',
      value: true,
      contribution: weights.scarcity.uniquePresentationBonus,
    });
  }
  const filmScarceMax = hasModelUrgency
    ? weights.scarcity.filmMaxWithModel
    : weights.scarcity.filmMax;
  const fScarce = inverseCountBoost(
    filmCount,
    filmScarceMax,
    weights.scarcity.filmHalfCount,
  );
  if (fScarce > 0) {
    scarcity += fScarce;
    scarcityReasons.push({
      key: 'film_showtime_count',
      value: filmCount,
      contribution: fScarce,
    });
  }
  if (scarcity > weights.scarcity.componentCap) {
    const scale = weights.scarcity.componentCap / scarcity;
    scarcity = weights.scarcity.componentCap;
    for (const r of scarcityReasons) {
      r.contribution = roundScore(r.contribution * scale);
    }
  }

  // Correlated urgency+scarcity saturation (shared scarcity evidence).
  const urgencyScarcitySum = urgency + scarcity;
  if (urgencyScarcitySum > weights.urgencyPlusScarcityCap) {
    const scale = weights.urgencyPlusScarcityCap / urgencyScarcitySum;
    urgency = roundScore(urgency * scale);
    scarcity = roundScore(scarcity * scale);
    for (const r of urgencyReasons) {
      r.contribution = roundScore(r.contribution * scale);
    }
    for (const r of scarcityReasons) {
      r.contribution = roundScore(r.contribution * scale);
    }
  }

  const exceptional = isExceptionalOpportunity(vector);

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const temporalReasons = [];
  let temporal = temporalActionabilityScore(
    vector.temporal?.hoursUntil,
    weights.temporal,
    { exceptional },
  );
  if (temporal > 0) {
    temporalReasons.push({
      key: 'hours_until_curve',
      value: vector.temporal?.hoursUntil,
      contribution: temporal,
    });
  }
  if (vector.temporal?.isEvening) {
    temporal += weights.temporal.eveningBoost;
    temporalReasons.push({
      key: 'evening',
      value: true,
      contribution: weights.temporal.eveningBoost,
    });
  }
  if (vector.temporal?.isCurrentWeekend) {
    temporal += weights.temporal.weekendBoost;
    temporalReasons.push({
      key: 'current_weekend',
      value: true,
      contribution: weights.temporal.weekendBoost,
    });
  }

  /** Mild repertory/event evidence (not “old = better”). */
  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const repertoryReasons = [];
  let repertory = 0;
  if (vector.opening?.openingType === 'repertory') {
    repertory += weights.repertory.openingRepertory;
    repertoryReasons.push({
      key: 'opening_type',
      value: 'repertory',
      contribution: weights.repertory.openingRepertory,
    });
  } else if (vector.opening?.openingType === 'event') {
    repertory += weights.repertory.openingEvent;
    repertoryReasons.push({
      key: 'opening_type',
      value: 'event',
      contribution: weights.repertory.openingEvent,
    });
  }
  if (
    vector.opening?.isOlderFilm &&
    vector.theater?.isRep &&
    !vector.event?.isClassicRevival
  ) {
    repertory += weights.repertory.olderFilmAtRepVenue;
    repertoryReasons.push({
      key: 'older_film_at_rep_venue',
      value: true,
      contribution: weights.repertory.olderFilmAtRepVenue,
    });
  }

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const ubiquityReasons = [];
  let ubiquityPenalty = 0;
  const isOrdinaryPresentation =
    !vector.presentation?.hasRareFormat &&
    !vector.presentation?.hasPremiumFormat &&
    !(vector.event?.isEventVariant) &&
    vector.event?.isSpecialScreening !== true;
  if (isOrdinaryPresentation) {
    const showtimes = filmCount;
    const share = vector.filmWindow?.filmTheaterShareOfTracked ?? 0;
    let penalty = 0;
    if (showtimes >= 8) {
      penalty +=
        weights.penalties.ubiquityMax *
        (1 -
          1 /
            (1 +
              (showtimes - 1) / weights.penalties.ubiquityHalfShowtimes));
    }
    if (share >= 0.35) {
      penalty += weights.penalties.ubiquityTheaterShareScale * share;
    }
    if (vector.opening?.openingType === 'theatrical' && showtimes >= 15) {
      penalty += weights.penalties.theatricalOrdinaryExtra;
    }
    ubiquityPenalty = -roundScore(
      clamp(penalty, 0, weights.penalties.ubiquityMax + 4),
    );
    if (ubiquityPenalty < 0) {
      ubiquityReasons.push({
        key: 'ordinary_ubiquitous_film',
        value: { showtimes, share },
        contribution: ubiquityPenalty,
      });
    }
  }

  /** @type {{ key: string, value: unknown, contribution: number }[]} */
  const imminenceReasons = [];
  let imminencePenalty = 0;
  if (vector.temporal?.isTooImminent) {
    const scale = exceptional
      ? weights.penalties.tooImminentExceptionalScale
      : 1;
    imminencePenalty = -roundScore(weights.penalties.tooImminent * scale);
    imminenceReasons.push({
      key: 'too_imminent',
      value: vector.temporal?.minutesUntil ?? TOO_IMMINENT_MINUTES,
      contribution: imminencePenalty,
    });
  }

  const components = {
    urgency: {
      score: roundScore(urgency),
      reasons: urgencyReasons,
    },
    presentationRarity: {
      score: roundScore(presentationRarity),
      reasons: rarityReasons,
    },
    event: {
      score: roundScore(eventScore),
      reasons: eventReasons,
    },
    novelty: {
      score: roundScore(novelty),
      reasons: noveltyReasons,
      noveltyClass,
    },
    scarcity: {
      score: roundScore(scarcity),
      reasons: scarcityReasons,
    },
    temporal: {
      score: roundScore(temporal),
      reasons: temporalReasons,
    },
    repertory: {
      score: roundScore(repertory),
      reasons: repertoryReasons,
    },
    ubiquityPenalty: {
      score: roundScore(ubiquityPenalty),
      reasons: ubiquityReasons,
    },
    imminencePenalty: {
      score: roundScore(imminencePenalty),
      reasons: imminenceReasons,
    },
  };

  const totalScore = roundScore(
    components.urgency.score +
      components.presentationRarity.score +
      components.event.score +
      components.novelty.score +
      components.scarcity.score +
      components.temporal.score +
      components.repertory.score +
      components.ubiquityPenalty.score +
      components.imminencePenalty.score,
  );

  return {
    vector,
    eligible: true,
    exclusionReason: null,
    totalScore,
    components,
    noveltyClass,
    diversityProfile: {
      dominantReasonCategory: null, // filled after attribution
      formatFamily: formatFamily(vector.presentation),
      eventFamily: vector.event?.screeningVariantType ?? 'none',
      theaterId: vector.identifiers?.theaterId ?? null,
      openingType: vector.opening?.openingType ?? null,
      newlyAnnounced: Boolean(
        vector.novelty?.isNewlyAddedAtTheater ||
          vector.novelty?.isRecentlyObservedScreening,
      ),
      filmKey: vector.identifiers?.filmKey ?? null,
    },
  };
}

/**
 * Deterministic tie-break among scored opportunities (descending preference).
 * @param {ScoredOpportunity} a
 * @param {ScoredOpportunity} b
 */
export function compareScoredOpportunities(a, b) {
  if (a.totalScore !== b.totalScore) {
    return a.totalScore > b.totalScore ? -1 : 1;
  }
  const aRare = a.components?.presentationRarity?.score ?? 0;
  const bRare = b.components?.presentationRarity?.score ?? 0;
  if (aRare !== bRare) return aRare > bRare ? -1 : 1;
  const aEvent = a.components?.event?.score ?? 0;
  const bEvent = b.components?.event?.score ?? 0;
  if (aEvent !== bEvent) return aEvent > bEvent ? -1 : 1;
  const aHours = a.vector?.temporal?.hoursUntil;
  const bHours = b.vector?.temporal?.hoursUntil;
  const aH = Number.isFinite(aHours) ? aHours : Number.POSITIVE_INFINITY;
  const bH = Number.isFinite(bHours) ? bHours : Number.POSITIVE_INFINITY;
  if (aH !== bH) return aH < bH ? -1 : 1;
  const aKey = a.vector?.identifiers?.opportunityKey ?? '';
  const bKey = b.vector?.identifiers?.opportunityKey ?? '';
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  return 0;
}

/**
 * @param {object[]} vectors
 * @param {{ weights?: typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS }} [options]
 */
export function rankOpportunityVectors(vectors, options = {}) {
  const weights = options.weights ?? DEFAULT_TOP_OPPORTUNITY_WEIGHTS;
  const list = Array.isArray(vectors) ? vectors : [];
  /** @type {ScoredOpportunity[]} */
  const scored = [];
  /** @type {ScoredOpportunity[]} */
  const ineligible = [];
  for (const vector of list) {
    const scoredItem = scoreOpportunityFeatureVector(vector, weights);
    if (scoredItem.eligible) {
      const withReason = {
        ...scoredItem,
        dominantReason: attributeOpportunityReason(scoredItem),
      };
      if (withReason.diversityProfile) {
        withReason.diversityProfile = {
          ...withReason.diversityProfile,
          dominantReasonCategory: withReason.dominantReason.category,
        };
      }
      scored.push(withReason);
    } else {
      ineligible.push(scoredItem);
    }
  }
  scored.sort(compareScoredOpportunities);
  return { scored, ineligible, weights };
}

/**
 * Pick highest-scoring screening per filmKey.
 * @param {ScoredOpportunity[]} scoredSorted
 */
export function selectFilmRepresentatives(scoredSorted) {
  /** @type {ScoredOpportunity[]} */
  const reps = [];
  const seen = new Set();
  /** @type {ScoredOpportunity[]} */
  const suppressedDuplicates = [];
  for (const item of scoredSorted) {
    const filmKey = item.vector?.identifiers?.filmKey;
    if (!filmKey) continue;
    if (seen.has(filmKey)) {
      suppressedDuplicates.push({
        ...item,
        suppressionReason: 'duplicate_film',
      });
      continue;
    }
    seen.add(filmKey);
    reps.push(item);
  }
  return { representatives: reps, suppressedDuplicates };
}

/**
 * Similarity in [0,1] for MMR.
 * @param {ScoredOpportunity} a
 * @param {ScoredOpportunity} b
 * @param {typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS.diversity} cfg
 */
export function diversitySimilarity(a, b, cfg) {
  let sim = 0;
  const pa = a.diversityProfile ?? {};
  const pb = b.diversityProfile ?? {};
  if (
    pa.dominantReasonCategory &&
    pa.dominantReasonCategory === pb.dominantReasonCategory
  ) {
    sim += cfg.sameDominantReason;
  }
  if (pa.formatFamily && pa.formatFamily === pb.formatFamily) {
    sim += cfg.sameFormatFamily;
  }
  if (
    pa.eventFamily &&
    pa.eventFamily !== 'none' &&
    pa.eventFamily === pb.eventFamily
  ) {
    sim += cfg.sameEventFamily;
  }
  if (pa.theaterId && pa.theaterId === pb.theaterId) {
    sim += cfg.sameTheater;
  }
  if (pa.openingType && pa.openingType === pb.openingType) {
    sim += cfg.sameOpeningType;
  }
  if (pa.newlyAnnounced && pb.newlyAnnounced) {
    sim += cfg.sameNewlyAnnounced;
  }
  return clamp(sim, 0, 1);
}

/**
 * MMR-style diversification. Strongest remains first unless empty.
 * @param {ScoredOpportunity[]} representativesSorted
 * @param {{
 *   topN?: number,
 *   weights?: typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
 * }} [options]
 */
export function selectDiversifiedTopOpportunities(
  representativesSorted,
  options = {},
) {
  const weights = options.weights ?? DEFAULT_TOP_OPPORTUNITY_WEIGHTS;
  const topN = options.topN ?? weights.topN;
  const list = Array.isArray(representativesSorted)
    ? representativesSorted
    : [];
  if (list.length === 0 || topN <= 0) {
    return {
      selected: [],
      nearMisses: [],
      diagnostics: [],
    };
  }

  /** @type {ScoredOpportunity[]} */
  const selected = [];
  const remaining = [...list];
  /** @type {object[]} */
  const diagnostics = [];

  // Slot 1: strongest (already sorted).
  const first = remaining.shift();
  selected.push({
    ...first,
    diversificationPenalty: 0,
    selectionScore: first.totalScore,
    selectionRank: 1,
  });
  diagnostics.push({
    opportunityKey: first.vector?.identifiers?.opportunityKey,
    baseScore: first.totalScore,
    diversificationPenalty: 0,
    selectionScore: first.totalScore,
    note: 'highest_base_score',
  });

  while (selected.length < topN && remaining.length > 0) {
    let bestIdx = 0;
    let bestAdj = -Infinity;
    let bestPenalty = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const sel of selected) {
        maxSim = Math.max(
          maxSim,
          diversitySimilarity(cand, sel, weights.diversity),
        );
      }
      const penalty = roundScore(weights.diversity.lambda * maxSim * 40);
      const adj = roundScore(cand.totalScore - penalty);
      if (
        adj > bestAdj ||
        (adj === bestAdj && compareScoredOpportunities(cand, remaining[bestIdx]) < 0)
      ) {
        bestAdj = adj;
        bestIdx = i;
        bestPenalty = penalty;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    selected.push({
      ...picked,
      diversificationPenalty: bestPenalty,
      selectionScore: bestAdj,
      selectionRank: selected.length + 1,
    });
    diagnostics.push({
      opportunityKey: picked.vector?.identifiers?.opportunityKey,
      baseScore: picked.totalScore,
      diversificationPenalty: bestPenalty,
      selectionScore: bestAdj,
      note: 'mmr_pick',
    });
  }

  const nearMisses = remaining.slice(0, 5).map((item, index) => ({
    ...item,
    nearMissRank: index + 1,
    lostBecause: 'below_diversified_cutoff',
  }));

  return { selected, nearMisses, diagnostics };
}

/**
 * Dominant reason from score contribution × evidence specificity (salience).
 * Ranking still uses totalScore; this only chooses the explanation.
 * @param {ScoredOpportunity} scored
 */
export function attributeOpportunityReason(scored) {
  const components = scored?.components;
  const vector = scored?.vector;
  if (!components) {
    return {
      category: 'other',
      labelKey: 'other',
      evidence: {},
      supportingReasons: [],
    };
  }

  const cfg =
    scored.weights?.reasonSalience ?? DEFAULT_TOP_OPPORTUNITY_WEIGHTS.reasonSalience;
  const noveltyClass =
    scored.noveltyClass ??
    components.novelty?.noveltyClass ??
    classifyOpportunityNovelty(vector);
  const hasRare = vector?.presentation?.hasRareFormat === true;
  const hasEvent =
    hasExplicitEventVariant(vector) ||
    (components.event?.score ?? 0) > 0;
  const hasModelLeaving =
    vector?.leavingSoon?.leavingSoonBucket === 'last_chance' ||
    vector?.leavingSoon?.leavingSoonBucket === 'leaving_soon';
  const hasSpecific =
    hasRare || hasEvent || hasModelLeaving;

  const candidates = [
    {
      category: 'leaving_soon',
      labelKey:
        vector?.leavingSoon?.leavingSoonBucket === 'last_chance'
          ? 'last_chance_bucket'
          : 'leaving_soon_bucket',
      score: components.urgency?.score ?? 0,
      specificity:
        vector?.leavingSoon?.leavingSoonBucket === 'last_chance'
          ? cfg.lastChance
          : cfg.leavingSoon,
      requires: () => hasModelLeaving,
      evidence: {
        bucket: vector?.leavingSoon?.leavingSoonBucket ?? null,
      },
    },
    {
      category: 'rare_presentation',
      labelKey: `rare_${vector?.presentation?.rareFormats?.[0] ?? vector?.presentation?.rareExperiences?.[0] ?? 'format'}`,
      score: components.presentationRarity?.score ?? 0,
      specificity: cfg.rarePresentation,
      requires: () => hasRare,
      evidence: {
        rareFormats: vector?.presentation?.rareFormats ?? [],
        premiumFormats: vector?.presentation?.premiumFormats ?? [],
        presentationShowtimeCount:
          vector?.presentation?.presentationShowtimeCount ?? null,
      },
    },
    {
      category: 'special_event',
      labelKey: vector?.event?.screeningVariantType ?? 'special_event',
      score: components.event?.score ?? 0,
      specificity: cfg.specialEvent,
      requires: () => (components.event?.score ?? 0) > 0,
      evidence: {
        screeningVariantType: vector?.event?.screeningVariantType,
        isSpecialScreening: vector?.event?.isSpecialScreening,
      },
    },
    {
      category: 'newly_announced',
      labelKey:
        noveltyClass === 'new_film_at_theater'
          ? 'newly_added_at_theater'
          : 'recent_screening',
      score: components.novelty?.score ?? 0,
      specificity:
        noveltyClass === 'distinctive_new_screening'
          ? cfg.distinctiveAnnouncement
          : noveltyClass === 'new_film_at_theater'
            ? cfg.theaterAnnouncement
            : cfg.ordinaryAnnouncement,
      requires: () =>
        (components.novelty?.score ?? 0) >= 4 &&
        noveltyClass !== 'ordinary_recent_row' &&
        noveltyClass !== 'stale',
      evidence: {
        noveltyClass,
        daysSinceScreeningFirstSeen: vector?.novelty?.daysSinceScreeningFirstSeen,
        daysSinceFilmTheaterAnnouncement:
          vector?.novelty?.daysSinceFilmTheaterAnnouncement,
      },
    },
    {
      category: 'limited_presentation',
      labelKey: 'limited_presentation',
      score: components.scarcity?.score ?? 0,
      specificity: hasSpecific
        ? cfg.limitedPresentationWithSpecific
        : cfg.limitedPresentationGeneric,
      requires: () =>
        (vector?.presentation?.presentationShowtimeCount ?? 99) <= 2 &&
        (components.scarcity?.score ?? 0) >= 4,
      evidence: {
        presentationShowtimeCount:
          vector?.presentation?.presentationShowtimeCount,
        filmWindowShowtimeCount: vector?.filmWindow?.filmWindowShowtimeCount,
      },
    },
    {
      category: 'limited_run',
      labelKey: 'limited_run_window',
      score: Math.max(
        components.urgency?.score ?? 0,
        hasSpecific ? 0 : components.scarcity?.score ?? 0,
      ),
      specificity: hasSpecific
        ? cfg.limitedRunWithSpecific
        : cfg.limitedRunGeneric,
      requires: () =>
        !hasModelLeaving &&
        ((vector?.filmWindow?.filmWindowShowtimeCount ?? 99) <= 2 ||
          vector?.filmWindow?.isFilmLastKnownScreeningInWindow),
      evidence: {
        filmWindowShowtimeCount: vector?.filmWindow?.filmWindowShowtimeCount,
        isFilmLastKnownScreeningInWindow:
          vector?.filmWindow?.isFilmLastKnownScreeningInWindow,
      },
    },
    {
      category: 'repertory_event',
      labelKey: 'repertory_evidence',
      score: components.repertory?.score ?? 0,
      specificity: cfg.repertory,
      requires: () => (components.repertory?.score ?? 0) > 0,
      evidence: {
        openingType: vector?.opening?.openingType,
        isOlderFilm: vector?.opening?.isOlderFilm,
        isRep: vector?.theater?.isRep,
      },
    },
    {
      category: 'showing_soon',
      labelKey: 'temporal_actionability',
      score: components.temporal?.score ?? 0,
      specificity: cfg.showingSoon,
      requires: () => true,
      evidence: {
        hoursUntil: vector?.temporal?.hoursUntil,
      },
    },
  ];

  const eligible = candidates
    .filter((c) => c.requires())
    .map((c) => ({
      ...c,
      salience: roundScore((c.score ?? 0) * (c.specificity ?? 1)),
    }));
  eligible.sort((a, b) => {
    if (a.salience !== b.salience) return b.salience - a.salience;
    if (a.score !== b.score) return b.score - a.score;
    return a.category < b.category ? -1 : 1;
  });
  const dominant = eligible[0] ?? {
    category: 'other',
    labelKey: 'other',
    score: 0,
    salience: 0,
    evidence: {},
  };

  const supportingReasons = eligible
    .slice(1, 4)
    .filter((c) => c.score > 0 && c.category !== dominant.category)
    .map((c) => ({
      category: c.category,
      labelKey: c.labelKey,
      score: roundScore(c.score),
      salience: c.salience,
      evidence: c.evidence,
    }));

  return {
    category: dominant.category,
    labelKey: dominant.labelKey,
    score: roundScore(dominant.score),
    salience: roundScore(dominant.salience ?? 0),
    evidence: dominant.evidence,
    supportingReasons,
  };
}

/**
 * End-to-end: HomeData → ranked Top N with full diagnostics.
 * @param {object | null | undefined} homeData
 * @param {{
 *   now?: Date | (() => Date) | string,
 *   enrichmentIndex?: object | null,
 *   weights?: typeof DEFAULT_TOP_OPPORTUNITY_WEIGHTS,
 *   topN?: number,
 * }} [options]
 */
export function buildRankedTopOpportunityCandidates(homeData, options = {}) {
  const weights = options.weights ?? DEFAULT_TOP_OPPORTUNITY_WEIGHTS;
  const topN = options.topN ?? weights.topN;
  const context = buildOpportunityFeatureContext(homeData, {
    now: options.now,
    enrichmentIndex: options.enrichmentIndex ?? null,
  });
  const vectors = buildAllOpportunityFeatureVectors(homeData, {
    now: options.now,
    enrichmentIndex: options.enrichmentIndex ?? null,
  });
  const { scored, ineligible } = rankOpportunityVectors(vectors, { weights });
  const { representatives, suppressedDuplicates } =
    selectFilmRepresentatives(scored);
  const { selected, nearMisses, diagnostics } =
    selectDiversifiedTopOpportunities(representatives, { weights, topN });

  return {
    nowSortable: context.nowSortable,
    todayIso: context.todayIso,
    weights,
    topN,
    counts: {
      vectors: vectors.length,
      eligible: scored.length,
      ineligible: ineligible.length,
      filmRepresentatives: representatives.length,
      selected: selected.length,
    },
    rawScored: scored,
    ineligible,
    filmRepresentatives: representatives,
    suppressedDuplicates,
    selected,
    nearMisses,
    diversificationDiagnostics: diagnostics,
  };
}
