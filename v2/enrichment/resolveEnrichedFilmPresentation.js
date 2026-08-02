/**
 * Shared source + enrichment presentation merge (T-ENR-10).
 * Join is exact canonical filmId only — never title / source id.
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
 *     runtimeMin?: number | null,
 *   } | null,
 *   enrichment?: object | null,
 *   enrichmentIndex?: import('./enrichmentIndex.js').buildEnrichmentIndex extends Function
 *     ? ReturnType<typeof import('./enrichmentIndex.js').buildEnrichmentIndex>
 *     : never,
 *   context?: 'home' | 'opening' | 'search' | 'film-detail',
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
  // Home/Opening: opportunity title wins.
  // Search / Film Detail: film-entity heading prefers canonical.
  const displayTitle =
    context === 'search' || context === 'film-detail'
      ? canonicalTitle ?? sourceTitle
      : sourceTitle ?? canonicalTitle;

  const canonicalYear =
    typeof row?.release_year === 'number' && Number.isFinite(row.release_year)
      ? row.release_year
      : null;

  const genreNames = formatGenreNames(row?.genres);
  const genreLine = genreNames.length > 0 ? genreNames.join(', ') : null;

  const overviewFull = asText(row?.overview);
  const synopsisParts = truncateSynopsis(overviewFull ?? '', SYNOPSIS_PREVIEW_CHARS);

  const sourcePoster = asText(sourceFilm?.posterUrl);
  const tmdbPoster = resolveTmdbImageUrl(
    row?.poster,
    enrichmentIndex?.imageConfig ?? null,
    'poster',
  );
  const posterUrl = sourcePoster ?? tmdbPoster ?? null;
  const posterSource = sourcePoster ? 'source' : tmdbPoster ? 'tmdb' : 'none';

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
    runtimeMin:
      typeof sourceFilm?.runtimeMin === 'number' ? sourceFilm.runtimeMin : null,
  };
}
