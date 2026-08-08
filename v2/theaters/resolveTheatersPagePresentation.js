/**
 * Theaters list / Theater Detail presentation mode switch (T-THEA-10).
 *
 * Production/live HomeData is the default.
 * Explicit mockup/QC: `?theaterMockup=1` or localStorage flag.
 * `?theaterLive=1` remains a compatibility alias (forces production).
 */

import { getTheatersMockupPresentation } from '../fixtures/theatersMockupFixture.js';
import {
  getTheaterDetailMockupPresentation,
  THEATER_DETAIL_DEFAULT_THEATER_ID,
} from '../fixtures/theaterDetailMockupFixture.js';
import { composeTheatersListPresentation } from './composeTheatersListPresentation.js';
import { composeTheaterDetailPresentation } from './composeTheaterDetailPresentation.js';

export const THEATER_MOCKUP_FLAG_QUERY = 'theaterMockup';
export const THEATER_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.theaterMockup';
/** @deprecated Compatibility alias — live is already the default. */
export const THEATER_LIVE_FLAG_QUERY = 'theaterLive';
/** @deprecated Compatibility alias — live is already the default. */
export const THEATER_LIVE_STORAGE_KEY = 'reel-seattle.v2.theaterLive';

/**
 * Explicit QC/mockup mode — never the production default.
 * @returns {boolean}
 */
export function isTheaterMockupPresentationMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(THEATER_MOCKUP_FLAG_QUERY) === '1') return true;
    if (window.localStorage?.getItem(THEATER_MOCKUP_STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * @deprecated Prefer isTheaterMockupPresentationMode (inverted default).
 * Kept so older call sites / docs referring to theaterLive still resolve.
 * @returns {boolean}
 */
export function isTheaterLivePresentationMode() {
  if (isTheaterMockupPresentationMode()) return false;
  if (typeof window === 'undefined') return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(THEATER_LIVE_FLAG_QUERY) === '0') return false;
  } catch {
    // ignore
  }
  return true;
}

/**
 * @param {{
 *   homeData?: object | null,
 *   forceMode?: 'production' | 'mockup-fixture' | null,
 * }} [params]
 */
export function resolveTheatersPagePresentation({
  homeData = null,
  forceMode = null,
} = {}) {
  const mode =
    forceMode ??
    (isTheaterMockupPresentationMode() ? 'mockup-fixture' : 'production');

  if (mode === 'mockup-fixture') {
    const presentation = getTheatersMockupPresentation();
    return {
      mode: /** @type {'mockup-fixture'} */ ('mockup-fixture'),
      source: presentation.source,
      presentation,
    };
  }

  const presentation = composeTheatersListPresentation(homeData);
  return {
    mode: /** @type {'production'} */ ('production'),
    source: presentation.source,
    presentation,
  };
}

/**
 * @param {{
 *   theaterId?: string | null,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   forceMode?: 'production' | 'mockup-fixture' | null,
 * }} [params]
 */
export function resolveTheaterDetailPagePresentation({
  theaterId = THEATER_DETAIL_DEFAULT_THEATER_ID,
  homeData = null,
  enrichmentIndex = null,
  forceMode = null,
} = {}) {
  const mode =
    forceMode ??
    (isTheaterMockupPresentationMode() ? 'mockup-fixture' : 'production');

  if (mode === 'mockup-fixture') {
    const presentation = getTheaterDetailMockupPresentation();
    return {
      mode: /** @type {'mockup-fixture'} */ ('mockup-fixture'),
      source: presentation.source,
      resolved: true,
      presentation,
    };
  }

  const presentation = composeTheaterDetailPresentation(
    homeData,
    theaterId,
    enrichmentIndex,
  );
  return {
    mode: /** @type {'production'} */ ('production'),
    source: presentation.source,
    resolved: presentation.resolved,
    presentation,
  };
}
