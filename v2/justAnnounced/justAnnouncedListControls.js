/**
 * Just Announced full-list sort helpers.
 * Filters omitted: mixed availability (some films lack theaters) makes
 * theater filtering unintuitive for this shelf.
 */

export const JUST_ANNOUNCED_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'recently-announced', label: 'Most recently announced' }),
  Object.freeze({ id: 'opening-date', label: 'Opening date' }),
  Object.freeze({ id: 'title-az', label: 'Title A–Z' }),
]);

/**
 * @param {string | null | undefined} id
 */
export function resolveJustAnnouncedSortOption(id) {
  return (
    JUST_ANNOUNCED_SORT_OPTIONS.find((option) => option.id === id) ??
    JUST_ANNOUNCED_SORT_OPTIONS[0]
  );
}

/**
 * Parse announcement timestamp for sorting. Supports YYYY-MM-DD and ISO datetimes.
 * @param {string | null | undefined} value
 * @returns {number} epoch ms, or NaN
 */
export function announcementSortValue(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const trimmed = value.trim();
  const parsed = Date.parse(
    trimmed.length <= 10 ? `${trimmed}T12:00:00` : trimmed,
  );
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * @param {object[]} films
 * @param {string} sortId
 */
export function sortJustAnnouncedFilms(films, sortId) {
  const list = Array.isArray(films) ? [...films] : [];
  const cmpTitle = (a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
      sensitivity: 'base',
    });

  switch (sortId) {
    case 'title-az':
      return list.sort(cmpTitle);
    case 'opening-date':
      return list.sort((a, b) => {
        const aDate = String(a.openingDate ?? '');
        const bDate = String(b.openingDate ?? '');
        if (aDate && bDate && aDate !== bDate) {
          return aDate.localeCompare(bDate);
        }
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return cmpTitle(a, b);
      });
    case 'recently-announced':
    default:
      return list.sort((a, b) => {
        const aMs = announcementSortValue(a.firstObservedAt);
        const bMs = announcementSortValue(b.firstObservedAt);
        if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
          return bMs - aMs;
        }
        if (Number.isFinite(aMs) && !Number.isFinite(bMs)) return -1;
        if (!Number.isFinite(aMs) && Number.isFinite(bMs)) return 1;
        return cmpTitle(a, b);
      });
  }
}
