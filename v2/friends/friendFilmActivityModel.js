/**
 * Canonical friend film-activity model shared by Film Detail and Friend Detail.
 *
 * Aggregation lives here so surfaces do not duplicate privacy / friendship /
 * identity / grouping rules.
 */

import {
  compareFriendSummaries,
  friendGivenName,
} from './friendsModel.js';
import { friendDisplayLabel } from './friendsCopy.js';
import {
  normalizeFriendFilmUserState,
  filterFilmStatesToAcceptedFriends,
} from '../filmState/filmUserStateModel.js';
import { filmPreferenceKeyFromRef } from '../auth/filmPreferenceIdentity.js';
import { normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';
import {
  buildHomeFilmIdentityIndex,
  resolveHomeFilmForPreferenceRef,
  formatPreferenceDateLabel,
} from '../collections/personalCollectionModel.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { parseFilmPreferenceKey } from '../auth/filmPreferenceIdentity.js';
import {
  asCanonicalStoreFilmId,
  normalizeShowtimeFilmKey,
} from '../stores/savedFilmsStore.js';
import { syntheticShowtimeKeyForCanonicalFilmId } from '../filmState/filmUserStateModel.js';

/** Inline name count before collapsing to +N on Film Detail. */
export const FRIEND_ACTIVITY_NAME_INLINE_LIMIT = 2;

export const FRIEND_FILM_ACTIVITY_RPC = Object.freeze({
  listForFilm: 'list_friend_film_states',
  listForFriend: 'list_friend_shared_film_activity',
  setShare: 'set_share_film_activity_with_friends',
});

/**
 * @typedef {{
 *   userId: string,
 *   displayName: string | null,
 *   avatarUrl: string | null,
 *   friendshipId?: string,
 *   createdAt?: string,
 *   shareInteractionCount?: number,
 * }} FriendActivityPerson
 */

/**
 * @typedef {{
 *   filmKey: string,
 *   filmId: string | null,
 *   showtimeFilmKey: string | null,
 *   updatedAt: string | null,
 *   states: { saved: boolean, seen: boolean, not_interested: boolean },
 * }} FriendActivityFilmRow
 */

/**
 * @param {string[]} names
 * @param {number} [limit]
 * @returns {string}
 */
export function formatFriendNameOverflow(
  names,
  limit = FRIEND_ACTIVITY_NAME_INLINE_LIMIT,
) {
  const list = (Array.isArray(names) ? names : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  const max = Math.max(1, Number(limit) || FRIEND_ACTIVITY_NAME_INLINE_LIMIT);
  if (list.length === 0) return '';
  if (list.length <= max) return list.join(', ');
  const shown = list.slice(0, max);
  const overflow = list.length - max;
  return `${shown.join(', ')} +${overflow}`;
}

/**
 * @param {import('./friendsModel.js').FriendSummary[]} friends
 * @param {FriendActivityPerson} a
 * @param {FriendActivityPerson} b
 */
function compareActivityPeople(a, b, friendsById) {
  const friendA = friendsById.get(a.userId);
  const friendB = friendsById.get(b.userId);
  if (friendA && friendB) {
    const byShare = compareFriendSummaries(friendA, friendB);
    if (byShare !== 0) return byShare;
  }
  const nameA = friendDisplayLabel(a.displayName).toLocaleLowerCase();
  const nameB = friendDisplayLabel(b.displayName).toLocaleLowerCase();
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  return String(a.userId).localeCompare(String(b.userId));
}

/**
 * @param {import('./friendsModel.js').FriendSummary | null | undefined} friend
 * @returns {FriendActivityPerson | null}
 */
function personFromFriend(friend) {
  if (!friend?.userId) return null;
  return {
    userId: friend.userId,
    displayName: friend.displayName ?? null,
    avatarUrl: friend.avatarUrl ?? null,
    friendshipId: friend.friendshipId,
    createdAt: friend.createdAt,
    shareInteractionCount: friend.shareInteractionCount,
  };
}

/**
 * Whether a user id is allowed to contribute friend activity.
 *
 * @param {string} userId
 * @param {{
 *   acceptedFriendIds: Set<string> | string[],
 *   sharingByUserId?: Map<string, boolean> | Record<string, boolean> | null,
 * }} options
 */
export function canExposeFriendActivity(userId, options) {
  if (typeof userId !== 'string' || !userId) return false;
  const allowed =
    options.acceptedFriendIds instanceof Set
      ? options.acceptedFriendIds
      : new Set(
          (Array.isArray(options.acceptedFriendIds)
            ? options.acceptedFriendIds
            : []
          ).filter((id) => typeof id === 'string' && id),
        );
  if (!allowed.has(userId)) return false;
  const sharing = options.sharingByUserId;
  if (sharing == null) return true;
  if (sharing instanceof Map) {
    if (sharing.has(userId) && sharing.get(userId) !== true) return false;
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(sharing, userId)) {
    return sharing[userId] === true;
  }
  return true;
}

/**
 * Film Detail aggregation: friends who Saved / Seen / Not Interested this film.
 *
 * @param {{
 *   filmKey: string | null | undefined,
 *   activityRows?: unknown[],
 *   friends?: import('./friendsModel.js').FriendSummary[],
 *   sharingByUserId?: Map<string, boolean> | Record<string, boolean> | null,
 * }} input
 * @returns {{
 *   filmKey: string,
 *   saved: FriendActivityPerson[],
 *   seen: FriendActivityPerson[],
 *   notInterested: FriendActivityPerson[],
 *   hasAny: boolean,
 * } | null}
 */
export function getFriendActivityForFilm(input) {
  const filmKey =
    typeof input?.filmKey === 'string' && input.filmKey.trim()
      ? input.filmKey.trim()
      : null;
  if (!filmKey) return null;

  const friends = Array.isArray(input.friends) ? input.friends : [];
  const friendsById = new Map(friends.map((f) => [f.userId, f]));
  const acceptedIds = new Set(friends.map((f) => f.userId));

  const normalized = (Array.isArray(input.activityRows) ? input.activityRows : [])
    .map((row) => normalizeFriendFilmUserState(row))
    .filter(Boolean);

  const friendOnly = filterFilmStatesToAcceptedFriends(normalized, acceptedIds);

  /** @type {Map<string, import('../filmState/filmUserStateModel.js').FilmUserState>} */
  const byUser = new Map();
  for (const row of friendOnly) {
    if (row.filmKey !== filmKey) continue;
    if (
      !canExposeFriendActivity(row.userId, {
        acceptedFriendIds: acceptedIds,
        sharingByUserId: input.sharingByUserId,
      })
    ) {
      continue;
    }
    // Deduplicate by userId — last wins for state merge.
    const existing = byUser.get(row.userId);
    if (!existing) {
      byUser.set(row.userId, row);
      continue;
    }
    byUser.set(row.userId, {
      ...existing,
      states: {
        saved: existing.states.saved || row.states.saved,
        seen: existing.states.seen || row.states.seen,
        not_interested:
          existing.states.not_interested || row.states.not_interested,
      },
    });
  }

  /** @type {FriendActivityPerson[]} */
  const saved = [];
  /** @type {FriendActivityPerson[]} */
  const seen = [];
  /** @type {FriendActivityPerson[]} */
  const notInterested = [];

  for (const row of byUser.values()) {
    const friend = friendsById.get(row.userId);
    const person = personFromFriend(friend) ?? {
      userId: row.userId,
      displayName: null,
      avatarUrl: null,
    };
    if (row.states.saved) saved.push(person);
    if (row.states.seen) seen.push(person);
    if (row.states.not_interested) notInterested.push(person);
  }

  const sortPeople = (list) =>
    [...list].sort((a, b) => compareActivityPeople(a, b, friendsById));

  const result = {
    filmKey,
    saved: sortPeople(saved),
    seen: sortPeople(seen),
    notInterested: sortPeople(notInterested),
    hasAny: false,
  };
  result.hasAny =
    result.saved.length > 0 ||
    result.seen.length > 0 ||
    result.notInterested.length > 0;
  return result;
}

/**
 * Presentation lines for Film Detail. Returns null when the section should omit.
 *
 * @param {ReturnType<typeof getFriendActivityForFilm>} activity
 * @param {{ nameLimit?: number }} [options]
 * @returns {{
 *   title: string,
 *   lines: Array<{ id: string, state: string, text: string }>,
 * } | null}
 */
export function buildFromYourFriendsPresentation(activity, options = {}) {
  if (!activity?.hasAny) return null;
  const limit = options.nameLimit ?? FRIEND_ACTIVITY_NAME_INLINE_LIMIT;
  /** @type {Array<{ id: string, state: string, text: string }>} */
  const lines = [];

  const toNames = (people) =>
    people.map((p) => friendGivenName(p.displayName));

  if (activity.saved.length > 0) {
    lines.push({
      id: 'saved',
      state: 'saved',
      text: `Saved by ${formatFriendNameOverflow(toNames(activity.saved), limit)}`,
    });
  }
  if (activity.seen.length > 0) {
    lines.push({
      id: 'seen',
      state: 'seen',
      text: `Seen by ${formatFriendNameOverflow(toNames(activity.seen), limit)}`,
    });
  }
  if (activity.notInterested.length > 0) {
    lines.push({
      id: 'not_interested',
      state: 'not_interested',
      text: `Not interested: ${formatFriendNameOverflow(
        toNames(activity.notInterested),
        limit,
      )}`,
    });
  }
  if (lines.length === 0) return null;
  return { title: 'From your friends', lines };
}

/**
 * Normalize a friend-keyed activity RPC row.
 *
 * @param {unknown} raw
 * @returns {FriendActivityFilmRow | null}
 */
export function normalizeFriendActivityFilmRow(raw) {
  const state = normalizeFriendFilmUserState(raw);
  if (!state) return null;
  const row = raw && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const updatedAt =
    typeof row.updatedAt === 'string'
      ? row.updatedAt
      : typeof row.updated_at === 'string'
        ? row.updated_at
        : null;
  return {
    filmKey: state.filmKey,
    filmId: state.filmRef?.filmId ?? null,
    showtimeFilmKey: state.filmRef?.showtimeFilmKey ?? null,
    updatedAt,
    states: state.states,
  };
}

/**
 * Normalize list_friend_shared_film_activity structured payload.
 * Accepts legacy bare arrays for older fixtures.
 *
 * @param {unknown} raw
 * @returns {{
 *   isFriend: boolean,
 *   sharesActivity: boolean,
 *   films: FriendActivityFilmRow[],
 * }}
 */
export function normalizeFriendSharedActivityPayload(raw) {
  if (Array.isArray(raw)) {
    return {
      isFriend: true,
      sharesActivity: true,
      films: raw.map(normalizeFriendActivityFilmRow).filter(Boolean),
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { isFriend: false, sharesActivity: false, films: [] };
  }
  const row = /** @type {Record<string, unknown>} */ (raw);
  const isFriend = row.is_friend === true || row.isFriend === true;
  const sharesActivity =
    row.shares_activity === true || row.sharesActivity === true;
  const filmsRaw = Array.isArray(row.films) ? row.films : [];
  if (!isFriend || !sharesActivity) {
    return { isFriend, sharesActivity: isFriend ? sharesActivity : false, films: [] };
  }
  return {
    isFriend: true,
    sharesActivity: true,
    films: filmsRaw.map(normalizeFriendActivityFilmRow).filter(Boolean),
  };
}

/**
 * Deterministic catalog key used when a preference row is TMDB-only.
 * Must match normalizeFriendFilmUserState / Film Detail open identity.
 *
 * @param {string | null | undefined} filmIdOrKey
 * @returns {string | null}
 */
export function resolveFriendActivityCatalogKey(filmIdOrKey) {
  const filmId = asCanonicalStoreFilmId(filmIdOrKey);
  if (filmId) {
    const synthetic = syntheticShowtimeKeyForCanonicalFilmId(filmId);
    const ref = normalizeSavedFilmRef({
      filmId,
      showtimeFilmKey: synthetic,
    });
    return filmPreferenceKeyFromRef(ref);
  }
  const showtime = normalizeShowtimeFilmKey(filmIdOrKey);
  if (!showtime) return null;
  return filmPreferenceKeyFromRef({
    filmId: null,
    showtimeFilmKey: showtime,
  });
}

/**
 * Friend Detail aggregation for one friend’s shared films.
 *
 * @param {{
 *   friendId: string | null | undefined,
 *   friends?: import('./friendsModel.js').FriendSummary[],
 *   activityRows?: unknown[],
 *   friendSharesActivity?: boolean,
 * }} input
 * @returns {{
 *   friend: import('./friendsModel.js').FriendSummary | null,
 *   isFriend: boolean,
 *   sharesActivity: boolean,
 *   saved: FriendActivityFilmRow[],
 *   seen: FriendActivityFilmRow[],
 *   notInterested: FriendActivityFilmRow[],
 * } | null}
 */
export function getSharedFilmActivityForFriend(input) {
  const friendId =
    typeof input?.friendId === 'string' && input.friendId.trim()
      ? input.friendId.trim()
      : null;
  if (!friendId) return null;

  const friends = Array.isArray(input.friends) ? input.friends : [];
  const friend = friends.find((f) => f.userId === friendId) ?? null;
  const isFriend = Boolean(friend);
  const sharesActivity = input.friendSharesActivity !== false;

  if (!isFriend || !sharesActivity) {
    return {
      friend,
      isFriend,
      sharesActivity: isFriend ? sharesActivity : false,
      saved: [],
      seen: [],
      notInterested: [],
    };
  }

  /** @type {Map<string, FriendActivityFilmRow>} */
  const byFilm = new Map();
  for (const raw of Array.isArray(input.activityRows) ? input.activityRows : []) {
    const row = normalizeFriendActivityFilmRow(raw);
    if (!row) continue;
    const existing = byFilm.get(row.filmKey);
    if (!existing) {
      byFilm.set(row.filmKey, row);
      continue;
    }
    byFilm.set(row.filmKey, {
      ...existing,
      filmId: existing.filmId ?? row.filmId,
      showtimeFilmKey: existing.showtimeFilmKey ?? row.showtimeFilmKey,
      updatedAt:
        (existing.updatedAt && row.updatedAt
          ? existing.updatedAt > row.updatedAt
            ? existing.updatedAt
            : row.updatedAt
          : existing.updatedAt || row.updatedAt) ?? null,
      states: {
        saved: existing.states.saved || row.states.saved,
        seen: existing.states.seen || row.states.seen,
        not_interested:
          existing.states.not_interested || row.states.not_interested,
      },
    });
  }

  const all = [...byFilm.values()];
  const sortFilms = (list) =>
    [...list].sort((a, b) => {
      const aT = Date.parse(a.updatedAt || '') || 0;
      const bT = Date.parse(b.updatedAt || '') || 0;
      if (bT !== aT) return bT - aT;
      return String(a.filmKey).localeCompare(String(b.filmKey));
    });

  return {
    friend,
    isFriend: true,
    sharesActivity: true,
    saved: sortFilms(all.filter((r) => r.states.saved)),
    seen: sortFilms(all.filter((r) => r.states.seen)),
    notInterested: sortFilms(all.filter((r) => r.states.not_interested)),
  };
}

/**
 * Resolve Friend Detail rows against HomeData / enrichment for PFC-style cards.
 *
 * Ordering: recently updated first; title A–Z when timestamps missing (already
 * applied in getSharedFilmActivityForFriend via filmKey fallback).
 *
 * @param {FriendActivityFilmRow[]} films
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   now?: Date,
 * }} [options]
 */
export function buildFriendActivityCollectionRows(films, options = {}) {
  const homeData = options.homeData ?? null;
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const index = buildHomeFilmIdentityIndex(homeData);
  const list = Array.isArray(films) ? films : [];

  return list.map((film, i) => {
    const parsed = parseFilmPreferenceKey(film.filmKey);
    const filmRef =
      normalizeSavedFilmRef({
        filmId: film.filmId ?? parsed?.filmId ?? null,
        showtimeFilmKey:
          film.showtimeFilmKey ?? parsed?.showtimeFilmKey ?? null,
      }) ?? {
        filmId: film.filmId ?? parsed?.filmId ?? null,
        showtimeFilmKey:
          film.showtimeFilmKey ?? parsed?.showtimeFilmKey ?? null,
        sourceFilmId: null,
        source: null,
      };
    const preferenceKey = filmPreferenceKeyFromRef(filmRef) || film.filmKey;
    const homeFilm = resolveHomeFilmForPreferenceRef(filmRef, index);
    const enriched = homeFilm
      ? enrichHomeFilm(homeFilm, enrichmentIndex, 'collection', homeData)
      : null;
    const title =
      (typeof enriched?.title === 'string' && enriched.title.trim()) ||
      (typeof homeFilm?.title === 'string' && homeFilm.title.trim()) ||
      preferenceKey;
    const posterUrl =
      (typeof enriched?.posterUrl === 'string' && enriched.posterUrl) ||
      (typeof homeFilm?.posterUrl === 'string' && homeFilm.posterUrl) ||
      null;
    const dateLabel = formatPreferenceDateLabel(film.updatedAt);
    return {
      rowKey: `${preferenceKey}:${i}`,
      origin: homeFilm ? 'home' : 'snapshot',
      filmKey: homeFilm?.filmKey ?? film.showtimeFilmKey ?? preferenceKey,
      filmId: film.filmId ?? homeFilm?.filmId ?? parsed?.filmId ?? null,
      title,
      posterUrl,
      metaLine: dateLabel,
      showtimeLine: null,
      tags: [],
      statusLine: null,
      showWatchingBadge: false,
      showRemove: false,
      nextOpportunityKey: null,
      preferenceKey,
    };
  });
}
