/**
 * Opening This Week list sort + filter helpers (QW-06 / QW-07).
 * Uses fields already present on the Opening presentation model.
 */

export const OPENING_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'opening-date', label: 'Opening date' }),
  Object.freeze({ id: 'title-az', label: 'Title A–Z' }),
  Object.freeze({ id: 'most-showtimes', label: 'Most showtimes' }),
  Object.freeze({ id: 'most-theaters', label: 'Most theaters' }),
]);

/**
 * @param {string | null | undefined} id
 */
export function resolveOpeningSortOption(id) {
  return (
    OPENING_SORT_OPTIONS.find((option) => option.id === id) ??
    OPENING_SORT_OPTIONS[0]
  );
}

/**
 * @param {object[]} films
 * @param {string} sortId
 */
export function sortOpeningFilms(films, sortId) {
  const list = Array.isArray(films) ? [...films] : [];
  const cmpTitle = (a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
      sensitivity: 'base',
    });
  const cmpDate = (a, b) => {
    const aDate = String(a.openingDate ?? '');
    const bDate = String(b.openingDate ?? '');
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    const theaterDiff = (b.theaterCount ?? 0) - (a.theaterCount ?? 0);
    if (theaterDiff !== 0) return theaterDiff;
    const showtimeDiff =
      (b.visibleShowtimeCount ?? b.showtimeCount ?? 0) -
      (a.visibleShowtimeCount ?? a.showtimeCount ?? 0);
    if (showtimeDiff !== 0) return showtimeDiff;
    return cmpTitle(a, b);
  };

  switch (sortId) {
    case 'title-az':
      return list.sort(cmpTitle);
    case 'most-showtimes':
      return list.sort((a, b) => {
        const diff = (b.showtimeCount ?? 0) - (a.showtimeCount ?? 0);
        return diff !== 0 ? diff : cmpTitle(a, b);
      });
    case 'most-theaters':
      return list.sort((a, b) => {
        const diff = (b.theaterCount ?? 0) - (a.theaterCount ?? 0);
        return diff !== 0 ? diff : cmpTitle(a, b);
      });
    case 'opening-date':
    default:
      return list.sort(cmpDate);
  }
}

/**
 * @param {object[]} films
 */
export function buildOpeningFilterOptions(films) {
  const list = Array.isArray(films) ? films : [];
  const theaters = new Map();
  const formats = new Map();
  const dates = new Map();

  for (const film of list) {
    if (film.theaterId && film.theaterName) {
      theaters.set(film.theaterId, film.theaterName);
    } else if (film.theaterName) {
      theaters.set(film.theaterName, film.theaterName);
    }
    const formatLabels = Array.isArray(film.formatLabels)
      ? film.formatLabels
      : film.formatLabel
        ? [film.formatLabel]
        : [];
    for (const label of formatLabels) {
      if (label) formats.set(label, label);
    }
    const dateKey = film.openingDate || film.dateLabel;
    if (dateKey && film.dateLabel) {
      dates.set(String(dateKey), film.dateLabel);
    }
  }

  return {
    theaters: [...theaters.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    formats: [...formats.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    dates: [...dates.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

/**
 * @param {object[]} films
 * @param {{
 *   theaterId?: string | null,
 *   formatLabel?: string | null,
 *   openingDate?: string | null,
 * }} filters
 */
export function filterOpeningFilms(films, filters = {}) {
  const list = Array.isArray(films) ? films : [];
  const theaterId = filters.theaterId || null;
  const formatLabel = filters.formatLabel || null;
  const openingDate = filters.openingDate || null;

  return list.filter((film) => {
    if (theaterId) {
      const filmTheaterId = film.theaterId || film.theaterName;
      if (filmTheaterId !== theaterId) return false;
    }
    if (formatLabel) {
      const labels = Array.isArray(film.formatLabels)
        ? film.formatLabels
        : film.formatLabel
          ? [film.formatLabel]
          : [];
      if (!labels.includes(formatLabel)) return false;
    }
    if (openingDate) {
      const key = film.openingDate || film.dateLabel;
      if (String(key) !== String(openingDate)) return false;
    }
    return true;
  });
}

/**
 * @param {{
 *   theaterId?: string | null,
 *   formatLabel?: string | null,
 *   openingDate?: string | null,
 * }} filters
 */
export function countActiveOpeningFilters(filters = {}) {
  return [filters.theaterId, filters.formatLabel, filters.openingDate].filter(
    Boolean,
  ).length;
}
