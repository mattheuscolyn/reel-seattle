/**
 * Convert TMDB-only / live detail snapshots into enrichment-shaped rows
 * so resolveEnrichedFilmPresentation can consume them without per-card fetches.
 */

import { asCanonicalFilmId } from './enrichmentIndex.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {object | null | undefined} snapshot
 *   Normalized TMDB detail from tmdbOnlyFilmCache / normalizeTmdbMovieDetail,
 *   or a raw enrichment-like row.
 * @returns {object | null}
 */
export function enrichmentRowFromTmdbSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const filmId =
    asCanonicalFilmId(snapshot.film_id) ??
    asCanonicalFilmId(snapshot.filmId) ??
    null;
  if (!filmId) return null;

  const displayTitle =
    asText(snapshot.display_title) ??
    asText(snapshot.title) ??
    asText(snapshot.original_title) ??
    asText(snapshot.originalTitle);
  if (!displayTitle) return null;

  const genresRaw = Array.isArray(snapshot.genres) ? snapshot.genres : [];
  const genres = genresRaw
    .map((genre) => {
      if (typeof genre === 'string') {
        const name = genre.trim();
        return name ? { name } : null;
      }
      const name = asText(genre?.name);
      return name ? { name } : null;
    })
    .filter(Boolean);

  const directorsRaw = Array.isArray(snapshot.directors) ? snapshot.directors : [];
  const directors = directorsRaw
    .map((person) => {
      if (typeof person === 'string') {
        const name = person.trim();
        return name ? { name } : null;
      }
      const name = asText(person?.name);
      return name ? { name } : null;
    })
    .filter(Boolean);

  const posterUrl = asText(snapshot.posterUrl) ?? asText(snapshot.poster?.url);
  const posterPath = asText(snapshot.poster?.path) ?? asText(snapshot.poster_path);
  const backdropUrl =
    asText(snapshot.backdropUrl) ?? asText(snapshot.backdrop?.url);
  const backdropPath =
    asText(snapshot.backdrop?.path) ?? asText(snapshot.backdrop_path);

  const releaseYear =
    typeof snapshot.release_year === 'number' && Number.isFinite(snapshot.release_year)
      ? snapshot.release_year
      : typeof snapshot.year === 'number' && Number.isFinite(snapshot.year)
        ? snapshot.year
        : null;

  const runtimeMinutes =
    typeof snapshot.runtime_minutes === 'number' &&
    Number.isFinite(snapshot.runtime_minutes)
      ? snapshot.runtime_minutes
      : typeof snapshot.runtimeMin === 'number' && Number.isFinite(snapshot.runtimeMin)
        ? snapshot.runtimeMin
        : null;

  return {
    film_id: filmId,
    tmdb_id: Number(filmId.slice('tmdb:'.length)),
    display_title: displayTitle,
    original_title:
      asText(snapshot.original_title) ??
      asText(snapshot.originalTitle) ??
      displayTitle,
    release_year: releaseYear,
    release_date:
      asText(snapshot.release_date) ?? asText(snapshot.releaseDate) ?? null,
    overview: asText(snapshot.overview) ?? asText(snapshot.synopsis) ?? null,
    runtime_minutes: runtimeMinutes,
    genres,
    directors,
    us_certification:
      asText(snapshot.us_certification) ??
      asText(snapshot.usCertification) ??
      null,
    poster: posterPath || posterUrl ? { path: posterPath, url: posterUrl } : null,
    backdrop:
      backdropPath || backdropUrl
        ? { path: backdropPath, url: backdropUrl }
        : null,
    provenance: {
      source: 'tmdb_live_hydrate',
    },
    field_provenance: {
      display_title: 'tmdb',
      overview: 'tmdb',
      poster: 'tmdb',
      runtime_minutes: 'tmdb',
    },
  };
}
