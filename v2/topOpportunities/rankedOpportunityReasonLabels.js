/**
 * User-facing reason labels for ranked Top Opportunity selections.
 *
 * Presentation only — scoring/eligibility never import this module.
 * Codes stay stable; labels may change later without retuning weights.
 */

const RARE_FORMAT_PRIORITY = Object.freeze(['imax-70mm', '70mm', '35mm']);
const LIVE_SCORE_ID = 'live-score';

const EVENT_VARIANT_LABELS = Object.freeze({
  early_access: 'Early access',
  anniversary: 'Anniversary screening',
  double_feature: 'Double feature',
  live_encore: 'Live encore',
  concert_live_encore: 'Live encore',
  fan_event: 'Fan event',
});

const CATEGORY_FALLBACK_LABELS = Object.freeze({
  leaving_soon: 'Leaving soon',
  rare_presentation: 'Rare presentation',
  special_event: 'Special event',
  newly_announced: 'Newly announced',
  limited_presentation: 'Limited presentations',
  limited_run: 'Limited run',
  repertory_event: 'Repertory screening',
  showing_soon: 'Showing soon',
  other: 'Showing soon',
});

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asTrimmed(item))
    .filter((item) => item != null);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

/**
 * @param {object | null | undefined} reason
 * @param {object | null | undefined} vector
 */
function rareEvidence(reason, vector) {
  const evidence = reason?.evidence ?? {};
  const formats = asStringArray(
    evidence.rareFormats ?? vector?.presentation?.rareFormats,
  );
  const experiences = asStringArray(
    evidence.rareExperiences ?? vector?.presentation?.rareExperiences,
  );
  return { formats, experiences };
}

/**
 * Stable subtype key for a ranked reason. Independent of wording.
 *
 * @param {object | null | undefined} reason
 * @param {object | null | undefined} [vector]
 * @returns {string}
 */
export function rankedReasonLabelKey(reason, vector) {
  const category = asTrimmed(reason?.category) ?? 'other';
  const evidence = reason?.evidence ?? {};

  if (category === 'leaving_soon') {
    const bucket =
      asTrimmed(evidence.bucket) ??
      asTrimmed(vector?.leavingSoon?.leavingSoonBucket);
    return bucket === 'last_chance' ? 'last_chance' : 'leaving_soon';
  }

  if (category === 'rare_presentation') {
    const { formats, experiences } = rareEvidence(reason, vector);
    for (const formatId of RARE_FORMAT_PRIORITY) {
      if (formats.includes(formatId)) {
        return formatId === 'imax-70mm' ? 'rare_imax_70mm' : `rare_${formatId}`;
      }
    }
    if (experiences.includes(LIVE_SCORE_ID) || formats.includes(LIVE_SCORE_ID)) {
      return 'live_score_presentation';
    }
    const fromKey = asTrimmed(reason?.labelKey);
    if (fromKey === 'rare_imax-70mm' || fromKey === 'rare_imax_70mm') {
      return 'rare_imax_70mm';
    }
    if (fromKey === 'rare_70mm' || fromKey === 'rare_35mm') return fromKey;
    if (fromKey === 'rare_live-score') return 'live_score_presentation';
    return 'rare_presentation';
  }

  if (category === 'special_event') {
    const variant =
      asTrimmed(evidence.screeningVariantType) ??
      asTrimmed(vector?.event?.screeningVariantType) ??
      asTrimmed(reason?.labelKey);
    if (variant && EVENT_VARIANT_LABELS[variant]) return variant;
    return 'special_event';
  }

  if (category === 'newly_announced') return 'newly_announced';

  if (category === 'limited_presentation') {
    const count =
      asCount(evidence.presentationShowtimeCount) ??
      asCount(vector?.presentation?.presentationShowtimeCount);
    return count === 1 ? 'one_screening' : 'limited_presentations';
  }

  if (category === 'limited_run') {
    const count =
      asCount(evidence.filmWindowShowtimeCount) ??
      asCount(vector?.filmWindow?.filmWindowShowtimeCount);
    return count === 1 ? 'one_screening' : 'limited_run';
  }

  if (category === 'repertory_event') return 'repertory_screening';
  if (category === 'showing_soon') return 'showing_soon';
  return category === 'other' ? 'showing_soon' : category;
}

/**
 * Concise user-facing label from structured subtype evidence.
 *
 * @param {object | null | undefined} reason
 * @param {object | null | undefined} [vector]
 * @returns {string}
 */
export function rankedReasonLabel(reason, vector) {
  const category = asTrimmed(reason?.category) ?? 'other';
  const key = rankedReasonLabelKey(reason, vector);
  if (key === 'last_chance') return 'Last chance';
  if (key === 'leaving_soon') return 'Leaving soon';
  if (key === 'rare_imax_70mm') return 'Rare IMAX 70mm presentation';
  if (key === 'rare_70mm') return 'Rare 70mm presentation';
  if (key === 'rare_35mm') return 'Rare 35mm presentation';
  if (key === 'live_score_presentation') return 'Live score presentation';
  if (key === 'rare_presentation') return 'Rare presentation';
  if (key === 'early_access') return EVENT_VARIANT_LABELS.early_access;
  if (key === 'anniversary') return EVENT_VARIANT_LABELS.anniversary;
  if (key === 'double_feature') return EVENT_VARIANT_LABELS.double_feature;
  if (key === 'live_encore' || key === 'concert_live_encore') {
    return EVENT_VARIANT_LABELS.live_encore;
  }
  if (key === 'fan_event') return EVENT_VARIANT_LABELS.fan_event;
  if (key === 'special_event') return 'Special event';
  if (key === 'newly_announced') return 'Newly announced';
  if (key === 'one_screening') return 'One screening';
  if (key === 'limited_presentations') return 'Limited presentations';
  if (key === 'limited_run') return 'Limited run';
  if (key === 'repertory_screening') return 'Repertory screening';
  if (key === 'showing_soon') return 'Showing soon';
  return CATEGORY_FALLBACK_LABELS[category] ?? CATEGORY_FALLBACK_LABELS.other;
}

/**
 * @param {object | null | undefined} reason
 * @param {object | null | undefined} [vector]
 * @returns {{
 *   code: string,
 *   labelKey: string,
 *   label: string,
 * }}
 */
export function presentRankedOpportunityReason(reason, vector) {
  const code = asTrimmed(reason?.category) ?? 'other';
  return {
    code,
    labelKey: rankedReasonLabelKey(reason, vector),
    label: rankedReasonLabel(reason, vector),
  };
}

/**
 * Supporting reasons with labels, salience order preserved, dominant omitted.
 *
 * @param {object | null | undefined} dominantReason
 * @param {object | null | undefined} [vector]
 * @returns {{ code: string, labelKey: string, label: string }[]}
 */
export function presentSupportingRankedReasons(dominantReason, vector) {
  const dominantCode = asTrimmed(dominantReason?.category);
  const seen = new Set(dominantCode ? [dominantCode] : []);
  const raw = Array.isArray(dominantReason?.supportingReasons)
    ? dominantReason.supportingReasons
    : [];
  /** @type {{ code: string, labelKey: string, label: string }[]} */
  const out = [];
  for (const item of raw) {
    const presented = presentRankedOpportunityReason(item, vector);
    if (seen.has(presented.code)) continue;
    seen.add(presented.code);
    out.push(presented);
  }
  return out;
}
