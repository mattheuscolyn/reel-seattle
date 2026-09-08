/**
 * User-facing freshness / partial-data copy from HomeData.
 * Never names internal sources or implementation terms.
 */

import { SEATTLE_TIMEZONE, resolveClock } from './canonicalScreening.js';

/**
 * Conservative stale threshold. Production emit is daily (06:00 UTC),
 * but listings can change intra-day. Six hours is a named default, not
 * a fetch TTL — stale data still remains visible.
 */
export const SHOWTIME_STALE_AFTER_HOURS = 6;
export const SHOWTIME_STALE_AFTER_MS = SHOWTIME_STALE_AFTER_HOURS * 60 * 60 * 1000;

export const SHOWTIME_STALE_NOTICE =
  'Showtimes may have changed since the last update.';
export const SHOWTIME_PARTIAL_NOTICE = 'Some listings may be incomplete.';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {string} iso
 * @param {Date} now
 * @returns {string | null}
 */
export function formatShowtimesRefreshedLabel(iso, now = new Date()) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const label = instant.toLocaleString('en-US', {
    timeZone: SEATTLE_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  void now;
  return `Updated ${label}`;
}

/**
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [options]
 */
export function composeShowtimesFreshness(homeData, options = {}) {
  const now = resolveClock(options.now);
  const generatedAt = asTrimmed(homeData?.generatedAt);
  const health = homeData?.sourceHealth;
  const sources =
    health?.sources && typeof health.sources === 'object' ? health.sources : {};
  const sourceStates = Object.values(sources);
  const failedSources = sourceStates.filter((source) => {
    const status = asTrimmed(source?.status)?.toLowerCase();
    return Boolean(status) && status !== 'success';
  });
  const healthFailed =
    asTrimmed(health?.status)?.toLowerCase() &&
    asTrimmed(health?.status)?.toLowerCase() !== 'success';
  const optionalLoadFailed =
    Array.isArray(homeData?.loadErrors) && homeData.loadErrors.length > 0;

  /** @type {'partial' | 'ready' | 'unknown'} */
  let completeness = 'unknown';
  if (failedSources.length > 0 || healthFailed) {
    completeness = 'partial';
  } else if (generatedAt && (sourceStates.length > 0 || health?.status === 'success')) {
    completeness = 'ready';
  } else if (generatedAt) {
    completeness = 'ready';
  } else if (optionalLoadFailed) {
    completeness = 'partial';
  }

  const lastRefreshedLabel = generatedAt
    ? formatShowtimesRefreshedLabel(generatedAt, now)
    : null;
  const generatedMs = generatedAt ? new Date(generatedAt).getTime() : NaN;
  const ageMs = Number.isFinite(generatedMs) ? now.getTime() - generatedMs : null;
  const stale = ageMs != null && ageMs > SHOWTIME_STALE_AFTER_MS;
  const staleNotice = stale ? SHOWTIME_STALE_NOTICE : null;
  const notice =
    completeness === 'partial' ? SHOWTIME_PARTIAL_NOTICE : null;

  const line = [lastRefreshedLabel, staleNotice, notice]
    .filter(Boolean)
    .join(' · ');

  return {
    lastRefreshedAt: generatedAt,
    lastRefreshedLabel,
    completeness,
    stale,
    ageMs,
    staleNotice,
    notice,
    line: line || null,
  };
}
