/** Cockpit-local path for the committed pipeline observability artifact. */
export const PIPELINE_REPORT_URL = '/data/pipeline_report.json';

export const PIPELINE_REPORT_REPO_PATH = 'public/data/pipeline_report.json';

let pipelineReportCache = null;
let pipelineReportPromise = null;

/**
 * Fetch and parse pipeline_report.json.
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchPipelineReport(url = PIPELINE_REPORT_URL, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch pipeline report (${url}): ${detail}`);
  }

  if (!response.ok) {
    throw new Error(
      `Unable to load pipeline report: HTTP ${response.status} for ${url}`,
    );
  }

  try {
    return await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Pipeline report JSON parse failed (${url}): ${detail}`);
  }
}

/**
 * Fetch once per page session, sharing in-flight requests (StrictMode-safe).
 * @param {() => Promise<object>} [fetchArtifact]
 */
export async function loadPipelineReportOnce(
  fetchArtifact = () => fetchPipelineReport(),
) {
  if (pipelineReportCache) {
    return pipelineReportCache;
  }

  if (pipelineReportPromise) {
    return pipelineReportPromise;
  }

  pipelineReportPromise = fetchArtifact()
    .then((artifact) => {
      pipelineReportCache = artifact;
      return artifact;
    })
    .catch((error) => {
      pipelineReportPromise = null;
      throw error;
    })
    .finally(() => {
      pipelineReportPromise = null;
    });

  return pipelineReportPromise;
}

/** @internal Test-only reset for module-level cache state. */
export function __resetPipelineReportCacheForTests() {
  pipelineReportCache = null;
  pipelineReportPromise = null;
}
