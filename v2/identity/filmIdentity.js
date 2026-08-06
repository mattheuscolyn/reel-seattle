/**
 * Shared frontend film identity contract (canonical TMDB + source fallbacks).
 *
 * Priority for mutations / equality:
 * 1. Canonical `filmId` (`tmdb:<positive-int>`) when present
 * 2. Stable `showtimeFilmKey` (+ aliases) for intentional unmatched / source events
 * 3. Legacy aliases for backward-compatible reads
 * 4. Title comparison only as an explicit last-resort compatibility fallback
 *
 * Surfaces must not independently reconstruct identity from display titles.
 */

import {
  asCanonicalStoreFilmId,
  normalizeShowtimeFilmKey,
  savedFilmRefsEqual,
} from '../stores/savedFilmsStore.js';
import {
  filmRefFromHomeFilm,
  resolveSavedShowtimeFilmKey,
} from '../save/filmRefFromFilm.js';

export { filmRefFromHomeFilm, resolveSavedShowtimeFilmKey };

/**
 * @typedef {'tmdb' | 'source' | 'unknown'} FilmIdentityType
 */

/**
 * @typedef {{
 *   filmId: string | null,
 *   filmRef: string | null,
 *   showtimeFilmKey: string | null,
 *   parentFilmKey: string | null,
 *   canonicalTitle: string | null,
 *   releaseYear: number | null,
 *   identityAliases: string[],
 *   identityType: FilmIdentityType,
 *   source: string | null,
 *   sourceFilmId: string | null,
 * }} FilmIdentityView
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function asOptionalYear(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1888) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

/**
 * Canonical preference / sync key for a film record.
 * Prefers `tmdb:<id>`; otherwise `showtime:<showtimeFilmKey>`.
 *
 * @param {object | null | undefined} filmOrRef
 * @returns {string | null}
 */
export function resolveCanonicalFilmRef(filmOrRef) {
  if (!filmOrRef || typeof filmOrRef !== 'object') return null;
  const filmId = asCanonicalStoreFilmId(
    filmOrRef.filmId ?? filmOrRef.film_id ?? null,
  );
  if (filmId) return filmId;
  const key =
    normalizeShowtimeFilmKey(filmOrRef.showtimeFilmKey) ??
    normalizeShowtimeFilmKey(filmOrRef.filmKey) ??
    resolveSavedShowtimeFilmKey(filmOrRef);
  return key ? `showtime:${key}` : null;
}

/**
 * @param {object | null | undefined} film
 * @returns {FilmIdentityType}
 */
export function resolveIdentityType(film) {
  if (asCanonicalStoreFilmId(film?.filmId ?? film?.film_id ?? null)) return 'tmdb';
  const key =
    normalizeShowtimeFilmKey(film?.showtimeFilmKey) ??
    normalizeShowtimeFilmKey(film?.filmKey) ??
    resolveSavedShowtimeFilmKey(film);
  return key ? 'source' : 'unknown';
}

/**
 * Collect legacy/compatible alias keys for a film (never invents titles).
 *
 * @param {object | null | undefined} film
 * @returns {string[]}
 */
export function collectIdentityAliases(film) {
  if (!film || typeof film !== 'object') return [];
  /** @type {Set<string>} */
  const aliases = new Set();
  const filmKey = normalizeShowtimeFilmKey(film.filmKey);
  const parent = normalizeShowtimeFilmKey(film.parentFilmKey);
  const showtimeKey = normalizeShowtimeFilmKey(film.showtimeFilmKey);
  const preferred = resolveSavedShowtimeFilmKey(film);
  for (const key of [filmKey, parent, showtimeKey, preferred]) {
    if (key) aliases.add(key);
  }
  const existing = Array.isArray(film.identityAliases)
    ? film.identityAliases
    : Array.isArray(film.aliasKeys)
      ? film.aliasKeys
      : [];
  for (const raw of existing) {
    const key = normalizeShowtimeFilmKey(raw);
    if (key) aliases.add(key);
  }
  return [...aliases];
}

/**
 * Normalize any film-like object into the shared identity view.
 *
 * @param {object | null | undefined} film
 * @returns {FilmIdentityView | null}
 */
export function describeFilmIdentity(film) {
  if (!film || typeof film !== 'object') return null;
  const showtimeFilmKey =
    normalizeShowtimeFilmKey(film.showtimeFilmKey) ??
    resolveSavedShowtimeFilmKey(film);
  if (!showtimeFilmKey && !asCanonicalStoreFilmId(film.filmId)) return null;

  const filmId = asCanonicalStoreFilmId(film.filmId ?? film.film_id ?? null);
  return {
    filmId,
    filmRef: resolveCanonicalFilmRef(film),
    showtimeFilmKey,
    parentFilmKey: normalizeShowtimeFilmKey(film.parentFilmKey),
    canonicalTitle:
      asOptionalString(film.canonicalTitle) ??
      asOptionalString(film.parentDisplayTitle) ??
      asOptionalString(film.title),
    releaseYear:
      asOptionalYear(film.releaseYear) ??
      asOptionalYear(film.year) ??
      asOptionalYear(film.canonicalYear),
    identityAliases: collectIdentityAliases(film),
    identityType: resolveIdentityType(film),
    source: asOptionalString(film.source),
    sourceFilmId: asOptionalString(film.sourceFilmId),
  };
}

/**
 * Compare two film-like records using store equality rules (no title).
 *
 * @param {object | null | undefined} left
 * @param {object | null | undefined} right
 * @returns {boolean}
 */
export function filmIdentitiesEqual(left, right) {
  const leftRef = filmRefFromHomeFilm(left) ?? normalizeLooseRef(left);
  const rightRef = filmRefFromHomeFilm(right) ?? normalizeLooseRef(right);
  if (!leftRef || !rightRef) return false;
  return savedFilmRefsEqual(leftRef, rightRef);
}

/**
 * @param {object | null | undefined} value
 */
function normalizeLooseRef(value) {
  if (!value || typeof value !== 'object') return null;
  const showtimeFilmKey =
    normalizeShowtimeFilmKey(value.showtimeFilmKey) ??
    normalizeShowtimeFilmKey(value.filmKey);
  if (!showtimeFilmKey) return null;
  return {
    filmId: asCanonicalStoreFilmId(value.filmId ?? value.film_id ?? null),
    showtimeFilmKey,
    aliasKeys: collectIdentityAliases(value),
    sourceFilmId: asOptionalString(value.sourceFilmId),
    source: asOptionalString(value.source),
  };
}

/**
 * Stable planner / engine filter tokens for a film card.
 * Prefers filmId + showtime keys; title only when no usable identity exists.
 *
 * @param {object | null | undefined} filmCard
 * @returns {string[]}
 */
export function filmIdentityTokens(filmCard) {
  if (!filmCard || typeof filmCard !== 'object') return [];
  /** @type {string[]} */
  const tokens = [];
  const filmId = asCanonicalStoreFilmId(
    filmCard.filmId ?? filmCard.film_id ?? null,
  );
  if (filmId) tokens.push(filmId);

  const keys = collectIdentityAliases(filmCard);
  for (const key of keys) tokens.push(key);

  if (tokens.length === 0) {
    const title = asOptionalString(filmCard.title);
    if (title) tokens.push(title);
  }
  return tokens;
}

/**
 * @param {object[] | null | undefined} filmCards
 * @returns {string[]}
 */
export function filmIdentityTokensFromCards(filmCards) {
  if (!Array.isArray(filmCards)) return [];
  /** @type {Set<string>} */
  const out = new Set();
  for (const card of filmCards) {
    for (const token of filmIdentityTokens(card)) out.add(token);
  }
  return [...out];
}

/**
 * Dev-only identity explanation (no production UI noise).
 *
 * @param {object | null | undefined} film
 * @param {{
 *   routeTarget?: string | null,
 *   preferenceKeysChecked?: string[],
 *   plannerKey?: string | null,
 *   fallbackReason?: string | null,
 * }} [context]
 */
export function explainFilmIdentity(film, context = {}) {
  const identity = describeFilmIdentity(film);
  const ref = filmRefFromHomeFilm(film);
  return {
    canonicalFilmId: identity?.filmId ?? null,
    chosenFilmRef: identity?.filmRef ?? resolveCanonicalFilmRef(film),
    showtimeFilmKey: identity?.showtimeFilmKey ?? null,
    aliases: identity?.identityAliases ?? [],
    identityType: identity?.identityType ?? 'unknown',
    storeFilmRef: ref,
    routeTarget: context.routeTarget ?? identity?.showtimeFilmKey ?? null,
    preferenceKeysChecked: context.preferenceKeysChecked ?? [
      identity?.filmId,
      identity?.showtimeFilmKey,
      ...(identity?.identityAliases ?? []),
    ].filter(Boolean),
    plannerKey:
      context.plannerKey ??
      identity?.filmId ??
      identity?.showtimeFilmKey ??
      null,
    fallbackReason:
      context.fallbackReason ??
      (!identity?.filmId && identity?.showtimeFilmKey
        ? 'source_or_showtime_fallback'
        : !identity
          ? 'missing_identity'
          : null),
  };
}

/**
 * Whether diagnostics may be logged (Vite DEV only).
 * @returns {boolean}
 */
export function isFilmIdentityDiagnosticsEnabled() {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/**
 * @param {object | null | undefined} film
 * @param {object} [context]
 */
export function logFilmIdentityDiagnostics(film, context = {}) {
  if (!isFilmIdentityDiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug('[film-identity]', explainFilmIdentity(film, context));
}

/**
 * Resolve Film Detail navigation params from a schedule / accepted / itinerary
 * film record. Never routes by display title alone.
 *
 * Precedence for `filmKey` route target:
 * 1. parentFilmKey (variants → canonical parent)
 * 2. HomeData parent when the stored key is a variant
 * 3. showtimeFilmKey / filmKey
 * 4. HomeData lookup by canonical filmId
 *
 * @param {object | null | undefined} record
 * @param {object | null | undefined} [homeData]
 * @returns {{ filmKey: string, opportunityKey: string | null } | null}
 */
export function resolveFilmDetailNavParams(record, homeData = null) {
  if (!record || typeof record !== 'object') return null;

  const opportunityKey = asOptionalString(record.opportunityKey);
  const parentKey = normalizeShowtimeFilmKey(record.parentFilmKey);
  const showtimeKey =
    normalizeShowtimeFilmKey(record.showtimeFilmKey) ??
    normalizeShowtimeFilmKey(record.filmKey);
  const filmId = asCanonicalStoreFilmId(record.filmId ?? record.film_id ?? null);

  /** @type {string | null} */
  let filmKey = parentKey || showtimeKey;

  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const filmsByKey =
    homeData?.filmsByKey instanceof Map
      ? homeData.filmsByKey
      : new Map(films.map((f) => [f.filmKey, f]));

  if (!filmKey && filmId) {
    const parentMatch =
      films.find((f) => f.filmId === filmId && !f.parentFilmKey) ??
      films.find((f) => f.filmId === filmId) ??
      null;
    filmKey = normalizeShowtimeFilmKey(parentMatch?.filmKey);
  }

  if (filmKey && filmsByKey.has(filmKey)) {
    const row = filmsByKey.get(filmKey);
    const resolvedParent = normalizeShowtimeFilmKey(row?.parentFilmKey);
    if (resolvedParent) filmKey = resolvedParent;
  }

  if (!filmKey) return null;
  return { filmKey, opportunityKey };
}

