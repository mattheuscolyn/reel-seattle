/**
 * Central helper for v2 `/data/...` fetch URLs.
 *
 * Uses Vite `import.meta.env.BASE_URL` so requests stay correct when the app
 * is mounted at `/` (current GitHub Pages domain-root config) or a subpath.
 *
 * @param {string} routePath Absolute app route, e.g. `/data/showtimes_current.json`
 * @param {string} [baseUrl] Override for tests; defaults to Vite BASE_URL or `/`
 * @returns {string}
 */
export function resolveV2DataUrl(routePath, baseUrl) {
  if (typeof routePath !== 'string' || !routePath.startsWith('/')) {
    throw new Error(`v2 data route must be an absolute path: ${routePath}`);
  }
  const relative = routePath.replace(/^\//, '');
  let base = baseUrl;
  if (base == null) {
    const envBase =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      typeof import.meta.env.BASE_URL === 'string'
        ? import.meta.env.BASE_URL
        : null;
    base = envBase;
  }
  if (typeof base !== 'string' || !base) base = '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${relative}`;
}
