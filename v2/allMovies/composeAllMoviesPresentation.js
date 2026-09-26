/**
 * All Movies — films with an actual booked future Seattle screening.
 *
 * Distinct from:
 * - Coming Soon: expected/announced titles, including those without a
 *   Seattle showtime yet. All Movies never reads Coming Soon inventory.
 * - Browse Showtimes: performance-centric date/theater/format/time exploration.
 * - Opening This Week: release/opening-focused curated subset.
 * - Just Announced: recently observed showtime additions.
 *
 * Inclusion: ≥1 actionable future HomeData opportunity. No hidden
 * 14/45/90-day horizon — far-future bookings belong here, grouped as Later.
 *
 * Identity: parent/canonical film family + exact tmdb:* filmId. Never
 * dedupe by normalized title.
 *
 * UI state (search, availability, sort, genreKeys) lives in in-app
 * session state (`allMoviesUi`), not URL query parameters.
 */

import {
  addIsoDays,
  normalizeSearchQuery,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import {
  asCanonicalFilmId,
  lookupEnrichment,
} from '../enrichment/enrichmentIndex.js';
import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import { formatGenreNames } from '../enrichment/resolveEnrichedFilmPresentation.js';
import {
  MAX_SURFACE_HYDRATION_IDS,
  uniqueCanonicalFilmIds,
} from '../enrichment/hydrateShelfFilmEnrichment.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import { normalizeShowtimeFilmKey } from '../stores/savedFilmsStore.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import {
  compareScreeningsByStart,
  isActionableScreening,
} from '../showtimes/canonicalScreening.js';
import {
  opportunitySortableKey,
  parseLocalTimeMinutes,
} from '../showtimes/showtimeEligibility.js';
import { filterVisibleFilms } from '../visibility/filmVisibility.js';

export const ALL_MOVIES_PAGE_TITLE = 'All Movies';
export const ALL_MOVIES_PAGE_TAGLINE =
  'Every film with upcoming Seattle showtimes.';

/** Rolling Pacific window: today through today + 6 (7 calendar days). */
export const ALL_MOVIES_THIS_WEEK_SPAN_DAYS = 6;

export const ALL_MOVIES_AVAILABILITY_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  Object.freeze({ id: 'this-week', label: 'This Week' }),
  Object.freeze({ id: 'later', label: 'Later' }),
]);

export const ALL_MOVIES_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'soonest', label: 'Soonest' }),
  Object.freeze({ id: 'az', label: 'A–Z' }),
]);

export const DEFAULT_ALL_MOVIES_UI = Object.freeze({
  query: '',
  availability: 'all',
  sort: 'soonest',
  genreKeys: Object.freeze([]),
});

/** TMDB films rarely exceed a handful of genres; keep the full structured list. */
export const ALL_MOVIES_MAX_GENRES = 20;

const EVENING_START_MINUTES = 17 * 60;

/**
 * Stable filter key for a TMDB genre display label.
 * @param {unknown} label
 * @returns {string | null}
 */
export function allMoviesGenreKey(label) {
  if (typeof label !== 'string') return null;
  const key = label.trim().toLowerCase();
  return key || null;
}

/**
 * Defensive unique, lowercase, sorted genre keys.
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeAllMoviesGenreKeys(value) {
  if (!Array.isArray(value)) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const keys = [];
  for (const raw of value) {
    const key = allMoviesGenreKey(typeof raw === 'string' ? raw : '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  keys.sort((a, b) => a.localeCompare(b, 'en'));
  return keys;
}

/**
 * Full structured TMDB genre labels for a canonical filmId.
 * Never infers from title, theater, keywords, or source copy.
 *
 * @param {object | null | undefined} enrichmentIndex
 * @param {string | null | undefined} filmId
 * @returns {string[]}
 */
export function extractAllMoviesGenres(enrichmentIndex, filmId) {
  const row = lookupEnrichment(enrichmentIndex, filmId);
  return formatGenreNames(row?.genres, ALL_MOVIES_MAX_GENRES);
}

/**
 * @param {string[] | undefined} filmGenreKeys
 * @param {Iterable<string>} selectedKeys
 */
export function filmMatchesAllMoviesGenres(filmGenreKeys, selectedKeys) {
  const set =
    selectedKeys instanceof Set
      ? selectedKeys
      : new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  if (set.size === 0) return true;
  return (Array.isArray(filmGenreKeys) ? filmGenreKeys : []).some((key) =>
    set.has(key),
  );
}

/**
 * Faceted genre counts: unique films matching All Movies eligibility +
 * active search + active availability, excluding the genre dimension
 * itself so selected genres do not zero out other options.
 *
 * @param {object[]} rows
 * @returns {{ key: string, label: string, count: number }[]}
 */
export function buildAllMoviesGenreOptions(rows) {
  /** @type {Map<string, { key: string, label: string, count: number }>} */
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const labels = Array.isArray(row?.genres) ? row.genres : [];
    /** @type {Set<string>} */
    const seen = new Set();
    for (const label of labels) {
      const key = allMoviesGenreKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { key, label, count: 1 });
    }
  }
  return [...byKey.values()]
    .filter((option) => option.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, 'en');
    });
}

/**
 * Preview how many facet films match a draft genre selection (OR).
 *
 * @param {string[][]} facetGenreKeys
 * @param {unknown} selectedKeys
 */
export function countAllMoviesMatchingGenreKeys(facetGenreKeys, selectedKeys) {
  const rows = Array.isArray(facetGenreKeys) ? facetGenreKeys : [];
  const keys = normalizeAllMoviesGenreKeys(selectedKeys);
  if (keys.length === 0) return rows.length;
  const set = new Set(keys);
  let count = 0;
  for (const filmKeys of rows) {
    if (filmMatchesAllMoviesGenres(filmKeys, set)) count += 1;
  }
  return count;
}

/**
 * @param {unknown} ui
 */
export function normalizeAllMoviesUi(ui) {
  const availability =
    ui?.availability === 'this-week' || ui?.availability === 'later'
      ? ui.availability
      : DEFAULT_ALL_MOVIES_UI.availability;
  const sort = ui?.sort === 'az' ? 'az' : DEFAULT_ALL_MOVIES_UI.sort;
  const query =
    typeof ui?.query === 'string' ? normalizeSearchQuery(ui.query) : '';
  const genreKeys = normalizeAllMoviesGenreKeys(ui?.genreKeys);
  return { query, availability, sort, genreKeys };
}

/**
 * @param {object | null | undefined} homeData
 * @returns {object[]}
 */
function listFilms(homeData) {
  const rows = homeData?.films;
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {object | null | undefined} homeData
 * @returns {object[]}
 */
function listOpportunities(homeData) {
  const rows = homeData?.opportunities;
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Parent-family anchor used by screening variants (Early Access / Q&A).
 * @param {object | null | undefined} film
 */
export function allMoviesFamilyAnchor(film) {
  const key = normalizeShowtimeFilmKey(film?.filmKey);
  const parent = normalizeShowtimeFilmKey(film?.parentFilmKey);
  if (parent && parent !== key) return parent;
  return key;
}

/**
 * @param {string} a
 * @param {string} b
 * @param {Map<string, string>} parent
 */
function findRoot(a, parent) {
  if (!parent.has(a)) parent.set(a, a);
  const current = parent.get(a);
  if (current !== a) {
    const root = findRoot(current, parent);
    parent.set(a, root);
    return root;
  }
  return a;
}

/**
 * @param {string | null} a
 * @param {string | null} b
 * @param {Map<string, string>} parent
 */
function unionKeys(a, b, parent) {
  if (!a || !b) return;
  const ra = findRoot(a, parent);
  const rb = findRoot(b, parent);
  if (ra === rb) return;
  if (ra < rb) parent.set(rb, ra);
  else parent.set(ra, rb);
}

/**
 * Consolidate screening variants via parentFilmKey and exact canonical filmId.
 * Never groups by display title.
 *
 * @param {object[]} films
 * @returns {Map<string, object[]>} rootKey → member films
 */
export function groupAllMoviesFilms(films) {
  /** @type {Map<string, string>} */
  const parent = new Map();
  /** @type {Map<string, string[]>} */
  const keysByFilmId = new Map();
  /** @type {Map<string, object>} */
  const byKey = new Map();

  for (const film of Array.isArray(films) ? films : []) {
    const key = normalizeShowtimeFilmKey(film?.filmKey);
    if (!key) continue;
    byKey.set(key, film);
    findRoot(key, parent);
    unionKeys(key, allMoviesFamilyAnchor(film), parent);
    const filmId = asCanonicalFilmId(film.filmId);
    if (!filmId) continue;
    const existing = keysByFilmId.get(filmId);
    if (existing) existing.push(key);
    else keysByFilmId.set(filmId, [key]);
  }

  for (const keys of keysByFilmId.values()) {
    for (let i = 1; i < keys.length; i += 1) {
      unionKeys(keys[0], keys[i], parent);
    }
  }

  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const [key, film] of byKey) {
    const root = findRoot(key, parent);
    const members = groups.get(root);
    if (members) members.push(film);
    else groups.set(root, [film]);
  }
  return groups;
}

/**
 * Single pass over HomeData opportunities. Do not call this per film.
 *
 * @param {object | null | undefined} homeData
 * @param {Date} now
 * @returns {Map<string, object[]>}
 */
export function indexActionableOpportunitiesByFilmKey(homeData, now) {
  /** @type {Map<string, object[]>} */
  const byKey = new Map();
  for (const opportunity of listOpportunities(homeData)) {
    if (!isActionableScreening(opportunity, now)) continue;
    const key = normalizeShowtimeFilmKey(opportunity.filmKey);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(opportunity);
    else byKey.set(key, [opportunity]);
  }
  return byKey;
}

/**
 * @param {string} localDate
 * @param {string} todayIso
 * @param {string} weekEndIso
 */
export function allMoviesWindowForDate(localDate, todayIso, weekEndIso) {
  if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return null;
  }
  if (localDate < todayIso) return null;
  if (localDate <= weekEndIso) return 'this-week';
  return 'later';
}

/**
 * @param {object[]} opportunities
 * @param {string} todayIso
 * @param {string} weekEndIso
 */
function resolveAvailabilityBucket(opportunities, todayIso, weekEndIso) {
  let hasThisWeek = false;
  let hasLater = false;
  for (const opportunity of opportunities) {
    const bucket = allMoviesWindowForDate(
      opportunity.localDate,
      todayIso,
      weekEndIso,
    );
    if (bucket === 'this-week') hasThisWeek = true;
    else if (bucket === 'later') hasLater = true;
    if (hasThisWeek) break;
  }
  if (hasThisWeek) return 'this-week';
  if (hasLater) return 'later';
  return null;
}

/**
 * Prefer the parent/canonical row for presentation and Film Detail routing.
 * @param {object[]} members
 */
export function pickAllMoviesRepresentative(members) {
  const ranked = [...members].sort((a, b) => {
    const aParent = allMoviesFamilyAnchor(a) === normalizeShowtimeFilmKey(a.filmKey) ? 0 : 1;
    const bParent = allMoviesFamilyAnchor(b) === normalizeShowtimeFilmKey(b.filmKey) ? 0 : 1;
    if (aParent !== bParent) return aParent - bParent;
    const aId = asCanonicalFilmId(a.filmId) ? 0 : 1;
    const bId = asCanonicalFilmId(b.filmId) ? 0 : 1;
    if (aId !== bId) return aId - bId;
    return String(a.filmKey ?? '').localeCompare(String(b.filmKey ?? ''));
  });
  return ranked[0] ?? null;
}

/**
 * @param {object[]} members
 */
function groupCanonicalFilmId(members) {
  for (const film of members) {
    const id = asCanonicalFilmId(film.filmId);
    if (id) return id;
  }
  return null;
}

/**
 * Stable group identity: canonical filmId when known, else showtime parent key.
 * @param {string} rootKey
 * @param {object[]} members
 */
export function allMoviesGroupId(rootKey, members) {
  return groupCanonicalFilmId(members) ?? `showtime:${rootKey}`;
}

/**
 * Inventory of canonical films with ≥1 booked future Seattle screening.
 * Coming Soon artifacts are intentionally unused.
 *
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date }} [options]
 */
export function buildAllMoviesInventory(homeData, options = {}) {
  const now = options.now ?? new Date();
  const todayIso = pacificDateString(now);
  const weekEndIso = addIsoDays(todayIso, ALL_MOVIES_THIS_WEEK_SPAN_DAYS);
  const films = listFilms(homeData);
  const oppsByFilmKey = indexActionableOpportunitiesByFilmKey(homeData, now);
  const groups = groupAllMoviesFilms(films);

  /** @type {object[]} */
  const items = [];
  for (const [rootKey, members] of groups) {
    /** @type {object[]} */
    const opportunities = [];
    for (const film of members) {
      const key = normalizeShowtimeFilmKey(film.filmKey);
      const rows = key ? oppsByFilmKey.get(key) : null;
      if (rows) opportunities.push(...rows);
    }
    if (opportunities.length === 0) continue;

    opportunities.sort(compareScreeningsByStart);
    const availability = resolveAvailabilityBucket(
      opportunities,
      todayIso,
      weekEndIso,
    );
    if (!availability) continue;

    const representative = pickAllMoviesRepresentative(members);
    if (!representative) continue;

    const nextOpportunity = opportunities[0];
    const theaterIds = new Set(
      opportunities
        .map((row) => asText(row.theaterId))
        .filter(Boolean),
    );
    const filmId = groupCanonicalFilmId(members);
    items.push({
      groupId: allMoviesGroupId(rootKey, members),
      rootKey,
      filmKey: normalizeShowtimeFilmKey(representative.filmKey),
      filmId,
      memberFilmKeys: members
        .map((film) => normalizeShowtimeFilmKey(film.filmKey))
        .filter(Boolean)
        .sort(),
      representative,
      members,
      availability,
      nextOpportunity,
      nextSortable: opportunitySortableKey(nextOpportunity) ?? '',
      showtimeCount: opportunities.length,
      theaterCount: theaterIds.size,
      farthestDate: opportunities[opportunities.length - 1]?.localDate ?? null,
    });
  }

  return {
    todayIso,
    weekEndIso,
    now,
    items,
    thisWeekCount: items.filter((item) => item.availability === 'this-week').length,
    laterCount: items.filter((item) => item.availability === 'later').length,
  };
}

/**
 * @param {string | null | undefined} isoDate
 * @param {string} todayIso
 */
export function formatAllMoviesDateLabel(isoDate, todayIso, localTime) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const tomorrowIso = addIsoDays(todayIso, 1);
  const weekEndIso = addIsoDays(todayIso, ALL_MOVIES_THIS_WEEK_SPAN_DAYS);
  if (isoDate === todayIso) {
    const mins = parseLocalTimeMinutes(localTime);
    return mins != null && mins >= EVENING_START_MINUTES ? 'Tonight' : 'Today';
  }
  if (isoDate === tomorrowIso) return 'Tomorrow';

  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (isoDate <= weekEndIso) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(date);
  const todayYear = Number(todayIso.slice(0, 4));
  return year !== todayYear ? `${monthDay}, ${year}` : monthDay;
}

/**
 * Honest next-showtime copy. Far-future rows always include a date.
 *
 * @param {object | null | undefined} opportunity
 * @param {{ todayIso: string, timeFormatId?: string }} options
 */
export function formatAllMoviesNextWhen(opportunity, options) {
  if (!opportunity) return null;
  const todayIso = options.todayIso;
  const timeFormatId = options.timeFormatId ?? '12h';
  const dateLabel = formatAllMoviesDateLabel(
    opportunity.localDate,
    todayIso,
    opportunity.localTime,
  );
  const timeLabel =
    formatDisplayClock(opportunity.localTime, timeFormatId) ||
    asText(opportunity.timeDisplay) ||
    asText(opportunity.localTime);
  const theater = asText(opportunity.theaterName);
  const parts = [dateLabel, timeLabel, theater].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * @param {object} row
 * @param {string} query
 */
function matchesAllMoviesQuery(row, query) {
  const q = normalizeSearchQuery(query).toLowerCase();
  if (!q) return true;
  const fields = [
    row.title,
    row.sourceTitle,
    row.parentTitle,
    ...(Array.isArray(row.searchAliases) ? row.searchAliases : []),
  ];
  return fields.some((value) => String(value ?? '').toLowerCase().includes(q));
}

/**
 * @param {object} a
 * @param {object} b
 */
function compareAllMoviesAz(a, b) {
  const ta = String(a.title ?? '').toLocaleLowerCase('en');
  const tb = String(b.title ?? '').toLocaleLowerCase('en');
  if (ta !== tb) return ta.localeCompare(tb, 'en');
  return String(a.groupId).localeCompare(String(b.groupId));
}

/**
 * @param {object} a
 * @param {object} b
 */
function compareAllMoviesSoonest(a, b) {
  const ka = a.nextSortable ?? '';
  const kb = b.nextSortable ?? '';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return compareAllMoviesAz(a, b);
}

/**
 * @param {object} item
 * @param {object} resolved
 * @param {{ todayIso: string, timeFormatId?: string }} options
 */
function toAllMoviesRow(item, resolved, options) {
  const enriched = resolved.enriched;
  const title = enriched.displayTitle ?? item.representative.title ?? 'Untitled';
  const year =
    enriched.canonicalYear != null
      ? String(enriched.canonicalYear)
      : item.representative.releaseYear != null
        ? String(item.representative.releaseYear)
        : null;
  const runtime = formatRuntimeLabel(enriched.runtimeMin);
  const genres = extractAllMoviesGenres(
    options.enrichmentIndex,
    resolved.filmId ?? item.filmId,
  );
  /** @type {string[]} */
  const genreKeys = [];
  /** @type {Set<string>} */
  const seenGenreKeys = new Set();
  for (const label of genres) {
    const key = allMoviesGenreKey(label);
    if (!key || seenGenreKeys.has(key)) continue;
    seenGenreKeys.add(key);
    genreKeys.push(key);
  }
  const genre = genres[0] ?? null;
  const metaLine = [year, runtime, genre].filter(Boolean).join(' · ') || null;
  const nextWhenLabel = formatAllMoviesNextWhen(item.nextOpportunity, options);
  let aggregateLabel = null;
  if (item.theaterCount > 1) {
    aggregateLabel = `Playing at ${item.theaterCount} theaters`;
  } else if (item.showtimeCount > 1) {
    aggregateLabel = `${item.showtimeCount} showtimes`;
  }

  return {
    groupId: item.groupId,
    filmKey: item.filmKey,
    filmId: resolved.filmId ?? item.filmId,
    opportunityKey: item.nextOpportunity?.opportunityKey ?? null,
    memberFilmKeys: item.memberFilmKeys,
    availability: item.availability,
    title,
    sourceTitle: enriched.sourceTitle ?? item.representative.sourceTitle ?? null,
    parentTitle: item.representative.parentDisplayTitle ?? null,
    posterUrl: enriched.posterUrl,
    posterSource: enriched.posterSource,
    year: enriched.canonicalYear ?? item.representative.releaseYear ?? null,
    runtimeMin: enriched.runtimeMin ?? null,
    genre,
    genres,
    genreKeys,
    metaLine,
    searchAliases: [
      ...(Array.isArray(item.representative.identityAliases)
        ? item.representative.identityAliases
        : []),
      ...(Array.isArray(item.representative.aliasKeys)
        ? item.representative.aliasKeys
        : []),
      item.representative.title,
      item.representative.sourceTitle,
      item.representative.parentDisplayTitle,
      item.representative.canonicalTitle,
    ].filter(Boolean),
    nextWhenLabel,
    aggregateLabel,
    nextSortable: item.nextSortable,
    showtimeCount: item.showtimeCount,
    theaterCount: item.theaterCount,
    farthestDate: item.farthestDate,
  };
}

/**
 * @param {object | null | undefined} homeData
 * @param {{
 *   loadStatus?: string,
 *   query?: string,
 *   availability?: string,
 *   sort?: string,
 *   genreKeys?: string[],
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   now?: Date,
 *   storage?: Storage | null,
 *   visibilityPreferences?: { hideNotInterested?: boolean, hideSeen?: boolean } | null,
 * }} [options]
 */
export function composeAllMoviesPresentation(homeData, options = {}) {
  const loadStatus = options.loadStatus ?? (homeData ? 'ready' : 'loading');
  const ui = normalizeAllMoviesUi(options);
  const timeFormatId = options.timeFormatId ?? '12h';
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const visibilityOptions = {
    storage: options.storage ?? null,
    preferences: options.visibilityPreferences ?? null,
    context: 'all-movies',
    now: options.now,
  };

  if (loadStatus === 'loading' && !homeData) {
    return {
      state: 'loading',
      pageTitle: ALL_MOVIES_PAGE_TITLE,
      pageTagline: ALL_MOVIES_PAGE_TAGLINE,
      countLabel: null,
      emptyMessage: 'Loading Seattle showtimes…',
      emptyAction: null,
      query: ui.query,
      availability: ui.availability,
      sort: ui.sort,
      genreKeys: ui.genreKeys,
      genreOptions: [],
      genreInventory: [],
      facetGenreKeys: [],
      facetCount: 0,
      matchedCount: 0,
      matchedThisWeekCount: 0,
      matchedLaterCount: 0,
      totalCount: 0,
      visibleCount: 0,
      thisWeekCount: 0,
      laterCount: 0,
      sections: [],
      films: [],
    };
  }

  if (loadStatus === 'unavailable' || !homeData) {
    return {
      state: 'unavailable',
      pageTitle: ALL_MOVIES_PAGE_TITLE,
      pageTagline: ALL_MOVIES_PAGE_TAGLINE,
      countLabel: null,
      emptyMessage: 'Showtimes aren’t available right now.',
      emptyAction: null,
      query: ui.query,
      availability: ui.availability,
      sort: ui.sort,
      genreKeys: ui.genreKeys,
      genreOptions: [],
      genreInventory: [],
      facetGenreKeys: [],
      facetCount: 0,
      matchedCount: 0,
      matchedThisWeekCount: 0,
      matchedLaterCount: 0,
      totalCount: 0,
      visibleCount: 0,
      thisWeekCount: 0,
      laterCount: 0,
      sections: [],
      films: [],
    };
  }

  const inventory = buildAllMoviesInventory(homeData, { now: options.now });
  const rawRows = inventory.items.map((item) => {
    const resolved = resolveCanonicalFilmPresentation({
      filmKey: item.filmKey,
      filmId: item.filmId,
      homeData,
      enrichmentIndex,
      fallbackRecord: item.representative,
      context: 'collection',
    });
    return toAllMoviesRow(item, resolved, {
      todayIso: inventory.todayIso,
      timeFormatId,
      enrichmentIndex,
    });
  });

  const rows = filterVisibleFilms(rawRows, visibilityOptions);

  const compared = ui.sort === 'az' ? compareAllMoviesAz : compareAllMoviesSoonest;
  const searched = ui.query
    ? rows.filter((row) => matchesAllMoviesQuery(row, ui.query))
    : rows;
  const facetRows =
    ui.availability === 'all'
      ? searched
      : searched.filter((row) => row.availability === ui.availability);
  const genreInventory = buildAllMoviesGenreOptions(rows);
  const genreOptions = buildAllMoviesGenreOptions(facetRows);
  const selectedGenreSet = new Set(ui.genreKeys);
  const matched = ui.genreKeys.length
    ? searched.filter((row) =>
        filmMatchesAllMoviesGenres(row.genreKeys, selectedGenreSet),
      )
    : searched;

  const matchedThisWeek = matched.filter((row) => row.availability === 'this-week');
  const matchedLater = matched.filter((row) => row.availability === 'later');
  const filtered =
    ui.availability === 'all'
      ? matched
      : matched.filter((row) => row.availability === ui.availability);
  const ordered = [...filtered];
  ordered.sort(compared);

  const thisWeek = ordered.filter((row) => row.availability === 'this-week');
  const later = ordered.filter((row) => row.availability === 'later');

  /** @type {{ id: string, label: string, films: object[] }[]} */
  const sections = [];
  if (ui.availability !== 'later' && thisWeek.length > 0) {
    sections.push({
      id: 'this-week',
      label: `This Week · ${thisWeek.length}`,
      films: thisWeek,
    });
  }
  if (ui.availability !== 'this-week' && later.length > 0) {
    sections.push({
      id: 'later',
      label: `Later · ${later.length}`,
      films: later,
    });
  }

  const totalCount = rows.length;
  const visibleCount = filtered.length;
  const hasRestrictingFilter =
    Boolean(ui.query) || ui.availability !== 'all' || ui.genreKeys.length > 0;
  const countLabel = hasRestrictingFilter
    ? `${visibleCount} of ${totalCount} ${totalCount === 1 ? 'movie' : 'movies'}`
    : `${totalCount} ${totalCount === 1 ? 'movie' : 'movies'}`;

  let state = 'ready';
  let emptyMessage = null;
  let emptyAction = null;
  if (totalCount === 0) {
    state = 'empty';
    emptyMessage = 'No upcoming Seattle showtimes are available.';
  } else if (ui.query && searched.length === 0) {
    state = 'search-empty';
    emptyMessage = `No movies match ‘${ui.query}’.`;
    emptyAction = { id: 'clear-search', label: 'Clear search' };
  } else if (ui.genreKeys.length > 0 && matched.length === 0) {
    state = 'genre-empty';
    emptyMessage = 'No movies match these genres.';
    emptyAction = { id: 'clear-genres', label: 'Clear genres' };
  } else if (visibleCount === 0 && ui.availability === 'this-week') {
    state = 'filter-empty';
    emptyMessage =
      'Nothing is booked in the next 7 days. Later showtimes are still listed under Later.';
    emptyAction = { id: 'show-later', label: 'Show Later' };
  } else if (visibleCount === 0 && ui.availability === 'later') {
    state = 'filter-empty';
    emptyMessage = 'Every booked film has a showtime this week.';
    emptyAction = { id: 'show-all', label: 'Show All' };
  }

  return {
    state,
    pageTitle: ALL_MOVIES_PAGE_TITLE,
    pageTagline: ALL_MOVIES_PAGE_TAGLINE,
    countLabel: totalCount > 0 ? countLabel : null,
    emptyMessage,
    emptyAction,
    query: ui.query,
    availability: ui.availability,
    sort: ui.sort,
    genreKeys: ui.genreKeys,
    genreOptions,
    genreInventory,
    facetGenreKeys: facetRows.map((row) => row.genreKeys),
    facetCount: facetRows.length,
    matchedCount: matched.length,
    matchedThisWeekCount: matchedThisWeek.length,
    matchedLaterCount: matchedLater.length,
    totalCount,
    visibleCount,
    thisWeekCount: inventory.thisWeekCount,
    laterCount: inventory.laterCount,
    sections,
    films: ordered,
  };
}

/**
 * Canonical IDs for the currently rendered All Movies rows, capped by the
 * shared hydration architecture (never hydrate 200+ IDs just because the
 * page exists).
 *
 * @param {object | null | undefined} presentation
 * @returns {string[]}
 */
export function collectAllMoviesCanonicalFilmIds(presentation) {
  /** @type {string[]} */
  const ids = [];
  for (const section of presentation?.sections ?? []) {
    for (const row of section.films ?? []) {
      if (row.filmId) ids.push(row.filmId);
    }
  }
  return uniqueCanonicalFilmIds(ids, MAX_SURFACE_HYDRATION_IDS);
}
