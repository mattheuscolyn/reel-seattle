/**
 * Narrow mutation bridge from local film stores → sync client.
 * Applying cloud pulls must run under suppress to avoid write loops.
 */

/**
 * @typedef {{
 *   preferenceType: 'saved' | 'seen' | 'not_interested',
 *   mutatedAt: string,
 *   source?: string | null,
 * }} FilmStoreMutationEvent
 */

/** @type {Set<(event: FilmStoreMutationEvent) => void>} */
const listeners = new Set();
let suppressDepth = 0;

/**
 * @param {(event: FilmStoreMutationEvent) => void} listener
 * @returns {() => void}
 */
export function subscribeFilmStoreMutations(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {FilmStoreMutationEvent} event
 */
export function notifyFilmStoreMutation(event) {
  if (suppressDepth > 0) return;
  if (!event || !event.preferenceType) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Sync failures must never break local store writes.
    }
  }
}

/**
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function suppressFilmStoreMutationNotifications(fn) {
  suppressDepth += 1;
  try {
    return fn();
  } finally {
    suppressDepth -= 1;
  }
}

/**
 * @returns {boolean}
 */
export function areFilmStoreMutationNotificationsSuppressed() {
  return suppressDepth > 0;
}

/** @internal */
export function resetFilmStoreMutationBridgeForTests() {
  listeners.clear();
  suppressDepth = 0;
}
