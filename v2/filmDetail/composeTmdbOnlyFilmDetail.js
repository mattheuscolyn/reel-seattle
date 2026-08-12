/**
 * Film Detail presentation for TMDB-only films (no Seattle showtimes yet).
 */

import { formatRuntimeLabel } from '../home/shelfData.js';
import { truncateSynopsis } from './filmDetailModel.js';
import { joinMetaParts } from './composeFilmDetailPresentation.js';
import { asTmdbFilmId } from '../search/tmdbSearchClient.js';

/**
 * @param {object | null | undefined} snapshot — from tmdbOnlyFilmCache
 * @param {string} [filmKey]
 */
export function composeTmdbOnlyFilmDetailPresentation(snapshot, filmKey = '') {
  const key =
    asTmdbFilmId(snapshot?.filmId) ||
    asTmdbFilmId(filmKey) ||
    (typeof filmKey === 'string' ? filmKey.trim() : '');

  if (!snapshot || typeof snapshot !== 'object' || !key) {
    return {
      mode: /** @type {'tmdb-only'} */ ('tmdb-only'),
      source: 'tmdb-live',
      resolved: false,
      filmKey: key || filmKey || null,
      filmId: asTmdbFilmId(key),
      displayTitle: null,
      hero: null,
      signals: [],
      signalTotal: 0,
      synopsis: {
        available: false,
        preview: null,
        full: null,
        needsMore: false,
        tags: [],
      },
      bestWay: null,
      bestWayEmpty: true,
      today: { localDate: null, rows: [], empty: true },
      availabilityNote: 'No Seattle showtimes yet',
      availabilityHint:
        'Save this film and Reel Seattle can watch for local screenings.',
    };
  }

  const title = snapshot.title;
  const runtimeLabel =
    typeof snapshot.runtimeMin === 'number'
      ? formatRuntimeLabel(snapshot.runtimeMin)
      : null;
  const yearLabel =
    snapshot.year != null ? String(snapshot.year) : null;
  const genresLabel =
    Array.isArray(snapshot.genres) && snapshot.genres.length
      ? snapshot.genres.join(' · ')
      : null;
  const directorLabel =
    Array.isArray(snapshot.directors) && snapshot.directors.length
      ? `Directed by ${snapshot.directors.join(', ')}`
      : null;
  const synopsisParts = truncateSynopsis(snapshot.overview, 160);

  return {
    mode: /** @type {'tmdb-only'} */ ('tmdb-only'),
    source: 'tmdb-live',
    resolved: true,
    filmKey: key,
    filmId: key,
    hasEnrichment: true,
    displayTitle: title,
    canonicalTitle: title,
    sourceTitle: title,
    hero: {
      filmKey: key,
      filmId: key,
      title,
      posterUrl: snapshot.posterUrl ?? null,
      backdropUrl: snapshot.backdropUrl ?? null,
      runtimeLabel,
      year: yearLabel,
      rating: snapshot.usCertification ?? null,
      genres: genresLabel,
      director: directorLabel,
      badges: [],
      metaLine: joinMetaParts(
        yearLabel,
        runtimeLabel,
        snapshot.usCertification ?? null,
      ),
      synopsis: snapshot.overview ?? null,
      hasEnrichment: true,
    },
    signals: [],
    signalTotal: 0,
    synopsis: {
      available: Boolean(snapshot.overview),
      preview: synopsisParts.preview,
      full: synopsisParts.full,
      needsMore: synopsisParts.needsMore,
      tags: [],
    },
    bestWay: null,
    bestWayEmpty: true,
    today: { localDate: null, rows: [], empty: true },
    availabilityNote: 'No Seattle showtimes yet',
    availabilityHint:
      'Save this film and Reel Seattle can watch for local screenings.',
  };
}
