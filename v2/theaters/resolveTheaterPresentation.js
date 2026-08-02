/**
 * Shared theater presentation resolver (T-THEA-01).
 *
 * Null-safe. Never invents visit metadata — only formats registry/HomeData
 * fields and joins showtimes for now-showing / observed formats.
 * Used by Theater List, Theater Detail, Search, and Explore.
 */

import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';
import { addIsoDays, pacificDateString } from '../explore/exploreCatalog.js';
import { resolveTheaterImagery } from './resolveTheaterImagery.js';

/** Approved Theater List Now Showing film cap. */
export const THEATER_NOW_SHOWING_LIST_LIMIT = 5;
/** Theater Detail Now Showing film cap. */
export const THEATER_NOW_SHOWING_DETAIL_LIMIT = 12;
/** Inclusive next-N-day window (today + 6 = 7 calendar days). */
export const THEATER_NOW_SHOWING_DAY_SPAN = 7;

/** @typedef {'list' | 'detail' | 'search'} TheaterPresentationContext */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function asTheaterTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
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
function asPositiveInt(value) {
  const n = asFiniteNumber(value);
  if (n == null || n < 1 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * Absolute http(s) only — never invent relative/vendor paths.
 * Prefer {@link resolveTheaterImagery} for venue photography.
 * @param {unknown} value
 * @returns {string | null}
 */
export function asAbsoluteHttpUrl(value) {
  const trimmed = asTheaterTrimmedString(value);
  if (!trimmed) return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return null;
}

/**
 * Build a single-line address from curated registry/HomeData fields.
 * Returns null when no street (or usable) address exists — do not invent.
 *
 * @param {object | null | undefined} theater
 * @returns {string | null}
 */
export function formatTheaterAddressLabel(theater) {
  if (!theater || typeof theater !== 'object') return null;

  const line1 =
    asTheaterTrimmedString(theater.addressLine1) ??
    asTheaterTrimmedString(theater.address_line1);
  const line2 =
    asTheaterTrimmedString(theater.addressLine2) ??
    asTheaterTrimmedString(theater.address_line2);
  const city = asTheaterTrimmedString(theater.city);
  const state =
    asTheaterTrimmedString(theater.state) ?? asTheaterTrimmedString(theater.region);
  const postal =
    asTheaterTrimmedString(theater.postalCode) ??
    asTheaterTrimmedString(theater.postal_code);

  const street = [line1, line2].filter(Boolean).join(', ');
  const locality = [city, state].filter(Boolean).join(', ');
  const cityStateZip = [locality, postal].filter(Boolean).join(' ');

  if (street && cityStateZip) return `${street}, ${cityStateZip}`;
  if (street) return street;
  // Without a street line, neighborhood · city is not an "address" — leave null.
  return null;
}

/**
 * Prefer curated directions_url; otherwise derive from address or lat/lng.
 * Derivation is not invention — it only encodes known coordinates/address.
 *
 * @param {object | null | undefined} theater
 * @returns {string | null}
 */
export function resolveTheaterDirectionsUrl(theater) {
  if (!theater || typeof theater !== 'object') return null;
  const curated =
    asAbsoluteHttpUrl(theater.directionsUrl) ??
    asAbsoluteHttpUrl(theater.directions_url);
  if (curated) return curated;

  const lat =
    asFiniteNumber(theater.latitude) ?? asFiniteNumber(theater.lat);
  const lng =
    asFiniteNumber(theater.longitude) ?? asFiniteNumber(theater.lng);
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const address = formatTheaterAddressLabel(theater);
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return null;
}

/**
 * @param {object | null | undefined} theater
 * @returns {string | null}
 */
export function formatTheaterScreensLabel(theater) {
  const count =
    asPositiveInt(theater?.screenCount) ??
    asPositiveInt(theater?.screen_count);
  if (count == null) return null;
  return count === 1 ? '1 screen' : `${count} screens`;
}

/**
 * Durable curated capabilities first; otherwise observed showtime format labels.
 *
 * @param {object | null | undefined} theater
 * @param {object | null | undefined} homeData
 * @returns {string | null}
 */
export function formatTheaterFormatsLabel(theater, homeData = null) {
  const capabilities = asStringList(
    theater?.capabilities ?? theater?.capabilityLabels,
  );
  if (capabilities.length > 0) {
    return capabilities
      .map((c) => formatUserFacingFormatLabel(c) ?? c)
      .filter(Boolean)
      .join(', ');
  }

  const theaterId = asTheaterTrimmedString(theater?.id);
  if (!theaterId || !homeData) return null;

  const labels = new Set();
  for (const opp of Array.isArray(homeData.opportunities)
    ? homeData.opportunities
    : []) {
    if (opp?.theaterId !== theaterId) continue;
    for (const raw of Array.isArray(opp.formatLabels) ? opp.formatLabels : []) {
      const label = formatUserFacingFormatLabel(raw);
      if (label) labels.add(label);
    }
  }
  if (labels.size === 0) return null;
  return [...labels].sort((a, b) => a.localeCompare(b)).join(', ');
}

/**
 * Distinct films at this theater from HomeData opportunities.
 * Window: next seven local calendar days (today inclusive).
 * Dedupes by canonical filmId when present; otherwise by filmKey.
 *
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} theaterId
 * @param {{ limit?: number, now?: Date, daySpan?: number }} [options]
 * @returns {Array<{ filmKey: string, filmId: string | null, title: string, detailLabel: string | null, posterUrl: string | null, formatLabel: string | null, opportunityKey: string | null }>}
 */
export function buildTheaterNowShowing(homeData, theaterId, options = {}) {
  const id = asTheaterTrimmedString(theaterId);
  if (!id || !homeData) return [];

  const limit =
    typeof options.limit === 'number' && options.limit > 0
      ? options.limit
      : THEATER_NOW_SHOWING_LIST_LIMIT;
  const daySpan =
    typeof options.daySpan === 'number' && options.daySpan > 0
      ? options.daySpan
      : THEATER_NOW_SHOWING_DAY_SPAN;
  const today = pacificDateString(options.now ?? new Date());
  const windowEnd = addIsoDays(today, daySpan - 1);

  /** @type {Map<string, object>} */
  const filmsByKey = new Map(
    (Array.isArray(homeData.films) ? homeData.films : []).map((film) => [
      film.filmKey,
      film,
    ]),
  );

  /**
   * @type {Map<string, { filmKey: string, filmId: string | null, title: string, detailLabel: string | null, posterUrl: string | null, formatLabel: string | null, opportunityKey: string | null, sortKey: string }>}
   */
  const byIdentity = new Map();

  for (const opp of Array.isArray(homeData.opportunities)
    ? homeData.opportunities
    : []) {
    if (opp?.theaterId !== id) continue;
    const localDate = asTheaterTrimmedString(opp.localDate);
    if (!localDate || localDate < today || localDate > windowEnd) continue;

    const filmKey = asTheaterTrimmedString(opp.filmKey);
    if (!filmKey) continue;
    const film = filmsByKey.get(filmKey);
    const filmId =
      asTheaterTrimmedString(film?.filmId) ??
      asTheaterTrimmedString(opp.filmId);
    const identityKey = filmId ? `id:${filmId}` : `key:${filmKey}`;

    const sortKey =
      asTheaterTrimmedString(opp.sortableLocalDateTime) ??
      `${localDate}${asTheaterTrimmedString(opp.localTime) ?? ''}`;
    const existing = byIdentity.get(identityKey);
    if (existing && existing.sortKey <= sortKey) continue;

    const formatLabel =
      (Array.isArray(opp.formatLabels) ? opp.formatLabels : [])
        .map(formatUserFacingFormatLabel)
        .find(Boolean) ?? null;

    byIdentity.set(identityKey, {
      filmKey,
      filmId,
      title:
        asTheaterTrimmedString(film?.title) ??
        asTheaterTrimmedString(opp.title) ??
        filmKey,
      detailLabel: formatLocalDateLabel(localDate),
      posterUrl:
        asAbsoluteHttpUrl(film?.posterUrl) ??
        asAbsoluteHttpUrl(film?.poster_url) ??
        null,
      formatLabel,
      opportunityKey: asTheaterTrimmedString(opp.opportunityKey),
      sortKey: sortKey || filmKey,
    });
  }

  return [...byIdentity.values()]
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
    .slice(0, limit)
    .map(({ sortKey: _s, ...row }) => row);
}

/**
 * Map amenity label → icon key used by Theater Detail surface.
 * @param {string} label
 */
function amenityIconForLabel(label) {
  const lower = label.toLowerCase();
  if (lower.includes('access')) return 'accessibility';
  if (lower.includes('beer') || lower.includes('wine') || lower.includes('bar')) {
    return 'wine';
  }
  if (lower.includes('restroom') || lower.includes('gender')) return 'people';
  if (lower.includes('air') || lower.includes('ac')) return 'wind';
  return 'popcorn';
}

/**
 * @param {object | null | undefined} theater
 * @returns {Array<{ id: string, icon: string, label: string }>}
 */
export function buildTheaterAmenityItems(theater) {
  return asStringList(theater?.amenities).map((label, index) => ({
    id: `amenity-${index}-${label.toLowerCase().replace(/\s+/g, '-')}`,
    icon: amenityIconForLabel(label),
    label,
  }));
}

/**
 * Stats from curated screen_count / capabilities only (no invented seats).
 * @param {object | null | undefined} theater
 * @returns {Array<{ id: string, icon: string, value: string, label: string }>}
 */
export function buildTheaterStats(theater) {
  /** @type {Array<{ id: string, icon: string, value: string, label: string }>} */
  const stats = [];
  const screens =
    asPositiveInt(theater?.screenCount) ??
    asPositiveInt(theater?.screen_count);
  if (screens != null) {
    stats.push({
      id: 'screens',
      icon: 'monitor',
      value: String(screens),
      label: 'SCREENS',
    });
  }
  for (const raw of asStringList(theater?.capabilities)) {
    const value = formatUserFacingFormatLabel(raw) ?? raw;
    const id = `cap-${value.toLowerCase().replace(/\s+/g, '-')}`;
    stats.push({
      id,
      icon: /35|70|film/i.test(value) ? 'film' : 'projector',
      value,
      label: /35|70|film/i.test(value) ? 'FILM CAPABLE' : 'PROJECTION',
    });
  }
  return stats;
}

/**
 * Shared theater presentation for list / detail / search cards.
 *
 * @param {{
 *   theater: object | null | undefined,
 *   homeData?: object | null,
 *   context?: TheaterPresentationContext,
 *   isFavorite?: boolean,
 * }} params
 */
export function resolveTheaterPresentation({
  theater,
  homeData = null,
  context = 'list',
  isFavorite = false,
}) {
  const safeContext =
    context === 'detail' || context === 'search' || context === 'list'
      ? context
      : 'list';

  if (!theater || typeof theater !== 'object') {
    return {
      id: null,
      name: 'Unknown theater',
      addressLabel: null,
      neighborhood: null,
      city: null,
      metaLabel: null,
      websiteUrl: null,
      directionsUrl: null,
      description: null,
      imageUrl: null,
      heroImageUrl: null,
      thumbnailUrl: null,
      imageAttribution: null,
      imageLicense: null,
      screensLabel: null,
      formatsLabel: null,
      nowShowing: [],
      amenities: [],
      capabilities: [],
      stats: [],
      favorite: Boolean(isFavorite),
      opportunityCount: 0,
      sectionsVisible: {
        address: false,
        website: false,
        directions: false,
        description: false,
        image: false,
        screens: false,
        formats: false,
        nowShowing: false,
        amenities: false,
        stats: false,
        pricingHours: false,
      },
      context: safeContext,
      source: 'empty',
    };
  }

  const id = asTheaterTrimmedString(theater.id);
  const name =
    asTheaterTrimmedString(theater.name) ??
    id ??
    'Unknown theater';
  const neighborhood = asTheaterTrimmedString(theater.neighborhood);
  const city = asTheaterTrimmedString(theater.city);
  const addressLabel = formatTheaterAddressLabel(theater);
  const websiteUrl =
    asAbsoluteHttpUrl(theater.websiteUrl) ??
    asAbsoluteHttpUrl(theater.website_url);
  const directionsUrl = resolveTheaterDirectionsUrl(theater);
  const description =
    asTheaterTrimmedString(theater.shortDescription) ??
    asTheaterTrimmedString(theater.short_description) ??
    asTheaterTrimmedString(theater.description);
  const imagery = resolveTheaterImagery(theater);
  const imageUrl = imagery.thumbnailUrl ?? imagery.heroUrl;
  const heroImageUrl = imagery.heroUrl;
  const thumbnailUrl = imagery.thumbnailUrl;
  const imageAttribution = imagery.attribution;
  const imageLicense = imagery.license;
  const screensLabel = formatTheaterScreensLabel(theater);
  const formatsLabel = formatTheaterFormatsLabel(theater, homeData);
  const amenities = buildTheaterAmenityItems(theater);
  const capabilities = asStringList(theater.capabilities);
  const stats = buildTheaterStats(theater);
  const opportunityCount =
    typeof theater.opportunityCount === 'number' &&
    Number.isFinite(theater.opportunityCount)
      ? theater.opportunityCount
      : 0;

  const nowShowing =
    safeContext === 'search'
      ? []
      : buildTheaterNowShowing(homeData, id, {
          limit:
            safeContext === 'detail'
              ? THEATER_NOW_SHOWING_DETAIL_LIMIT
              : THEATER_NOW_SHOWING_LIST_LIMIT,
        });

  const metaParts =
    safeContext === 'search'
      ? [neighborhood, city].filter(Boolean)
      : [addressLabel, neighborhood].filter(Boolean);
  const metaLabel =
    metaParts.length > 0
      ? metaParts.join(' · ')
      : neighborhood && city
        ? `${neighborhood} · ${city}`
        : neighborhood ?? city ?? null;

  return {
    id,
    name,
    addressLabel,
    neighborhood,
    city,
    metaLabel,
    websiteUrl,
    directionsUrl,
    description,
    imageUrl,
    heroImageUrl,
    thumbnailUrl,
    imageAttribution,
    imageLicense,
    screensLabel,
    formatsLabel,
    nowShowing,
    amenities,
    capabilities,
    stats,
    favorite: Boolean(isFavorite),
    opportunityCount,
    sectionsVisible: {
      address: Boolean(addressLabel),
      website: Boolean(websiteUrl),
      directions: Boolean(directionsUrl),
      description: Boolean(description),
      image: imagery.hasImage,
      screens: Boolean(screensLabel),
      formats: Boolean(formatsLabel),
      nowShowing: nowShowing.length > 0,
      amenities: amenities.length > 0,
      stats: stats.length > 0,
      // Pricing & hours deferred (D06 / T-THEA-40/41) — never invent.
      pricingHours: false,
    },
    context: safeContext,
    source: 'home-data',
  };
}
