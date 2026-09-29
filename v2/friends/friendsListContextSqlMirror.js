/**
 * Semantic mirror of list_friends_list_context.
 * Encodes the migration's friendship, privacy, tombstone, and plan filters.
 */

import { FRIENDS_LIST_PLAN_CAP } from './friendsListContextModel.js';

/**
 * @param {string} viewerId
 * @param {Array<[string, string]>} friendships
 * @param {string} otherId
 */
function areFriends(viewerId, friendships, otherId) {
  return friendships.some(
    ([a, b]) =>
      (a === viewerId && b === otherId) || (b === viewerId && a === otherId),
  );
}

/**
 * @param {{
 *   viewerId: string,
 *   plan: {
 *     planId: string,
 *     ownerId: string,
 *     visibility: string,
 *     members?: Array<{ userId: string }>,
 *   },
 *   friendships: Array<[string, string]>,
 * }} ctx
 */
function canViewPlan(ctx) {
  const { viewerId, plan, friendships } = ctx;
  if (!viewerId || !plan) return false;
  if (plan.ownerId === viewerId) return true;
  if ((plan.members ?? []).some((member) => member.userId === viewerId)) return true;
  return plan.visibility === 'friends' && areFriends(viewerId, friendships, plan.ownerId);
}

/**
 * @param {{
 *   viewerId: string,
 *   friendships?: Array<[string, string]>,
 *   shareByUserId?: Record<string, boolean | undefined>,
 *   preferences?: Array<{
 *     user_id: string,
 *     film_key: string,
 *     film_id?: string | null,
 *     showtime_film_key?: string | null,
 *     preference_type: string,
 *     is_active: boolean,
 *   }>,
 *   plans?: Array<{
 *     planId: string,
 *     ownerId: string,
 *     visibility: string,
 *     planType?: string,
 *     planDate?: string | null,
 *     performances?: Array<{
 *       filmKey?: string | null,
 *       filmId?: string | null,
 *       title?: string | null,
 *       posterUrl?: string | null,
 *       localDate?: string | null,
 *       localTime?: string | null,
 *       theaterName?: string | null,
 *     }>,
 *     members?: Array<{ userId: string, response: string }>,
 *   }>,
 *   today: string,
 * }} ctx
 */
export function sqlMirrorListFriendsListContext(ctx) {
  const viewerId = ctx.viewerId;
  const friendships = Array.isArray(ctx.friendships) ? ctx.friendships : [];
  const shareByUserId = ctx.shareByUserId ?? {};
  const preferences = Array.isArray(ctx.preferences) ? ctx.preferences : [];
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const today = ctx.today;

  /** @type {string[]} */
  const friendIds = [];
  for (const [a, b] of friendships) {
    if (a === viewerId && b !== viewerId) friendIds.push(b);
    if (b === viewerId && a !== viewerId) friendIds.push(a);
  }
  const uniqueFriends = [...new Set(friendIds)].sort();

  const friends = uniqueFriends.map((friendUserId) => {
    const sharesActivity = shareByUserId[friendUserId] === true;
    const savedFilms = sharesActivity
      ? preferences
          .filter(
            (row) =>
              row.user_id === friendUserId &&
              row.is_active === true &&
              row.preference_type === 'saved',
          )
          .map((row) => ({
            film_key: row.film_key,
            film_id: row.film_id ?? null,
            showtime_film_key: row.showtime_film_key ?? null,
          }))
          .sort((a, b) => a.film_key.localeCompare(b.film_key))
      : [];

    /** @type {Array<Record<string, unknown>>} */
    const perfs = [];
    for (const plan of plans) {
      const members = plan.members ?? [];
      const friendMember = members.find((member) => member.userId === friendUserId);
      if (!friendMember || friendMember.userId === viewerId) continue;
      if (!['interested', 'maybe', 'going'].includes(friendMember.response)) continue;
      if (plan.planType === 'decided' && friendMember.response !== 'going') continue;
      if (!areFriends(viewerId, friendships, friendUserId)) continue;
      if (
        !canViewPlan({
          viewerId,
          plan: { ...plan, members },
          friendships,
        })
      ) {
        continue;
      }
      const viewerCanJoin =
        plan.visibility === 'friends' &&
        plan.ownerId !== viewerId &&
        !members.some((member) => member.userId === viewerId);
      for (const perf of plan.performances ?? []) {
        const sortDate = perf.localDate || plan.planDate || today;
        if (sortDate < today) continue;
        perfs.push({
          plan_id: plan.planId,
          response: friendMember.response,
          film_key: perf.filmKey ?? null,
          film_id: perf.filmId ?? null,
          title: perf.title ?? null,
          poster_url: perf.posterUrl || null,
          local_date: perf.localDate || plan.planDate || null,
          local_time: perf.localTime ?? null,
          theater_name: perf.theaterName ?? null,
          sort_date: sortDate,
          viewer_can_join: viewerCanJoin,
          viewer_can_open: true,
        });
      }
    }
    perfs.sort((a, b) => {
      const date = String(a.sort_date).localeCompare(String(b.sort_date));
      if (date !== 0) return date;
      const time = String(a.local_time || '').localeCompare(String(b.local_time || ''));
      if (time !== 0) return time;
      return String(a.plan_id).localeCompare(String(b.plan_id));
    });
    const planIds = new Set(perfs.map((row) => row.plan_id));
    const nearest = perfs[0] ?? null;
    if (nearest) delete nearest.sort_date;

    return {
      friend_user_id: friendUserId,
      shares_activity: sharesActivity,
      saved_films: savedFilms,
      upcoming_plan_count: Math.min(planIds.size, FRIENDS_LIST_PLAN_CAP),
      nearest_plan: nearest,
    };
  });

  return { ok: true, friends };
}
