import { useEffect, useMemo, useState } from 'react';
import { useFriends } from './useFriends.js';
import { listFriendActivityForFilm } from './friendFilmActivityApi.js';
import {
  buildFromYourFriendsPresentation,
  getFriendActivityForFilm,
} from './friendFilmActivityModel.js';
import { filmPreferenceKeyFromRef } from '../auth/filmPreferenceIdentity.js';
import { normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';
import { resolveFilmUserStateIdentity } from '../filmState/filmUserStateModel.js';

/**
 * Load + project "From your friends" for Film Detail.
 *
 * @param {{
 *   filmKey?: string | null,
 *   filmId?: string | null,
 *   filmRef?: object | null,
 * }} [input]
 */
export function useFriendActivityForFilm(input = {}) {
  const { friends, signedIn, status: friendsStatus } = useFriends();
  const [rows, setRows] = useState(/** @type {unknown[]} */ ([]));
  const [loadStatus, setLoadStatus] = useState('idle');

  const preferenceKey = useMemo(() => {
    if (input.filmRef) {
      const identity = resolveFilmUserStateIdentity(input.filmRef);
      if (identity?.filmKey) return identity.filmKey;
    }
    const ref = normalizeSavedFilmRef({
      filmId: input.filmId ?? null,
      showtimeFilmKey: input.filmKey ?? null,
    });
    if (ref) {
      const key = filmPreferenceKeyFromRef(ref);
      if (key) return key;
    }
    if (typeof input.filmKey === 'string' && input.filmKey.trim()) {
      return input.filmKey.trim();
    }
    if (typeof input.filmId === 'string' && input.filmId.trim()) {
      return input.filmId.trim();
    }
    return null;
  }, [input.filmKey, input.filmId, input.filmRef]);

  useEffect(() => {
    if (!signedIn || !preferenceKey) {
      setRows([]);
      setLoadStatus('idle');
      return undefined;
    }
    let cancelled = false;
    setLoadStatus('loading');
    void (async () => {
      const result = await listFriendActivityForFilm(preferenceKey);
      if (cancelled) return;
      if (!result.ok) {
        setRows([]);
        setLoadStatus('error');
        return;
      }
      setRows(result.states ?? []);
      setLoadStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, preferenceKey, friends.length]);

  const activity = useMemo(() => {
    if (!preferenceKey || !signedIn) return null;
    // RPC already filters sharing-disabled friends; pass friends for names.
    return getFriendActivityForFilm({
      filmKey: preferenceKey,
      activityRows: rows,
      friends,
      sharingByUserId: null,
    });
  }, [preferenceKey, signedIn, rows, friends]);

  const presentation = useMemo(
    () => buildFromYourFriendsPresentation(activity),
    [activity],
  );

  return {
    preferenceKey,
    activity,
    presentation,
    loadStatus,
    friendsStatus,
    signedIn,
  };
}
