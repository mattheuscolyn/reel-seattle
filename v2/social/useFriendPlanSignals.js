import { useEffect, useState } from 'react';
import { listFriendPlanSignalsRemote } from '../sharedPlans/sharedPlansApi.js';

/**
 * Non-blocking friend plan signals. Empty until loaded; never blocks the host surface.
 * @param {{ filmKey?: string | null, friendId?: string | null, enabled?: boolean }} input
 */
export function useFriendPlanSignals(input) {
  const filmKey = typeof input?.filmKey === 'string' ? input.filmKey.trim() : '';
  const friendId = typeof input?.friendId === 'string' ? input.friendId.trim() : '';
  const enabled = input?.enabled !== false && Boolean(filmKey || friendId);
  const [signals, setSignals] = useState(
    /** @type {import('./socialPlanContext.js').normalizeFriendPlanSignal extends Function ? NonNullable<ReturnType<import('./socialPlanContext.js').normalizeFriendPlanSignal>>[] : never[]} */ (
      []
    ),
  );

  useEffect(() => {
    if (!enabled) {
      setSignals([]);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const result = await listFriendPlanSignalsRemote({
        filmKey: filmKey || null,
        friendId: friendId || null,
      });
      if (cancelled) return;
      setSignals(result.ok ? result.signals : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, filmKey, friendId]);

  return signals;
}
