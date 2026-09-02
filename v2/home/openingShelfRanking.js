/**
 * Deterministic Home Opening shelf ranking — max 6 cards, bucket priority.
 * Uses normalized opening entries only; does not mutate artifact membership.
 */

export const HOME_OPENING_SHELF_MAX_CARDS = 6;

/**
 * @param {object} a
 * @param {object} b
 */
export function compareOpeningShelfEntries(a, b) {
  const aDate = String(a.openingDate ?? '');
  const bDate = String(b.openingDate ?? '');
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;

  const theaterDiff =
    (b.theaterCountOnOpeningDate ?? 0) - (a.theaterCountOnOpeningDate ?? 0);
  if (theaterDiff !== 0) return theaterDiff;

  const showtimeDiff =
    (b.visibleShowtimeCount ?? 0) - (a.visibleShowtimeCount ?? 0);
  if (showtimeDiff !== 0) return showtimeDiff;

  return String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
    sensitivity: 'base',
  });
}

/**
 * @param {object[]} entries normalized opening entries (with categoryId)
 * @param {{ maxCards?: number }} [options]
 * @returns {object[]}
 */
export function rankOpeningShelfEntries(entries, options = {}) {
  const maxCards = options.maxCards ?? HOME_OPENING_SHELF_MAX_CARDS;
  const list = Array.isArray(entries) ? entries : [];

  const byCategory = {
    new: list.filter((entry) => entry.categoryId === 'new').sort(compareOpeningShelfEntries),
    event: list
      .filter(
        (entry) => entry.categoryId === 'event' && (entry.visibleShowtimeCount ?? 0) > 0,
      )
      .sort(compareOpeningShelfEntries),
    revivalActive: list
      .filter(
        (entry) => entry.categoryId === 'revival' && (entry.visibleShowtimeCount ?? 0) > 0,
      )
      .sort(compareOpeningShelfEntries),
    revivalInactive: list
      .filter(
        (entry) => entry.categoryId === 'revival' && (entry.visibleShowtimeCount ?? 0) === 0,
      )
      .sort(compareOpeningShelfEntries),
  };

  /** @type {object[]} */
  const selected = [];
  const buckets = [
    byCategory.new,
    byCategory.event,
    byCategory.revivalActive,
    byCategory.revivalInactive,
  ];

  for (const bucket of buckets) {
    for (const entry of bucket) {
      if (selected.length >= maxCards) return selected;
      selected.push(entry);
    }
  }

  return selected;
}
