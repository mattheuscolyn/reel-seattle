import { DEFAULT_SORT, SORT_OPTIONS } from './showtimesPageEngine.js';

const VALID_SORTS = new Set(SORT_OPTIONS.map((option) => option.value));

/** Trim search text; empty string means no title filter. */
export function normalizeSearchText(searchText) {
  if (searchText == null) return '';
  return String(searchText).trim();
}

/** Coerce sort query value to a supported sort mode or the default. */
export function normalizeSort(value) {
  if (!value || typeof value !== 'string') return DEFAULT_SORT;
  const trimmed = value.trim();
  return VALID_SORTS.has(trimmed) ? trimmed : DEFAULT_SORT;
}

function readMultiParam(searchParams, key) {
  return searchParams
    .getAll(key)
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Decode Showtimes filter state from URLSearchParams.
 * Accepts a query string (with or without leading "?") for tests.
 */
export function decodeShowtimesFilters(searchParamsInput) {
  const searchParams =
    typeof searchParamsInput === 'string'
      ? new URLSearchParams(
          searchParamsInput.startsWith('?') ? searchParamsInput.slice(1) : searchParamsInput,
        )
      : searchParamsInput;

  return {
    searchText: normalizeSearchText(searchParams.get('search') ?? ''),
    selectedDates: readMultiParam(searchParams, 'dates'),
    selectedTheaters: readMultiParam(searchParams, 'theaters'),
    sort: normalizeSort(searchParams.get('sort')),
  };
}

/**
 * Encode Showtimes filters into URLSearchParams.
 * Default/empty values are omitted for clean share URLs.
 */
export function encodeShowtimesFilters({
  searchText = '',
  selectedDates = [],
  selectedTheaters = [],
  sort = DEFAULT_SORT,
} = {}) {
  const params = new URLSearchParams();
  const trimmedSearch = normalizeSearchText(searchText);

  if (trimmedSearch) {
    params.set('search', trimmedSearch);
  }

  for (const date of selectedDates) {
    const trimmed = String(date).trim();
    if (trimmed) params.append('dates', trimmed);
  }

  for (const theater of selectedTheaters) {
    const trimmed = String(theater).trim();
    if (trimmed) params.append('theaters', trimmed);
  }

  const normalizedSort = normalizeSort(sort);
  if (normalizedSort !== DEFAULT_SORT) {
    params.set('sort', normalizedSort);
  }

  return params;
}

/** Serialize filters to a query string (empty string when no params). */
export function buildShowtimesSearchString(filters) {
  const query = encodeShowtimesFilters(filters).toString();
  return query ? `?${query}` : '';
}

/** Keep only values that exist in the current option list. */
export function intersectWithOptions(selected, options) {
  if (!selected?.length) return [];
  const allowed = new Set(options);
  return selected.filter((value) => allowed.has(value));
}

/** True when encoded params differ from current URLSearchParams. */
export function showtimesFiltersDiffer(encodedParams, currentParams) {
  return encodedParams.toString() !== currentParams.toString();
}
