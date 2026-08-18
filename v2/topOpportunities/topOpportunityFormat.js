import {
  canGoNext,
  canGoPrevious,
  clampSelectionIndex,
} from '../adapters/selectTopOpportunities.js';

/**
 * Coarse film keys can inflate additional-showtime counts across variants.
 * Above this threshold, omit the numeric count and use a restrained label.
 */
export const MAX_RELIABLE_ADDITIONAL_SHOWTIMES = 12;

/** Known user-facing format labels. Raw source slugs are omitted. */
const FORMAT_DISPLAY = Object.freeze({
  // Premium formats
  imax: 'IMAX',
  'imax-at-amc': 'IMAX',
  'imax-3d': 'IMAX 3D',
  'imax-70mm': 'IMAX 70mm',
  'imax-70-mm': 'IMAX 70mm',
  'dolby cinema': 'Dolby Cinema',
  'dolby-cinema': 'Dolby Cinema',
  'dolby-cinema-at-amc': 'Dolby Cinema',
  'dolby atmos': 'Dolby Atmos',
  'dolby-atmos': 'Dolby Atmos',
  '3d': '3D',
  'reald-3d': 'RealD 3D',
  '4dx': '4DX',
  screenx: 'ScreenX',
  'screen-x': 'ScreenX',
  rpx: 'RPX',
  rpxt: 'RPX',
  prime: 'Prime',
  '70mm': '70mm',
  '35mm': '35mm',
  'laser-at-amc': 'Laser at AMC',
  xl: 'XL',
  'xl-at-amc': 'XL at AMC',
  'xl-amc': 'XL at AMC',
  // Accessibility features
  'open-caption': 'Open Captions',
  'open-captions': 'Open Captions',
  'closed-caption': 'Closed Captions',
  'audio-description': 'Audio Description',
  'live-score': 'Live Score',
  oc: 'OC',
  cc: 'CC',
});

/**
 * Format a local YYYY-MM-DD for display without timezone shifting.
 * @param {string | null | undefined} isoDate
 */
export function formatLocalDateLabel(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Map a source format tag to a user-facing label, or null for raw slugs.
 * @param {string} raw
 * @returns {string | null}
 */
export function formatUserFacingFormatLabel(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const mapped = FORMAT_DISPLAY[trimmed.toLowerCase()];
  if (mapped) return mapped;
  // Already human-looking: no hyphenated slug shape.
  if (!trimmed.includes('-') && /^[A-Za-z0-9][A-Za-z0-9+ .]*$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Natural showing line: Theater · Date · Time
 * @param {object} selection
 */
export function buildShowingContextLabel(selection) {
  const opportunity = selection?.representativeOpportunity;
  if (!opportunity) return null;
  const dateLabel = formatLocalDateLabel(opportunity.localDate);
  const parts = [
    opportunity.theaterName,
    dateLabel,
    opportunity.timeDisplay,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Supporting facts: runtime · genre · format (only when trustworthy).
 * @param {object} selection
 */
export function buildSupportingFactsLabel(selection) {
  const film = selection?.film;
  const opportunity = selection?.representativeOpportunity;
  const parts = [];

  if (typeof film?.runtimeMin === 'number' && Number.isFinite(film.runtimeMin)) {
    parts.push(`${film.runtimeMin} min`);
  }

  const genre =
    typeof film?.genre === 'string' && film.genre.trim() ? film.genre.trim() : null;
  if (genre) {
    parts.push(genre);
  }

  if (Array.isArray(opportunity?.formatLabels)) {
    const formats = opportunity.formatLabels
      .map(formatUserFacingFormatLabel)
      .filter(Boolean);
    const unique = [...new Set(formats)];
    if (unique.length > 0) {
      parts.push(unique.join(', '));
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Availability line with sanity guard against inflated showtime counts.
 *
 * Rule:
 * - Exact additional count only when 1…MAX_RELIABLE_ADDITIONAL_SHOWTIMES
 * - Above that: “Multiple showtimes” (omit extreme numbers)
 * - Theater count ≥ 2 always eligible as “At N theaters”
 *
 * @param {object} selection
 */
export function buildAdditionalListingsLabel(selection) {
  const additional = selection?.additionalShowtimeCount ?? 0;
  const theaters = selection?.film?.theaterCount ?? 0;
  const parts = [];

  if (additional >= 1 && additional <= MAX_RELIABLE_ADDITIONAL_SHOWTIMES) {
    parts.push(
      additional === 1 ? '1 more showtime' : `${additional} more showtimes`,
    );
  } else if (additional > MAX_RELIABLE_ADDITIONAL_SHOWTIMES) {
    parts.push('Multiple showtimes');
  }

  if (theaters >= 2) {
    parts.push(`At ${theaters} theaters`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * @param {number} index
 * @param {number} length
 */
export function buildPositionLabel(index, length) {
  if (length <= 0) return 'No featured opportunities';
  const safe = clampSelectionIndex(index, length);
  return `${safe + 1} of ${length}`;
}

export { canGoNext, canGoPrevious, clampSelectionIndex };
