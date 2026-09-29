import { startTransition, useEffect, useState } from 'react';

/**
 * Shell-first destination reveal.
 *
 * The first render for `destinationKey` is the lightweight shell (`false`).
 * After that shell has a chance to paint, a transition reveals expensive
 * content (`true`). Changing the key returns to the shell on that render.
 *
 * Navigation state itself must stay urgent. Do not wrap `setNav` in this
 * transition. Destinations call this before film derivation or large lists.
 *
 * @param {string} destinationKey
 * @returns {boolean}
 */
export function useDestinationReveal(destinationKey) {
  const [revealedKey, setRevealedKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      startTransition(() => {
        if (!cancelled) setRevealedKey(destinationKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [destinationKey]);

  return revealedKey === destinationKey;
}

/**
 * Grow a large list after the destination shell has painted.
 * The first revealed render shows `initial` items; later frames add `step`.
 * `resetKey` (filters, query, sort) starts over at `initial`.
 * `revealAll` renders the full list immediately for scroll restoration.
 *
 * @param {number} total
 * @param {{
 *   initial?: number,
 *   step?: number,
 *   resetKey?: string,
 *   revealAll?: boolean,
 * }} [options]
 * @returns {number}
 */
export function useProgressiveCount(total, options = {}) {
  const initial = options.initial ?? 16;
  const step = options.step ?? 48;
  const resetKey = options.resetKey ?? '';
  const revealAll = options.revealAll === true;
  const [count, setCount] = useState(initial);
  const [seenResetKey, setSeenResetKey] = useState(resetKey);

  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setCount(initial);
  }

  useEffect(() => {
    if (total <= 0) return undefined;
    if (revealAll) {
      if (count < total) setCount(total);
      return undefined;
    }
    if (count >= total) return undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      startTransition(() => {
        if (!cancelled) {
          setCount((current) => Math.min(total, current + step));
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [count, total, step, revealAll]);

  if (total <= 0) return 0;
  if (revealAll) return total;
  return Math.min(count, total);
}
