import { fileURLToPath } from 'node:url';

/**
 * Explicit Cockpit /data allowlist only — never a wildcard filesystem map.
 * Keys are request paths; values are absolute paths to committed artifacts.
 * Includes selected public/data files plus local-only data/source_catalog catalogs.
 */
export const ALLOWED_DATA_ROUTES = Object.freeze({
  '/data/pipeline_report.json': fileURLToPath(
    new URL('../public/data/pipeline_report.json', import.meta.url),
  ),
  '/data/theaters.json': fileURLToPath(
    new URL('../public/data/theaters.json', import.meta.url),
  ),
  '/data/showtimes_current.json': fileURLToPath(
    new URL('../public/data/showtimes_current.json', import.meta.url),
  ),
  '/data/source_catalog/amc_movie_products.json': fileURLToPath(
    new URL('../data/source_catalog/amc_movie_products.json', import.meta.url),
  ),
  '/data/source_catalog/amc_release_observations.json': fileURLToPath(
    new URL(
      '../data/source_catalog/amc_release_observations.json',
      import.meta.url,
    ),
  ),
  '/data/film_identity/tmdb_match_decisions.json': fileURLToPath(
    new URL('../data/film_identity/tmdb_match_decisions.json', import.meta.url),
  ),
  '/data/film_identity/film_identity_catalog.json': fileURLToPath(
    new URL('../data/film_identity/film_identity_catalog.json', import.meta.url),
  ),
  '/data/film_identity/tmdb_match_review_queue.json': fileURLToPath(
    new URL(
      '../data/film_identity/tmdb_match_review_queue.json',
      import.meta.url,
    ),
  ),
  '/data/audits/tmdb_film_identity_coverage.json': fileURLToPath(
    new URL('../data/audits/tmdb_film_identity_coverage.json', import.meta.url),
  ),
  '/data/audits/film_identity_review_pack.json': fileURLToPath(
    new URL('../data/audits/film_identity_review_pack.json', import.meta.url),
  ),
  '/data/film_enrichment_current.json': fileURLToPath(
    new URL('../public/data/film_enrichment_current.json', import.meta.url),
  ),
});
