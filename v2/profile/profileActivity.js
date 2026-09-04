/**
 * Profile Your Films counts + favorite-theater preview from local stores.
 */

import { getFavoriteTheaters } from '../stores/favoriteTheatersStore.js';
import { getNotInterestedFilms } from '../stores/notInterestedFilmsStore.js';
import { getSavedFilms } from '../stores/savedFilmsStore.js';
import { getSeenFilms } from '../stores/seenFilmsStore.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import { subscribeScheduleStoreMutations } from '../auth/scheduleStoreMutationBridge.js';
import { COLLECTION_IDS } from '../explore/exploreIds.js';

export const PROFILE_FAVORITE_THEATERS_PREVIEW_MAX = 3;

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {{
 *   seen: number,
 *   notInterested: number,
 *   saved: number,
 *   favoriteTheaters: number,
 * }}
 */
export function getProfileActivityCounts(storage) {
  const store =
    storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : storage;
  return {
    seen: getSeenFilms(store).length,
    notInterested: getNotInterestedFilms(store).length,
    saved: getSavedFilms(store).length,
    favoriteTheaters: getFavoriteTheaters(store).length,
  };
}

/**
 * Your Films cards for Profile UI (Saved / Seen / Not Interested).
 * @param {Storage | null | undefined} [storage]
 */
export function buildYourFilmsItems(storage) {
  const counts = getProfileActivityCounts(storage);
  return Object.freeze([
    Object.freeze({
      key: 'saved',
      label: 'Saved',
      value: counts.saved,
      collectionId: COLLECTION_IDS.saved,
      icon: 'bookmark',
    }),
    Object.freeze({
      key: 'seen',
      label: 'Seen',
      value: counts.seen,
      collectionId: COLLECTION_IDS.seen,
      icon: 'eye',
    }),
    Object.freeze({
      key: 'notInterested',
      label: 'Not Interested',
      value: counts.notInterested,
      collectionId: COLLECTION_IDS.hidden,
      icon: 'close',
    }),
  ]);
}

/**
 * Subscribe to film + schedule store mutations (and optional focus) for count refresh.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeProfileActivity(listener) {
  const unsubFilm = subscribeFilmStoreMutations(() => listener());
  const unsubSchedule = subscribeScheduleStoreMutations(() => listener());
  const onFocus = () => listener();
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
  }
  return () => {
    unsubFilm();
    unsubSchedule();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    }
  };
}

/**
 * Real favorite theaters for Profile preview (newest first, capped).
 * @param {Storage | null | undefined} [storage]
 */
export function getProfileFavoriteTheaters(storage) {
  const store =
    storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : storage;
  return getFavoriteTheaters(store)
    .slice(0, PROFILE_FAVORITE_THEATERS_PREVIEW_MAX)
    .map((t) =>
      Object.freeze({
        id: t.theaterRef?.theaterId ?? t.theaterId,
        name: t.name || t.theaterRef?.theaterId || 'Theater',
        locationLabel: t.neighborhood || '',
        imageUrl: t.imageUrl || '',
        favorited: true,
      }),
    );
}
