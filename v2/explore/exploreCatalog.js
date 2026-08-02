/**
 * Pure Explore catalog helpers — search, date windows, format filters.
 * Matches movie titles, theaters, and formats; person/cast/director search
 * is not supported by public artifacts.
 */

import {
  IMAX_FORMAT_TAGS,
  THIRTY_FIVE_MM_FORMAT_TAGS,
} from './exploreIds.js';
import { findNextOpportunityForFilm } from '../home/shelfData.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { resolveTheaterPresentation } from '../theaters/resolveTheaterPresentation.js';
import { SEARCH_EXPLORE_HONESTY_NOTE } from './searchCopy.js';

/**
 * Local calendar YYYY-MM-DD in America/Los_Angeles.
 * @param {Date} [now]
 */
export function pacificDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Add calendar days to a YYYY-MM-DD string (no timezone shift).
 * @param {string} isoDate
 * @param {number} days
 */
export function addIsoDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Weekday for a calendar YYYY-MM-DD (0=Sun … 6=Sat), timezone-independent.
 * @param {string} isoDate
 */
export function isoWeekday(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/**
 * Upcoming or current weekend: Friday–Sunday (Pacific calendar dates).
 * If today is Fri–Sun, uses the current weekend; otherwise the next Fri–Sun.
 * @param {string} [todayIso]
 * @returns {{ start: string, end: string }}
 */
export function resolveWeekendRange(todayIso = pacificDateString()) {
  const dow = isoWeekday(todayIso);
  let friday;
  if (dow === 5) friday = todayIso;
  else if (dow === 6) friday = addIsoDays(todayIso, -1);
  else if (dow === 0) friday = addIsoDays(todayIso, -2);
  else friday = addIsoDays(todayIso, 5 - dow);
  return { start: friday, end: addIsoDays(friday, 2) };
}

/**
 * Compact single-date label, e.g. "Tue, May 20".
 * @param {string} isoDate
 */
export function formatCompactDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Compact range label, e.g. "May 20 – May 26".
 * @param {string} startIso
 * @param {string} endIso
 */
export function formatCompactDateRange(startIso, endIso) {
  const fmt = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

/**
 * Resolve film rows for an ordered list of keys; skip missing/stale keys.
 * @param {object | null} homeData
 * @param {string[]} keys
 */
export function filmsForKeys(homeData, keys) {
  const byKey = new Map(listFilms(homeData).map((film) => [film.filmKey, film]));
  /** @type {ReturnType<typeof toFilmRow>[]} */
  const out = [];
  for (const key of keys ?? []) {
    const film = byKey.get(key);
    if (!film) continue;
    out.push(toFilmRow(homeData, film));
  }
  return out;
}

/**
 * @param {object | null} homeData
 * @returns {object[]}
 */
export function listFilms(homeData) {
  return Array.isArray(homeData?.films) ? homeData.films : [];
}

/**
 * @param {object | null} homeData
 * @returns {object[]}
 */
export function listOpportunities(homeData) {
  return Array.isArray(homeData?.opportunities) ? homeData.opportunities : [];
}

/**
 * @param {object | null} homeData
 * @returns {Record<string, object>}
 */
export function theatersById(homeData) {
  return homeData?.theatersById && typeof homeData.theatersById === 'object'
    ? homeData.theatersById
    : {};
}

/**
 * Normalize a search query for matching.
 * @param {string} query
 */
export function normalizeSearchQuery(query) {
  if (typeof query !== 'string') return '';
  return query.trim().replace(/\s+/g, ' ');
}

/**
 * Title/keyword search over film titles, theater names, and format labels.
 * Does NOT search people/cast/directors — unsupported by public artifacts.
 *
 * @param {object | null} homeData
 * @param {string} query
 */
export function searchExplore(homeData, query) {
  const q = normalizeSearchQuery(query).toLowerCase();
  if (!q) {
    return {
      query: '',
      films: [],
      theaters: [],
      formats: [],
      note: 'Enter a movie, theater, or format keyword to search.',
      personSearchSupported: false,
    };
  }

  const films = listFilms(homeData)
    .filter((film) => {
      const title = String(film.title ?? '').toLowerCase();
      const source = String(film.sourceTitle ?? '').toLowerCase();
      const parent = String(film.parentDisplayTitle ?? '').toLowerCase();
      return title.includes(q) || source.includes(q) || parent.includes(q);
    })
    .map((film) => ({
      filmKey: film.filmKey,
      title: film.title,
      posterUrl: film.posterUrl ?? null,
      metaLabel: film.runtimeMin ? `${film.runtimeMin} min` : null,
      nextOpportunityKey:
        findNextOpportunityForFilm(homeData, film.filmKey)?.opportunityKey ?? null,
    }));

  const theaters = Object.values(theatersById(homeData))
    .filter((theater) => {
      const name = String(theater.name ?? '').toLowerCase();
      const neighborhood = String(theater.neighborhood ?? '').toLowerCase();
      const city = String(theater.city ?? '').toLowerCase();
      return (
        name.includes(q) || neighborhood.includes(q) || city.includes(q)
      );
    })
    .map((theater) => ({
      id: theater.id,
      name: theater.name,
      metaLabel: [theater.neighborhood, theater.city].filter(Boolean).join(' · ') || null,
      opportunityCount: theater.opportunityCount ?? 0,
    }));

  const formats = inventoryFormats(homeData)
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
    }));

  return {
    query: normalizeSearchQuery(query),
    films,
    theaters,
    formats,
    note:
      films.length === 0 && theaters.length === 0 && formats.length === 0
        ? 'No movie, theater, or format matches in the current window.'
        : null,
    personSearchSupported: false,
  };
}

/**
 * Films with at least one opportunity on a given local date.
 * @param {object | null} homeData
 * @param {string} localDate
 */
export function filmsOnDate(homeData, localDate) {
  const keys = new Set(
    listOpportunities(homeData)
      .filter((opp) => opp.localDate === localDate)
      .map((opp) => opp.filmKey),
  );
  return listFilms(homeData)
    .filter((film) => keys.has(film.filmKey))
    .map((film) => toFilmRow(homeData, film));
}

/**
 * Films with opportunities from startDate through endDate inclusive.
 * @param {object | null} homeData
 * @param {string} startDate
 * @param {string} endDate
 */
export function filmsInDateRange(homeData, startDate, endDate) {
  const keys = new Set(
    listOpportunities(homeData)
      .filter(
        (opp) =>
          typeof opp.localDate === 'string' &&
          opp.localDate >= startDate &&
          opp.localDate <= endDate,
      )
      .map((opp) => opp.filmKey),
  );
  return listFilms(homeData)
    .filter((film) => keys.has(film.filmKey))
    .map((film) => toFilmRow(homeData, film));
}

/**
 * @param {object | null} homeData
 */
export function allPlayingFilms(homeData) {
  return listFilms(homeData)
    .filter((film) => (film.showtimeCount ?? 0) > 0)
    .map((film) => toFilmRow(homeData, film));
}

/**
 * @param {string[]} tags
 * @param {readonly string[]} matchers
 */
function hasMatchingFormat(tags, matchers) {
  if (!Array.isArray(tags)) return false;
  const set = new Set(tags.map((t) => String(t).toLowerCase()));
  return matchers.some((m) => set.has(m.toLowerCase()));
}

/**
 * @param {object | null} homeData
 * @param {readonly string[]} matchers
 */
export function filmsWithFormatTags(homeData, matchers) {
  const keys = new Set(
    listOpportunities(homeData)
      .filter((opp) => hasMatchingFormat(opp.formatLabels, matchers))
      .map((opp) => opp.filmKey),
  );
  return listFilms(homeData)
    .filter((film) => keys.has(film.filmKey))
    .map((film) => toFilmRow(homeData, film));
}

/**
 * Inventory of format labels present in current opportunities.
 * @param {object | null} homeData
 */
export function inventoryFormats(homeData) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const opp of listOpportunities(homeData)) {
    for (const raw of opp.formatLabels ?? []) {
      const key = String(raw).toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * @param {object | null} homeData
 * @param {object} film
 */
function toFilmRow(homeData, film) {
  const next = findNextOpportunityForFilm(homeData, film.filmKey);
  return {
    filmKey: film.filmKey,
    title: film.title,
    posterUrl: film.posterUrl ?? null,
    metaLabel: next
      ? [next.theaterName, next.timeDisplay].filter(Boolean).join(' · ')
      : null,
    nextOpportunityKey: next?.opportunityKey ?? null,
  };
}

/**
 * Build collection content for an Explore collection id.
 * @param {object | null} homeData
 * @param {string} collectionId
 * @param {{ query?: string, dismissedKeys?: string[], seenKeys?: string[] }} [options]
 */
export function buildExploreCollection(homeData, collectionId, options = {}) {
  const today = pacificDateString();
  const weekEnd = addIsoDays(today, 6);
  const weekend = resolveWeekendRange(today);

  switch (collectionId) {
    case 'all-movies':
      return {
        status: 'ready',
        kind: 'films',
        reason: null,
        films: allPlayingFilms(homeData),
        theaters: [],
        formats: [],
      };
    case 'today':
      return {
        status: 'ready',
        kind: 'films',
        reason: `Films with showtimes on ${today} (Pacific).`,
        films: filmsOnDate(homeData, today),
        theaters: [],
        formats: [],
      };
    case 'this-week':
      return {
        status: 'ready',
        kind: 'films',
        reason: `Films with showtimes ${today}–${weekEnd} (Pacific, rolling 7-day window — not a calendar week).`,
        films: filmsInDateRange(homeData, today, weekEnd),
        theaters: [],
        formats: [],
      };
    case 'weekend':
      return {
        status: 'ready',
        kind: 'films',
        reason: `Films with showtimes ${weekend.start}–${weekend.end} (Pacific Friday–Sunday).`,
        films: filmsInDateRange(homeData, weekend.start, weekend.end),
        theaters: [],
        formats: [],
      };
    case 'imax': {
      const films = filmsWithFormatTags(homeData, IMAX_FORMAT_TAGS);
      return {
        status: films.length > 0 ? 'ready' : 'unavailable',
        kind: 'films',
        reason:
          films.length > 0
            ? 'Matched IMAX / imax-at-amc format tags in current showtimes.'
            : 'No IMAX-tagged showtimes in the current window.',
        films,
        theaters: [],
        formats: [],
      };
    }
    case '35mm': {
      const films = filmsWithFormatTags(homeData, THIRTY_FIVE_MM_FORMAT_TAGS);
      return {
        status: films.length > 0 ? 'ready' : 'unavailable',
        kind: 'films',
        reason:
          films.length > 0
            ? 'Matched 35mm format tags in current showtimes.'
            : 'No 35mm format tags are present in the current public showtimes artifacts.',
        films,
        theaters: [],
        formats: [],
      };
    }
    case 'search-results': {
      const result = searchExplore(homeData, options.query ?? '');
      return {
        status: 'ready',
        kind: 'search',
        reason: result.personSearchSupported
          ? null
          : SEARCH_EXPLORE_HONESTY_NOTE,
        films: result.films,
        theaters: result.theaters,
        formats: result.formats ?? [],
        query: result.query,
        note: result.note,
      };
    }
    case 'theaters': {
      const theaters = Object.values(theatersById(homeData))
        .filter((t) => t.id)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((t) => {
          const card = resolveTheaterPresentation({
            theater: t,
            homeData,
            context: 'search',
          });
          return {
            id: card.id,
            name: card.name,
            metaLabel:
              [
                card.metaLabel,
                card.opportunityCount != null
                  ? `${card.opportunityCount} showtimes`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || null,
          };
        });
      return {
        status: theaters.length > 0 ? 'ready' : 'unavailable',
        kind: 'theaters',
        reason: null,
        films: [],
        theaters,
        formats: [],
      };
    }
    case 'formats': {
      const formats = inventoryFormats(homeData);
      return {
        status: formats.length > 0 ? 'ready' : 'unavailable',
        kind: 'formats',
        reason:
          formats.length > 0
            ? 'Formats observed on current showtimes (source tags). Not a complete venue capability catalog.'
            : 'No format tags in the current window.',
        films: [],
        theaters: [],
        formats,
      };
    }
    case 'collections':
      return {
        status: 'unavailable',
        kind: 'empty',
        reason:
          'Curated Collections are not available yet — no collections artifact in public data.',
        films: [],
        theaters: [],
        formats: [],
      };
    case 'coming-soon':
      return {
        status: 'unavailable',
        kind: 'empty',
        reason:
          'Coming Soon is not available yet — no approved upcoming-film classification in public data.',
        films: [],
        theaters: [],
        formats: [],
      };
    case 'special-events':
      return {
        status: 'unavailable',
        kind: 'empty',
        reason:
          'Special Events is not available yet — Q&A / early-access classifications are not stably modeled for Explore.',
        films: [],
        theaters: [],
        formats: [],
      };
    case 'suggested-starts':
      return {
        status: 'ready',
        kind: 'suggested-starts',
        reason:
          'Discovery shortcuts by date scope. This Week uses a rolling 7-day Pacific window; Weekend is Friday–Sunday.',
        films: [],
        theaters: [],
        formats: [],
      };
    case 'film-activity':
      return {
        status: 'ready',
        kind: 'film-activity',
        reason:
          'Device-local Seen and Not interested only — not synced to Profile. Not interested does not yet filter Home ranking.',
        films: [],
        theaters: [],
        formats: [],
        seenKeys: options.seenKeys ?? [],
        dismissedKeys: options.dismissedKeys ?? [],
      };
    case 'seen': {
      const films = filmsForKeys(homeData, options.seenKeys ?? []);
      return {
        status: 'ready',
        kind: 'seen',
        reason:
          films.length === 0
            ? 'No films marked Seen yet on this device.'
            : 'Device-local Seen list. Missing catalog titles are omitted.',
        films,
        theaters: [],
        formats: [],
      };
    }
    case 'hidden': {
      const films = filmsForKeys(homeData, options.dismissedKeys ?? []);
      return {
        status: 'ready',
        kind: 'hidden',
        reason:
          films.length === 0
            ? 'No films marked Not interested yet on this device.'
            : 'Device-local Not interested list (dismissed-film store). Missing catalog titles are omitted.',
        films,
        theaters: [],
        formats: [],
      };
    }
    case 'opening-this-week':
    case 'leaving-soon':
      return null; // handled by existing Home shelf builders
    default:
      return {
        status: 'unavailable',
        kind: 'empty',
        reason: 'Unknown Explore surface.',
        films: [],
        theaters: [],
        formats: [],
      };
  }
}
