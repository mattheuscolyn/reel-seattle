/**
 * React binding for discovery visibility prefs + grace revision.
 * Loads preferences once per render via store getters (not per-card).
 */

import { useEffect, useState } from 'react';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import {
  getVisibilityPreferences,
  subscribeVisibilityPreferences,
} from '../stores/visibilityPreferencesStore.js';
import { subscribeRecentSeen } from '../stores/recentSeenStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {{
 *   storage: Storage | null,
 *   preferences: { hideNotInterested: boolean, hideSeen: boolean },
 *   revision: number,
 * }}
 */
export function useDiscoveryVisibility(storage = getBrowserStorage()) {
  const [revision, setRevision] = useState(0);
  const [preferences, setPreferences] = useState(() =>
    getVisibilityPreferences(storage),
  );

  useEffect(() => {
    const bump = () => {
      setPreferences(getVisibilityPreferences(storage));
      setRevision((n) => n + 1);
    };
    const unsubPrefs = subscribeVisibilityPreferences(bump);
    const unsubGrace = subscribeRecentSeen(bump);
    const unsubFilms = subscribeFilmStoreMutations(bump);
    return () => {
      unsubPrefs();
      unsubGrace();
      unsubFilms();
    };
  }, [storage]);

  return { storage, preferences, revision };
}
