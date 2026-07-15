import { formatMissingScalar } from './pipelineHealthFormat.js';

/**
 * Count occurrences of a string field, retaining unknown values.
 * @param {object[]} theaters
 * @param {string} field
 */
export function countByField(theaters, field) {
  const counts = Object.create(null);
  for (const theater of theaters) {
    const raw = theater?.[field];
    const key =
      raw == null || raw === ''
        ? '(missing)'
        : String(raw);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/**
 * Build compact registry summary metrics.
 * Unknown source/type values are retained rather than dropped.
 * @param {object|null|undefined} registry
 */
export function buildTheaterRegistrySummary(registry) {
  const theaters = Array.isArray(registry?.theaters) ? registry.theaters : [];
  let enabledCount = 0;
  let disabledCount = 0;
  let withoutExternalId = 0;
  let withoutAliases = 0;
  let withoutCity = 0;
  let withoutNeighborhood = 0;

  for (const theater of theaters) {
    if (theater?.enabled === true) {
      enabledCount += 1;
    } else if (theater?.enabled === false) {
      disabledCount += 1;
    }

    if (theater?.source_external_id == null || theater.source_external_id === '') {
      withoutExternalId += 1;
    }

    if (!Array.isArray(theater?.aliases) || theater.aliases.length === 0) {
      withoutAliases += 1;
    }

    if (theater?.city == null || theater.city === '') {
      withoutCity += 1;
    }

    if (theater?.neighborhood == null || theater.neighborhood === '') {
      withoutNeighborhood += 1;
    }
  }

  return {
    total: theaters.length,
    enabledCount,
    disabledCount,
    bySource: countByField(theaters, 'source'),
    byType: countByField(theaters, 'type'),
    observations: {
      withoutExternalId,
      withoutAliases,
      withoutCity,
      withoutNeighborhood,
      disabledCount,
    },
  };
}

/**
 * Format aliases for display.
 * @param {unknown} aliases
 */
export function formatAliases(aliases) {
  if (!Array.isArray(aliases) || aliases.length === 0) return 'None';
  const cleaned = aliases
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return cleaned.length === 0 ? 'None' : cleaned.join(', ');
}

/**
 * Format enabled boolean as Yes/No text (or — when missing).
 * @param {unknown} enabled
 */
export function formatEnabledLabel(enabled) {
  if (enabled === true) return 'Yes';
  if (enabled === false) return 'No';
  return formatMissingScalar(enabled);
}

/**
 * Build display rows in artifact order (no re-sort).
 * Disabled theaters remain included.
 * @param {object|null|undefined} registry
 */
export function buildTheaterRegistryRows(registry) {
  const theaters = Array.isArray(registry?.theaters) ? registry.theaters : [];

  return theaters.map((theater, index) => {
    const enabled = theater?.enabled;
    return {
      key: theater?.id ? String(theater.id) : `theater-${index}`,
      name: formatMissingScalar(theater?.name),
      id: formatMissingScalar(theater?.id),
      source: formatMissingScalar(theater?.source),
      enabled,
      enabledLabel: formatEnabledLabel(enabled),
      isDisabled: enabled === false,
      type: formatMissingScalar(theater?.type),
      aliasesDisplay: formatAliases(theater?.aliases),
      sourceExternalId: formatMissingScalar(theater?.source_external_id),
      city: formatMissingScalar(theater?.city),
      neighborhood: formatMissingScalar(theater?.neighborhood),
      timezone: formatMissingScalar(theater?.timezone),
    };
  });
}

/**
 * Pure helper for independent section state (used by tests).
 * @param {{ loading: boolean, error: string|null, data: unknown }} pipeline
 * @param {{ loading: boolean, error: string|null, data: unknown }} registry
 */
export function areCockpitSectionsIndependent(pipeline, registry) {
  const pipelineFailed = Boolean(pipeline?.error);
  const registryFailed = Boolean(registry?.error);
  const pipelineHasData = pipeline?.data != null;
  const registryHasData = registry?.data != null;

  // A failure in one section must not force-clear the other section's data.
  if (pipelineFailed && registryHasData) return true;
  if (registryFailed && pipelineHasData) return true;
  if (!pipelineFailed && !registryFailed) return true;
  return pipelineFailed !== registryFailed || pipelineHasData || registryHasData;
}
