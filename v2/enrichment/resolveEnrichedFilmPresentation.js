/**
 * Shared source + enrichment presentation merge.
 * Join is exact canonical filmId only — never title / source id.
 *
 * Film-level precedence (canonical-film-contract):
 * manual override → TMDB → theater source → unavailable.
 * Home/Opening card titles still prefer opportunity/source titles.
 */

import { asCanonicalFilmId, lookupEnrichment } from './enrichmentIndex.js';
import { resolveTmdbImageUrl } from './resolveTmdbImageUrl.js';
import { truncateSynopsis } from '../filmDetail/filmDetailModel.js';

const MAX_GENRES_COMPACT = 2;
const SYNOPSIS_PREVIEW_CHARS = 160;

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
 * @param {unknown} genres
 * @param {number} [max]
 * @returns {string[]}
 */
export function formatGenreNames(genres, max = MAX_GENRES_COMPACT) {
  if (!Array.isArray(genres)) return [];
  /** @type {string[]} */
  const names = [];
  const seen = new Set();
  for (const genre of genres) {
    const name = asText(genre?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= max) break;
  }
  return names;
}

/**
 * @param {unknown} directors
 * @returns {string | null}
 */
export function formatDirectorLine(directors) {
  if (!Array.isArray(directors) || directors.length === 0) return null;
  const names = directors
    .map((d) => asText(d?.name))
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * @param {{
 *   sourceFilm?: {
 *     filmId?: string | null,
 *     title?: string | null,
 *     posterUrl?: string | null,
 *     backdropUrl?: string | null,
 *     runtimeMin?: number | null,
 *     synopsis?: string | null,
 *     certification?: string | null,
 *   } | null,
 *   enrichment?: object | null,
 *   enrichmentIndex?: import('./enrichmentIndex.js').buildEnrichmentIndex extends Function
 *     ? ReturnType<typeof import('./enrichmentIndex.js').buildEnrichmentIndex>
 *     : never,
 *   context?: 'home' | 'opening' | 'search' | 'film-detail' | 'theater' | 'showtimes' | 'planner' | 'schedule' | 'collection',
 * }} args
 */
export function resolveEnrichedFilmPresentation({
  sourceFilm = null,
  enrichment = null,
  enrichmentIndex = null,
  context = 'home',
} = {}) {
  const filmId = asCanonicalFilmId(sourceFilm?.filmId);
  const row =
    enrichment ??
    (filmId ? lookupEnrichment(enrichmentIndex, filmId) : null);

  const sourceTitle = asText(sourceFilm?.title);
  const canonicalTitle = asText(row?.display_title) ?? asText(row?.original_title);
  // Film-entity surfaces prefer TMDB canonical title.
  // Home/Opening cards still prefer opportunity/source titles.
  const preferCanonicalTitle =
    context === 'search' ||
    context === 'film-detail' ||
    context === 'theater' ||
    context === 'showtimes' ||
    context === 'planner' ||
    context === 'schedule' ||
    context === 'collection';
  const displayTitle = preferCanonicalTitle
    ? canonicalTitle ?? sourceTitle
    : sourceTitle ?? canonicalTitle;

  const canonicalYear =
    typeof row?.release_year === 'number' && Number.isFinite(row.release_year)
      ? row.release_year
      : null;

  const genreNames = formatGenreNames(
    row?.genres,
    context === 'film-detail' ? 6 : MAX_GENRES_COMPACT,
  );
  const genreLine = genreNames.length > 0 ? genreNames.join(', ') : null;

  const overviewFull = asText(row?.overview) ?? asText(sourceFilm?.synopsis);
  const synopsisParts = truncateSynopsis(overviewFull ?? '', SYNOPSIS_PREVIEW_CHARS);

  const sourcePoster = asText(sourceFilm?.posterUrl);
  const tmdbPoster = resolveTmdbImageUrl(
    row?.poster,
    enrichmentIndex?.imageConfig ?? null,
    'poster',
  );
  // Film-level media: TMDB first; theater fills gaps.
  const posterUrl = tmdbPoster ?? sourcePoster ?? null;
  const posterSource = tmdbPoster ? 'tmdb' : sourcePoster ? 'source' : 'none';

  const tmdbBackdrop = resolveTmdbImageUrl(
    row?.backdrop,
    enrichmentIndex?.imageConfig ?? null,
    'backdrop',
  );
  const sourceBackdrop = asText(sourceFilm?.backdropUrl);
  const backdropUrl = tmdbBackdrop ?? sourceBackdrop ?? null;
  const backdropSource = tmdbBackdrop ? 'tmdb' : sourceBackdrop ? 'source' : 'none';

  const tmdbRuntime =
    typeof row?.runtime_minutes === 'number' && Number.isFinite(row.runtime_minutes)
      ? row.runtime_minutes
      : null;
  const sourceRuntime =
    typeof sourceFilm?.runtimeMin === 'number' && Number.isFinite(sourceFilm.runtimeMin)
      ? sourceFilm.runtimeMin
      : null;
  const runtimeMin = tmdbRuntime ?? sourceRuntime ?? null;
  const runtimeSource =
    tmdbRuntime != null ? 'tmdb' : sourceRuntime != null ? 'theater_source' : 'unavailable';

  const usCertification =
    asText(row?.us_certification) ?? asText(sourceFilm?.certification) ?? null;
  const certificationSource = asText(row?.us_certification)
    ? 'tmdb'
    : asText(sourceFilm?.certification)
      ? 'theater_source'
      : 'unavailable';

  /** @type {Record<string, string>} */
  const fieldProvenance = {
    ...(row?.field_provenance && typeof row.field_provenance === 'object'
      ? row.field_provenance
      : {}),
    poster: posterSource === 'tmdb' ? 'tmdb' : posterSource === 'source' ? 'theater_source' : 'unavailable',
    backdrop:
      backdropSource === 'tmdb'
        ? 'tmdb'
        : backdropSource === 'source'
          ? 'theater_source'
          : 'unavailable',
    runtime_minutes: runtimeSource,
    us_certification: certificationSource,
    overview: asText(row?.overview)
      ? 'tmdb'
      : asText(sourceFilm?.synopsis)
        ? 'theater_source'
        : 'unavailable',
    canonical_title: canonicalTitle
      ? 'tmdb'
      : sourceTitle
        ? 'theater_source'
        : 'unavailable',
  };

  return {
    filmId,
    hasEnrichment: Boolean(row),
    context,
    sourceTitle,
    canonicalTitle,
    displayTitle,
    canonicalYear,
    genres: genreNames,
    genreLine,
    overview: overviewFull,
    synopsisPreview: synopsisParts.preview,
    synopsisFull: synopsisParts.full,
    directors: formatDirectorLine(row?.directors),
    posterUrl,
    posterSource,
    backdropUrl,
    backdropSource,
    runtimeMin,
    runtimeSource,
    usCertification,
    fieldProvenance,
  };
}
