/**
 * Resolve TMDB image URLs from enrichment artifact config + path (T-ENR-10).
 * No browser TMDB API calls; no image download.
 */

/**
 * @param {unknown} path
 * @returns {string | null}
 */
export function normalizeTmdbImagePath(path) {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.includes('://') || trimmed.includes('..')) return null;
  return trimmed;
}

/**
 * @param {{
 *   path?: unknown,
 *   url?: unknown,
 * } | null | undefined} image
 * @param {{
 *   secureBaseUrl: string,
 *   posterSize?: string,
 *   backdropSize?: string,
 * } | null | undefined} imageConfig
 * @param {'poster' | 'backdrop'} [kind]
 * @returns {string | null}
 */
export function resolveTmdbImageUrl(image, imageConfig, kind = 'poster') {
  if (!image || typeof image !== 'object') return null;
  const path = normalizeTmdbImagePath(image.path);
  if (!path) return null;

  if (!imageConfig?.secureBaseUrl) {
    const existing = typeof image.url === 'string' ? image.url.trim() : '';
    return existing.startsWith('http://') || existing.startsWith('https://')
      ? existing
      : null;
  }

  const size =
    kind === 'backdrop'
      ? imageConfig.backdropSize || 'w780'
      : imageConfig.posterSize || 'w500';
  const base = String(imageConfig.secureBaseUrl).replace(/\/+$/, '');
  return `${base}/${size}${path}`;
}
