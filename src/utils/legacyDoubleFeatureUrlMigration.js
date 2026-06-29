/**
 * Decode legacy `/double-feature?...` query params for redirect migration into Planner.
 * Kept only for old shared Double Feature links; not used by Planner-native URL state.
 */

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

function readOptionalText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Coerce movie filter mode from legacy URL `filter` param. */
function normalizeMovieFilterMode(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === 'whitelist' || trimmed === 'blacklist') return trimmed;
  return null;
}

/**
 * Decode legacy Double Feature filter state from URLSearchParams.
 * `movies` → whitelist; `exclude` → blacklist.
 *
 * @param {URLSearchParams|string} searchParamsInput
 * @returns {{
 *   selectedDate: string,
 *   selectedTheaters: string[],
 *   earliestStartTime: string,
 *   earliestEndTime: string,
 *   movieFilterType: 'none'|'whitelist'|'blacklist',
 *   selectedMovies: string[],
 * }}
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
