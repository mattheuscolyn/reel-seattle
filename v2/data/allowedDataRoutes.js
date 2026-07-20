import { fileURLToPath } from 'node:url';

/**
 * Explicit v2 /data allowlist — never a wildcard filesystem map.
 * Leaves Leaving Soon and source catalogs out of the Home baseline.
 */
export const ALLOWED_V2_DATA_ROUTES = Object.freeze({
  '/data/showtimes_current.json': fileURLToPath(
    new URL('../../public/data/showtimes_current.json', import.meta.url),
  ),
  '/data/theaters.json': fileURLToPath(
    new URL('../../public/data/theaters.json', import.meta.url),
  ),
  '/data/newly_added_current.json': fileURLToPath(
    new URL('../../public/data/newly_added_current.json', import.meta.url),
  ),
  '/data/pipeline_report.json': fileURLToPath(
    new URL('../../public/data/pipeline_report.json', import.meta.url),
  ),
});

/** Paths that must never be served to the v2 Home baseline. */
export const EXCLUDED_V2_DATA_PATHS = Object.freeze([
  '/data/leaving_soon_current.json',
]);
