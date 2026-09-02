/**
 * Explicit v2 /data allowlist — single source of truth for:
 * - Vite dev/preview middleware serving
 * - Production `dist-v2` data copy during `npm run build:v2`
 *
 * Never a wildcard filesystem map. Leaving Soon and source catalogs stay out.
 */

import { existsSync } from 'node:fs';
import { dirname, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
/** Repo root (…/reel-seattle). */
export const V2_DATA_REPO_ROOT = resolve(MODULE_DIR, '../..');
/** Only files under this directory may be allowlisted. */
export const V2_PUBLIC_DATA_ROOT = resolve(V2_DATA_REPO_ROOT, 'public/data');

/**
 * @typedef {{
 *   route: string,
 *   sourceRelative: string,
 *   required: boolean,
 * }} V2DataArtifactDef
 */

/**
 * Authoritative artifact list.
 *
 * `required` mirrors runtime loaders:
 * - showtimes → hard-required by `loadHomeData`
 * - theaters / newly_added / pipeline_report / enrichment → optional (honest degrade)
 *
 * @type {readonly V2DataArtifactDef[]}
 */
export const V2_DATA_ARTIFACTS = Object.freeze([
  Object.freeze({
    route: '/data/showtimes_current.json',
    sourceRelative: 'public/data/showtimes_current.json',
    required: true,
  }),
  Object.freeze({
    route: '/data/theaters.json',
    sourceRelative: 'public/data/theaters.json',
    required: false,
  }),
  Object.freeze({
    route: '/data/newly_added_current.json',
    sourceRelative: 'public/data/newly_added_current.json',
    required: false,
  }),
  Object.freeze({
    route: '/data/opening_this_week_current.json',
    sourceRelative: 'public/data/opening_this_week_current.json',
    required: false,
  }),
  Object.freeze({
    route: '/data/pipeline_report.json',
    sourceRelative: 'public/data/pipeline_report.json',
    required: false,
  }),
  Object.freeze({
    route: '/data/film_enrichment_current.json',
    sourceRelative: 'public/data/film_enrichment_current.json',
    required: false,
  }),
]);

/**
 * Resolve and validate an artifact source path (must stay under public/data).
 * @param {V2DataArtifactDef | { sourceRelative: string, route?: string }} artifact
 * @returns {string} absolute filesystem path
 */
export function resolveV2DataArtifactSource(artifact) {
  const sourceRelative = artifact?.sourceRelative;
  if (typeof sourceRelative !== 'string' || !sourceRelative.trim()) {
    throw new Error('v2 data artifact missing sourceRelative');
  }
  if (
    sourceRelative.includes('\0') ||
    sourceRelative.split(/[/\\]/).includes('..')
  ) {
    throw new Error(
      `v2 data artifact source escapes repo roots: ${sourceRelative}`,
    );
  }
  if (!sourceRelative.replace(/\\/g, '/').startsWith('public/data/')) {
    throw new Error(
      `v2 data artifact must live under public/data/: ${sourceRelative}`,
    );
  }

  const absolute = resolve(V2_DATA_REPO_ROOT, sourceRelative);
  const rootWithSep = normalize(V2_PUBLIC_DATA_ROOT + sep);
  const normalizedAbs = normalize(absolute);
  if (
    normalizedAbs !== normalize(V2_PUBLIC_DATA_ROOT) &&
    !normalizedAbs.startsWith(rootWithSep)
  ) {
    throw new Error(
      `v2 data artifact resolves outside public/data: ${sourceRelative}`,
    );
  }

  const route = artifact.route;
  if (typeof route === 'string' && route.length > 0) {
    assertSafeV2DataPublicRoute(route);
    const expectedName = route.slice('/data/'.length);
    const actualName = relative(V2_PUBLIC_DATA_ROOT, absolute).replace(
      /\\/g,
      '/',
    );
    if (actualName !== expectedName) {
      throw new Error(
        `v2 data route/filename mismatch: route=${route} source=${sourceRelative}`,
      );
    }
  }

  return absolute;
}

/**
 * @param {string} route
 */
export function assertSafeV2DataPublicRoute(route) {
  if (typeof route !== 'string' || !route.startsWith('/data/')) {
    throw new Error(`v2 data route must start with /data/: ${route}`);
  }
  if (route.includes('..') || route.includes('\\') || route.includes('\0')) {
    throw new Error(`unsafe v2 data route: ${route}`);
  }
  const name = route.slice('/data/'.length);
  if (!name || name.includes('/') || !/^[a-zA-Z0-9._-]+\.json$/.test(name)) {
    throw new Error(`v2 data public filename is unsafe: ${route}`);
  }
}

/**
 * Route → absolute source path (for middleware / legacy imports).
 * @type {Readonly<Record<string, string>>}
 */
export const ALLOWED_V2_DATA_ROUTES = Object.freeze(
  Object.fromEntries(
    V2_DATA_ARTIFACTS.map((artifact) => [
      artifact.route,
      resolveV2DataArtifactSource(artifact),
    ]),
  ),
);

/** Paths that must never be served to the v2 Home baseline. */
export const EXCLUDED_V2_DATA_PATHS = Object.freeze([
  '/data/leaving_soon_current.json',
]);

/**
 * @returns {readonly V2DataArtifactDef[]}
 */
export function listV2DataArtifacts() {
  return V2_DATA_ARTIFACTS;
}

/**
 * @param {string} route
 * @returns {V2DataArtifactDef | null}
 */
export function getV2DataArtifactByRoute(route) {
  return V2_DATA_ARTIFACTS.find((a) => a.route === route) ?? null;
}

/**
 * @param {string} route
 * @returns {string | null} absolute path when allowlisted
 */
export function resolveAllowedV2DataRoute(route) {
  const path = ALLOWED_V2_DATA_ROUTES[route];
  return typeof path === 'string' ? path : null;
}

/**
 * Validate allowlist integrity (duplicate routes, path escape, required sources).
 * @param {{ requireSourcesExist?: boolean }} [options]
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateV2DataAllowlist(options = {}) {
  const requireSourcesExist = options.requireSourcesExist !== false;
  /** @type {string[]} */
  const errors = [];
  const seenRoutes = new Set();

  for (const artifact of V2_DATA_ARTIFACTS) {
    try {
      assertSafeV2DataPublicRoute(artifact.route);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (seenRoutes.has(artifact.route)) {
      errors.push(`duplicate v2 data route: ${artifact.route}`);
    }
    seenRoutes.add(artifact.route);

    if (EXCLUDED_V2_DATA_PATHS.includes(artifact.route)) {
      errors.push(`allowlisted route is excluded: ${artifact.route}`);
    }

    let absolute;
    try {
      absolute = resolveV2DataArtifactSource(artifact);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    if (requireSourcesExist && artifact.required && !existsSync(absolute)) {
      errors.push(
        `required v2 data source missing for ${artifact.route}: ${absolute}`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
