/**
 * Screening / presentation–grain feature extraction for Top Opportunities.
 *
 * Architecture (this module = feature extraction only):
 *   eligibility inputs → feature extraction → (future) scoring → diversification → reason
 *
 * No final score. No Top-N selection. No diversification. No user-facing reason strings.
 *
 * Grain: one vector per real screening/opportunity. Do not collapse by film first.
 */

import {
  addIsoDays,
  isoWeekday,
  pacificDateString,
  resolveWeekendRange,
} from '../explore/exploreCatalog.js';
import {
  CANONICAL_BROWSE_LABEL,
  classifyFormatLabel,
} from '../formatsExperiences/formatNormalize.js';
import { isIsoDate, isLocalTime } from '../adapters/opportunityIdentity.js';
import {
  isNonFilmEventClassification,
  normalizeContentClassification,
} from '../adapters/contentClassification.js';
import {
  opportunitySortableKey,
  pacificSortableDateTime,
  parseLocalTimeMinutes,
} from '../showtimes/showtimeEligibility.js';

/** @typedef {import('../formatsExperiences/formatNormalize.js').FormatCanonicalId} FormatCanonicalId */
/** @typedef {import('../formatsExperiences/formatNormalize.js').ExperienceCanonicalId} ExperienceCanonicalId */

/** Rare / high-signal presentation formats. */
export const RARE_FORMAT_IDS = Object.freeze([
  'imax-70mm',
  '70mm',
  '35mm',
]);

/** Rare experience treated as presentation rarity (not accessibility). */
export const RARE_EXPERIENCE_IDS = Object.freeze(['live-score']);

/** Premium but less rare formats. */
export const PREMIUM_FORMAT_IDS = Object.freeze([
  'imax',
  'dolby-cinema',
  'xl-amc',
  'reald-3d',
]);

/** Accessibility experiences — never inflate rare/premium. */
export const ACCESSIBILITY_EXPERIENCE_IDS = Object.freeze([
  'open-caption',
  'audio-description',
]);

/** Raw a11y tags that may not map through experience aliases. */
const RAW_CLOSED_CAPTION_SLUGS = Object.freeze([
  'closed-caption',
  'closed-captions',
  'cc',
]);

/** Minutes until show below which opportunity is “too imminent” to plan. */
export const TOO_IMMINENT_MINUTES = 90;

/** Screening first-seen within this many calendar days → recently observed. */
export const RECENT_SCREENING_FIRST_SEEN_DAYS = 7;

/** Evening starts at this local hour (inclusive). */
export const EVENING_START_HOUR = 17;

/** Prime-time local hour range [start, endExclusive). */
export const PRIME_TIME_START_HOUR = 17;
export const PRIME_TIME_END_HOUR = 22;

/** Film age (years) at/above which `isOlderFilm` is true. */
export const OLDER_FILM_YEARS = 20;

/** Variant types treated as event-ish for presentation identity + atoms. */
export const EVENT_VARIANT_TYPES = Object.freeze([
  'anniversary',
  'fan_event',
  'special_event',
  'early_access',
  'holiday_re_release',
  'anniversary_re_release',
  'classic_revival',
  'double_feature',
  'live_encore',
  'concert_live_encore',
  'opening_night',
  'sensory_friendly',
  'anime_special_engagement',
  'awards_season_limited',
  'special_limited_run',
]);

const RARE_FORMAT_SET = new Set(RARE_FORMAT_IDS);
const RARE_EXPERIENCE_SET = new Set(RARE_EXPERIENCE_IDS);
const PREMIUM_FORMAT_SET = new Set(PREMIUM_FORMAT_IDS);
const ACCESSIBILITY_SET = new Set(ACCESSIBILITY_EXPERIENCE_IDS);
const EVENT_VARIANT_SET = new Set(EVENT_VARIANT_TYPES);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asNonNegInt(value) {
  const n = asFiniteNumber(value);
  if (n == null) return null;
  const i = Math.trunc(n);
  return i >= 0 ? i : null;
}

/**
 * @template T
 * @param {Iterable<T>} values
 * @param {(a: T, b: T) => number} [compare]
 * @returns {T[]}
 */
function sortedUnique(values, compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
  return [...new Set(values)].sort(compare);
}

/**
 * Wall-clock Pacific sortable → epoch ms via UTC components (diff-safe).
 * @param {string} sortable `YYYY-MM-DDTHH:MM`
 * @returns {number | null}
 */
export function localSortableToUtcMs(sortable) {
  if (typeof sortable !== 'string') return null;
  const match = sortable
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const hh = Number(match[4]);
  const mm = Number(match[5]);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  return Date.UTC(y, m - 1, d, hh, mm);
}

/**
 * Whole calendar days between two YYYY-MM-DD strings (b - a).
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number | null}
 */
export function calendarDaysBetween(fromIso, toIso) {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso)) return null;
  const [ay, am, ad] = fromIso.split('-').map(Number);
  const [by, bm, bd] = toIso.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

/**
 * @param {Date | (() => Date) | string | null | undefined} now
 * @returns {Date}
 */
function resolveNowDate(now) {
  if (typeof now === 'function') return now();
  if (now instanceof Date && Number.isFinite(now.getTime())) return now;
  if (typeof now === 'string' && now.trim()) {
    const parsed = new Date(now);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Whether an opportunity contributes to window scarcity aggregates.
 *
 * Universe = remaining, identity-valid screenings at known theaters.
 * Excludes: missing identity/datetime, canceled, past (sortable &lt; now),
 * unknown theater name, and sold_out (not treated as a remaining bookable
 * opportunity). Sold-out is a hard exclusion for counts only — vectors are
 * still built for those rows so eligibility can surface status.
 *
 * @param {object} opportunity
 * @param {string} nowSortable `YYYY-MM-DDTHH:MM` Pacific wall clock
 * @returns {boolean}
 */
export function isCountableScarcityOpportunity(opportunity, nowSortable) {
  const filmKey = asTrimmedString(opportunity?.filmKey);
  const theaterId = asTrimmedString(opportunity?.theaterId);
  const theaterName = asTrimmedString(opportunity?.theaterName);
  const sortable = opportunitySortableKey(opportunity);
  if (!filmKey || !theaterId || !sortable) return false;
  if (!theaterName || theaterName.toLowerCase() === 'unknown theater') {
    return false;
  }
  const status = asTrimmedString(opportunity?.status)?.toLowerCase() ?? '';
  if (status === 'canceled' || status === 'sold_out') return false;
  if (
    typeof nowSortable === 'string' &&
    nowSortable.length >= 16 &&
    sortable < nowSortable
  ) {
    return false;
  }
  return true;
}

/**
 * Classify raw format tags into rare / premium / accessibility / other.
 * @param {unknown} formatLabels
 * @param {{ exhibitorHint?: string | null }} [opts]
 */
export function classifyPresentationFormats(formatLabels, opts = {}) {
  const raw = Array.isArray(formatLabels) ? formatLabels : [];
  /** @type {FormatCanonicalId[]} */
  const rareFormats = [];
  /** @type {FormatCanonicalId[]} */
  const premiumFormats = [];
  /** @type {ExperienceCanonicalId[]} */
  const accessibilityExperiences = [];
  /** @type {ExperienceCanonicalId[]} */
  const rareExperiences = [];
  let hasClosedCaption = false;

  for (const label of raw) {
    const slug =
      typeof label === 'string'
        ? label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';
    if (RAW_CLOSED_CAPTION_SLUGS.includes(slug)) {
      hasClosedCaption = true;
    }

    const { formatId, experienceId } = classifyFormatLabel(label, opts);
    if (formatId && RARE_FORMAT_SET.has(formatId)) {
      rareFormats.push(formatId);
    } else if (formatId && PREMIUM_FORMAT_SET.has(formatId)) {
      premiumFormats.push(formatId);
    }

    if (experienceId && RARE_EXPERIENCE_SET.has(experienceId)) {
      rareExperiences.push(experienceId);
    } else if (experienceId && ACCESSIBILITY_SET.has(experienceId)) {
      accessibilityExperiences.push(experienceId);
    }
  }

  const rare = sortedUnique(rareFormats);
  const premium = sortedUnique(premiumFormats);
  const accessibility = sortedUnique(accessibilityExperiences);
  const rareExp = sortedUnique(rareExperiences);

  return {
    rareFormats: rare,
    premiumFormats: premium,
    rareExperiences: rareExp,
    accessibilityExperiences: accessibility,
    hasRareFormat: rare.length > 0 || rareExp.length > 0,
    hasPremiumFormat: premium.length > 0,
    hasOpenCaption: accessibility.includes('open-caption'),
    hasAudioDescription: accessibility.includes('audio-description'),
    hasClosedCaption,
    /** Presentation-defining ids (rare formats + rare experiences + premium). */
    presentationFormatIds: sortedUnique([...rare, ...rareExp, ...premium]),
  };
}

/**
 * Stable presentation identity for scarcity grouping.
 * Accessibility-only tags do not create a distinct presentation.
 *
 * @param {{
 *   filmKey: string,
 *   rareFormats: string[],
 *   premiumFormats: string[],
 *   rareExperiences: string[],
 *   screeningVariantType?: string | null,
 *   isSpecialScreening?: boolean,
 * }} parts
 * @returns {string}
 */
export function buildPresentationIdentityKey(parts) {
  const filmKey = asTrimmedString(parts.filmKey) || 'unknown-film';
  const fmt = sortedUnique([
    ...(parts.rareFormats ?? []),
    ...(parts.rareExperiences ?? []),
    ...(parts.premiumFormats ?? []),
  ]);
  if (fmt.length > 0) {
    return `${filmKey}|fmt:${fmt.join('+')}`;
  }

  const variant = asTrimmedString(parts.screeningVariantType);
  if (variant && variant !== 'none' && EVENT_VARIANT_SET.has(variant)) {
    return `${filmKey}|var:${variant}`;
  }
  if (parts.isSpecialScreening === true) {
    return `${filmKey}|var:special`;
  }
  return `${filmKey}|std`;
}

/**
 * @param {object} screening
 * @param {{ exhibitorHint?: string | null }} [opts]
 */
export function resolveScreeningPresentation(screening, opts = {}) {
  const filmKey = asTrimmedString(screening?.filmKey) ?? '';
  const classified = classifyPresentationFormats(screening?.formatLabels, {
    exhibitorHint:
      opts.exhibitorHint ??
      asTrimmedString(screening?.theaterName) ??
      null,
  });
  const variant = asTrimmedString(screening?.screeningVariantType);
  const isSpecial = screening?.isSpecialScreening === true;
  const presentationKey = buildPresentationIdentityKey({
    filmKey,
    rareFormats: classified.rareFormats,
    premiumFormats: classified.premiumFormats,
    rareExperiences: classified.rareExperiences,
    screeningVariantType: variant,
    isSpecialScreening: isSpecial,
  });
  return { ...classified, presentationKey, screeningVariantType: variant };
}

/**
 * @param {string | null | undefined} variant
 */
export function variantFlags(variant) {
  const v = asTrimmedString(variant);
  return {
    screeningVariantType: v,
    isAnniversary: v === 'anniversary' || v === 'anniversary_re_release',
    isFanEvent: v === 'fan_event',
    isSpecialEvent: v === 'special_event',
    isEarlyAccess: v === 'early_access',
    isHolidayRerelease: v === 'holiday_re_release',
    isClassicRevival: v === 'classic_revival',
    isDoubleFeature: v === 'double_feature',
    isLiveEncore: v === 'live_encore' || v === 'concert_live_encore',
    isOpeningNight: v === 'opening_night',
    isSensoryFriendly: v === 'sensory_friendly',
    isEventVariant: Boolean(v && v !== 'none' && EVENT_VARIANT_SET.has(v)),
  };
}

/**
 * @param {Date | (() => Date) | string} now
 * @param {string} localDate
 * @param {string} localTime
 * @param {string | null} sortable
 */
export function buildTemporalFeatures(now, localDate, localTime, sortable) {
  const nowDate = resolveNowDate(now);
  const nowSortable = pacificSortableDateTime(nowDate);
  const todayIso = pacificDateString(nowDate);
  const tomorrowIso = addIsoDays(todayIso, 1);
  const weekend = resolveWeekendRange(todayIso);

  const screeningSortable =
    sortable && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(sortable)
      ? sortable.slice(0, 16)
      : isIsoDate(localDate) && isLocalTime(localTime)
        ? `${localDate}T${localTime.slice(0, 5)}`
        : null;

  const nowMs = localSortableToUtcMs(nowSortable);
  const showMs = screeningSortable
    ? localSortableToUtcMs(screeningSortable)
    : null;

  let hoursUntil = null;
  let minutesUntil = null;
  if (nowMs != null && showMs != null) {
    minutesUntil = Math.round((showMs - nowMs) / 60_000);
    hoursUntil = Math.round(((showMs - nowMs) / 3_600_000) * 100) / 100;
  }

  const daysUntil =
    isIsoDate(localDate) && isIsoDate(todayIso)
      ? calendarDaysBetween(todayIso, localDate)
      : null;

  const mins = parseLocalTimeMinutes(localTime);
  const hour = mins != null ? Math.floor(mins / 60) : null;

  const isToday = isIsoDate(localDate) && localDate === todayIso;
  const isTomorrow = isIsoDate(localDate) && localDate === tomorrowIso;
  const dow = isIsoDate(localDate) ? isoWeekday(localDate) : null;
  const isWeekend = dow === 5 || dow === 6 || dow === 0;
  const isCurrentWeekend =
    isIsoDate(localDate) &&
    localDate >= weekend.start &&
    localDate <= weekend.end;
  const isEvening = hour != null ? hour >= EVENING_START_HOUR : false;
  const isPrimeTime =
    hour != null
      ? hour >= PRIME_TIME_START_HOUR && hour < PRIME_TIME_END_HOUR
      : false;
  const isPast =
    minutesUntil != null ? minutesUntil < 0 : screeningSortable != null
      ? screeningSortable < nowSortable
      : false;
  const isTooImminent =
    minutesUntil != null &&
    minutesUntil >= 0 &&
    minutesUntil < TOO_IMMINENT_MINUTES;
  const isTonight = isToday && isEvening && !isPast;

  return {
    nowSortableLocalDateTime: nowSortable,
    todayIso,
    hoursUntil,
    minutesUntil,
    daysUntil,
    isToday,
    isTonight,
    isTomorrow,
    isWeekend,
    isCurrentWeekend,
    isEvening,
    isPrimeTime,
    isTooImminent,
    isPast,
  };
}

/**
 * @param {object | null | undefined} homeData
 * @param {{
 *   now?: Date | (() => Date) | string,
 *   enrichmentIndex?: { byFilmId?: Map<string, object> } | null,
 *   newlyAddedPairs?: object[] | null,
 *   userContext?: object | null,
 * }} [options]
 */
export function buildOpportunityFeatureContext(homeData, options = {}) {
  const now = options.now ?? new Date();
  const nowDate = resolveNowDate(now);
  const nowSortable = pacificSortableDateTime(nowDate);
  const todayIso = pacificDateString(nowDate);
  const timezone =
    asTrimmedString(homeData?.timezone) ?? 'America/Los_Angeles';

  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const theatersById =
    homeData?.theatersById && typeof homeData.theatersById === 'object'
      ? homeData.theatersById
      : {};

  const filmsByKey = new Map();
  for (const film of films) {
    const key = asTrimmedString(film?.filmKey);
    if (key) filmsByKey.set(key, film);
  }

  /** @type {Map<string, { count: number, theaters: Set<string>, dates: Set<string>, firstAt: string | null, lastAt: string | null }>} */
  const filmAgg = new Map();
  /** @type {Map<string, { count: number, theaters: Set<string>, dates: Set<string>, firstAt: string | null, lastAt: string | null }>} */
  const presentationAgg = new Map();
  /** @type {Map<string, string>} */
  const presentationKeyByOpportunity = new Map();

  let enabledTheaterCount = 0;
  for (const theater of Object.values(theatersById)) {
    if (theater?.enabled !== false) enabledTheaterCount += 1;
  }
  if (enabledTheaterCount === 0) {
    enabledTheaterCount = Object.keys(theatersById).length;
  }

  for (const opp of opportunities) {
    const filmKey = asTrimmedString(opp?.filmKey);
    const sortable = opportunitySortableKey(opp);
    if (!filmKey || !sortable) continue;

    const presentation = resolveScreeningPresentation(opp);
    const pKey = presentation.presentationKey;
    if (asTrimmedString(opp?.opportunityKey)) {
      presentationKeyByOpportunity.set(opp.opportunityKey, pKey);
    }

    // Scarcity aggregates use remaining countable universe only.
    if (!isCountableScarcityOpportunity(opp, nowSortable)) continue;

    let f = filmAgg.get(filmKey);
    if (!f) {
      f = {
        count: 0,
        theaters: new Set(),
        dates: new Set(),
        firstAt: null,
        lastAt: null,
      };
      filmAgg.set(filmKey, f);
    }
    f.count += 1;
    if (asTrimmedString(opp.theaterId)) f.theaters.add(opp.theaterId);
    if (isIsoDate(opp.localDate)) f.dates.add(opp.localDate);
    if (!f.firstAt || sortable < f.firstAt) f.firstAt = sortable;
    if (!f.lastAt || sortable > f.lastAt) f.lastAt = sortable;

    let p = presentationAgg.get(pKey);
    if (!p) {
      p = {
        count: 0,
        theaters: new Set(),
        dates: new Set(),
        firstAt: null,
        lastAt: null,
      };
      presentationAgg.set(pKey, p);
    }
    p.count += 1;
    if (asTrimmedString(opp.theaterId)) p.theaters.add(opp.theaterId);
    if (isIsoDate(opp.localDate)) p.dates.add(opp.localDate);
    if (!p.firstAt || sortable < p.firstAt) p.firstAt = sortable;
    if (!p.lastAt || sortable > p.lastAt) p.lastAt = sortable;
  }

  /** @type {Map<string, object>} */
  const leavingByFilmKey = new Map();
  const leavingSoon = homeData?.leavingSoon;
  const leavingEntries = Array.isArray(leavingSoon?.entries)
    ? leavingSoon.entries
    : [];
  for (const entry of leavingEntries) {
    const key = asTrimmedString(entry?.filmKey);
    if (key && !leavingByFilmKey.has(key)) leavingByFilmKey.set(key, entry);
  }
  const leavingSoonModelAvailable =
    leavingSoon?.status === 'ready' || leavingEntries.length > 0;
  const leavingSoonCoverageNote =
    asTrimmedString(leavingSoon?.reason) ??
    (leavingSoonModelAvailable
      ? 'amc_model_buckets_available'
      : 'leaving_soon_unavailable');

  /** @type {Map<string, object>} */
  const openingByFilmKey = new Map();
  /** @type {Map<string, object>} */
  const openingByParentKey = new Map();
  const opening = homeData?.openingThisWeek;
  const openingEntries = Array.isArray(opening?.entries) ? opening.entries : [];
  const openingWeek = opening?.week ?? null;
  for (const entry of openingEntries) {
    const key = asTrimmedString(entry?.showtimeFilmKey ?? entry?.filmKey);
    const parent = asTrimmedString(entry?.parentFilmKey);
    if (key) openingByFilmKey.set(key, entry);
    if (parent && !openingByParentKey.has(parent)) {
      openingByParentKey.set(parent, entry);
    }
  }

  /** @type {Map<string, { firstAnnouncedDate: string | null, lastSeenDate: string | null }>} */
  const newlyAddedPairMap = new Map();
  const pairsFromHome = Array.isArray(homeData?.newlyAddedPairs)
    ? homeData.newlyAddedPairs
    : [];
  const pairsFromOptions = Array.isArray(options.newlyAddedPairs)
    ? options.newlyAddedPairs
    : [];
  for (const pair of [...pairsFromHome, ...pairsFromOptions]) {
    const filmKey = asTrimmedString(pair?.filmKey ?? pair?.showtime_film_key);
    const theaterId = asTrimmedString(pair?.theaterId ?? pair?.theater_id);
    if (!filmKey || !theaterId) continue;
    const mapKey = `${filmKey}|${theaterId}`;
    if (newlyAddedPairMap.has(mapKey)) continue;
    newlyAddedPairMap.set(mapKey, {
      firstAnnouncedDate: asTrimmedString(
        pair?.firstAnnouncedDate ?? pair?.first_announced_date,
      ),
      lastSeenDate: asTrimmedString(pair?.lastSeenDate ?? pair?.last_seen_date),
    });
  }

  /** Film-level newly-added fallback when pairs absent. */
  /** @type {Map<string, { firstObservedAt: string | null }>} */
  const newlyAddedByFilm = new Map();
  for (const item of Array.isArray(homeData?.newlyAdded)
    ? homeData.newlyAdded
    : []) {
    const key = asTrimmedString(item?.filmKey);
    if (!key) continue;
    newlyAddedByFilm.set(key, {
      firstObservedAt: asTrimmedString(item?.firstObservedAt),
    });
  }

  const enrichmentIndex = options.enrichmentIndex ?? null;

  return {
    timezone,
    nowDate,
    nowSortable,
    todayIso,
    filmsByKey,
    theatersById,
    enabledTheaterCount,
    filmAgg,
    presentationAgg,
    presentationKeyByOpportunity,
    leavingByFilmKey,
    leavingSoonModelAvailable:
      leavingSoon?.status === 'ready' || leavingEntries.length > 0,
    leavingSoonCoverageNote,
    openingByFilmKey,
    openingByParentKey,
    openingWeek,
    newlyAddedPairMap,
    newlyAddedByFilm,
    enrichmentIndex,
    /** Reserved for future personalization; unused by extraction today. */
    userContext: options.userContext ?? null,
    opportunities,
  };
}

/**
 * @param {object} screening
 * @param {ReturnType<typeof buildOpportunityFeatureContext>} context
 */
export function buildOpportunityFeatureVector(screening, context) {
  const opportunityKey = asTrimmedString(screening?.opportunityKey);
  const filmKey = asTrimmedString(screening?.filmKey);
  const theaterId = asTrimmedString(screening?.theaterId);
  const theaterName = asTrimmedString(screening?.theaterName);
  const localDate = asTrimmedString(screening?.localDate);
  const localTime = asTrimmedString(screening?.localTime)?.slice(0, 5) ?? null;
  const sortable =
    opportunitySortableKey(screening) ??
    (localDate && localTime ? `${localDate}T${localTime}` : null);

  const film = filmKey ? context.filmsByKey.get(filmKey) ?? null : null;
  const parentFilmKey =
    asTrimmedString(screening?.parentFilmKey) ??
    asTrimmedString(film?.parentFilmKey);
  const filmId =
    asTrimmedString(screening?.filmId) ?? asTrimmedString(film?.filmId);
  const title =
    asTrimmedString(screening?.title) ??
    asTrimmedString(film?.title) ??
    asTrimmedString(screening?.filmTitle);

  const theaterMeta = theaterId ? context.theatersById[theaterId] ?? null : null;
  const theaterType = asTrimmedString(theaterMeta?.type);
  const resolvedTheaterName =
    theaterName ?? asTrimmedString(theaterMeta?.name) ?? null;

  const status = asTrimmedString(screening?.status);
  const isCanceled =
    status != null && status.toLowerCase() === 'canceled';
  const temporal = buildTemporalFeatures(
    context.nowDate,
    localDate ?? '',
    localTime ?? '',
    sortable,
  );

  const presentation = resolveScreeningPresentation(screening, {
    exhibitorHint: resolvedTheaterName,
  });
  const events = variantFlags(
    asTrimmedString(screening?.screeningVariantType) ??
      asTrimmedString(film?.screeningVariantType),
  );
  const isSpecialScreening =
    screening?.isSpecialScreening === true ||
    film?.isSpecialScreening === true;
  const contentClassification = normalizeContentClassification(
    screening?.contentClassification ??
      screening?.content_classification ??
      film?.contentClassification ??
      film?.content_classification,
  );
  const isNonFilmEvent = isNonFilmEventClassification(contentClassification);

  const filmStats = filmKey ? context.filmAgg.get(filmKey) : null;
  const filmWindowShowtimeCount = filmStats?.count ?? 0;
  const filmWindowTheaterCount = filmStats?.theaters.size ?? 0;
  const filmWindowDaysWithShowtimes = filmStats?.dates.size ?? 0;
  const filmWindowFirstScreeningAt = filmStats?.firstAt ?? null;
  const filmWindowLastScreeningAt = filmStats?.lastAt ?? null;
  const isFilmLastKnownScreeningInWindow =
    Boolean(sortable) &&
    Boolean(filmWindowLastScreeningAt) &&
    sortable === filmWindowLastScreeningAt;
  const isFilmOneScreening = filmWindowShowtimeCount === 1;
  const isFilmLimitedListings = filmWindowShowtimeCount > 0 && filmWindowShowtimeCount <= 2;
  const isFilmOneTheater = filmWindowTheaterCount === 1;
  const filmTheaterShareOfTracked =
    context.enabledTheaterCount > 0 && filmWindowTheaterCount > 0
      ? Math.round(
          (filmWindowTheaterCount / context.enabledTheaterCount) * 1000,
        ) / 1000
      : null;

  const pKey = presentation.presentationKey;
  const pStats = context.presentationAgg.get(pKey) ?? null;
  const presentationShowtimeCount = pStats?.count ?? 0;
  const presentationTheaterCount = pStats?.theaters.size ?? 0;
  const presentationDaysWithShowtimes = pStats?.dates.size ?? 0;
  const presentationFirstScreeningAt = pStats?.firstAt ?? null;
  const presentationLastScreeningAt = pStats?.lastAt ?? null;
  const isUniquePresentation = presentationShowtimeCount === 1;
  const isPresentationLastKnownInWindow =
    Boolean(sortable) &&
    Boolean(presentationLastScreeningAt) &&
    sortable === presentationLastScreeningAt;
  const isRareRelativeToFilm =
    presentation.hasRareFormat ||
    (presentation.hasPremiumFormat &&
      filmWindowShowtimeCount > presentationShowtimeCount &&
      presentationShowtimeCount > 0 &&
      presentationShowtimeCount / filmWindowShowtimeCount <= 0.35);

  // Novelty — film×theater
  const pairKey =
    filmKey && theaterId ? `${filmKey}|${theaterId}` : null;
  const pair = pairKey ? context.newlyAddedPairMap.get(pairKey) ?? null : null;
  const filmNewly = filmKey
    ? context.newlyAddedByFilm.get(filmKey) ?? null
    : null;
  const firstAnnouncedDate = pair?.firstAnnouncedDate ?? null;
  const isNewlyAddedAtTheater = Boolean(pair);
  const daysSinceFilmTheaterAnnouncement = firstAnnouncedDate
    ? calendarDaysBetween(firstAnnouncedDate, context.todayIso)
    : null;
  const isNewlyAddedFilm = Boolean(filmNewly) || isNewlyAddedAtTheater;

  // Screening-level novelty
  const screeningFirstSeenAt = asTrimmedString(
    screening?.firstSeenAt ?? screening?.first_seen_at,
  );
  const daysSinceScreeningFirstSeen = screeningFirstSeenAt
    ? calendarDaysBetween(screeningFirstSeenAt, context.todayIso)
    : null;
  const isRecentlyObservedScreening =
    daysSinceScreeningFirstSeen != null &&
    daysSinceScreeningFirstSeen >= 0 &&
    daysSinceScreeningFirstSeen <= RECENT_SCREENING_FIRST_SEEN_DAYS;

  // Leaving soon
  const leaving = filmKey
    ? context.leavingByFilmKey.get(filmKey) ??
      (parentFilmKey
        ? context.leavingByFilmKey.get(parentFilmKey) ?? null
        : null)
    : null;
  const leavingSoonBucket = asTrimmedString(leaving?.bucket) ?? null;
  const leavingSoonRiskLevel = asTrimmedString(leaving?.riskLevel) ?? null;
  const leavingSoonMaxShowDate = asTrimmedString(leaving?.maxShowDate) ?? null;
  // Proxy only — model max date is not a guaranteed final theatrical day.
  const daysUntilLeavingSoonMaxShowDate = leavingSoonMaxShowDate
    ? calendarDaysBetween(context.todayIso, leavingSoonMaxShowDate)
    : null;
  const hasLeavingSoonModelSignal = Boolean(leaving);

  // Opening
  const opening =
    (filmKey ? context.openingByFilmKey.get(filmKey) : null) ??
    (parentFilmKey ? context.openingByParentKey.get(parentFilmKey) : null) ??
    (parentFilmKey ? context.openingByFilmKey.get(parentFilmKey) : null) ??
    null;
  const openingType = asTrimmedString(opening?.openingType) ?? null;
  const openingDate = asTrimmedString(opening?.openingDate) ?? null;
  const engagementDays = asNonNegInt(opening?.engagementDays);
  const historicalScreeningCount = asNonNegInt(
    opening?.historicalScreeningCount,
  );
  let isOpeningThisWeek = false;
  if (openingDate && context.openingWeek) {
    const start = asTrimmedString(context.openingWeek.start_date ?? context.openingWeek.startDate);
    const end = asTrimmedString(context.openingWeek.end_date ?? context.openingWeek.endDate);
    if (start && end) {
      isOpeningThisWeek = openingDate >= start && openingDate <= end;
    }
  } else if (opening) {
    isOpeningThisWeek = true;
  }

  // Enrichment
  let releaseYear = null;
  let releaseDate = null;
  let filmAgeYears = null;
  if (filmId && context.enrichmentIndex?.byFilmId) {
    const row = context.enrichmentIndex.byFilmId.get(filmId) ?? null;
    if (row) {
      releaseYear = asNonNegInt(row.release_year);
      releaseDate = asTrimmedString(row.release_date);
      if (releaseYear != null) {
        const currentYear = Number(context.todayIso.slice(0, 4));
        if (Number.isFinite(currentYear)) {
          filmAgeYears = Math.max(0, currentYear - releaseYear);
        }
      }
    }
  }
  const isOlderFilm =
    filmAgeYears != null ? filmAgeYears >= OLDER_FILM_YEARS : false;

  const isChain = theaterType === 'chain';
  const isIndie = theaterType === 'indie';
  const isRep = theaterType === 'rep';
  const isFestival = theaterType === 'festival';

  const formatLabels = sortedUnique(
    (presentation.rareFormats.length
      ? presentation.rareFormats
      : []
    )
      .concat(presentation.premiumFormats)
      .concat(presentation.rareExperiences)
      .map((id) => CANONICAL_BROWSE_LABEL[id] ?? id),
  );

  const reasonAtoms = {
    rareFormats: [...presentation.rareFormats],
    premiumFormats: [...presentation.premiumFormats],
    rareExperiences: [...presentation.rareExperiences],
    accessibilityExperiences: [...presentation.accessibilityExperiences],
    eventTypes: events.isEventVariant
      ? sortedUnique([events.screeningVariantType].filter(Boolean))
      : [],
    isSpecialScreening,
    isLeavingSoon: leavingSoonBucket === 'leaving_soon',
    isLastChanceBucket: leavingSoonBucket === 'last_chance',
    hasLeavingSoonModelSignal,
    isNewScreening: isRecentlyObservedScreening,
    isNewAtTheater: isNewlyAddedAtTheater,
    isNewlyAddedFilm,
    presentationShowtimeCount,
    filmWindowShowtimeCount,
    isUniquePresentation,
    isRareRelativeToFilm,
    openingType,
    isOpeningThisWeek,
    isOlderFilm,
    isRepVenue: isRep,
    theaterType,
  };

  const eligibilityInputs = {
    hasOpportunityKey: Boolean(opportunityKey),
    hasFilmKey: Boolean(filmKey),
    hasFilmIdentity: Boolean(filmKey || filmId),
    hasTheaterId: Boolean(theaterId),
    hasTheaterName: Boolean(resolvedTheaterName),
    theaterNameIsUnknown:
      Boolean(resolvedTheaterName) &&
      resolvedTheaterName.toLowerCase() === 'unknown theater',
    hasValidLocalDate: Boolean(localDate && isIsoDate(localDate)),
    hasValidLocalTime: Boolean(localTime && isLocalTime(localTime)),
    hasSortableLocalDateTime: Boolean(sortable),
    status,
    isCanceled,
    isPast: temporal.isPast,
    isSoldOut: status != null && status.toLowerCase() === 'sold_out',
    hasCurrentOpportunity: Boolean(opportunityKey && sortable && !isCanceled),
    contentClassification,
    isNonFilmEvent,
  };

  return {
    schemaVersion: 1,
    identifiers: {
      opportunityKey,
      filmKey,
      parentFilmKey,
      filmId,
      title,
      theaterId,
      theaterName: resolvedTheaterName,
      localDate,
      localTime,
      sortableLocalDateTime: sortable,
      presentationKey: pKey,
      source: asTrimmedString(screening?.source),
      sourceShowtimeId: asTrimmedString(screening?.sourceShowtimeId),
    },
    eligibilityInputs,
    temporal,
    filmWindow: {
      filmWindowShowtimeCount,
      filmWindowTheaterCount,
      filmWindowDaysWithShowtimes,
      filmWindowFirstScreeningAt,
      filmWindowLastScreeningAt,
      isFilmLastKnownScreeningInWindow,
      isFilmOneScreening,
      isFilmLimitedListings,
      isFilmOneTheater,
      filmTheaterShareOfTracked,
    },
    presentation: {
      presentationKey: pKey,
      presentationShowtimeCount,
      presentationTheaterCount,
      presentationDaysWithShowtimes,
      presentationFirstScreeningAt,
      presentationLastScreeningAt,
      isUniquePresentation,
      isPresentationLastKnownInWindow,
      isRareRelativeToFilm,
      rareFormats: presentation.rareFormats,
      premiumFormats: presentation.premiumFormats,
      rareExperiences: presentation.rareExperiences,
      accessibilityExperiences: presentation.accessibilityExperiences,
      hasRareFormat: presentation.hasRareFormat,
      hasPremiumFormat: presentation.hasPremiumFormat,
      hasOpenCaption: presentation.hasOpenCaption,
      hasAudioDescription: presentation.hasAudioDescription,
      hasClosedCaption: presentation.hasClosedCaption,
      canonicalFormatLabels: formatLabels,
    },
    event: {
      isSpecialScreening,
      ...events,
    },
    novelty: {
      isNewlyAddedAtTheater,
      isNewlyAddedFilm,
      firstAnnouncedDate,
      daysSinceFilmTheaterAnnouncement,
      screeningFirstSeenAt,
      daysSinceScreeningFirstSeen,
      isRecentlyObservedScreening,
      recentFirstSeenDaysThreshold: RECENT_SCREENING_FIRST_SEEN_DAYS,
    },
    leavingSoon: {
      hasLeavingSoonModelSignal,
      leavingSoonModelAvailable: context.leavingSoonModelAvailable,
      leavingSoonCoverageNote: context.leavingSoonCoverageNote,
      leavingSoonBucket,
      leavingSoonRiskLevel,
      leavingSoonMaxShowDate,
      daysUntilLeavingSoonMaxShowDate,
    },
    opening: {
      openingType,
      openingDate,
      isOpeningThisWeek,
      engagementDays,
      historicalScreeningCount,
      releaseYear,
      releaseDate,
      filmAgeYears,
      isOlderFilm,
    },
    theater: {
      theaterId,
      theaterName: resolvedTheaterName,
      theaterType,
      isChain,
      isIndie,
      isRep,
      isFestival,
    },
    reasonAtoms,
    /** Reserved; extraction ignores personalization today. */
    user: context.userContext
      ? { attached: true, unused: true }
      : { attached: false, unused: true },
  };
}

/**
 * Convenience: vectors for every opportunity in HomeData (no film collapse).
 * @param {object | null | undefined} homeData
 * @param {Parameters<typeof buildOpportunityFeatureContext>[1]} [options]
 */
export function buildAllOpportunityFeatureVectors(homeData, options = {}) {
  const context = buildOpportunityFeatureContext(homeData, options);
  return context.opportunities.map((opp) =>
    buildOpportunityFeatureVector(opp, context),
  );
}
