/**
 * Optional loader for public/data/coming_soon_current.json.
 * Failure never blocks Home or Explore landing.
 */

import { resolveV2DataUrl } from '../data/v2DataUrl.js';

export const V2_COMING_SOON_CURRENT_URL = resolveV2DataUrl(
  '/data/coming_soon_current.json',
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
 * @param {unknown} doc
 */
export function isComingSoonArtifact(doc) {
  return Boolean(
    doc &&
      typeof doc === 'object' &&
      typeof doc.schema_version === 'string' &&
      Array.isArray(doc.entries),
  );
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   url?: string,
 *   artifact?: unknown,
 * }} [options]
 * @returns {Promise<{
 *   status: 'ready' | 'unavailable',
 *   artifact: object | null,
 *   warning: string | null,
 * }>}
 */
export async function loadComingSoonCurrent(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.url ?? V2_COMING_SOON_CURRENT_URL;

  let doc = options.artifact;
  let warning = null;
  if (doc === undefined) {
    try {
      doc = await fetchJson(url, fetchImpl);
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
      doc = null;
    }
  }

  if (!isComingSoonArtifact(doc)) {
    return {
      status: 'unavailable',
      artifact: null,
      warning: warning ?? 'coming_soon_current.json is missing or invalid',
    };
  }

  return {
    status: 'ready',
    artifact: doc,
    warning,
  };
}
