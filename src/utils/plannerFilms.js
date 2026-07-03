import { isShowtimeCanceled } from './showtimeFilters.js';

/**
 * @typedef {object} PlannerFilmOption
 * @property {string} key
 * @property {string} title
 * @property {string} poster
 * @property {number} theaterCount
 * @property {string[]} theaters
 * @property {string} [parentKey] - Parent film key for grouping
 * @property {string} [parentTitle] - Parent display title
 * @property {string} [variantType] - Screening variant type
 * @property {boolean} [isSpecialScreening] - True if this is a special screening variant
 * @property {PlannerFilmOption[]} [variants] - Child variants when this is a parent
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
        parentKey: String(row.parent_film_key ?? '').trim() || key,
        parentTitle: String(row.parent_display_title ?? '').trim() || title,
        variantType: String(row.screening_variant_type ?? 'none').trim(),
        isSpecialScreening: Boolean(row.is_special_screening),
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
      parentKey: entry.parentKey,
      parentTitle: entry.parentTitle,
      variantType: entry.variantType,
      isSpecialScreening: entry.isSpecialScreening,
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

/**
 * Group films by parent, adding variants as children to parent entries.
 *
 * @param {PlannerFilmOption[]} catalog - Flat catalog of all films
 * @returns {PlannerFilmOption[]} - Catalog with parent entries containing variants
 */
export function groupFilmsByParent(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) return [];

  const byParentKey = new Map();
  
  // Group films by parent key
  for (const film of catalog) {
    const parentKey = film.parentKey || film.key;
    
    if (!byParentKey.has(parentKey)) {
      byParentKey.set(parentKey, []);
    }
    byParentKey.get(parentKey).push(film);
  }
  
  const grouped = [];
  
  for (const [parentKey, films] of byParentKey.entries()) {
    // Sort: non-variants first, then by title
    films.sort((a, b) => {
      if (a.isSpecialScreening !== b.isSpecialScreening) {
        return a.isSpecialScreening ? 1 : -1;
      }
      return a.title.localeCompare(b.title);
    });
    
    const parent = films[0];
    const variants = films.slice(1);
    
    // Create parent entry
    const parentEntry = {
      ...parent,
      variants: variants.length > 0 ? variants : undefined,
      // Aggregate theater counts across all variants
      theaterCount: films.reduce((sum, f) => sum + f.theaterCount, 0),
      // Merge theaters from all variants
      theaters: [...new Set(films.flatMap(f => f.theaters))].sort(),
    };
    
    grouped.push(parentEntry);
  }
  
  // Sort by parent title
  return grouped.sort((a, b) => (a.parentTitle || a.title).localeCompare(b.parentTitle || b.title));
}

/**
 * Get display label for a variant type.
 *
 * @param {string} variantType
 * @returns {string}
 */
export function getVariantTypeLabel(variantType) {
  const labels = {
    sensory_friendly: 'Sensory Friendly',
    early_access: 'Early Access',
    opening_night: 'Opening Night',
    fan_event: 'Fan Event',
    double_feature: 'Double Feature',
    anniversary: 'Anniversary',
    format_variant: 'Special Format',
    live_encore: 'Live/Encore',
    anime_special_engagement: 'Anime Event',
    awards_season_limited: 'Limited Release',
    foreign_language_limited: 'Foreign Language',
    special_event: 'Special Event',
  };
  
  return labels[variantType] || '';
}
