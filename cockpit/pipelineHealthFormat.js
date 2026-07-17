/** Preferred source key order for the cockpit health view. */
export const SOURCE_ORDER = ['amc', 'siff', 'beacon'];

/** Human-readable labels; status values themselves are never remapped. */
export const SOURCE_LABELS = {
  amc: 'AMC',
  siff: 'SIFF',
  beacon: 'Beacon',
};

const MISSING = '—';

/**
 * Display scalar values without converting null/undefined into zeros.
 * @param {unknown} value
 */
export function formatMissingScalar(value) {
  if (value == null || value === '') return MISSING;
  return String(value);
}

/**
 * Normalize catalog-health section for Pipeline Health display.
 * Passes emitted statuses through unchanged.
 * @param {object|null|undefined} report
 */
export function buildAmcCatalogHealthSummary(report) {
  const section =
    report && typeof report === 'object' ? report.amc_source_catalog : null;
  if (section == null || typeof section !== 'object') {
    return null;
  }

  const products =
    section.artifacts && typeof section.artifacts === 'object'
      ? section.artifacts.amc_movie_products
      : null;
  const releases =
    section.artifacts && typeof section.artifacts === 'object'
      ? section.artifacts.amc_release_observations
      : null;

  return {
    status: formatEmittedStatus(section.status),
    outcome: formatMissingScalar(section.outcome),
    buildAttempted: section.build_attempted === true,
    buildSucceeded: section.build_succeeded === true,
    softFailure: section.soft_failure === true,
    artifactsWrittenThisRun: section.artifacts_written_this_run === true,
    artifactsRetainedFromPrior: section.artifacts_retained_from_prior === true,
    reportedAt: formatTimestamp(section.reported_at),
    lastSuccessfulBuildAt: formatTimestamp(section.last_successful_build_at),
    message: formatMissingScalar(section.message),
    warnings: listDiagnostics(section.warnings),
    errors: listDiagnostics(section.errors),
    productsSummary:
      section.products_summary && typeof section.products_summary === 'object'
        ? section.products_summary
        : null,
    releasesSummary:
      section.releases_summary && typeof section.releases_summary === 'object'
        ? section.releases_summary
        : null,
    productsArtifact: products && typeof products === 'object' ? products : null,
    releasesArtifact: releases && typeof releases === 'object' ? releases : null,
  };
}

/**
 * Format an ISO timestamp for display while preserving the original string.
 * Returns { raw, readable } where readable may match raw if parsing fails.
 * @param {unknown} isoDateTime
 */
export function formatTimestamp(isoDateTime) {
  if (isoDateTime == null || isoDateTime === '') {
    return { raw: MISSING, readable: null };
  }

  const raw = String(isoDateTime);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { raw, readable: null };
  }

  // Keep the original timezone offset visible via raw; readable is supplemental.
  const readable = date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return { raw, readable };
}

/**
 * Normalize diagnostic arrays without capping length.
 * @param {unknown} items
 * @returns {string[]}
 */
export function listDiagnostics(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

/**
 * Emit-side status for display — never remapped (e.g. success stays "success").
 * @param {unknown} status
 */
export function formatEmittedStatus(status) {
  if (status == null || status === '') return MISSING;
  return String(status);
}

/**
 * Build ordered per-source rows for the health view.
 * Status is passed through exactly as emitted.
 * @param {object|null|undefined} report
 */
export function buildSourceHealthRows(report) {
  const sources =
    report && typeof report === 'object' && report.sources && typeof report.sources === 'object'
      ? report.sources
      : {};

  const known = SOURCE_ORDER.filter((key) =>
    Object.prototype.hasOwnProperty.call(sources, key),
  );
  const extras = Object.keys(sources).filter((key) => !SOURCE_ORDER.includes(key));
  const keys = [...known, ...extras];

  return keys.map((key) => {
    const source = sources[key] ?? {};
    return {
      key,
      label: SOURCE_LABELS[key] || key,
      status: formatEmittedStatus(source.status),
      rawStatus: source.status ?? null,
      showtimeCount: formatMissingScalar(source.showtime_count),
      filmCount: formatMissingScalar(source.film_count),
      theaterCount: formatMissingScalar(source.theater_count),
      lastSuccessfulRun: formatMissingScalar(source.last_successful_run),
      warnings: listDiagnostics(source.warnings),
      errors: listDiagnostics(source.errors),
    };
  });
}
