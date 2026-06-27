/** True when value is a non-empty poster URL (after trim); rejects legacy "None" sentinel. */
export function hasPosterUrl(value) {
  return normalizePosterUrl(value) != null;
}

/** Returns trimmed poster URL or null when missing/blank/None. */
export function normalizePosterUrl(value) {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  return trimmed;
}
