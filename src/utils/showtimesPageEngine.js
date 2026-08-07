import { uniqueSorted } from './arrayUtils.js';
import { isTodayOrFuture } from './dateUtils.js';
import { isShowtimeCanceled, showtimeSlot } from './showtimeFilters.js';

export const SORT_OPTIONS = [
  { value: 'showtimes-desc', label: 'Showtimes (Most to Least)' },
  { value: 'showtimes-asc', label: 'Showtimes (Least to Most)' },
  { value: 'runtime-desc', label: 'Runtime (Longest to Shortest)' },
  { value: 'runtime-asc', label: 'Runtime (Shortest to Longest)' },
];

export const DEFAULT_SORT = 'showtimes-desc';

/** Build theater and date dropdown options from legacy showtime rows. */
export function buildShowtimesFilterOptions(rows) {
  return {
    theaters: uniqueSorted(rows.map((row) => row.Theater)),
    dates: uniqueSorted(rows.map((row) => row.Date).filter(isTodayOrFuture)),
  };
}

/** Trim search text; empty string means no title filter. */
export function normalizeSearchText(searchText) {
  if (searchText == null) return '';
  return String(searchText).trim();
}

/** Case-insensitive partial match against legacy row `Film` title. */
export function filmTitleMatchesSearch(filmTitle, searchText) {
  const query = normalizeSearchText(searchText);
  if (!query) return true;
  if (!filmTitle) return false;
  return filmTitle.toLowerCase().includes(query.toLowerCase());
}

/**
 * Filter legacy showtime rows by selected theaters/dates and optional film search.
 * When no dates are selected, only today-or-future dates are kept.
 * Canceled showtimes are always excluded.
 */
export function filterShowtimeRows(
  rows,
  { selectedTheaters = [], selectedDates = [], searchText = '' } = {},
) {
  return rows.filter((row) => {
    if (isShowtimeCanceled(row)) return false;
    if (selectedTheaters.length > 0 && !selectedTheaters.includes(row.Theater)) {
      return false;
    }
    if (selectedDates.length === 0) {
      if (!isTodayOrFuture(row.Date)) return false;
    } else if (!selectedDates.includes(row.Date)) {
      return false;
    }
    if (!filmTitleMatchesSearch(row.Film, searchText)) return false;
    return true;
  });
}

/** Group filtered rows into film objects with nested date → theater → showtime slots. */
export function groupShowtimesForDisplay(filteredRows) {
  return Object.values(
    filteredRows.reduce((acc, row) => {
      const key = row.Film;
      if (!acc[key]) {
        acc[key] = {
          film: row.Film,
          filmKey: String(row.showtime_film_key ?? '').trim() || row.Film,
          runtime: row.Runtime,
          poster: row.posterDynamic,
          showtimes: {},
          parentKey: String(row.parent_film_key ?? '').trim() || String(row.showtime_film_key ?? '').trim() || row.Film,
          parentTitle: String(row.parent_display_title ?? '').trim() || row.Film,
          variantType: String(row.screening_variant_type ?? 'none').trim(),
          isSpecialScreening: Boolean(row.is_special_screening),
        };
      }
      if (!acc[key].poster && row.posterDynamic) {
        acc[key].poster = row.posterDynamic;
      }
      if (!acc[key].showtimes[row.Date]) acc[key].showtimes[row.Date] = {};
      if (!acc[key].showtimes[row.Date][row.Theater]) {
        acc[key].showtimes[row.Date][row.Theater] = [];
      }
      acc[key].showtimes[row.Date][row.Theater].push(showtimeSlot(row));
      return acc;
    }, {}),
  );
}

function countShowtimesForMovie(movie, selectedDates, selectedTheaters) {
  let count = 0;
  Object.entries(movie.showtimes).forEach(([date, theatersObj]) => {
    if (selectedDates.length === 0 || selectedDates.includes(date)) {
      Object.entries(theatersObj).forEach(([theater, times]) => {
        if (selectedTheaters.length === 0 || selectedTheaters.includes(theater)) {
          count += times.length;
        }
      });
    }
  });
  return count;
}

/** Sort grouped film objects using the Showtimes page sort modes. */
export function sortGroupedMovies(
  movies,
  sort = DEFAULT_SORT,
  selectedDates = [],
  selectedTheaters = [],
) {
  return [...movies].sort((a, b) => {
    if (sort === 'showtimes-desc') {
      return (
        countShowtimesForMovie(b, selectedDates, selectedTheaters) -
        countShowtimesForMovie(a, selectedDates, selectedTheaters)
      );
    }
    if (sort === 'showtimes-asc') {
      return (
        countShowtimesForMovie(a, selectedDates, selectedTheaters) -
        countShowtimesForMovie(b, selectedDates, selectedTheaters)
      );
    }
    if (sort === 'runtime-desc') {
      return Number(b.runtime) - Number(a.runtime);
    }
    if (sort === 'runtime-asc') {
      return Number(a.runtime) - Number(b.runtime);
    }
    return 0;
  });
}

/** Filter, group, and sort rows for the Showtimes page display model. */
export function buildShowtimesPageResults(
  rows,
  { selectedTheaters = [], selectedDates = [], sort = DEFAULT_SORT, searchText = '' } = {},
) {
  const filtered = filterShowtimeRows(rows, { selectedTheaters, selectedDates, searchText });
  const grouped = groupShowtimesForDisplay(filtered);
  const movies = sortGroupedMovies(grouped, sort, selectedDates, selectedTheaters);
  return { movies, filteredRows: filtered };
}

/**
 * Group movies by parent, adding variants as a property on parent entries.
 * Returns movies with parent entries containing a `variants` array.
 */
export function groupMoviesByParent(movies) {
  if (!Array.isArray(movies) || movies.length === 0) return movies;

  const byParentKey = new Map();

  // Group movies by parent key
  for (const movie of movies) {
    const parentKey = movie.parentKey || movie.filmKey || movie.film;

    if (!byParentKey.has(parentKey)) {
      byParentKey.set(parentKey, []);
    }
    byParentKey.get(parentKey).push(movie);
  }

  const grouped = [];

  for (const [parentKey, films] of byParentKey.entries()) {
    // Sort: non-variants first, then by title
    films.sort((a, b) => {
      if (a.isSpecialScreening !== b.isSpecialScreening) {
        return a.isSpecialScreening ? 1 : -1;
      }
      return a.film.localeCompare(b.film);
    });

    const parent = films[0];
    const variants = films.slice(1);

    // Use poster from first film with a valid poster
    let bestPoster = parent.poster;
    if (!bestPoster) {
      for (const variant of variants) {
        if (variant.poster) {
          bestPoster = variant.poster;
          break;
        }
      }
    }

    // Create parent entry with variants
    const parentEntry = {
      ...parent,
      poster: bestPoster,
      variants: variants.length > 0 ? variants : undefined,
      hasVariants: variants.length > 0,
    };

    grouped.push(parentEntry);
  }

  return grouped;
}
