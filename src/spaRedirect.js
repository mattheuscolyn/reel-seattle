/**
 * GitHub Pages SPA deep-link restoration.
 *
 * When GH Pages serves public/404.html for an unknown route, that page stores the
 * requested path and redirects to the app shell (/). Call restoreSpaRedirectPath()
 * once before React Router mounts so BrowserRouter sees the original URL.
 */

export const SPA_REDIRECT_STORAGE_KEY = 'reel-seattle-spa-redirect';

/** Read and clear a stored redirect path (for tests and app startup). */
export function consumeSpaRedirectPath(storage) {
  const store = storage ?? getSessionStorage();
  if (!store) return null;

  const path = store.getItem(SPA_REDIRECT_STORAGE_KEY);
  if (path) {
    store.removeItem(SPA_REDIRECT_STORAGE_KEY);
  }
  return path;
}

/**
 * Replace the current URL with a stored deep link, if present.
 * Safe to call before BrowserRouter initializes.
 */
export function restoreSpaRedirectPath(storage) {
  if (typeof window === 'undefined') return null;

  const path = consumeSpaRedirectPath(storage);
  if (!path || path === window.location.pathname + window.location.search + window.location.hash) {
    return path;
  }

  window.history.replaceState(null, '', path);
  return path;
}

function getSessionStorage() {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}
