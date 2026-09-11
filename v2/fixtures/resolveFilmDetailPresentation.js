/**
 * Resolve Film Detail presentation for production vs explicit QC fixture modes.
 *
 * Production never falls back to mockup/visual fixture content.
 * QC modes require explicit query/localStorage flags.
 * TMDB-only films resolve via session cache / live snapshot when not in HomeData.
 *
 * Durable `filmId` (e.g. tmdb:N) is preserved across navigation even when the
 * showtime slug is outside the current showtimes window.
 */

import { composeFilmDetailPresentation } from '../filmDetail/composeFilmDetailPresentation.js';
import { composeTmdbOnlyFilmDetailPresentation } from '../filmDetail/composeTmdbOnlyFilmDetail.js';
import { getCachedTmdbOnlyFilm } from '../filmDetail/tmdbOnlyFilmCache.js';
import { asTmdbFilmId } from '../search/tmdbSearchClient.js';
import { isFilmDetailVisualFixtureMode } from './filmDetailVisualFixtures.js';
import {
  getFilmDetailMockupPresentation,
  isFilmDetailMockupFixtureMode,
} from './filmDetailMockupFixture.js';

/**
 * @param {object | null | undefined} homeData
 * @param {string} filmId
 * @returns {string | null}
 */
function findHomeFilmKeyByFilmId(homeData, filmId) {
  const id = asTmdbFilmId(filmId);
  if (!id) return null;
  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const parent =
    films.find(
      (film) =>
        asTmdbFilmId(film?.filmId) === id &&
        !(
          typeof film?.parentFilmKey === 'string' &&
          film.parentFilmKey.trim() &&
          film.parentFilmKey.trim() !== film.filmKey
        ),
    ) ?? null;
  const any = films.find((film) => asTmdbFilmId(film?.filmId) === id) ?? null;
  const match = parent ?? any;
  return typeof match?.filmKey === 'string' && match.filmKey.trim()
    ? match.filmKey.trim()
    : null;
}

/**
 * @param {{
 *   homeData: object | null,
 *   filmKey: string | null | undefined,
 *   filmId?: string | null,
 *   opportunityKey?: string | null,
 *   enrichmentIndex?: object | null,
 *   forceMode?: 'production' | 'visual-fixture' | 'mockup-fixture' | null,
 *   timeFormatId?: string,
 *   tmdbOnlySnapshot?: object | null,
 * }} params
 */
export function resolveFilmDetailPresentation({
  homeData,
  filmKey,
  filmId = null,
  opportunityKey = null,
  enrichmentIndex = null,
  forceMode = null,
  timeFormatId = undefined,
  tmdbOnlySnapshot = null,
}) {
  const mode =
    forceMode ??
    (isFilmDetailMockupFixtureMode()
      ? 'mockup-fixture'
      : isFilmDetailVisualFixtureMode()
        ? 'visual-fixture'
        : 'production');

  if (mode === 'mockup-fixture') {
    return {
      mode: /** @type {'mockup-fixture'} */ ('mockup-fixture'),
      source: 'mockup-fixture',
      resolved: true,
      presentation: getFilmDetailMockupPresentation(),
    };
  }

  if (mode === 'visual-fixture') {
    const composed = composeFilmDetailPresentation(null, filmKey ?? '', null, {
      visualFixtureMode: true,
    });
    return {
      mode: /** @type {'visual-fixture'} */ ('visual-fixture'),
      source: composed.source,
      resolved: composed.resolved,
      presentation: composed,
    };
  }

  const key = typeof filmKey === 'string' ? filmKey.trim() : '';
  const durableFilmId = asTmdbFilmId(filmId) || asTmdbFilmId(key);

  const composeOpts = { enrichmentIndex, timeFormatId };

  if (key) {
    const composed = composeFilmDetailPresentation(
      homeData,
      key,
      opportunityKey,
      composeOpts,
    );
    if (composed.resolved) {
      return {
        mode: /** @type {'production'} */ ('production'),
        source: composed.source,
        resolved: true,
        presentation: composed,
      };
    }
  }

  // Slug missed (or empty) but durable id maps to a different in-window film.
  if (durableFilmId) {
    const altKey = findHomeFilmKeyByFilmId(homeData, durableFilmId);
    if (altKey && altKey !== key) {
      const viaId = composeFilmDetailPresentation(
        homeData,
        altKey,
        opportunityKey,
        composeOpts,
      );
      if (viaId.resolved) {
        return {
          mode: /** @type {'production'} */ ('production'),
          source: viaId.source,
          resolved: true,
          presentation: viaId,
        };
      }
    }

    const snapshot =
      tmdbOnlySnapshot ?? getCachedTmdbOnlyFilm(durableFilmId) ?? null;
    const tmdbPresentation = composeTmdbOnlyFilmDetailPresentation(
      snapshot,
      durableFilmId,
    );
    return {
      mode: /** @type {'production'} */ ('production'),
      source: 'tmdb-live',
      resolved: tmdbPresentation.resolved,
      presentation: tmdbPresentation,
    };
  }

  if (!key) {
    return {
      mode: /** @type {'production'} */ ('production'),
      source: 'home-data',
      resolved: false,
      presentation: composeFilmDetailPresentation(homeData, '', opportunityKey, {
        enrichmentIndex,
        timeFormatId,
      }),
    };
  }

  const composed = composeFilmDetailPresentation(
    homeData,
    key,
    opportunityKey,
    composeOpts,
  );
  return {
    mode: /** @type {'production'} */ ('production'),
    source: composed.source,
    resolved: false,
    presentation: composed,
  };
}
