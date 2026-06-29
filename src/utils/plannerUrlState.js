import { PLANNER_SORT_MODES } from './plannerEngine.js';
import { parseTimeToMinutes } from './timeUtils.js';
import { decodeDoubleFeatureFilters } from './legacyDoubleFeatureUrlMigration.js';

const VALID_FILM_COUNTS = new Set(['2', '3', '4', 'max']);
function toSearchParams(searchParamsInput) {
  if (typeof searchParamsInput === 'string') {
    const query = searchParamsInput.startsWith('?')
      ? searchParamsInput.slice(1)
      : searchParamsInput;
    return new URLSearchParams(query);
  }
  return searchParamsInput;
}

function readMultiParam(searchParams, key) {
  return searchParams
    .getAll(key)
    .map((value) => value.trim())
    .filter(Boolean);
}

function readFilmListParam(searchParams, key) {
  const values = searchParams.getAll(key);
  if (values.length === 0) return [];
  if (values.length === 1 && values[0].includes(',')) {
    return values[0]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return values.map((value) => value.trim()).filter(Boolean);
}

function writeFilmListParam(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((film) => String(film).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

function hasFilmListValues(value) {
  return writeFilmListParam(value).length > 0;
}

function readOptionalText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Trim optional planner time; invalid compact times decode to empty. */
export function normalizePlannerTime(value) {
  if (value == null) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return parseTimeToMinutes(trimmed) !== null ? trimmed : '';
}

function normalizeFilmCount(value) {  const trimmed = readOptionalText(value);
  if (!trimmed) return 2;
  if (VALID_FILM_COUNTS.has(trimmed)) return trimmed === 'max' ? 'max' : Number(trimmed);
  const n = Number(trimmed);
  if (n === 2 || n === 3 || n === 4) return n;
  return 2;
}

function parseGapMinutes(value) {
  const trimmed = readOptionalText(value);
  if (!trimmed) return '';
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return '';
  return String(n);
}

function normalizeSort(value) {
  const trimmed = readOptionalText(value);
  if (!trimmed) return '';
  return PLANNER_SORT_MODES.includes(trimmed) ? trimmed : '';
}

function normalizeAdvancedFlag(value) {
  const trimmed = readOptionalText(value).toLowerCase();
  return trimmed === '1' || trimmed === 'true' || trimmed === 'yes';
}

/**
 * Decode planner filter state from URLSearchParams.
 */
export function decodePlannerFilters(searchParamsInput) {
  const searchParams = toSearchParams(searchParamsInput);

  return {
    selectedDate: readOptionalText(searchParams.get('date')),
    selectedTheaters: readMultiParam(searchParams, 'theaters'),
    filmCount: normalizeFilmCount(searchParams.get('count')),
    startAfter: readOptionalText(searchParams.get('start')),
    finishBy: readOptionalText(searchParams.get('finish')),
    minGapMin: parseGapMinutes(searchParams.get('mingap')),
    maxGapMin: parseGapMinutes(searchParams.get('maxgap')),
    maxGapExplicit: searchParams.has('maxgap'),
    includeFilms: readFilmListParam(searchParams, 'movies'),
    excludeFilms: readFilmListParam(searchParams, 'exclude'),
    preferredFilms: readFilmListParam(searchParams, 'preferred'),
    firstFilm: readOptionalText(searchParams.get('first')),
    lastFilm: readOptionalText(searchParams.get('last')),
    sort: normalizeSort(searchParams.get('sort')),
    advancedOpen:
      normalizeAdvancedFlag(searchParams.get('advanced')) ||
      searchParams.has('mingap') ||
      searchParams.has('maxgap') ||
      readOptionalText(searchParams.get('first')) !== '' ||
      readOptionalText(searchParams.get('last')) !== '' ||
      normalizeSort(searchParams.get('sort')) !== '',
  };
}

/**
 * Encode planner filters into URLSearchParams. Defaults are omitted.
 */
export function encodePlannerFilters({
  selectedDate = '',
  selectedTheaters = [],
  filmCount = 2,
  startAfter = '',
  finishBy = '',
  minGapMin = '',
  maxGapMin = '',
  maxGapExplicit = false,
  includeFilms = [],
  excludeFilms = [],
  preferredFilms = [],
  firstFilm = '',
  lastFilm = '',
  sort = '',
  advancedOpen = false,
} = {}) {
  const params = new URLSearchParams();
  const trimmedDate = readOptionalText(selectedDate);

  if (trimmedDate) params.set('date', trimmedDate);

  for (const theater of selectedTheaters) {
    const trimmed = readOptionalText(theater);
    if (trimmed) params.append('theaters', trimmed);
  }

  const count = filmCount === 'max' ? 'max' : Number(filmCount);
  if (count === 3 || count === 4 || count === 'max') {
    params.set('count', String(count));
  }

  const start = readOptionalText(startAfter);
  if (start) params.set('start', start);

  const finish = readOptionalText(finishBy);
  if (finish) params.set('finish', finish);

  const minGap = parseGapMinutes(minGapMin);
  if (minGap !== '') params.set('mingap', minGap);

  if (maxGapExplicit) {
    const maxGap = parseGapMinutes(maxGapMin);
    if (maxGap !== '') params.set('maxgap', maxGap);
  }

  for (const film of writeFilmListParam(includeFilms)) {
    params.append('movies', film);
  }

  for (const film of writeFilmListParam(excludeFilms)) {
    params.append('exclude', film);
  }

  for (const film of writeFilmListParam(preferredFilms)) {
    params.append('preferred', film);
  }

  const first = readOptionalText(firstFilm);
  if (first) params.set('first', first);

  const last = readOptionalText(lastFilm);
  if (last) params.set('last', last);

  const safeSort = normalizeSort(sort);
  if (safeSort && safeSort !== 'earliest_start') {
    params.set('sort', safeSort);
  }

  if (advancedOpen) params.set('advanced', '1');

  return params;
}

export function buildPlannerSearchString(filters) {
  const query = encodePlannerFilters(filters).toString();
  return query ? `?${query}` : '';
}

export function plannerFiltersDiffer(encodedParams, currentParams) {
  return encodedParams.toString() !== currentParams.toString();
}

/** True when URL contains meaningful planner filter params. */
export function hasActivePlannerQuery({
  selectedDate = '',
  selectedTheaters = [],
  filmCount = 2,
  startAfter = '',
  finishBy = '',
  minGapMin = '',
  maxGapMin = '',
  maxGapExplicit = false,
  includeFilms = [],
  excludeFilms = [],
  preferredFilms = [],
  firstFilm = '',
  lastFilm = '',
  sort = '',
} = {}) {
  if (readOptionalText(selectedDate)) return true;
  if (selectedTheaters.length > 0) return true;
  if (filmCount === 3 || filmCount === 4 || filmCount === 'max') return true;
  if (readOptionalText(startAfter)) return true;
  if (readOptionalText(finishBy)) return true;
  if (parseGapMinutes(minGapMin) !== '') return true;
  if (maxGapExplicit) return true;
  if (hasFilmListValues(includeFilms)) return true;
  if (hasFilmListValues(excludeFilms)) return true;
  if (hasFilmListValues(preferredFilms)) return true;
  if (readOptionalText(firstFilm)) return true;
  if (readOptionalText(lastFilm)) return true;
  if (normalizeSort(sort)) return true;
  return false;
}

/**
 * Map Double Feature filter state to planner URL params for migration links.
 *
 * Double Feature `end` filters individual showtime end times (earliest end), not the
 * schedule finish-by time used by Planner/Marathon. It is intentionally omitted here.
 *
 * @param {object} doubleFeatureFilters - Output of decodeDoubleFeatureFilters
 * @returns {URLSearchParams}
 */
export function mapDoubleFeatureFiltersToPlanner(doubleFeatureFilters = {}) {
  const includeFilms =
    doubleFeatureFilters.movieFilterType === 'whitelist'
      ? doubleFeatureFilters.selectedMovies ?? []
      : [];
  const excludeFilms =
    doubleFeatureFilters.movieFilterType === 'blacklist'
      ? doubleFeatureFilters.selectedMovies ?? []
      : [];

  return encodePlannerFilters({
    selectedDate: doubleFeatureFilters.selectedDate ?? '',
    selectedTheaters: doubleFeatureFilters.selectedTheaters ?? [],
    filmCount: 2,
    startAfter: normalizePlannerTime(doubleFeatureFilters.earliestStartTime ?? ''),
    finishBy: '',
    includeFilms,
    excludeFilms,
    advancedOpen: includeFilms.length > 0 || excludeFilms.length > 0,
  });
}

/**
 * Build a /planner path from Double Feature URL query params.
 * Always includes count=2 so migration links are explicit.
 *
 * @param {URLSearchParams|string} searchParamsInput
 * @returns {string}
 */
export function buildPlannerPathFromDoubleFeature(searchParamsInput) {
  const dfFilters = decodeDoubleFeatureFilters(searchParamsInput);
  const params = mapDoubleFeatureFiltersToPlanner(dfFilters);
  if (!params.has('count')) params.set('count', '2');
  const query = params.toString();
  return query ? `/planner?${query}` : '/planner?count=2';
}

/** localStorage key used by the legacy Marathon iframe UI (`public/marathon/marathon.js`). */
export const MARATHON_FILTER_STORAGE_KEY = 'marathon-planner-filters';

/**
 * Parse legacy Marathon filter JSON from localStorage.
 * Shape: `{ blacklist: string[], preferred_movies: string[] }`
 *
 * @param {string|object|null|undefined} raw
 * @returns {{ blacklist: string[], preferredMovies: string[] }|null}
 */
export function parseMarathonStoredFilters(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      blacklist: Array.isArray(parsed.blacklist)
        ? parsed.blacklist.map((title) => String(title).trim()).filter(Boolean)
        : [],
      preferredMovies: Array.isArray(parsed.preferred_movies)
        ? parsed.preferred_movies.map((title) => String(title).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Read legacy Marathon filters from localStorage (browser only).
 *
 * @param {Storage|null|undefined} storage
 * @returns {{ blacklist: string[], preferredMovies: string[] }|null}
 */
export function readMarathonStoredFilters(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return parseMarathonStoredFilters(storage.getItem(MARATHON_FILTER_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Map legacy Marathon filter state to planner URL params for migration redirects.
 *
 * @param {{ blacklist?: string[], preferredMovies?: string[] }|null|undefined} marathonFilters
 * @returns {URLSearchParams}
 */
export function mapMarathonFiltersToPlanner(marathonFilters = null) {
  const blacklist = marathonFilters?.blacklist ?? [];
  const preferredMovies = marathonFilters?.preferredMovies ?? [];
  const hasAdvancedFilters = blacklist.length > 0 || preferredMovies.length > 0;

  const params = encodePlannerFilters({
    filmCount: 'max',
    excludeFilms: blacklist,
    preferredFilms: preferredMovies,
    advancedOpen: hasAdvancedFilters,
  });
  params.set('from', 'marathon');
  return params;
}

/**
 * Build a /planner path for Marathon legacy route redirects.
 * Reads localStorage when no explicit filters or storage object is passed.
 *
 * @param {Storage|{ blacklist?: string[], preferredMovies?: string[] }|null|undefined} storedFiltersOrStorage
 * @returns {string}
 */
export function buildPlannerPathFromMarathon(storedFiltersOrStorage) {
  let filters = null;
  if (storedFiltersOrStorage == null) {
    filters = readMarathonStoredFilters(
      typeof localStorage !== 'undefined' ? localStorage : null,
    );
  } else if (typeof storedFiltersOrStorage.getItem === 'function') {
    filters = readMarathonStoredFilters(storedFiltersOrStorage);
  } else {
    filters = storedFiltersOrStorage;
  }

  const params = mapMarathonFiltersToPlanner(filters);
  return `/planner?${params.toString()}`;
}

/** Planner link for Marathon legacy page migration. */
export function buildMarathonPlannerLink() {
  return '/planner?count=max';
}
