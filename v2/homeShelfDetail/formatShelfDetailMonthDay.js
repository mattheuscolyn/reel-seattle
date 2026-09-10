/**
 * Shared compact month/day for shelf-detail date lines: "Sep 14".
 * Shelf-specific prefixes (Opens / Last screening / bare date) stay local.
 *
 * @param {string | null | undefined} isoDate YYYY-MM-DD
 * @returns {string | null}
 */
export function formatShelfDetailMonthDay(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
