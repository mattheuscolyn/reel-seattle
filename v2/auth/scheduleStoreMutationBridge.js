/**
 * Mutation bridge: accepted-plans store → schedule sync client.
 */

/**
 * @typedef {{
 *   mutatedAt: string,
 *   source?: string | null,
 * }} ScheduleStoreMutationEvent
 */

/** @type {Set<(event: ScheduleStoreMutationEvent) => void>} */
const listeners = new Set();
let suppressDepth = 0;

/**
 * @param {(event: ScheduleStoreMutationEvent) => void} listener
 * @returns {() => void}
 */
export function subscribeScheduleStoreMutations(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {ScheduleStoreMutationEvent} event
 */
export function notifyScheduleStoreMutation(event) {
  if (suppressDepth > 0) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // never break local writes
    }
  }
}

/**
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function suppressScheduleStoreMutationNotifications(fn) {
  suppressDepth += 1;
  try {
    return fn();
  } finally {
    suppressDepth -= 1;
  }
}

/** @internal */
export function resetScheduleStoreMutationBridgeForTests() {
  listeners.clear();
  suppressDepth = 0;
}
