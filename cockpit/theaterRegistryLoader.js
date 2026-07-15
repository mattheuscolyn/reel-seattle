/** Cockpit-local URL for the synchronized public theater registry artifact. */
export const THEATERS_REGISTRY_URL = '/data/theaters.json';

export const THEATERS_REGISTRY_REPO_PATH = 'public/data/theaters.json';

let theatersRegistryCache = null;
let theatersRegistryPromise = null;

/**
 * Ensure the payload looks like a theater registry document.
 * @param {unknown} payload
 */
export function assertTheaterRegistryShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Theater registry must be a JSON object');
  }
  if (!Array.isArray(payload.theaters)) {
    throw new Error('Theater registry must include a theaters array');
  }
  return payload;
}

/**
 * Fetch and parse theaters.json from the synchronized public artifact.
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchTheaterRegistry(
  url = THEATERS_REGISTRY_URL,
  fetchImpl = fetch,
) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch theater registry (${url}): ${detail}`);
  }

  if (!response.ok) {
    throw new Error(
      `Unable to load theater registry: HTTP ${response.status} for ${url}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Theater registry JSON parse failed (${url}): ${detail}`);
  }

  return assertTheaterRegistryShape(payload);
}

/**
 * Fetch once per page session, sharing in-flight requests (StrictMode-safe).
 * @param {() => Promise<object>} [fetchArtifact]
 */
export async function loadTheaterRegistryOnce(
  fetchArtifact = () => fetchTheaterRegistry(),
) {
  if (theatersRegistryCache) {
    return theatersRegistryCache;
  }

  if (theatersRegistryPromise) {
    return theatersRegistryPromise;
  }

  theatersRegistryPromise = fetchArtifact()
    .then((artifact) => {
      theatersRegistryCache = artifact;
      return artifact;
    })
    .catch((error) => {
      theatersRegistryPromise = null;
      throw error;
    })
    .finally(() => {
      theatersRegistryPromise = null;
    });

  return theatersRegistryPromise;
}

/** @internal Test-only reset for module-level cache state. */
export function __resetTheaterRegistryCacheForTests() {
  theatersRegistryCache = null;
  theatersRegistryPromise = null;
}
