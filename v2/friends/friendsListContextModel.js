/**
 * Friends-list card model.
 *
 * Mutual Saved uses the same identity intersection as Friend Detail.
 * Plan count and the nearest plan come from list_friends_list_context,
 * which already applies Friend Detail signal rules.
 */

import {
  buildHomeFilmIdentityIndex,
  resolveHomeFilmForPreferenceRef,
} from '../collections/personalCollectionModel.js';
import { formatMemberResponseLabel } from '../sharedPlans/sharedPlanCopy.js';
import { normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import { selectMutualFilms } from './friendDetailPresentation.js';

/** Matches buildFriendPlanCards' visible cap. */
export const FRIENDS_LIST_PLAN_CAP = 6;

export const FRIENDS_LIST_POSTER_LIMIT = 3;

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function asString(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * @param {unknown} raw
 * @returns {{ filmKey: string, filmId: string | null, showtimeFilmKey: string | null } | null}
 */
function normalizeSavedIdentity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const filmKey = asString(row.film_key ?? row.filmKey);
  if (!filmKey) return null;
  return {
    filmKey,
    filmId: asString(row.film_id ?? row.filmId),
    showtimeFilmKey: asString(row.showtime_film_key ?? row.showtimeFilmKey),
  };
}

/**
 * @param {unknown} raw
 */
function normalizeNearestPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const planId = asString(row.plan_id ?? row.planId);
  const response = asString(row.response);
  if (!planId || !response) return null;
  if (response !== 'interested' && response !== 'maybe' && response !== 'going') {
    return null;
  }
  return {
    planId,
    filmKey: asString(row.film_key ?? row.filmKey),
    filmId: asString(row.film_id ?? row.filmId),
    title: asString(row.title) || 'Shared plan',
    posterUrl: asString(row.poster_url ?? row.posterUrl),
    localDate: asString(row.local_date ?? row.localDate),
    localTime: asString(row.local_time ?? row.localTime),
    theaterName: asString(row.theater_name ?? row.theaterName),
    response,
    viewerCanJoin: row.viewer_can_join === true || row.viewerCanJoin === true,
    viewerCanOpen: row.viewer_can_open !== false && row.viewerCanOpen !== false,
  };
}

/**
 * @param {unknown} raw
 * @returns {Array<{
 *   friendUserId: string,
 *   sharesActivity: boolean,
 *   savedFilms: Array<{ filmKey: string, filmId: string | null, showtimeFilmKey: string | null }>,
 *   upcomingPlanCount: number,
 *   nearestPlan: ReturnType<typeof normalizeNearestPlan>,
 * }>}
 */
export function normalizeFriendsListContext(raw) {
  const row = raw && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const friends = Array.isArray(row.friends) ? row.friends : [];
  /** @type {ReturnType<typeof normalizeFriendsListContext>} */
  const out = [];
  for (const item of friends) {
    if (!item || typeof item !== 'object') continue;
    const friend = /** @type {Record<string, unknown>} */ (item);
    const friendUserId = asString(friend.friend_user_id ?? friend.friendUserId);
    if (!friendUserId) continue;
    const sharesActivity =
      friend.shares_activity === true || friend.sharesActivity === true;
    const savedRaw = Array.isArray(friend.saved_films)
      ? friend.saved_films
      : Array.isArray(friend.savedFilms)
        ? friend.savedFilms
        : [];
    const countRaw = friend.upcoming_plan_count ?? friend.upcomingPlanCount ?? 0;
    const count = Number.isFinite(Number(countRaw))
      ? Math.max(0, Math.min(FRIENDS_LIST_PLAN_CAP, Math.floor(Number(countRaw))))
      : 0;
    out.push({
      friendUserId,
      sharesActivity,
      savedFilms: sharesActivity
        ? savedRaw.map(normalizeSavedIdentity).filter(Boolean)
        : [],
      upcomingPlanCount: count,
      nearestPlan: count > 0 ? normalizeNearestPlan(friend.nearest_plan ?? friend.nearestPlan) : null,
    });
  }
  return out;
}

/**
 * @param {number} count
 * @returns {string | null}
 */
export function mutualSavedLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? '1 film you both saved' : `${count} films you both saved`;
}

/**
 * @param {number} count
 * @returns {string | null}
 */
export function upcomingPlansLabel(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? '1 upcoming plan' : `${count} upcoming plans`;
}

/**
 * @param {string | null | undefined} localDate
 * @param {string | null | undefined} localTime
 */
export function formatFriendListPlanWhen(localDate, localTime) {
  let dateLabel = '';
  if (typeof localDate === 'string' && localDate) {
    const [y, m, d] = localDate.split('-').map(Number);
    if (y && m && d) {
      try {
        dateLabel = new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }).format(new Date(Date.UTC(y, m - 1, d, 12)));
      } catch {
        dateLabel = localDate;
      }
    }
  }
  const timeLabel = localTime ? formatDisplayClock(localTime, '12h') : '';
  return [dateLabel, timeLabel].filter(Boolean).join(' · ');
}

/**
 * @param {{ filmId?: string | null, filmKey?: string | null, showtimeFilmKey?: string | null, posterUrl?: string | null }} film
 * @param {ReturnType<typeof buildHomeFilmIdentityIndex> | null} index
 */
function posterForFilm(film, index) {
  if (film?.posterUrl) return film.posterUrl;
  if (!index) return null;
  const ref = normalizeSavedFilmRef({
    filmId: film?.filmId ?? null,
    showtimeFilmKey: film?.showtimeFilmKey ?? film?.filmKey ?? null,
  });
  if (!ref) return null;
  const home = resolveHomeFilmForPreferenceRef(ref, index);
  return typeof home?.posterUrl === 'string' && home.posterUrl ? home.posterUrl : null;
}

/**
 * @param {{
 *   friends?: Array<{ userId: string, displayName?: string | null, avatarUrl?: string | null }>,
 *   contextFriends?: ReturnType<typeof normalizeFriendsListContext>,
 *   viewerSaved?: object[],
 *   homeData?: object | null,
 * }} input
 */
export function buildFriendsListCards(input) {
  const friends = Array.isArray(input?.friends) ? input.friends : [];
  const context = Array.isArray(input?.contextFriends) ? input.contextFriends : [];
  const byId = new Map(context.map((row) => [row.friendUserId, row]));
  const index = buildHomeFilmIdentityIndex(input?.homeData ?? null);
  const contextReady = input?.contextFriends != null;

  return friends.map((friend) => {
    const ctx = byId.get(friend.userId) ?? null;
    const known = contextReady && ctx != null;
    const sharesActivity = known && ctx.sharesActivity === true;
    const mutual = sharesActivity
      ? selectMutualFilms(ctx.savedFilms, input?.viewerSaved)
      : [];
    const planCount = known ? ctx.upcomingPlanCount : 0;
    const nearest = known && planCount > 0 ? ctx.nearestPlan : null;
    const posterFilms = !nearest && sharesActivity
      ? mutual.slice(0, FRIENDS_LIST_POSTER_LIMIT)
      : [];
    let preview = 'none';
    if (nearest) preview = 'plan';
    else if (posterFilms.length > 0) preview = 'posters';

    return {
      userId: friend.userId,
      displayName: friend.displayName ?? null,
      avatarUrl: friend.avatarUrl ?? null,
      sharesActivity,
      mutualState: !known ? 'pending' : sharesActivity ? 'shared' : 'hidden',
      mutualCount: sharesActivity ? mutual.length : null,
      mutualLabel: sharesActivity ? mutualSavedLabel(mutual.length) : null,
      planCount: known ? planCount : null,
      planLabel: known ? upcomingPlansLabel(planCount) : null,
      preview,
      posters: posterFilms.map((film) => ({
        key: film.filmKey,
        posterUrl: posterForFilm(film, index),
        title: film.filmKey,
      })),
      plan: nearest
        ? {
            planId: nearest.planId,
            title: nearest.title,
            when: formatFriendListPlanWhen(nearest.localDate, nearest.localTime),
            theaterName: nearest.theaterName,
            posterUrl: posterForFilm(nearest, index),
            response: nearest.response,
            responseLabel: formatMemberResponseLabel(nearest.response),
            viewerCanJoin: nearest.viewerCanJoin,
          }
        : null,
    };
  });
}
