/**
 * Leaving Soon full-list sort + filter helpers.
 */

export const LEAVING_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'leaving-soonest', label: 'Leaving soonest' }),
  Object.freeze({ id: 'title-az', label: 'Title A–Z' }),
]);

/**
 * @param {string | null | undefined} id
 */
export function resolveLeavingSortOption(id) {
  return (
    LEAVING_SORT_OPTIONS.find((option) => option.id === id) ??
    LEAVING_SORT_OPTIONS[0]
  );
}

/**
 * @param {object[]} films
 * @param {string} sortId
 */
export function sortLeavingFilms(films, sortId) {
  const list = Array.isArray(films) ? [...films] : [];
  const cmpTitle = (a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
      sensitivity: 'base',
    });

  switch (sortId) {
    case 'title-az':
      return list.sort(cmpTitle);
    case 'leaving-soonest':
    default:
      return list.sort((a, b) => {
        const aDate = String(a.maxShowDate ?? '');
        const bDate = String(b.maxShowDate ?? '');
        if (aDate && bDate && aDate !== bDate) {
          return aDate.localeCompare(bDate);
        }
        if (aDate && !bDate) return -1;
        if (!aDate && bDate) return 1;
        return cmpTitle(a, b);
      });
  }
}

/**
 * @param {object[]} films
 */
export function buildLeavingFilterOptions(films) {
  const list = Array.isArray(films) ? films : [];
  const theaters = new Map();

  for (const film of list) {
    const filmTheaters = Array.isArray(film.theaters) ? film.theaters : [];
    for (const theater of filmTheaters) {
      const id = theater?.id || theater?.name;
      const name = theater?.name;
      if (id && name) theaters.set(id, name);
    }
  }

  return {
    theaters: [...theaters.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * @param {object[]} films
 * @param {{ theaterId?: string | null }} filters
 */
export function filterLeavingFilms(films, filters = {}) {
  const list = Array.isArray(films) ? films : [];
  const theaterId = filters.theaterId || null;
  if (!theaterId) return list;

  return list.filter((film) => {
    const filmTheaters = Array.isArray(film.theaters) ? film.theaters : [];
    if (filmTheaters.length > 0) {
      return filmTheaters.some(
        (theater) => theater?.id === theaterId || theater?.name === theaterId,
      );
    }
    return (film.theaterId || film.theaterName) === theaterId;
  });
}

/**
 * @param {{ theaterId?: string | null }} filters
 */
export function countActiveLeavingFilters(filters = {}) {
  return [filters.theaterId].filter(Boolean).length;
}
