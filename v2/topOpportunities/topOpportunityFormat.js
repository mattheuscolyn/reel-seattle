import {
  canGoNext,
  canGoPrevious,
  clampSelectionIndex,
} from '../adapters/selectTopOpportunities.js';

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
 * Supporting facts: runtime · genre · format (only when present)
 * Genre is never inferred — only shown when a trustworthy string exists.
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

  if (
    Array.isArray(opportunity?.formatLabels) &&
    opportunity.formatLabels.length > 0
  ) {
    parts.push(opportunity.formatLabels.join(', '));
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * @param {object} selection
 */
export function buildAdditionalListingsLabel(selection) {
  const additional = selection?.additionalShowtimeCount ?? 0;
  const theaters = selection?.film?.theaterCount ?? 0;
  const parts = [];
  if (additional > 0) {
    parts.push(
      additional === 1 ? '1 more showtime' : `${additional} more showtimes`,
    );
  }
  if (theaters >= 2) {
    parts.push(`${theaters} theaters`);
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
