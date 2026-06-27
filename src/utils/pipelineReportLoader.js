import { fetchPipelineReportArtifact } from '../showtimesAdapter.js';

let pipelineReportCache = null;
let pipelineReportPromise = null;

/**
 * Fetch pipeline_report.json once per page session, sharing in-flight requests.
 * Used by PipelineReportProvider to avoid duplicate StrictMode dev fetches.
 */
export async function loadPipelineReportArtifactOnce(
  fetchArtifact = fetchPipelineReportArtifact,
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
