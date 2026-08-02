/**
 * Resolve Film Detail presentation for production vs explicit QC fixture modes.
 *
 * Production never falls back to mockup/visual fixture content.
 * QC modes require explicit query/localStorage flags.
 */

import { composeFilmDetailPresentation } from '../filmDetail/composeFilmDetailPresentation.js';
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
 * }} params
 */
export function resolveFilmDetailPresentation({
  homeData,
  filmKey,
  opportunityKey = null,
  enrichmentIndex = null,
  forceMode = null,
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
      }),
    };
  }

  const composed = composeFilmDetailPresentation(
    homeData,
    key,
    opportunityKey,
    { enrichmentIndex },
  );
  return {
    mode: /** @type {'production'} */ ('production'),
    source: composed.source,
    resolved: composed.resolved,
    presentation: composed,
  };
}
