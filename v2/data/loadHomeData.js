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
export const V2_OPENING_THIS_WEEK_URL = resolveV2DataUrl(
  '/data/opening_this_week_current.json',
);
export const V2_LEAVING_SOON_URL = resolveV2DataUrl(
  '/data/leaving_soon_current.json',
);
export const V2_PIPELINE_REPORT_URL = resolveV2DataUrl(
  '/data/pipeline_report.json',
);
export const V2_COLLECTIONS_URL = resolveV2DataUrl(
  '/data/collections_current.json',
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
 * Let already-queued input run before synchronous Home assembly.
 * A macrotask boundary (not a timed delay): clicks can commit a destination
 * change before `buildHomeData` occupies the main thread.
 */
function yieldToMainThread() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

  // None of these artifacts read each other. Start them together.
  // showtimes_current.json stays required; a failure returns immediately and
  // does not wait for the optional requests already in flight.
  // pipeline_report.json is not read by the Home UI. It still feeds
  // sourceHealth for showtimes freshness ("Some listings may be incomplete."),
  // so it stays in this optional set rather than being dropped.
  const showtimesPromise = fetchJson(V2_SHOWTIMES_URL, fetchImpl);
  const theatersPromise = fetchOptionalJson(V2_THEATERS_URL, fetchImpl);
  const newlyAddedPromise = fetchOptionalJson(V2_NEWLY_ADDED_URL, fetchImpl);
  const openingThisWeekPromise = fetchOptionalJson(
    V2_OPENING_THIS_WEEK_URL,
    fetchImpl,
  );
  const leavingSoonPromise = fetchOptionalJson(V2_LEAVING_SOON_URL, fetchImpl);
  const collectionsPromise = fetchOptionalJson(V2_COLLECTIONS_URL, fetchImpl);
  const pipelinePromise = includePipelineReport
    ? fetchOptionalJson(V2_PIPELINE_REPORT_URL, fetchImpl)
    : null;

  let showtimesCurrent;
  try {
    showtimesCurrent = await showtimesPromise;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      homeData: null,
    };
  }

  const [
    theatersResult,
    newlyAddedResult,
    openingThisWeekResult,
    leavingSoonResult,
    collectionsResult,
    pipelineResult,
  ] = await Promise.all([
    theatersPromise,
    newlyAddedPromise,
    openingThisWeekPromise,
    leavingSoonPromise,
    collectionsPromise,
    pipelinePromise ?? Promise.resolve(null),
  ]);

  const loadErrors = [];
  let pipelineReport = null;
  if (pipelineResult) {
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
  if (!openingThisWeekResult.ok) {
    loadErrors.push(openingThisWeekResult.error);
  }
  if (!leavingSoonResult.ok) {
    loadErrors.push(leavingSoonResult.error);
  }
  if (!collectionsResult.ok) {
    loadErrors.push(collectionsResult.error);
  }

  await yieldToMainThread();

  try {
    const homeData = buildHomeData({
      showtimesCurrent,
      theatersRegistry: theatersResult.ok ? theatersResult.data : null,
      newlyAdded: newlyAddedResult.ok ? newlyAddedResult.data : null,
      openingThisWeek: openingThisWeekResult.ok ? openingThisWeekResult.data : null,
      leavingSoon: leavingSoonResult.ok ? leavingSoonResult.data : null,
      collectionsCurrent: collectionsResult.ok ? collectionsResult.data : null,
      pipelineReport,
    });
    return {
      ok: true,
      homeData: { ...homeData, loadErrors },
      loadErrors,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      homeData: null,
    };
  }
}
