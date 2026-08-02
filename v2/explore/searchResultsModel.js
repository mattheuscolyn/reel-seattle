/**
 * Search Results catalog — ranking, grouping, and filter helpers.
 * Title / theater / format matching only; no person/cast/director search.
 */

import {
  addIsoDays,
  filmsInDateRange,
  inventoryFormats,
  listFilms,
  listOpportunities,
  normalizeSearchQuery,
  pacificDateString,
  theatersById,
} from './exploreCatalog.js';
import { findNextOpportunityForFilm, formatRuntimeLabel } from '../home/shelfData.js';
import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';
import { resolveEnrichedFilmPresentation } from '../enrichment/resolveEnrichedFilmPresentation.js';
import { resolveTheaterPresentation } from '../theaters/resolveTheaterPresentation.js';
import {
  SEARCH_CAPABILITY_NOTE,
  SEARCH_EMPTY_BODY,
  formatSearchSummary,
} from './searchCopy.js';

export const SEARCH_TYPE_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  Object.freeze({ id: 'movies', label: 'Movies' }),
  Object.freeze({ id: 'theaters', label: 'Theaters' }),
  Object.freeze({ id: 'formats', label: 'Formats' }),
]);

export const SEARCH_TIME_FILTERS = Object.freeze([
  Object.freeze({
    id: 'playing-now',
    label: 'Playing now',
    /** Films with showtimes on/after today (Pacific) in the public window — not minute-level live status. */
  }),
  Object.freeze({ id: 'today', label: 'Today' }),
  Object.freeze({ id: 'this-week', label: 'This week' }),
]);

/**
 * @param {string} query
 * @param {string} title
 */
function titleMatchRank(query, title) {
  const q = query.toLowerCase();
  const t = String(title ?? '').toLowerCase();
  if (!q || !t) return 99;
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;
  return 99;
}

/**
 * Deterministic film ranking for search.
 * 1 exact title → 2 prefix → 3 contains → 4 sourceTitle → availability → alpha
 * @param {object[]} films
 * @param {string} query
 * @param {object | null} homeData
 */
export function rankSearchFilms(films, query, homeData) {
  const q = normalizeSearchQuery(query);
  return [...films].sort((a, b) => {
    const ra = Math.min(
      titleMatchRank(q, a.title),
      titleMatchRank(q, a.sourceTitle) + 0.5,
    );
    const rb = Math.min(
      titleMatchRank(q, b.title),
      titleMatchRank(q, b.sourceTitle) + 0.5,
    );
    if (ra !== rb) return ra - rb;
    const oa = findNextOpportunityForFilm(homeData, a.filmKey);
    const ob = findNextOpportunityForFilm(homeData, b.filmKey);
    const ta = oa?.sortableLocalDateTime ?? '9999';
    const tb = ob?.sortableLocalDateTime ?? '9999';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.title).localeCompare(String(b.title));
  });
}

/**
 * @param {object | null} homeData
 * @param {string} filmKey
 * @param {{ timeFilter?: string | null, theaterIds?: string[], formatTags?: string[] }} [filters]
 */
export function findFilteredNextOpportunity(homeData, filmKey, filters = {}) {
  const today = pacificDateString();
  const weekEnd = addIsoDays(today, 6);
  const theaterSet =
    Array.isArray(filters.theaterIds) && filters.theaterIds.length > 0
      ? new Set(filters.theaterIds)
      : null;
  const formatSet =
    Array.isArray(filters.formatTags) && filters.formatTags.length > 0
      ? new Set(filters.formatTags.map((t) => String(t).toLowerCase()))
      : null;

  let opps = listOpportunities(homeData).filter((opp) => opp.filmKey === filmKey);

  if (filters.timeFilter === 'today') {
    opps = opps.filter((opp) => opp.localDate === today);
  } else if (filters.timeFilter === 'this-week' || filters.timeFilter === 'playing-now') {
    opps = opps.filter(
      (opp) =>
        typeof opp.localDate === 'string' &&
        opp.localDate >= today &&
        opp.localDate <= weekEnd,
    );
  }

  if (theaterSet) {
    opps = opps.filter((opp) => theaterSet.has(opp.theaterId));
  }
  if (formatSet) {
    opps = opps.filter((opp) =>
      (opp.formatLabels ?? []).some((tag) => formatSet.has(String(tag).toLowerCase())),
    );
  }

  opps.sort((a, b) => {
    if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
      return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
    }
    return a.opportunityKey < b.opportunityKey ? -1 : 1;
  });
  return opps[0] ?? null;
}

/**
 * @param {object | null} homeData
 * @param {string} filmKey
 * @param {string} [timeFilter]
 */
function filmPassesTimeFilter(homeData, filmKey, timeFilter) {
  if (!timeFilter) return true;
  const today = pacificDateString();
  const weekEnd = addIsoDays(today, 6);
  if (timeFilter === 'today') {
    return filmsInDateRange(homeData, today, today).some((f) => f.filmKey === filmKey);
  }
  if (timeFilter === 'this-week' || timeFilter === 'playing-now') {
    return filmsInDateRange(homeData, today, weekEnd).some((f) => f.filmKey === filmKey);
  }
  return true;
}

/**
 * Compact showtime chip label for a performance.
 * @param {object | null} opportunity
 */
export function buildShowtimeChip(opportunity) {
  if (!opportunity) return null;
  const today = pacificDateString();
  const datePart =
    opportunity.localDate === today
      ? 'Tonight'
      : formatLocalDateLabel(opportunity.localDate) ?? opportunity.localDate;
  const formats = Array.isArray(opportunity.formatLabels)
    ? opportunity.formatLabels.map(formatUserFacingFormatLabel).filter(Boolean)
    : [];
  return {
    label: [datePart, opportunity.timeDisplay].filter(Boolean).join(' '),
    theaterName: opportunity.theaterName ?? null,
    formatLabel: formats[0] ?? null,
    opportunityKey: opportunity.opportunityKey,
  };
}

/**
 * Format/experience matches for a query.
 * @param {object | null} homeData
 * @param {string} query
 */
export function searchFormats(homeData, query) {
  const q = normalizeSearchQuery(query).toLowerCase();
  if (!q) return [];
  return inventoryFormats(homeData)
    .filter((entry) => {
      const tag = String(entry.tag).toLowerCase();
      const label = formatUserFacingFormatLabel(entry.tag)?.toLowerCase() ?? '';
      return tag.includes(q) || label.includes(q);
    })
    .map((entry) => ({
      tag: entry.tag,
      name: formatUserFacingFormatLabel(entry.tag) ?? entry.tag,
      count: entry.count,
      metaLabel: `${entry.count} showtimes`,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Build a collapsed/expanded film result view-model.
 * Enrichment (year/genre/synopsis/poster fallback) joins by exact filmId only.
 *
 * @param {object | null} homeData
 * @param {object} film
 * @param {{ timeFilter?: string | null, theaterIds?: string[], formatTags?: string[] }} [filters]
 * @param {object | null} [enrichmentIndex]
 */
export function buildSearchFilmResult(
  homeData,
  film,
  filters = {},
  enrichmentIndex = null,
) {
  const opportunity = findFilteredNextOpportunity(homeData, film.filmKey, filters);
  const chip = buildShowtimeChip(opportunity);
  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: film.filmId ?? null,
      title: film.title ?? null,
      posterUrl: film.posterUrl ?? null,
      runtimeMin: film.runtimeMin ?? null,
    },
    enrichmentIndex,
    context: 'search',
  });
  const runtime = formatRuntimeLabel(film.runtimeMin);
  const metaParts = [
    enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
    runtime,
    enriched.genreLine,
  ].filter(Boolean);
  const theaterCount = film.theaterCount ?? 0;
  const showtimeCount = film.showtimeCount ?? 0;
  const formatsOnFilm = new Set();
  for (const opp of listOpportunities(homeData)) {
    if (opp.filmKey !== film.filmKey) continue;
    for (const tag of opp.formatLabels ?? []) {
      const label = formatUserFacingFormatLabel(tag);
      if (label) formatsOnFilm.add(label);
    }
  }

  const badges = [];
  for (const label of formatsOnFilm) {
    if (/35\s*mm/i.test(label) || /imax/i.test(label) || /70\s*mm/i.test(label)) {
      badges.push({ id: `fmt-${label}`, label: `Playing in ${label}`, tone: 'neutral' });
    }
  }
  if (badges.length > 3) badges.length = 3;

  return {
    filmKey: film.filmKey,
    filmId: enriched.filmId,
    title: enriched.displayTitle ?? film.title,
    sourceTitle: film.sourceTitle ?? film.title ?? null,
    posterUrl: enriched.posterUrl,
    runtimeMin: film.runtimeMin ?? null,
    metaLine: metaParts.length ? metaParts.join(' · ') : null,
    year: enriched.canonicalYear,
    genre: enriched.genreLine,
    synopsis: enriched.synopsisPreview,
    rating: null,
    language: null,
    /** Carried for future slots; Search UI does not render directors yet. */
    director: enriched.directors,
    hasEnrichment: enriched.hasEnrichment,
    showtimeChip: chip,
    opportunityKey: opportunity?.opportunityKey ?? null,
    alsoPlayingLabel:
      theaterCount >= 2 ? `Also playing at ${theaterCount} theaters` : null,
    weekShowtimeLabel:
      showtimeCount >= 2 ? `${showtimeCount} showtimes in window` : null,
    badges,
    theaterCount,
    showtimeCount,
  };
}

/**
 * Full Search Results model for the designed surface.
 *
 * @param {object | null} homeData
 * @param {string} query
 * @param {{
 *   typeFilter?: string,
 *   timeFilter?: string | null,
 *   theaterIds?: string[],
 *   formatTags?: string[],
 *   dismissedKeys?: string[],
 *   runtimeMin?: number | null,
 *   runtimeMax?: number | null,
 *   enrichmentIndex?: object | null,
 * }} [options]
 */
export function buildSearchResultsModel(homeData, query, options = {}) {
  const normalized = normalizeSearchQuery(query);
  const typeFilter = options.typeFilter ?? 'all';
  const timeFilter = options.timeFilter ?? null;
  const dismissed = new Set(options.dismissedKeys ?? []);
  const theaterIds = options.theaterIds ?? [];
  const formatTags = options.formatTags ?? [];
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const filters = { timeFilter, theaterIds, formatTags };

  if (!normalized) {
    return {
      query: '',
      typeFilter,
      timeFilter,
      personSearchSupported: false,
      collectionsSearchSupported: false,
      films: [],
      theaters: [],
      formats: [],
      /** Future entity groups — empty until capability + data exist. */
      people: [],
      collections: [],
      totalCount: 0,
      summary: formatSearchSummary('', 0),
      capabilityNote: SEARCH_CAPABILITY_NOTE,
      emptyBody: null,
      emptyReason: 'empty-query',
    };
  }

  const q = normalized.toLowerCase();

  let filmMatches = listFilms(homeData).filter((film) => {
    if (dismissed.has(film.filmKey)) return false;
    const title = String(film.title ?? '').toLowerCase();
    const source = String(film.sourceTitle ?? '').toLowerCase();
    const parent = String(film.parentDisplayTitle ?? '').toLowerCase();
    return title.includes(q) || source.includes(q) || parent.includes(q);
  });

  filmMatches = filmMatches.filter((film) =>
    filmPassesTimeFilter(homeData, film.filmKey, timeFilter),
  );

  if (theaterIds.length || formatTags.length) {
    filmMatches = filmMatches.filter(
      (film) => findFilteredNextOpportunity(homeData, film.filmKey, filters) != null,
    );
  }

  if (typeof options.runtimeMin === 'number') {
    filmMatches = filmMatches.filter(
      (film) => (film.runtimeMin ?? 0) >= options.runtimeMin,
    );
  }
  if (typeof options.runtimeMax === 'number') {
    filmMatches = filmMatches.filter(
      (film) =>
        film.runtimeMin == null || film.runtimeMin <= options.runtimeMax,
    );
  }

  filmMatches = rankSearchFilms(filmMatches, normalized, homeData);
  let films = filmMatches.map((film) =>
    buildSearchFilmResult(homeData, film, filters, enrichmentIndex),
  );

  let theaters = Object.values(theatersById(homeData))
    .filter((theater) => {
      const name = String(theater.name ?? '').toLowerCase();
      const neighborhood = String(theater.neighborhood ?? '').toLowerCase();
      const city = String(theater.city ?? '').toLowerCase();
      return name.includes(q) || neighborhood.includes(q) || city.includes(q);
    })
    .map((theater) => {
      const card = resolveTheaterPresentation({
        theater,
        homeData,
        context: 'search',
      });
      return {
        id: card.id,
        name: card.name,
        metaLabel: card.metaLabel,
        opportunityCount: card.opportunityCount,
        availabilityLabel:
          card.opportunityCount > 0
            ? `${card.opportunityCount} showtimes`
            : null,
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  let formats = searchFormats(homeData, normalized);

  if (typeFilter === 'movies') {
    theaters = [];
    formats = [];
  } else if (typeFilter === 'theaters') {
    films = [];
    formats = [];
  } else if (typeFilter === 'formats') {
    films = [];
    theaters = [];
  }

  const totalCount = films.length + theaters.length + formats.length;
  const summary = formatSearchSummary(normalized, totalCount);

  return {
    query: normalized,
    typeFilter,
    timeFilter,
    personSearchSupported: false,
    collectionsSearchSupported: false,
    films,
    theaters,
    formats,
    people: [],
    collections: [],
    totalCount,
    summary,
    capabilityNote: SEARCH_CAPABILITY_NOTE,
    emptyBody: totalCount === 0 ? SEARCH_EMPTY_BODY : null,
    emptyReason: totalCount === 0 ? 'no-matches' : null,
  };
}

/**
 * Count advanced filters currently applied (excludes type/time chips).
 * @param {{ theaterIds?: string[], formatTags?: string[], runtimeMin?: number | null, runtimeMax?: number | null }} filters
 */
export function countAdvancedFilters(filters = {}) {
  let n = 0;
  if (filters.theaterIds?.length) n += 1;
  if (filters.formatTags?.length) n += 1;
  if (typeof filters.runtimeMin === 'number') n += 1;
  if (typeof filters.runtimeMax === 'number') n += 1;
  return n;
}

/**
 * Theater options for the Filters sheet.
 * @param {object | null} homeData
 */
export function listTheaterFilterOptions(homeData) {
  return Object.values(theatersById(homeData))
    .filter((t) => t.id && t.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((t) => ({ id: t.id, name: t.name }));
}

/**
 * Format options for the Filters sheet.
 * @param {object | null} homeData
 */
export function listFormatFilterOptions(homeData) {
  return inventoryFormats(homeData).map((entry) => ({
    tag: entry.tag,
    name: formatUserFacingFormatLabel(entry.tag) ?? entry.tag,
    count: entry.count,
  }));
}
