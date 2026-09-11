/**
 * Resolve whether a listing-variant showtime should aggregate under its parent
 * film key for HomeData film cards.
 *
 * Reuses pipeline `parent_film_key` + `screening_variant_type` — does not invent
 * a second title-normalization system. Conservative: prefer a visible duplicate
 * over an incorrect merge.
 */

/** Screening qualifiers safe to collapse to the parent film identity. */
export const SAFE_SCREENING_QUALIFIER_VARIANTS = Object.freeze([
  'early_access',
  'sensory_friendly',
  'opening_night',
  'fan_event',
  'format_variant',
]);

/** Variants that must remain distinct film entities. */
export const NON_MERGE_SCREENING_VARIANTS = Object.freeze([
  'double_feature',
]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asCanonicalFilmId(value) {
  const trimmed = asTrimmed(value);
  if (!trimmed) return null;
  if (!/^tmdb:[1-9][0-9]*$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @param {string | null | undefined} variantType
 * @returns {boolean}
 */
export function isSafeScreeningQualifierVariant(variantType) {
  const key = asTrimmed(variantType)?.toLowerCase() ?? '';
  return SAFE_SCREENING_QUALIFIER_VARIANTS.includes(key);
}

/**
 * @param {string | null | undefined} variantType
 * @returns {boolean}
 */
export function isNonMergeScreeningVariant(variantType) {
  const key = asTrimmed(variantType)?.toLowerCase() ?? '';
  return NON_MERGE_SCREENING_VARIANTS.includes(key);
}

/**
 * @param {{
 *   showtimeFilmKey: string,
 *   parentFilmKey?: string | null,
 *   screeningVariantType?: string | null,
 *   listingFilmId?: string | null,
 *   parentListingFilmId?: string | null,
 * }} input
 * @returns {{
 *   filmKey: string,
 *   merged: boolean,
 *   blockedReason: string | null,
 * }}
 */
export function resolveCanonicalFilmKey(input) {
  const showtimeFilmKey = asTrimmed(input?.showtimeFilmKey);
  if (!showtimeFilmKey) {
    return { filmKey: '', merged: false, blockedReason: 'missing_showtime_film_key' };
  }

  const parentFilmKey = asTrimmed(input?.parentFilmKey);
  const variantType = asTrimmed(input?.screeningVariantType)?.toLowerCase() ?? null;
  const listingFilmId = asCanonicalFilmId(input?.listingFilmId);
  const parentListingFilmId = asCanonicalFilmId(input?.parentListingFilmId);

  if (!parentFilmKey || parentFilmKey === showtimeFilmKey) {
    return { filmKey: showtimeFilmKey, merged: false, blockedReason: null };
  }

  if (isNonMergeScreeningVariant(variantType)) {
    return {
      filmKey: showtimeFilmKey,
      merged: false,
      blockedReason: 'non_merge_variant',
    };
  }

  // Allowlist only — prefer a visible duplicate over an incorrect merge.
  // Do not use a broad is_special_screening bypass (anniversary / live / etc.).
  if (!isSafeScreeningQualifierVariant(variantType)) {
    return {
      filmKey: showtimeFilmKey,
      merged: false,
      blockedReason: 'variant_not_safe_to_merge',
    };
  }

  // Confirmed TMDB conflict: never silently override.
  if (
    listingFilmId &&
    parentListingFilmId &&
    listingFilmId !== parentListingFilmId
  ) {
    return {
      filmKey: showtimeFilmKey,
      merged: false,
      blockedReason: 'tmdb_conflict',
    };
  }

  return { filmKey: parentFilmKey, merged: true, blockedReason: null };
}
