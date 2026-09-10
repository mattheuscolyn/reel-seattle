import { useEffect } from 'react';

/**
 * Lock document body scroll while a shelf-detail sort/filter menu is open.
 * Matches sheet chrome elsewhere in v2 (FriendsSheet, ShowtimeActionSheet).
 *
 * @param {boolean} locked
 */
export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}
