import { parseTimeToMinutes } from './timeUtils.js';

const VALID_MOVIE_FILTER_TYPES = new Set(['none', 'whitelist', 'blacklist']);

/** UI movie filter type including none. */
export function normalizeMovieFilterType(value) {
  if (!value || typeof value !== 'string') return 'none';
  const trimmed = value.trim();
  return VALID_MOVIE_FILTER_TYPES.has(trimmed) ? trimmed : 'none';
}

function readMultiParam(searchParams, key) {
  return searchParams
    .getAll(key)
    .map((value) => value.trim())
    .filter(Boolean);
}

function toSearchParams(searchParamsInput) {
  if (typeof searchParamsInput === 'string') {
    const query = searchParamsInput.startsWith('?')
      ? searchParamsInput.slice(1)
      : searchParamsInput;
    return new URLSearchParams(query);
  }
  return searchParamsInput;
}

/** Trim optional planner time; invalid compact times decode to empty. */
export function normalizePlannerTime(value) {
  if (value == null) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return parseTimeToMinutes(trimmed) !== null ? trimmed : '';
}

/** Trim optional text field from URL. */
function readOptionalText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Coerce movie filter mode from URL `filter` param. */
export function normalizeMovieFilterMode(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === 'whitelist' || trimmed === 'blacklist') return trimmed;
  return null;
}

/**
 * Decode Double Feature planner state from URLSearchParams.
 * `movies` → whitelist; `exclude` → blacklist.
 */
export function decodeDoubleFeatureFilters(searchParamsInput) {
  const searchParams = toSearchParams(searchParamsInput);
  const movies = readMultiParam(searchParams, 'movies');
  const exclude = readMultiParam(searchParams, 'exclude');

  let movieFilterType = 'none';
  let selectedMovies = [];
  if (exclude.length > 0) {
    movieFilterType = 'blacklist';
    selectedMovies = exclude;
  } else if (movies.length > 0) {
    movieFilterType = 'whitelist';
    selectedMovies = movies;
  } else {
    const filterMode = normalizeMovieFilterMode(searchParams.get('filter'));
    if (filterMode) {
      movieFilterType = filterMode;
    }
  }

  return {
    selectedDate: readOptionalText(searchParams.get('date')),
    selectedTheaters: readMultiParam(searchParams, 'theaters'),
    earliestStartTime: readOptionalText(searchParams.get('start')),
    earliestEndTime: readOptionalText(searchParams.get('end')),
    movieFilterType,
    selectedMovies,
  };
}

/**
 * Encode Double Feature planner filters into URLSearchParams.
 * Default/empty values are omitted for clean share URLs.
 */
export function encodeDoubleFeatureFilters({
  selectedDate = '',
  selectedTheaters = [],
  earliestStartTime = '',
  earliestEndTime = '',
  movieFilterType = 'none',
  selectedMovies = [],
} = {}) {
  const params = new URLSearchParams();
  const trimmedDate = String(selectedDate).trim();

  if (trimmedDate) {
    params.set('date', trimmedDate);
  }

  for (const theater of selectedTheaters) {
    const trimmed = String(theater).trim();
    if (trimmed) params.append('theaters', trimmed);
  }

  const start = readOptionalText(earliestStartTime);
  if (start) params.set('start', start);

  const end = readOptionalText(earliestEndTime);
  if (end) params.set('end', end);

  const filterType = normalizeMovieFilterType(movieFilterType);
  if (filterType === 'whitelist') {
    params.set('filter', 'whitelist');
    for (const film of selectedMovies) {
      const trimmed = String(film).trim();
      if (trimmed) params.append('movies', trimmed);
    }
  } else if (filterType === 'blacklist') {
    params.set('filter', 'blacklist');
    for (const film of selectedMovies) {
      const trimmed = String(film).trim();
      if (trimmed) params.append('exclude', trimmed);
    }
  }

  return params;
}

/** Serialize planner filters to a query string (empty string when no params). */
export function buildDoubleFeatureSearchString(filters) {
  const query = encodeDoubleFeatureFilters(filters).toString();
  return query ? `?${query}` : '';
}

/** Keep only values that exist in the current option list. */
export function intersectWithOptions(selected, options) {
  if (!selected?.length) return [];
  const allowed = new Set(options);
  return selected.filter((value) => allowed.has(value));
}

/** True when decoded planner state includes meaningful non-default URL filters. */
export function hasActivePlannerQuery({
  selectedDate = '',
  selectedTheaters = [],
  earliestStartTime = '',
  earliestEndTime = '',
  movieFilterType = 'none',
  selectedMovies = [],
} = {}) {
  if (readOptionalText(selectedDate)) return true;
  if (selectedTheaters.length > 0) return true;
  if (readOptionalText(earliestStartTime)) return true;
  if (readOptionalText(earliestEndTime)) return true;
  if (normalizeMovieFilterType(movieFilterType) !== 'none') return true;
  if (selectedMovies.length > 0) return true;
  return false;
}

/** True when encoded planner params would produce a non-empty query string. */
export function hasActivePlannerQueryString(searchParamsInput) {
  const filters = decodeDoubleFeatureFilters(searchParamsInput);
  return encodeDoubleFeatureFilters(filters).toString().length > 0;
}

/** True when encoded params differ from current URLSearchParams. */
export function doubleFeatureFiltersDiffer(encodedParams, currentParams) {
  return encodedParams.toString() !== currentParams.toString();
}
