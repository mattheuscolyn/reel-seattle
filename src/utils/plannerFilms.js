import { isShowtimeCanceled } from './showtimeFilters.js';

/**
 * @typedef {object} PlannerFilmOption
 * @property {string} key
 * @property {string} title
 * @property {string} poster
 * @property {number} theaterCount
 * @property {string[]} theaters
 */

/**
 * Build unique films available for planning on a date (optionally filtered by theaters).
 *
 * @param {object[]} rows - Legacy showtime rows
 * @param {{ date?: string, theaters?: string[] }} [options]
 * @returns {PlannerFilmOption[]}
 */
export function buildPlannerFilmCatalog(rows, { date = '', theaters = [] } = {}) {
  if (!date || !Array.isArray(rows)) return [];

  const byKey = new Map();

  for (const row of rows) {
    if (row.Date !== date) continue;
    if (theaters.length > 0 && !theaters.includes(row.Theater)) continue;
    if (isShowtimeCanceled(row)) continue;

    const title = String(row.Film ?? '').trim();
    if (!title) continue;

    const key = String(row.showtime_film_key ?? '').trim() || title;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        key,
        title,
        poster: row.posterDynamic || '',
        theaters: new Set(),
      };
      byKey.set(key, entry);
    }
    entry.theaters.add(row.Theater);
    if (!entry.poster && row.posterDynamic) {
      entry.poster = row.posterDynamic;
    }
  }

  return [...byKey.values()]
    .map((entry) => ({
      key: entry.key,
      title: entry.title,
      poster: entry.poster,
      theaterCount: entry.theaters.size,
      theaters: [...entry.theaters].sort(),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * @param {PlannerFilmOption[]} catalog
 * @returns {Map<string, PlannerFilmOption>}
 */
export function indexPlannerFilmsByKey(catalog) {
  return new Map(catalog.map((film) => [film.key, film]));
}

/**
 * @param {PlannerFilmOption[]} catalog
 * @returns {Map<string, PlannerFilmOption>}
 */
export function indexPlannerFilmsByTitle(catalog) {
  const map = new Map();
  for (const film of catalog) {
    map.set(film.title.toLowerCase(), film);
  }
  return map;
}

/**
 * Resolve a stored token (key or legacy title) to a catalog film when possible.
 *
 * @param {string} token
 * @param {PlannerFilmOption[]} catalog
 * @returns {PlannerFilmOption|null}
 */
export function resolvePlannerFilmToken(token, catalog) {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return null;

  const byKey = indexPlannerFilmsByKey(catalog);
  const byTitle = indexPlannerFilmsByTitle(catalog);

  return byKey.get(trimmed) ?? byTitle.get(trimmed.toLowerCase()) ?? null;
}

/**
 * @param {string} query
 * @param {PlannerFilmOption[]} catalog
 * @returns {PlannerFilmOption|null}
 */
export function suggestPlannerFilmMatch(query, catalog) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle || needle.length < 3) return null;

  const exact = catalog.find((film) => film.title.toLowerCase() === needle);
  if (exact) return exact;

  const contains = catalog.filter((film) => film.title.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0];

  const reverse = catalog.filter((film) => needle.includes(film.title.toLowerCase()));
  if (reverse.length === 1) return reverse[0];

  return null;
}

/**
 * @typedef {object} PlannerFilmValidation
 * @property {string} token
 * @property {'matched' | 'unmatched'} status
 * @property {string} label
 * @property {number} [theaterCount]
 * @property {PlannerFilmOption|null} [film]
 * @property {PlannerFilmOption|null} [suggestion]
 */

/**
 * @param {string[]} tokens
 * @param {PlannerFilmOption[]} catalog
 * @returns {PlannerFilmValidation[]}
 */
export function validatePlannerFilmTokens(tokens, catalog) {
  if (!Array.isArray(tokens)) return [];

  return tokens
    .map((token) => String(token).trim())
    .filter(Boolean)
    .map((token) => {
      const film = resolvePlannerFilmToken(token, catalog);
      if (film) {
        return {
          token,
          status: 'matched',
          label: film.title,
          theaterCount: film.theaterCount,
          film,
          suggestion: null,
        };
      }

      return {
        token,
        status: 'unmatched',
        label: token,
        film: null,
        suggestion: suggestPlannerFilmMatch(token, catalog),
      };
    });
}

/**
 * @param {string[]} tokens
 * @param {PlannerFilmOption[]} catalog
 * @returns {string}
 */
export function formatPlannerFilmTokenLabels(tokens, catalog) {
  return validatePlannerFilmTokens(tokens, catalog)
    .map((item) => item.label)
    .join(', ');
}

/**
 * Filter catalog options by a search query (partial title match).
 *
 * @param {PlannerFilmOption[]} catalog
 * @param {string} query
 * @returns {PlannerFilmOption[]}
 */
export function filterPlannerFilmsBySearch(catalog, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return catalog;
  return catalog.filter((film) => film.title.toLowerCase().includes(needle));
}

/**
 * Infer a default date and theater list from a grouped showtime film card.
 *
 * @param {object} movie
 * @param {{ selectedDates?: string[], selectedTheaters?: string[] }} [filterOptions]
 * @returns {{ date: string, theaters: string[] }}
 */
export function inferPlannerContextFromMovie(movie, { selectedDates = [], selectedTheaters = [] } = {}) {
  const dates = Object.keys(movie?.showtimes ?? {}).sort();
  const preferredDates =
    selectedDates.length > 0 ? dates.filter((date) => selectedDates.includes(date)) : dates;
  const date = preferredDates[0] || dates[0] || '';

  const theaters = new Set();
  const dateBlock = movie?.showtimes?.[date] ?? {};
  for (const theater of Object.keys(dateBlock)) {
    if (selectedTheaters.length === 0 || selectedTheaters.includes(theater)) {
      theaters.add(theater);
    }
  }

  return { date, theaters: [...theaters] };
}

/**
 * @param {object} options
 * @param {string[]} [options.includeFilms]
 * @param {string[]} [options.excludeFilms]
 * @param {string[]} [options.preferredFilms]
 * @param {string} [options.firstFilm]
 * @param {string} [options.lastFilm]
 * @param {PlannerFilmOption[]} [options.catalog]
 * @returns {Array<PlannerFilmValidation & { role?: string }>}
 */
export function collectPlannerFilmValidationItems({
  includeFilms = [],
  excludeFilms = [],
  preferredFilms = [],
  firstFilm = '',
  lastFilm = '',
  catalog = [],
} = {}) {
  const items = [
    ...validatePlannerFilmTokens(includeFilms, catalog).map((item) => ({
      ...item,
      role: 'required',
    })),
    ...validatePlannerFilmTokens(preferredFilms, catalog).map((item) => ({
      ...item,
      role: 'preferred',
    })),
    ...validatePlannerFilmTokens(excludeFilms, catalog).map((item) => ({
      ...item,
      role: 'excluded',
    })),
  ];

  if (firstFilm) {
    items.push(
      ...validatePlannerFilmTokens([firstFilm], catalog).map((item) => ({
        ...item,
        role: 'first',
      })),
    );
  }
  if (lastFilm) {
    items.push(
      ...validatePlannerFilmTokens([lastFilm], catalog).map((item) => ({
        ...item,
        role: 'last',
      })),
    );
  }

  return items;
}

/**
 * @param {PlannerFilmValidation[]} items
 * @returns {string}
 */
export function formatUnmatchedFilmSuggestion(items) {
  const unmatched = items.filter((item) => item.status === 'unmatched');
  if (unmatched.length === 0) return '';
  const labels = unmatched.map((item) => item.label).join(', ');
  return `These filters did not match any showtimes on the selected date: ${labels}. Try picking films from the list or adjusting date/theaters.`;
}
