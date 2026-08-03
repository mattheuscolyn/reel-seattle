/**
 * Approved OAuth redirect origins for Reel Seattle v2 (T-ACCOUNT-CLOUD-AUTH-01).
 *
 * Exact origin matching only — no subdomain wildcards, no caller-controlled
 * arbitrary destinations.
 */

export const APPROVED_OAUTH_ORIGINS = Object.freeze([
  'https://www.reelseattle.com',
  'https://reelseattle.com',
  'http://127.0.0.1:5175',
  'http://localhost:5175',
]);

export const DEFAULT_PRODUCTION_OAUTH_ORIGIN = 'https://www.reelseattle.com';

/** sessionStorage flag so OAuth return can reopen Profile/Account. */
export const AUTH_RETURN_PROFILE_STORAGE_KEY =
  'reel-seattle.v2.authReturnProfile';

/**
 * @param {string} origin
 * @returns {boolean}
 */
export function isApprovedOAuthOrigin(origin) {
  if (typeof origin !== 'string') return false;
  const normalized = origin.trim().replace(/\/$/, '');
  return APPROVED_OAUTH_ORIGINS.includes(normalized);
}

/**
 * Build the OAuth redirectTo URL for the current (or provided) origin.
 * Falls back to production www when the current origin is not approved.
 *
 * @param {{
 *   origin?: string | null,
 *   href?: string | null,
 * }} [options]
 * @returns {string}
 */
export function resolveOAuthRedirectTo(options = {}) {
  let origin = typeof options.origin === 'string' ? options.origin.trim() : '';
  if (!origin && typeof options.href === 'string' && options.href) {
    try {
      origin = new URL(options.href).origin;
    } catch {
      origin = '';
    }
  }
  if (!origin && typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  }
  origin = origin.replace(/\/$/, '');
  const approved = isApprovedOAuthOrigin(origin)
    ? origin
    : DEFAULT_PRODUCTION_OAUTH_ORIGIN;
  return `${approved}/`;
}

/**
 * Accept an explicit redirectTo only when its origin is approved.
 * @param {string | null | undefined} redirectTo
 * @returns {string | null}
 */
export function sanitizeExplicitOAuthRedirectTo(redirectTo) {
  if (typeof redirectTo !== 'string' || !redirectTo.trim()) return null;
  try {
    const url = new URL(redirectTo.trim());
    if (!isApprovedOAuthOrigin(url.origin)) return null;
    // Force path to app root — no deep-link open-redirect surface.
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

/**
 * Strip OAuth callback query/hash params from the address bar after PKCE
 * exchange. Safe no-op outside the browser.
 *
 * @param {{
 *   href?: string,
 *   replaceState?: (data: unknown, unused: string, url: string) => void,
 * }} [options]
 * @returns {string | null} cleaned href, or null when unchanged / unavailable
 */
export function cleanAuthCallbackUrl(options = {}) {
  const href =
    typeof options.href === 'string'
      ? options.href
      : typeof window !== 'undefined'
        ? window.location.href
        : '';
  if (!href) return null;

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const queryKeys = [
    'code',
    'state',
    'error',
    'error_description',
    'error_code',
  ];
  let changed = false;
  for (const key of queryKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (url.hash) {
    const hash = url.hash.replace(/^#/, '');
    if (
      /access_token=|refresh_token=|provider_token=|error=/.test(hash)
    ) {
      url.hash = '';
      changed = true;
    }
  }

  if (!changed) return null;

  const next = `${url.origin}${url.pathname}${url.search}${url.hash}`;
  const replace =
    options.replaceState ??
    (typeof window !== 'undefined'
      ? window.history.replaceState.bind(window.history)
      : null);
  try {
    replace?.(null, '', next);
  } catch {
    // History may be unavailable in some test hosts.
  }
  return next;
}

/**
 * Mark that the next successful auth return should open Profile.
 * @param {{ setItem?: (k: string, v: string) => void } | Storage | null} [storage]
 */
export function markAuthReturnToProfile(storage) {
  const store =
    storage ??
    (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  try {
    store?.setItem(AUTH_RETURN_PROFILE_STORAGE_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Consume the Profile return flag (one-shot).
 * @param {{ getItem?: Function, removeItem?: Function } | Storage | null} [storage]
 * @returns {boolean}
 */
export function consumeAuthReturnToProfile(storage) {
  const store =
    storage ??
    (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store) return false;
  try {
    const value = store.getItem(AUTH_RETURN_PROFILE_STORAGE_KEY);
    store.removeItem(AUTH_RETURN_PROFILE_STORAGE_KEY);
    return value === '1';
  } catch {
    return false;
  }
}
