/**
 * Durable source-identity keys used by the TMDB matcher.
 * Prefer `{source}|id|{source_film_id}`; fall back to `{source}|key|{showtime_film_key}`.
 */

/**
 * @param {{
 *   source?: string | null,
 *   sourceFilmId?: string | null,
 *   source_film_id?: string | null,
 *   showtimeFilmKey?: string | null,
 *   showtime_film_key?: string | null,
 * }} identity
 * @returns {string | null}
 */
export function sourceIdentityKey(identity) {
  if (!identity || typeof identity !== 'object') return null;
  const source = String(identity.source ?? '').trim();
  if (!source) return null;
  const sourceFilmId = String(
    identity.sourceFilmId ?? identity.source_film_id ?? '',
  ).trim();
  if (sourceFilmId) return `${source}|id|${sourceFilmId}`;
  const showtimeFilmKey = String(
    identity.showtimeFilmKey ?? identity.showtime_film_key ?? '',
  ).trim();
  if (showtimeFilmKey) return `${source}|key|${showtimeFilmKey}`;
  return null;
}

/**
 * @param {unknown} key
 * @returns {{ source: string, sourceFilmId: string | null, showtimeFilmKey: string | null } | null}
 */
export function parseSourceIdentityKey(key) {
  if (typeof key !== 'string' || !key.trim()) return null;
  const trimmed = key.trim();
  const idMatch = /^([^|]+)\|id\|(.+)$/.exec(trimmed);
  if (idMatch) {
    return {
      source: idMatch[1],
      sourceFilmId: idMatch[2],
      showtimeFilmKey: null,
    };
  }
  const keyMatch = /^([^|]+)\|key\|(.+)$/.exec(trimmed);
  if (keyMatch) {
    return {
      source: keyMatch[1],
      sourceFilmId: null,
      showtimeFilmKey: keyMatch[2],
    };
  }
  return null;
}

/**
 * @param {unknown} profile
 */
export function profileIsAdmin(profile) {
  return profile?.is_admin === true;
}
