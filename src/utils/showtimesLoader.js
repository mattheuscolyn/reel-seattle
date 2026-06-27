import { fetchShowtimesArtifact } from '../showtimesAdapter.js';

let showtimesArtifactCache = null;
let showtimesArtifactPromise = null;

/**
 * Fetch showtimes_current.json once per page session, sharing in-flight requests.
 * Used by ShowtimesDataProvider to avoid duplicate StrictMode dev fetches.
 */
export async function loadShowtimesArtifactOnce(
  fetchArtifact = fetchShowtimesArtifact,
) {
  if (showtimesArtifactCache) {
    return showtimesArtifactCache;
  }

  if (showtimesArtifactPromise) {
    return showtimesArtifactPromise;
  }

  showtimesArtifactPromise = fetchArtifact()
    .then((artifact) => {
      showtimesArtifactCache = artifact;
      return artifact;
    })
    .catch((error) => {
      showtimesArtifactPromise = null;
      throw error;
    })
    .finally(() => {
      showtimesArtifactPromise = null;
    });

  return showtimesArtifactPromise;
}

/** @internal Test-only reset for module-level cache state. */
export function __resetShowtimesLoaderCacheForTests() {
  showtimesArtifactCache = null;
  showtimesArtifactPromise = null;
}
