/**
 * Shared theater imagery resolver (WS-TIMG).
 *
 * Accepts only:
 * - absolute http(s) URLs (curated CDN / absolute public URLs)
 * - repository-managed paths under allowlisted `/theater-images/` prefixes
 *
 * Never scrapes. Never invents venue photography. Invalid refs → null
 * so List/Detail can fall back to designed placeholders (no broken images).
 */

/** Allowlisted site-relative roots for rights-cleared, repo-staged assets. */
export const THEATER_IMAGE_REPO_PREFIXES = Object.freeze([
  '/theater-images/',
]);

/**
 * @returns {{
 *   heroUrl: null,
 *   thumbnailUrl: null,
 *   attribution: null,
 *   license: null,
 *   hasImage: false,
 * }}
 */
export function emptyTheaterImagery() {
  return {
    heroUrl: null,
    thumbnailUrl: null,
    attribution: null,
    license: null,
    hasImage: false,
  };
}

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
 * Normalize a theater image ref to a safe display URL, or null.
 * Rejects traversal, data/blob/javascript schemes, and non-allowlisted relative paths.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeTheaterImageRef(value) {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:')
  ) {
    return null;
  }

  if (trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch {
      return null;
    }
  }

  // Protocol-relative URLs are ambiguous — reject.
  if (trimmed.startsWith('//')) return null;

  // Site-relative repo assets only under allowlisted prefixes.
  if (trimmed.startsWith('/')) {
    const allowed = THEATER_IMAGE_REPO_PREFIXES.some((prefix) =>
      trimmed.startsWith(prefix),
    );
    return allowed ? trimmed : null;
  }

  return null;
}

/**
 * Resolve optional hero + thumbnail + attribution/license from a theater record.
 *
 * Field precedence:
 * - hero: image_hero_url → image_url (shared fallback)
 * - thumbnail: image_thumbnail_url → image_url → hero
 *
 * @param {object | null | undefined} theater
 * @returns {{
 *   heroUrl: string | null,
 *   thumbnailUrl: string | null,
 *   attribution: string | null,
 *   license: string | null,
 *   hasImage: boolean,
 * }}
 */
export function resolveTheaterImagery(theater) {
  if (!theater || typeof theater !== 'object') {
    return emptyTheaterImagery();
  }

  // Hero prefers dedicated hero fields, then shared image_url.
  const heroUrl =
    normalizeTheaterImageRef(theater.imageHeroUrl) ??
    normalizeTheaterImageRef(theater.image_hero_url) ??
    normalizeTheaterImageRef(theater.imageUrl) ??
    normalizeTheaterImageRef(theater.image_url);

  const thumbnailUrl =
    normalizeTheaterImageRef(theater.imageThumbnailUrl) ??
    normalizeTheaterImageRef(theater.image_thumbnail_url) ??
    normalizeTheaterImageRef(theater.imageUrl) ??
    normalizeTheaterImageRef(theater.image_url) ??
    heroUrl;

  const attribution =
    asTrimmedString(theater.imageAttribution) ??
    asTrimmedString(theater.image_attribution);
  const license =
    asTrimmedString(theater.imageLicense) ??
    asTrimmedString(theater.image_license);

  const hasImage = Boolean(heroUrl || thumbnailUrl);

  // Attribution/license alone never count as imagery.
  if (!hasImage) {
    return emptyTheaterImagery();
  }

  return {
    heroUrl: heroUrl ?? thumbnailUrl,
    thumbnailUrl: thumbnailUrl ?? heroUrl,
    attribution: attribution ?? null,
    license: license ?? null,
    hasImage: true,
  };
}

/**
 * Back-compat single URL (list thumb preference).
 * @param {object | null | undefined} theater
 * @returns {string | null}
 */
export function resolveTheaterImageUrl(theater) {
  const imagery = resolveTheaterImagery(theater);
  return imagery.thumbnailUrl ?? imagery.heroUrl;
}
