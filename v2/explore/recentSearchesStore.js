/**
 * Device-local recent Explore searches.
 * Not synced to Profile / accounts.
 */

export const RECENT_SEARCHES_STORAGE_KEY = 'reel-seattle.v2.recentSearches';
export const RECENT_SEARCHES_MAX = 6;

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeRecentSearches(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= RECENT_SEARCHES_MAX) break;
  }
  return out;
}

/**
 * @param {string} query
 * @param {string[]} existing
 */
export function addRecentSearch(query, existing) {
  if (typeof query !== 'string') return normalizeRecentSearches(existing);
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) return normalizeRecentSearches(existing);
  const key = trimmed.toLowerCase();
  const rest = normalizeRecentSearches(existing).filter(
    (item) => item.toLowerCase() !== key,
  );
  return [trimmed, ...rest].slice(0, RECENT_SEARCHES_MAX);
}

/**
 * @param {string} query
 * @param {string[]} existing
 */
export function removeRecentSearch(query, existing) {
  const key = String(query ?? '')
    .trim()
    .toLowerCase();
  return normalizeRecentSearches(existing).filter(
    (item) => item.toLowerCase() !== key,
  );
}

/**
 * @param {Storage | null | undefined} storage
 */
export function loadRecentSearches(storage) {
  try {
    if (!storage) return [];
    const raw = storage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    return normalizeRecentSearches(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string[]} searches
 */
export function saveRecentSearches(storage, searches) {
  try {
    if (!storage) return false;
    storage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(normalizeRecentSearches(searches)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearRecentSearches(storage) {
  try {
    if (!storage) return false;
    storage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
