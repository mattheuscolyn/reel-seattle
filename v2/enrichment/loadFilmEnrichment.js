/**
 * Optional loader for public/data/film_enrichment_current.json (T-ENR-10).
 * Failure never blocks Home showtimes rendering.
 */

import { buildEnrichmentIndex } from './enrichmentIndex.js';
import { resolveV2DataUrl } from '../data/v2DataUrl.js';

export const V2_FILM_ENRICHMENT_URL = resolveV2DataUrl(
  '/data/film_enrichment_current.json',
);

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 */
async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch ${url}: ${detail}`);
  }
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON parse failed for ${url}: ${detail}`);
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   url?: string,
 *   artifact?: unknown,
 * }} [options]
 * @returns {Promise<{
 *   status: 'ready' | 'unavailable',
 *   index: ReturnType<typeof buildEnrichmentIndex>,
 *   warning: string | null,
 *   diagnostics: object,
 * }>}
 */
export async function loadFilmEnrichment(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.url ?? V2_FILM_ENRICHMENT_URL;

  let doc = options.artifact;
  let fetchWarning = null;
  if (doc === undefined) {
    try {
      doc = await fetchJson(url, fetchImpl);
    } catch (error) {
      fetchWarning = error instanceof Error ? error.message : String(error);
      doc = null;
    }
  }

  const index = buildEnrichmentIndex(doc);
  const warning =
    fetchWarning ??
    (index.status === 'unavailable' ? index.reason : null);

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[v2 enrichment]', {
      status: index.status,
      rowCount: index.rowCount,
      warning,
      duplicates: index.duplicateIds.length,
    });
  }

  return {
    status: index.status,
    index,
    warning,
    diagnostics: {
      loaded: index.status === 'ready',
      rowCount: index.rowCount,
      version: index.version,
      duplicateIds: index.duplicateIds,
      warning,
    },
  };
}
