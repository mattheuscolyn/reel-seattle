/**
 * Pure SQL-semantic mirrors for friend film-activity privacy RPCs.
 *
 * The repo has no workable local Docker/Postgres on this machine, so these
 * mirrors encode the migration's WHERE / join rules for regression coverage.
 * They are not a substitute for applying the migration to real Postgres.
 */

/**
 * Mirror of list_friend_film_states privacy + friendship filters.
 *
 * @param {Array<{
 *   user_id: string,
 *   film_key: string,
 *   film_id?: string | null,
 *   showtime_film_key?: string | null,
 *   preference_type: 'saved' | 'seen' | 'not_interested',
 *   is_active: boolean,
 * }>} preferenceRows
 * @param {{
 *   viewerId: string,
 *   filmKey: string,
 *   friendships: Array<[string, string]>,
 *   shareByUserId: Record<string, boolean | undefined>,
 * }} ctx
 */
export function sqlMirrorListFriendFilmStates(preferenceRows, ctx) {
  const friendSet = new Set();
  for (const [a, b] of ctx.friendships) {
    if (a === ctx.viewerId) friendSet.add(b);
    if (b === ctx.viewerId) friendSet.add(a);
  }
  /** @type {Map<string, any>} */
  const byUser = new Map();
  for (const row of preferenceRows) {
    if (!row?.is_active) continue;
    if (row.film_key !== ctx.filmKey) continue;
    if (row.user_id === ctx.viewerId) continue;
    if (!friendSet.has(row.user_id)) continue;
    // coalesce(share, false) = true  → only explicit true shares
    if (ctx.shareByUserId[row.user_id] !== true) continue;
    const existing = byUser.get(row.user_id) ?? {
      user_id: row.user_id,
      film_key: row.film_key,
      film_id: row.film_id ?? null,
      showtime_film_key: row.showtime_film_key ?? null,
      states: { saved: false, seen: false, not_interested: false },
    };
    if (row.preference_type === 'saved') existing.states.saved = true;
    if (row.preference_type === 'seen') existing.states.seen = true;
    if (row.preference_type === 'not_interested') {
      existing.states.not_interested = true;
    }
    byUser.set(row.user_id, existing);
  }
  return [...byUser.values()].sort((a, b) =>
    a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0,
  );
}

/**
 * Mirror of list_friend_shared_film_activity structured result.
 *
 * @param {Array<{
 *   user_id: string,
 *   film_key: string,
 *   film_id?: string | null,
 *   showtime_film_key?: string | null,
 *   preference_type: 'saved' | 'seen' | 'not_interested',
 *   is_active: boolean,
 *   updated_at?: string,
 * }>} preferenceRows
 * @param {{
 *   viewerId: string,
 *   friendId: string,
 *   friendships: Array<[string, string]>,
 *   shareByUserId: Record<string, boolean | undefined>,
 * }} ctx
 */
export function sqlMirrorListFriendSharedFilmActivity(preferenceRows, ctx) {
  const empty = {
    ok: true,
    is_friend: false,
    shares_activity: false,
    films: [],
  };
  if (!ctx.friendId || ctx.friendId === ctx.viewerId) return empty;

  const areFriends = ctx.friendships.some(
    ([a, b]) =>
      (a === ctx.viewerId && b === ctx.friendId) ||
      (b === ctx.viewerId && a === ctx.friendId),
  );
  if (!areFriends) return empty;

  const shares = ctx.shareByUserId[ctx.friendId] === true;
  if (!shares) {
    return {
      ok: true,
      is_friend: true,
      shares_activity: false,
      films: [],
    };
  }

  /** @type {Map<string, any>} */
  const byFilm = new Map();
  for (const row of preferenceRows) {
    if (!row?.is_active) continue;
    if (row.user_id !== ctx.friendId) continue;
    const existing = byFilm.get(row.film_key) ?? {
      user_id: row.user_id,
      film_key: row.film_key,
      film_id: row.film_id ?? null,
      showtime_film_key: row.showtime_film_key ?? null,
      updated_at: row.updated_at ?? null,
      states: { saved: false, seen: false, not_interested: false },
    };
    if (row.preference_type === 'saved') existing.states.saved = true;
    if (row.preference_type === 'seen') existing.states.seen = true;
    if (row.preference_type === 'not_interested') {
      existing.states.not_interested = true;
    }
    if (
      row.updated_at &&
      (!existing.updated_at || row.updated_at > existing.updated_at)
    ) {
      existing.updated_at = row.updated_at;
    }
    byFilm.set(row.film_key, existing);
  }

  const films = [...byFilm.values()].sort((a, b) => {
    const aT = a.updated_at || '';
    const bT = b.updated_at || '';
    if (aT !== bT) return aT < bT ? 1 : -1;
    return a.film_key < b.film_key ? -1 : a.film_key > b.film_key ? 1 : 0;
  });

  return {
    ok: true,
    is_friend: true,
    shares_activity: true,
    films,
  };
}
