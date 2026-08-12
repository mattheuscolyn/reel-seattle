/**
 * Session cache for TMDB-only Film Detail payloads.
 * Not written into showtimes_current or enrichment artifacts.
 *
 * In-memory Map for fast reads; sessionStorage so deep-links survive refresh
 * within the same browser tab.
 */

import {
  asTmdbFilmId,
  backdropUrlFromTmdbPath,
  posterUrlFromTmdbPath,
  yearFromReleaseDate,
} from '../search/tmdbSearchClient.js';

const SESSION_PREFIX = 'reel.seattle.tmdbOnlyFilm.v1:';

/** @type {Map<string, object>} */
const cache = new Map();

/**
 * @returns {Storage | null}
 */
function getSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} filmId
 * @returns {object | null}
 */
function readSession(filmId) {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${SESSION_PREFIX}${filmId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} filmId
 * @param {object} payload
 */
function writeSession(filmId, payload) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(`${SESSION_PREFIX}${filmId}`, JSON.stringify(payload));
  } catch {
    // Quota / private mode — memory cache still works for the session.
  }
}

/**
 * @param {string | null | undefined} filmId
 * @returns {object | null}
 */
export function getCachedTmdbOnlyFilm(filmId) {
  const id = asTmdbFilmId(filmId);
  if (!id) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  const fromSession = readSession(id);
  if (fromSession) {
    cache.set(id, fromSession);
    return fromSession;
  }
  return null;
}

/**
 * @param {string | null | undefined} filmId
 * @param {object} payload
 */
export function setCachedTmdbOnlyFilm(filmId, payload) {
  const id = asTmdbFilmId(filmId);
  if (!id || !payload || typeof payload !== 'object') return;
  const prev = cache.get(id) ?? {};
  const merged = { ...prev, ...payload, filmId: id };
  cache.set(id, merged);
  writeSession(id, merged);
}

/**
 * Seed a lightweight snapshot from a Search result before detail fetch.
 * @param {object} film — TMDB search result VM
 */
export function seedTmdbOnlyFilmFromSearchHit(film) {
  if (!film || typeof film !== 'object') return null;
  const filmId = asTmdbFilmId(film.filmId ?? film.filmKey);
  if (!filmId) return null;
  const snapshot = {
    filmId,
    tmdbId:
      typeof film.tmdbId === 'number'
        ? film.tmdbId
        : Number(filmId.slice('tmdb:'.length)),
    title: typeof film.title === 'string' ? film.title : null,
    year: film.year ?? null,
    posterUrl: film.posterUrl ?? null,
    runtimeMin: film.runtimeMin ?? null,
    overview: film.synopsis ?? null,
    genres: [],
    directors: [],
    usCertification: null,
    releaseDate: null,
    backdropUrl: null,
    fetchedAt: null,
  };
  setCachedTmdbOnlyFilm(filmId, snapshot);
  return snapshot;
}

export function clearTmdbOnlyFilmCache() {
  cache.clear();
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(SESSION_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Normalize a TMDB /movie/:id proxy payload into a durable detail snapshot.
 * @param {object} movie
 */
export function normalizeTmdbMovieDetail(movie) {
  if (!movie || typeof movie !== 'object') return null;
  const filmId = asTmdbFilmId(movie.id);
  if (!filmId) return null;
  const title =
    (typeof movie.title === 'string' && movie.title.trim()) ||
    (typeof movie.original_title === 'string' && movie.original_title.trim()) ||
    null;
  if (!title) return null;

  const runtimeMin =
    typeof movie.runtime === 'number' &&
    Number.isFinite(movie.runtime) &&
    movie.runtime > 0
      ? Math.round(movie.runtime)
      : null;
  const year = yearFromReleaseDate(movie.release_date);
  const overview =
    typeof movie.overview === 'string' && movie.overview.trim()
      ? movie.overview.trim()
      : null;
  const genres = Array.isArray(movie.genres)
    ? movie.genres
        .map((g) => (typeof g?.name === 'string' ? g.name.trim() : ''))
        .filter(Boolean)
    : [];

  const crew = Array.isArray(movie.credits?.crew) ? movie.credits.crew : [];
  const directors = crew
    .filter((person) => person?.job === 'Director')
    .map((person) =>
      typeof person?.name === 'string' ? person.name.trim() : '',
    )
    .filter(Boolean);

  const certification =
    typeof movie.us_certification === 'string' && movie.us_certification.trim()
      ? movie.us_certification.trim()
      : null;

  return {
    filmId,
    tmdbId: Number(filmId.slice('tmdb:'.length)),
    title,
    originalTitle:
      typeof movie.original_title === 'string' ? movie.original_title : null,
    releaseDate:
      typeof movie.release_date === 'string' ? movie.release_date : null,
    year,
    runtimeMin,
    overview,
    genres,
    directors,
    usCertification: certification,
    posterUrl: posterUrlFromTmdbPath(movie.poster_path, 'w500'),
    backdropUrl: backdropUrlFromTmdbPath(movie.backdrop_path, 'w780'),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Store + return normalized detail from a raw movie payload.
 * @param {object} movie
 */
export function cacheTmdbMovieDetail(movie) {
  const normalized = normalizeTmdbMovieDetail(movie);
  if (!normalized) return null;
  setCachedTmdbOnlyFilm(normalized.filmId, normalized);
  return normalized;
}
