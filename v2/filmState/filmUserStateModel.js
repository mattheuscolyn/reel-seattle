/**
 * Unified FilmUserState domain over existing Saved / Seen / Not Interested stores.
 *
 * Does not migrate or merge the three local stores. Provides a single query
 * surface so future friend-activity UI does not talk to three unrelated APIs.
 */

import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import {
  filmPreferenceKeyFromRef,
  parseFilmPreferenceKey,
} from '../auth/filmPreferenceIdentity.js';
import { isFilmSaved } from '../stores/savedFilmsStore.js';
import { isFilmSeen } from '../stores/seenFilmsStore.js';
import { isFilmNotInterested } from '../stores/notInterestedFilmsStore.js';
import { normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';

/** @type {readonly ['saved', 'seen', 'not_interested']} */
export const FILM_USER_STATES = Object.freeze([
  'saved',
  'seen',
  'not_interested',
]);

/**
 * @typedef {{
 *   userId: string | null,
 *   filmKey: string,
 *   filmRef: object,
 *   states: {
 *     saved: boolean,
 *     seen: boolean,
 *     not_interested: boolean,
 *   },
 * }} FilmUserState
 */

/**
 * @param {object | null | undefined} filmOrRef
 * @returns {{ filmRef: object, filmKey: string } | null}
 */
export function resolveFilmUserStateIdentity(filmOrRef) {
  const ref =
    normalizeSavedFilmRef(filmOrRef) ??
    (filmOrRef && typeof filmOrRef === 'object' && 'filmKey' in filmOrRef
      ? filmRefFromHomeFilm(filmOrRef)
      : null);
  if (!ref) return null;
  const filmKey = filmPreferenceKeyFromRef(ref);
  if (!filmKey) return null;
  return { filmRef: ref, filmKey };
}

/**
 * Read local device film states for the current browser user.
 *
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmOrRef
 * @param {{ userId?: string | null }} [options]
 * @returns {FilmUserState | null}
 */
export function getLocalFilmUserState(storage, filmOrRef, options = {}) {
  const identity = resolveFilmUserStateIdentity(filmOrRef);
  if (!identity) return null;
  return {
    userId: options.userId ?? null,
    filmKey: identity.filmKey,
    filmRef: identity.filmRef,
    states: {
      saved: isFilmSaved(storage, identity.filmRef),
      seen: isFilmSeen(storage, identity.filmRef),
      not_interested: isFilmNotInterested(storage, identity.filmRef),
    },
  };
}

/**
 * Normalize a friend-activity RPC row into FilmUserState.
 *
 * @param {unknown} raw
 * @returns {FilmUserState | null}
 */
export function normalizeFriendFilmUserState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const userId =
    typeof row.userId === 'string'
      ? row.userId
      : typeof row.user_id === 'string'
        ? row.user_id
        : null;
  const filmKey =
    typeof row.filmKey === 'string'
      ? row.filmKey
      : typeof row.film_key === 'string'
        ? row.film_key
        : null;
  if (!userId || !filmKey) return null;
  const parsed = parseFilmPreferenceKey(filmKey);
  const filmRef =
    normalizeSavedFilmRef({
      filmId: row.filmId ?? row.film_id ?? parsed?.filmId ?? null,
      showtimeFilmKey:
        row.showtimeFilmKey ??
        row.showtime_film_key ??
        parsed?.showtimeFilmKey ??
        null,
    }) ??
    (parsed?.showtimeFilmKey
      ? {
          filmId: parsed.filmId,
          showtimeFilmKey: parsed.showtimeFilmKey,
          sourceFilmId: null,
          source: null,
        }
      : null);
  if (!filmRef) return null;
  const statesRaw =
    row.states && typeof row.states === 'object'
      ? /** @type {Record<string, unknown>} */ (row.states)
      : {};
  return {
    userId,
    filmKey,
    filmRef,
    states: {
      saved: statesRaw.saved === true,
      seen: statesRaw.seen === true,
      not_interested:
        statesRaw.not_interested === true ||
        statesRaw.notInterested === true,
    },
  };
}

/**
 * Filter friend activity rows to accepted-friend user ids only.
 * Defense in depth for client-side aggregation.
 *
 * @param {FilmUserState[]} rows
 * @param {Set<string> | string[]} acceptedFriendIds
 */
export function filterFilmStatesToAcceptedFriends(rows, acceptedFriendIds) {
  const allowed =
    acceptedFriendIds instanceof Set
      ? acceptedFriendIds
      : new Set(
          (Array.isArray(acceptedFriendIds) ? acceptedFriendIds : []).filter(
            (id) => typeof id === 'string' && id,
          ),
        );
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.userId && allowed.has(row.userId),
  );
}
