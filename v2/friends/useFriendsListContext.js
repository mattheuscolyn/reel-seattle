import { useEffect, useState } from 'react';
import { listFriendsListContext } from './friendsListContextApi.js';

/**
 * Loads list context once per signed-in viewer. Empty until that single read finishes.
 * @param {boolean} enabled
 */
export function useFriendsListContext(enabled) {
  const [status, setStatus] = useState(/** @type {'idle' | 'loading' | 'ready' | 'error'} */ ('idle'));
  const [friends, setFriends] = useState(
    /** @type {import('./friendsListContextModel.js').normalizeFriendsListContext extends Function ? ReturnType<import('./friendsListContextModel.js').normalizeFriendsListContext> : never[]} */ (
      []
    ),
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      setFriends([]);
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    void (async () => {
      const result = await listFriendsListContext();
      if (cancelled) return;
      if (!result.ok) {
        setFriends([]);
        setStatus('error');
        return;
      }
      setFriends(result.friends);
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  return {
    status,
    friends,
    refresh: () => setReloadKey((value) => value + 1),
  };
}
