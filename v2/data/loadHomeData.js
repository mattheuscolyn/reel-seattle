/**
 * v2 Home artifact loader (fetch + shape check). Pure transforms live in buildHomeData.js.
 */

import { buildHomeData } from '../adapters/buildHomeData.js';
import { resolveV2DataUrl } from './v2DataUrl.js';

export const V2_SHOWTIMES_URL = resolveV2DataUrl('/data/showtimes_current.json');
export const V2_THEATERS_URL = resolveV2DataUrl('/data/theaters.json');
export const V2_NEWLY_ADDED_URL = resolveV2DataUrl(
  '/data/newly_added_current.json',
);
export const V2_PIPELINE_REPORT_URL = resolveV2DataUrl(
  '/data/pipeline_report.json',
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
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, data: unknown } | { ok: false, error: string }>}
 */
async function fetchOptionalJson(url, fetchImpl) {
  try {
    const data = await fetchJson(url, fetchImpl);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Load required + optional Home artifacts and build HomeData.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   includePipelineReport?: boolean,
 * }} [options]
 * @returns {Promise<
 *   | { ok: true, homeData: ReturnType<typeof buildHomeData>, loadErrors: string[] }
 *   | { ok: false, error: string, homeData: null }
 * >}
 */
export async function loadHomeData(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const includePipelineReport = options.includePipelineReport !== false;
  const loadErrors = [];

  let showtimesCurrent;
  try {
    showtimesCurrent = await fetchJson(V2_SHOWTIMES_URL, fetchImpl);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      homeData: null,
    };
  }

  const theatersResult = await fetchOptionalJson(V2_THEATERS_URL, fetchImpl);
  const newlyAddedResult = await fetchOptionalJson(V2_NEWLY_ADDED_URL, fetchImpl);

  let pipelineReport = null;
  if (includePipelineReport) {
    const pipelineResult = await fetchOptionalJson(V2_PIPELINE_REPORT_URL, fetchImpl);
    if (pipelineResult.ok) {
      pipelineReport = pipelineResult.data;
    } else {
      loadErrors.push(pipelineResult.error);
    }
  }

  if (!theatersResult.ok) {
    loadErrors.push(theatersResult.error);
  }
  if (!newlyAddedResult.ok) {
    loadErrors.push(newlyAddedResult.error);
  }

  try {
    const homeData = buildHomeData({
      showtimesCurrent,
      theatersRegistry: theatersResult.ok ? theatersResult.data : null,
      newlyAdded: newlyAddedResult.ok ? newlyAddedResult.data : null,
      pipelineReport,
    });
    return { ok: true, homeData, loadErrors };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      homeData: null,
    };
  }
}
