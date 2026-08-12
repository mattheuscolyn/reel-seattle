/**
 * Resolve Film Detail presentation for production vs explicit QC fixture modes.
 *
 * Production never falls back to mockup/visual fixture content.
 * QC modes require explicit query/localStorage flags.
 * TMDB-only films resolve via session cache / live snapshot when not in HomeData.
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
 * @param {{
 *   homeData: object | null,
 *   filmKey: string | null | undefined,
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
    { enrichmentIndex, timeFormatId },
  );
  if (composed.resolved) {
    return {
      mode: /** @type {'production'} */ ('production'),
      source: composed.source,
      resolved: true,
      presentation: composed,
    };
  }

  const tmdbId = asTmdbFilmId(key);
  if (tmdbId) {
    const snapshot = tmdbOnlySnapshot ?? getCachedTmdbOnlyFilm(tmdbId) ?? null;
    const tmdbPresentation = composeTmdbOnlyFilmDetailPresentation(
      snapshot,
      tmdbId,
    );
    return {
      mode: /** @type {'production'} */ ('production'),
      source: 'tmdb-live',
      resolved: tmdbPresentation.resolved,
      presentation: tmdbPresentation,
    };
  }

  return {
    mode: /** @type {'production'} */ ('production'),
    source: composed.source,
    resolved: false,
    presentation: composed,
  };
}
