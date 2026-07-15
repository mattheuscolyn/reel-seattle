import { formatMissingScalar, formatTimestamp } from './pipelineHealthFormat.js';

export const SHOWTIME_ROW_CAP = 200;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Stable ascending sort: time → film_title → id.
 * @param {object} a
 * @param {object} b
 */
export function compareShowtimeRecords(a, b) {
  const timeA = a?.time == null ? '' : String(a.time);
  const timeB = b?.time == null ? '' : String(b.time);
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;

  const titleA = a?.film_title == null ? '' : String(a.film_title);
  const titleB = b?.film_title == null ? '' : String(b.film_title);
  if (titleA !== titleB) return titleA < titleB ? -1 : 1;

  const idA = a?.id == null ? '' : String(a.id);
  const idB = b?.id == null ? '' : String(b.id);
  if (idA !== idB) return idA < idB ? -1 : 1;
  return 0;
}

/**
 * Exact theater_id + ISO date filter. Does not mutate the source array.
 * @param {object|null|undefined} artifact
 * @param {string} theaterId
 * @param {string} date
 */
export function filterShowtimesByTheaterAndDate(artifact, theaterId, date) {
  const showtimes = Array.isArray(artifact?.showtimes) ? artifact.showtimes : [];
  if (!theaterId || !date) return [];
  return showtimes.filter(
    (showtime) =>
      showtime?.theater_id === theaterId && showtime?.date === date,
  );
}

/**
 * Count duplicate IDs within a slice without removing rows.
 * @param {object[]} showtimes
 */
export function summarizeDuplicateIds(showtimes) {
  const counts = Object.create(null);
  for (const showtime of showtimes) {
    const id = showtime?.id;
    if (id == null || id === '') continue;
    const key = String(id);
    counts[key] = (counts[key] || 0) + 1;
  }

  let duplicateIdCount = 0;
  let extraRowCount = 0;
  for (const count of Object.values(counts)) {
    if (count > 1) {
      duplicateIdCount += 1;
      extraRowCount += count - 1;
    }
  }

  return { duplicateIdCount, extraRowCount, counts };
}

/**
 * Format duplicate observation copy for the selected slice.
 * @param {{ duplicateIdCount: number, extraRowCount: number }} summary
 */
export function formatDuplicateObservation(summary) {
  const duplicateIdCount = summary?.duplicateIdCount || 0;
  if (duplicateIdCount === 0) {
    return 'Duplicate ID observation: None';
  }
  const records = Object.values(summary.counts || {}).reduce((sum, count) => {
    return count > 1 ? sum + count : sum;
  }, 0);
  const idWord = duplicateIdCount === 1 ? 'ID' : 'IDs';
  const verb = duplicateIdCount === 1 ? 'appears' : 'appear';
  return `Duplicate ID observation: ${duplicateIdCount} ${idWord} ${verb} on ${records} records in this slice.`;
}

/**
 * @param {unknown} formatTags
 */
export function formatFormatTags(formatTags) {
  if (formatTags == null) return '—';
  if (!Array.isArray(formatTags)) return '—';
  if (formatTags.length === 0) return 'None';
  const cleaned = formatTags
    .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim());
  return cleaned.length === 0 ? 'None' : cleaned.join(', ');
}

/**
 * @param {unknown} runtimeMin
 */
export function formatRuntimeMinutes(runtimeMin) {
  if (runtimeMin == null || runtimeMin === '') return '—';
  if (typeof runtimeMin === 'number' && Number.isFinite(runtimeMin)) {
    return `${runtimeMin} min`;
  }
  const parsed = Number(runtimeMin);
  if (Number.isFinite(parsed)) return `${parsed} min`;
  return '—';
}

/**
 * @param {object} showtime
 */
export function formatTimePrimary(showtime) {
  if (showtime?.time_display) return String(showtime.time_display);
  if (showtime?.time) return String(showtime.time);
  return '—';
}

/**
 * @param {object} showtime
 */
export function formatTimeSecondary(showtime) {
  if (showtime?.time_display && showtime?.time) {
    return String(showtime.time);
  }
  return null;
}

/**
 * @param {object} showtime
 */
export function shouldShowParentContext(showtime) {
  const key = showtime?.showtime_film_key;
  const parentKey = showtime?.parent_film_key;
  const variant = showtime?.screening_variant_type;
  if (parentKey && key && parentKey !== key) return true;
  if (variant && variant !== 'none') return true;
  return false;
}

/**
 * @param {unknown} window
 * @param {string} date
 */
export function isDateOutsideArtifactWindow(window, date) {
  if (!date || !window || typeof window !== 'object') return false;
  const start = window.start_date;
  const end = window.end_date;
  if (typeof start !== 'string' || typeof end !== 'string') return false;
  return date < start || date > end;
}

/**
 * Build theater <option> rows from the public registry (includes disabled).
 * @param {object|null|undefined} registry
 */
export function buildTheaterSelectOptions(registry) {
  const theaters = Array.isArray(registry?.theaters) ? registry.theaters : [];
  return theaters.map((theater, index) => {
    const id = theater?.id == null ? '' : String(theater.id);
    const name = theater?.name == null ? id || `theater-${index}` : String(theater.name);
    const enabled = theater?.enabled === true;
    const disabled = theater?.enabled === false;
    return {
      id,
      name,
      enabled,
      disabled,
      label: disabled ? `${name} — Disabled` : name,
    };
  });
}

/**
 * Preferred default date from pipeline report window when valid ISO.
 * @param {object|null|undefined} pipelineReport
 */
export function defaultInspectionDate(pipelineReport) {
  const start = pipelineReport?.window?.start_date;
  if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return start;
  }
  return '';
}

/**
 * Format approximate byte size for developer display.
 * @param {number|null|undefined} bytes
 */
export function formatApproximateBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Apply theater/date selection against a loaded artifact.
 * Does not mutate artifact.showtimes.
 * @param {object} artifact
 * @param {{ theaterId: string, date: string, theater?: object|null }} selection
 * @param {{ loadMs?: number, approximateBytes?: number|null }} [loadMeta]
 */
export function buildShowtimeInspectionResult(artifact, selection, loadMeta = {}) {
  const started = nowMs();
  const theaterId = selection?.theaterId || '';
  const date = selection?.date || '';
  const matchedRaw = filterShowtimesByTheaterAndDate(artifact, theaterId, date);
  const matched = [...matchedRaw].sort(compareShowtimeRecords);
  const truncated = matched.length > SHOWTIME_ROW_CAP;
  const displayed = truncated ? matched.slice(0, SHOWTIME_ROW_CAP) : matched;
  const duplicateSummary = summarizeDuplicateIds(matched);
  const filterMs = Math.max(0, nowMs() - started);

  const rows = displayed.map((showtime, index) => {
    const firstSeen = formatTimestamp(showtime.first_seen_at);
    const lastSeen = formatTimestamp(showtime.last_seen_at);
    return {
      key: `${showtime.id ?? 'row'}-${index}`,
      timePrimary: formatTimePrimary(showtime),
      timeSecondary: formatTimeSecondary(showtime),
      filmTitle: formatMissingScalar(showtime.film_title),
      showParentContext: shouldShowParentContext(showtime),
      parentDisplayTitle: formatMissingScalar(showtime.parent_display_title),
      parentFilmKey: formatMissingScalar(showtime.parent_film_key),
      screeningVariantType: formatMissingScalar(showtime.screening_variant_type),
      status: formatMissingScalar(showtime.status),
      formatTags: formatFormatTags(showtime.format_tags),
      runtime: formatRuntimeMinutes(showtime.runtime_min),
      source: formatMissingScalar(showtime.source),
      sourceFilmId: formatMissingScalar(showtime.source_film_id),
      showtimeFilmKey: formatMissingScalar(showtime.showtime_film_key),
      showtimeId: formatMissingScalar(showtime.id),
      firstSeenRaw: firstSeen.raw,
      firstSeenReadable: firstSeen.readable,
      lastSeenRaw: lastSeen.raw,
      lastSeenReadable: lastSeen.readable,
    };
  });

  return {
    theaterId,
    date,
    theaterName: selection?.theater?.name ?? null,
    theaterEnabled: selection?.theater?.enabled,
    matchedCount: matched.length,
    displayedCount: displayed.length,
    truncated,
    outsideWindow: isDateOutsideArtifactWindow(artifact?.window, date),
    window: artifact?.window ?? null,
    generatedAt: artifact?.generated_at ?? null,
    duplicateSummary,
    duplicateObservation: formatDuplicateObservation(duplicateSummary),
    rows,
    filterMs,
    loadMs: loadMeta.loadMs ?? null,
    approximateBytes: loadMeta.approximateBytes ?? null,
    approximateSizeLabel: formatApproximateBytes(loadMeta.approximateBytes),
  };
}
