/**
 * Centralized discovery visibility policy for Seen / Not Interested prefs.
 */

import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import { normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';
import { isFilmSeen } from '../stores/seenFilmsStore.js';
import { isFilmNotInterested } from '../stores/notInterestedFilmsStore.js';
import {
  defaultVisibilityPreferences,
  getVisibilityPreferences,
} from '../stores/visibilityPreferencesStore.js';
import {
  isWithinRecentSeenGrace,
  RECENT_SEEN_GRACE_MS,
} from '../stores/recentSeenStore.js';

/** Contexts that never apply discovery hiding. */
export const FILM_VISIBILITY_ALWAYS_SHOW_CONTEXTS = Object.freeze([
  'film-detail',
  'shorts-program-detail',
  'planner',
  'personal-collection',
  'management',
  'settings',
]);

/**
 * @param {string | null | undefined} context
 */
export function isAlwaysShowVisibilityContext(context) {
  return (
    typeof context === 'string' &&
    FILM_VISIBILITY_ALWAYS_SHOW_CONTEXTS.includes(context)
  );
}

/**
 * @param {{
 *   film?: object | null,
 *   filmRef?: object | null,
 *   storage?: Storage | null,
 *   preferences?: { hideNotInterested?: boolean, hideSeen?: boolean } | null,
 *   context?: string | null,
 *   now?: number | Date,
 *   graceMs?: number,
 *   isSeen?: boolean | null,
 *   isNotInterested?: boolean | null,
 * }} params
 * @returns {boolean}
 */
export function shouldShowFilm({
  film = null,
  filmRef = null,
  storage = null,
  preferences = null,
  context = 'discovery',
  now = Date.now(),
  graceMs = RECENT_SEEN_GRACE_MS,
  isSeen: isSeenOverride = null,
  isNotInterested: isNotInterestedOverride = null,
} = {}) {
  if (isAlwaysShowVisibilityContext(context)) return true;

  const prefs =
    preferences && typeof preferences === 'object'
      ? {
          hideNotInterested: Boolean(preferences.hideNotInterested),
          hideSeen: Boolean(preferences.hideSeen),
        }
      : getVisibilityPreferences(storage);

  if (!prefs.hideNotInterested && !prefs.hideSeen) return true;

  const ref =
    normalizeSavedFilmRef(filmRef) ??
    (film ? filmRefFromHomeFilm(film) : null);
  if (!ref) return true;

  const notInterested =
    typeof isNotInterestedOverride === 'boolean'
      ? isNotInterestedOverride
      : isFilmNotInterested(storage, ref);
  if (prefs.hideNotInterested && notInterested) return false;

  const seen =
    typeof isSeenOverride === 'boolean'
      ? isSeenOverride
      : isFilmSeen(storage, ref);
  if (prefs.hideSeen && seen) {
    if (isWithinRecentSeenGrace(storage, ref, { now, graceMs })) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * @param {object[] | null | undefined} films
 * @param {Parameters<typeof shouldShowFilm>[0]} options
 * @returns {object[]}
 */
export function filterVisibleFilms(films, options = {}) {
  if (!Array.isArray(films) || films.length === 0) return [];
  return films.filter((film) =>
    shouldShowFilm({
      ...options,
      film,
      filmRef: options.filmRef ?? null,
    }),
  );
}

/**
 * Filter a Home-style shelf while preserving status/reason metadata.
 *
 * @param {{ films?: object[], status?: string, reason?: string, [key: string]: unknown } | null | undefined} shelf
 * @param {Parameters<typeof shouldShowFilm>[0]} options
 */
export function filterVisibleShelf(shelf, options = {}) {
  if (!shelf || typeof shelf !== 'object') return shelf;
  const films = Array.isArray(shelf.films) ? shelf.films : [];
  const nextFilms = filterVisibleFilms(films, options);
  if (nextFilms.length === films.length) return shelf;
  return {
    ...shelf,
    films: nextFilms,
  };
}

/**
 * Apply visibility, then a presentation cap — so capped previews can backfill.
 *
 * Call with an uncapped (or over-capped) candidate shelf from the builder.
 *
 * @param {{ films?: object[], status?: string, reason?: string, [key: string]: unknown } | null | undefined} shelf
 * @param {Parameters<typeof shouldShowFilm>[0]} options
 * @param {number} [maxCards]
 */
export function capVisibleShelf(shelf, options = {}, maxCards = Infinity) {
  const filtered = filterVisibleShelf(shelf, options);
  if (!filtered || typeof filtered !== 'object') return filtered;
  const films = Array.isArray(filtered.films) ? filtered.films : [];
  if (!Number.isFinite(maxCards) || maxCards < 0 || films.length <= maxCards) {
    return filtered;
  }
  return {
    ...filtered,
    films: films.slice(0, maxCards),
  };
}

/**
 * Filter films then apply a presentation cap.
 *
 * @param {object[] | null | undefined} films
 * @param {Parameters<typeof shouldShowFilm>[0]} options
 * @param {number} [maxCards]
 */
export function takeVisibleFilms(films, options = {}, maxCards = Infinity) {
  const visible = filterVisibleFilms(films, options);
  if (!Number.isFinite(maxCards) || maxCards < 0) return visible;
  return visible.slice(0, maxCards);
}

/**
 * Filter a See-All style presentation that carries `films` (+ optional sections).
 *
 * @param {{ films?: object[], sections?: object[], totalCount?: number, [key: string]: unknown } | null | undefined} presentation
 * @param {Parameters<typeof shouldShowFilm>[0]} options
 * @param {{ rebuildSections?: (films: object[]) => object[] }} [config]
 */
export function filterVisibleListPresentation(
  presentation,
  options = {},
  config = {},
) {
  if (!presentation || typeof presentation !== 'object') return presentation;
  const films = Array.isArray(presentation.films) ? presentation.films : [];
  const nextFilms = filterVisibleFilms(films, options);
  if (nextFilms.length === films.length) return presentation;

  /** @type {Record<string, unknown>} */
  const next = {
    ...presentation,
    films: nextFilms,
    totalCount: nextFilms.length,
  };

  if (typeof config.rebuildSections === 'function') {
    next.sections = config.rebuildSections(nextFilms);
  } else if (Array.isArray(presentation.sections)) {
    next.sections = presentation.sections
      .map((section) => ({
        ...section,
        films: filterVisibleFilms(
          Array.isArray(section?.films) ? section.films : [],
          options,
        ),
      }))
      .filter((section) => section.films.length > 0);
  }

  return next;
}

/**
 * Filter browse/showtime opportunities by their filmKey against Home films.
 *
 * @param {object[]} opportunities
 * @param {object | null | undefined} homeData
 * @param {Parameters<typeof shouldShowFilm>[0]} options
 */
export function filterVisibleOpportunities(
  opportunities,
  homeData,
  options = {},
) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) {
    return [];
  }
  const filmsByKey = new Map(
    (Array.isArray(homeData?.films) ? homeData.films : []).map((film) => [
      film.filmKey,
      film,
    ]),
  );
  return opportunities.filter((opp) => {
    const film = filmsByKey.get(opp?.filmKey);
    if (!film) return true;
    return shouldShowFilm({ ...options, film });
  });
}

/**
 * Best-effort film stub from a Coming Soon artifact entry.
 * @param {object | null | undefined} entry
 */
export function filmStubFromComingSoonEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const filmId =
    typeof entry.film_id === 'string' && entry.film_id.trim()
      ? entry.film_id.trim()
      : null;
  const showtimeKey = Array.isArray(entry.showtime_film_keys)
    ? entry.showtime_film_keys.find(
        (key) => typeof key === 'string' && key.trim(),
      )
    : null;
  const filmKey =
    (typeof showtimeKey === 'string' && showtimeKey.trim()) || filmId;
  if (!filmKey) return null;
  return { filmKey, filmId };
}

export { defaultVisibilityPreferences, RECENT_SEEN_GRACE_MS };
