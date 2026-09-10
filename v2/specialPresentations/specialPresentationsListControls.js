/**
 * Special Presentations full-list sort + theater filter helpers.
 */

import { specialPresentationBrowseLabel } from './collectSpecialPresentations.js';

export const SPECIAL_PRESENTATIONS_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'soonest-presentation', label: 'Soonest presentation' }),
  Object.freeze({ id: 'presentation-type', label: 'Presentation type' }),
  Object.freeze({ id: 'title-az', label: 'Title A–Z' }),
]);

/**
 * @param {string | null | undefined} id
 */
export function resolveSpecialPresentationsSortOption(id) {
  return (
    SPECIAL_PRESENTATIONS_SORT_OPTIONS.find((option) => option.id === id) ??
    SPECIAL_PRESENTATIONS_SORT_OPTIONS[0]
  );
}

/**
 * @param {object[]} films
 * @param {string} sortId
 */
export function sortSpecialPresentationFilms(films, sortId) {
  const list = Array.isArray(films) ? [...films] : [];
  const cmpTitle = (a, b) =>
    String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
      sensitivity: 'base',
    });

  switch (sortId) {
    case 'title-az':
      return list.sort(cmpTitle);
    case 'presentation-type':
      return list.sort((a, b) => {
        const aRank =
          typeof a.presentationPriorityRank === 'number'
            ? a.presentationPriorityRank
            : 99;
        const bRank =
          typeof b.presentationPriorityRank === 'number'
            ? b.presentationPriorityRank
            : 99;
        if (aRank !== bRank) return aRank - bRank;
        const at = String(a.earliestSortableLocalDateTime ?? '');
        const bt = String(b.earliestSortableLocalDateTime ?? '');
        if (at && bt && at !== bt) return at.localeCompare(bt);
        return cmpTitle(a, b);
      });
    case 'soonest-presentation':
    default:
      return list.sort((a, b) => {
        const at = String(a.earliestSortableLocalDateTime ?? '');
        const bt = String(b.earliestSortableLocalDateTime ?? '');
        if (at && bt && at !== bt) return at.localeCompare(bt);
        if (at && !bt) return -1;
        if (!at && bt) return 1;
        return cmpTitle(a, b);
      });
  }
}

/**
 * @param {object[]} films
 */
export function buildSpecialPresentationsFilterOptions(films) {
  const list = Array.isArray(films) ? films : [];
  const theaters = new Map();
  const presentationTypes = new Map();

  for (const film of list) {
    const filmTheaters = Array.isArray(film.theaters) ? film.theaters : [];
    for (const theater of filmTheaters) {
      const id = theater?.id || theater?.name;
      const name = theater?.name;
      if (id && name) theaters.set(id, name);
    }
    const ids = Array.isArray(film.presentationCanonicalIds)
      ? film.presentationCanonicalIds
      : [];
    for (const canonicalId of ids) {
      if (!canonicalId || presentationTypes.has(canonicalId)) continue;
      presentationTypes.set(
        canonicalId,
        specialPresentationBrowseLabel(canonicalId),
      );
    }
  }

  return {
    theaters: [...theaters.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    presentationTypes: [...presentationTypes.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * @param {object[]} films
 * @param {{ theaterId?: string | null, presentationCanonicalId?: string | null }} filters
 */
export function filterSpecialPresentationFilms(films, filters = {}) {
  const list = Array.isArray(films) ? films : [];
  const theaterId = filters.theaterId || null;
  const presentationCanonicalId = filters.presentationCanonicalId || null;
  if (!theaterId && !presentationCanonicalId) return list;

  return list.filter((film) => {
    if (theaterId) {
      const filmTheaters = Array.isArray(film.theaters) ? film.theaters : [];
      const matchesTheater = filmTheaters.some(
        (theater) => theater?.id === theaterId || theater?.name === theaterId,
      );
      if (!matchesTheater) return false;
    }
    if (presentationCanonicalId) {
      const ids = Array.isArray(film.presentationCanonicalIds)
        ? film.presentationCanonicalIds
        : [];
      if (!ids.includes(presentationCanonicalId)) return false;
    }
    return true;
  });
}

/**
 * @param {{ theaterId?: string | null, presentationCanonicalId?: string | null }} filters
 */
export function countActiveSpecialPresentationsFilters(filters = {}) {
  return [filters.theaterId, filters.presentationCanonicalId].filter(Boolean)
    .length;
}
