/**
 * Merge local Search Results with TMDB-only hits.
 *
 * Local films stay privileged. TMDB hits are appended under a secondary
 * group after dedupe by canonical `tmdb:<id>`.
 */

import { formatSearchSummary } from '../explore/searchCopy.js';
import { TMDB_SEARCH_LIMIT } from './tmdbSearchClient.js';

/**
 * Collect local filmIds that are already `tmdb:<id>`.
 * Prefer catalog-wide home films so known local titles never reappear as
 * TMDB-only rows even when they did not match the current query ranking.
 *
 * Fallback: when a local film lacks `filmId`, it cannot be deduped by TMDB ID
 * (title-only matching is intentionally not used here).
 *
 * @param {object[]} films
 * @returns {Set<string>}
 */
export function collectLocalTmdbFilmIds(films) {
  const ids = new Set();
  for (const film of films ?? []) {
    const id = typeof film?.filmId === 'string' ? film.filmId.trim() : '';
    if (/^tmdb:[1-9][0-9]*$/.test(id)) ids.add(id);
  }
  return ids;
}

/**
 * @param {object[]} tmdbFilms
 * @param {Set<string>} localTmdbIds
 */
export function dedupeTmdbFilmsAgainstLocal(tmdbFilms, localTmdbIds) {
  const seen = new Set(localTmdbIds);
  /** @type {object[]} */
  const out = [];
  for (const film of tmdbFilms ?? []) {
    const id = typeof film?.filmId === 'string' ? film.filmId.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(film);
    if (out.length >= TMDB_SEARCH_LIMIT) break;
  }
  return out;
}

/**
 * Rank remaining TMDB hits: title match quality, then popularity.
 * @param {object[]} films
 * @param {string} query
 */
export function rankTmdbSearchFilms(films, query) {
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  const rank = (title) => {
    const t = String(title ?? '').toLowerCase();
    if (!q || !t) return 99;
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (t.includes(q)) return 2;
    return 3;
  };
  return [...films].sort((a, b) => {
    const ra = rank(a.title);
    const rb = rank(b.title);
    if (ra !== rb) return ra - rb;
    const pa = typeof a.tmdbPopularity === 'number' ? a.tmdbPopularity : 0;
    const pb = typeof b.tmdbPopularity === 'number' ? b.tmdbPopularity : 0;
    if (pa !== pb) return pb - pa;
    return String(a.title).localeCompare(String(b.title));
  });
}

/**
 * Whether the current Search filters should suppress external TMDB results.
 * Time/theater/format filters imply Seattle exhibition constraints.
 *
 * @param {{
 *   typeFilter?: string,
 *   timeFilter?: string | null,
 *   theaterIds?: string[],
 *   formatTags?: string[],
 * }} [options]
 */
export function shouldSuppressTmdbSearch(options = {}) {
  const typeFilter = options.typeFilter ?? 'all';
  if (typeFilter === 'theaters' || typeFilter === 'formats') return true;
  if (options.timeFilter) return true;
  if (Array.isArray(options.theaterIds) && options.theaterIds.length > 0) {
    return true;
  }
  if (Array.isArray(options.formatTags) && options.formatTags.length > 0) {
    return true;
  }
  return false;
}

/**
 * @param {object} localModel — from buildSearchResultsModel
 * @param {object[]} tmdbHits — already mapped film VMs
 * @param {{
 *   typeFilter?: string,
 *   timeFilter?: string | null,
 *   theaterIds?: string[],
 *   formatTags?: string[],
 *   tmdbStatus?: 'idle' | 'loading' | 'ready' | 'error' | 'suppressed',
 *   catalogFilms?: object[],
 * }} [options]
 */
export function mergeLocalAndTmdbSearchResults(
  localModel,
  tmdbHits,
  options = {},
) {
  const base = localModel && typeof localModel === 'object' ? localModel : null;
  if (!base) {
    return {
      query: '',
      films: [],
      moreFilms: [],
      theaters: [],
      formats: [],
      people: [],
      collections: [],
      totalCount: 0,
      summary: formatSearchSummary('', 0),
      tmdbStatus: 'idle',
      emptyBody: null,
      emptyReason: 'empty-query',
    };
  }

  const suppressed = shouldSuppressTmdbSearch(options);
  const localFilms = Array.isArray(base.films) ? base.films : [];
  const localWithOrigin = localFilms.map((film) => ({
    ...film,
    origin: film.origin ?? 'local',
    availabilityLabel:
      film.availabilityLabel ??
      (film.showtimeChip ? null : 'No upcoming showtimes in the current window'),
  }));

  let moreFilms = [];
  let tmdbStatus = options.tmdbStatus ?? 'idle';
  if (suppressed) {
    tmdbStatus = 'suppressed';
  } else if (Array.isArray(tmdbHits) && tmdbHits.length > 0) {
    const catalog = Array.isArray(options.catalogFilms)
      ? options.catalogFilms
      : localWithOrigin;
    const localIds = collectLocalTmdbFilmIds([
      ...catalog,
      ...localWithOrigin,
    ]);
    moreFilms = rankTmdbSearchFilms(
      dedupeTmdbFilmsAgainstLocal(tmdbHits, localIds),
      base.query,
    );
    if (tmdbStatus === 'idle' || tmdbStatus === 'loading') {
      tmdbStatus = 'ready';
    }
  }

  const theaters = Array.isArray(base.theaters) ? base.theaters : [];
  const formats = Array.isArray(base.formats) ? base.formats : [];
  const totalCount =
    localWithOrigin.length + moreFilms.length + theaters.length + formats.length;
  const awaitingTmdb =
    !suppressed &&
    (tmdbStatus === 'loading' || tmdbStatus === 'idle') &&
    Boolean(String(base.query ?? '').trim());

  return {
    ...base,
    films: localWithOrigin,
    moreFilms,
    moreFilmsSectionTitle: 'More films',
    totalCount,
    summary: formatSearchSummary(base.query, totalCount),
    tmdbStatus,
    emptyBody:
      totalCount === 0 && !awaitingTmdb ? base.emptyBody : null,
    emptyReason:
      totalCount === 0 && !awaitingTmdb ? base.emptyReason : null,
  };
}
