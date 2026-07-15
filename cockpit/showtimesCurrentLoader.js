/** Cockpit-local URL for the committed current showtimes artifact. */
export const SHOWTIMES_CURRENT_URL = '/data/showtimes_current.json';

export const SHOWTIMES_CURRENT_REPO_PATH = 'public/data/showtimes_current.json';

let showtimesCurrentCache = null;
let showtimesCurrentPromise = null;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Ensure the payload looks like showtimes_current.json.
 * @param {unknown} payload
 */
export function assertShowtimesCurrentShape(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('showtimes_current must be a JSON object');
  }
  if (!Array.isArray(payload.showtimes)) {
    throw new Error('showtimes_current must include a showtimes array');
  }
  if (!Array.isArray(payload.films)) {
    throw new Error('showtimes_current must include a films array');
  }
  if (!Array.isArray(payload.theaters)) {
    throw new Error('showtimes_current must include a theaters array');
  }
  return payload;
}

/**
 * Fetch and parse showtimes_current.json (normalized, not legacy rows).
 * @param {string} [url]
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ artifact: object, meta: { loadMs: number, approximateBytes: number|null } }>}
 */
export async function fetchShowtimesCurrent(
  url = SHOWTIMES_CURRENT_URL,
  fetchImpl = fetch,
) {
  const started = nowMs();
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch current showtimes (${url}): ${detail}`);
  }

  if (!response.ok) {
    throw new Error(
      `Unable to load current showtimes: HTTP ${response.status} for ${url}`,
    );
  }

  let approximateBytes = null;
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0) {
      approximateBytes = parsed;
    }
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`showtimes_current JSON parse failed (${url}): ${detail}`);
  }

  if (approximateBytes == null) {
    try {
      approximateBytes = JSON.stringify(payload).length;
    } catch {
      approximateBytes = null;
    }
  }

  const artifact = assertShowtimesCurrentShape(payload);
  return {
    artifact,
    meta: {
      loadMs: Math.max(0, nowMs() - started),
      approximateBytes,
    },
  };
}

/**
 * Fetch once per page session, sharing in-flight requests (StrictMode-safe).
 * Failed loads do not cache, so a later retry (or refresh) can succeed.
 * @param {() => Promise<{ artifact: object, meta: object }>} [fetchArtifact]
 */
export async function loadShowtimesCurrentOnce(
  fetchArtifact = () => fetchShowtimesCurrent(),
) {
  if (showtimesCurrentCache) {
    return showtimesCurrentCache;
  }

  if (showtimesCurrentPromise) {
    return showtimesCurrentPromise;
  }

  showtimesCurrentPromise = fetchArtifact()
    .then((result) => {
      showtimesCurrentCache = result;
      return result;
    })
    .catch((error) => {
      showtimesCurrentPromise = null;
      throw error;
    })
    .finally(() => {
      showtimesCurrentPromise = null;
    });

  return showtimesCurrentPromise;
}

/** @returns {boolean} */
export function hasShowtimesCurrentCache() {
  return showtimesCurrentCache != null;
}

/** @internal Test-only reset for module-level cache state. */
export function __resetShowtimesCurrentCacheForTests() {
  showtimesCurrentCache = null;
  showtimesCurrentPromise = null;
}
