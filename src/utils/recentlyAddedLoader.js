import { fetchRecentlyAddedArtifact } from './recentlyAddedAdapter.js';

let recentlyAddedCache = null;
let recentlyAddedPromise = null;

/**
 * Fetch newly_added_current.json once per page session, sharing in-flight requests.
 */
export async function loadRecentlyAddedArtifactOnce(
  fetchArtifact = fetchRecentlyAddedArtifact,
) {
  if (recentlyAddedCache) {
    return recentlyAddedCache;
  }

  if (recentlyAddedPromise) {
    return recentlyAddedPromise;
  }

  recentlyAddedPromise = fetchArtifact()
    .then((artifact) => {
      recentlyAddedCache = artifact;
      return artifact;
    })
    .catch((error) => {
      recentlyAddedPromise = null;
      throw error;
    })
    .finally(() => {
      recentlyAddedPromise = null;
    });

  return recentlyAddedPromise;
}

/** @internal Test-only reset for module-level cache state. */
export function __resetRecentlyAddedLoaderCacheForTests() {
  recentlyAddedCache = null;
  recentlyAddedPromise = null;
}
