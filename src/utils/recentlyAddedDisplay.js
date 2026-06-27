import { parseIsoDateLocal } from './dateUtils.js';
import { formatCountLabel } from './showtimesDisplay.js';
import { daysBackFromArtifact, parseRecentlyAddedEntries } from './recentlyAddedAdapter.js';

function pairKey(filmKey, theaterId) {
  return `${filmKey}\u0000${theaterId}`;
}

function isUsablePoster(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== 'none';
}

/**
 * Join artifact entries to the full current showtimes row set.
 * Ignores active search/date/theater filters; only drops entries with no row match.
 *
 * @param {unknown} artifact
 * @param {Array<Record<string, string>>} rows
 */
export function buildRecentlyAddedFilms(artifact, rows) {
  const entries = parseRecentlyAddedEntries(artifact);
  if (!entries.length || !Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const rowsByPair = new Map();
  for (const row of rows) {
    const filmKey = String(row.showtime_film_key || '').trim();
    const theaterId = String(row.theater_id || '').trim();
    if (!filmKey || !theaterId) continue;
    const key = pairKey(filmKey, theaterId);
    if (!rowsByPair.has(key)) rowsByPair.set(key, []);
    rowsByPair.get(key).push(row);
  }

  /** @type {Map<string, object>} */
  const filmsByKey = new Map();
  /** @type {Map<string, Set<string>>} */
  const seenPairs = new Map();

  for (const entry of entries) {
    const key = pairKey(entry.showtime_film_key, entry.theater_id);
    const matchedRows = rowsByPair.get(key);
    if (!matchedRows?.length) continue;

    const filmSeen = seenPairs.get(entry.showtime_film_key) || new Set();
    if (filmSeen.has(key)) continue;
    filmSeen.add(key);
    seenPairs.set(entry.showtime_film_key, filmSeen);

    let film = filmsByKey.get(entry.showtime_film_key);
    if (!film) {
      film = {
        showtime_film_key: entry.showtime_film_key,
        film_title: entry.film_title,
        first_announced_date: entry.first_announced_date,
        theaters: [],
        theaterIds: new Set(),
        showtimeCount: 0,
        poster: '',
        runtime: '',
      };
      filmsByKey.set(entry.showtime_film_key, film);
    }

    if (entry.first_announced_date > film.first_announced_date) {
      film.first_announced_date = entry.first_announced_date;
    }
    if (!film.theaterIds.has(entry.theater_id)) {
      film.theaterIds.add(entry.theater_id);
      film.theaters.push({ id: entry.theater_id, name: entry.theater_name });
    }
    film.showtimeCount += matchedRows.length;

    for (const row of matchedRows) {
      if (!isUsablePoster(film.poster) && isUsablePoster(row.posterDynamic)) {
        film.poster = row.posterDynamic.trim();
      }
      if (!film.runtime && row.Runtime) {
        film.runtime = row.Runtime;
      }
    }
  }

  const films = [...filmsByKey.values()].map(({ theaterIds, ...film }) => film);
  films.sort((a, b) => {
    const dateCmp = b.first_announced_date.localeCompare(a.first_announced_date);
    if (dateCmp !== 0) return dateCmp;
    return a.film_title.localeCompare(b.film_title, undefined, { sensitivity: 'base' });
  });

  for (const film of films) {
    film.theaters.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  return films;
}

/**
 * @param {number | null | undefined} daysBack
 */
export function formatRecentlyAddedSubtitle(daysBack) {
  const days =
    typeof daysBack === 'number' && Number.isFinite(daysBack) && daysBack > 0 ? daysBack : 7;
  return `Newly announced in the last ${days} days and currently showing.`;
}

/**
 * @param {string | null | undefined} isoDate
 * @param {string | string[] | undefined} locale
 */
export function formatFirstAnnouncedLabel(isoDate, locale = undefined) {
  const parsed = parseIsoDateLocal(isoDate);
  if (!parsed) return null;
  const shortDate = parsed.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return `Added ${shortDate}`;
}

/**
 * @param {Array<{ name: string }>} theaters
 */
export function formatTheaterSummary(theaters) {
  if (!Array.isArray(theaters) || theaters.length === 0) return null;
  if (theaters.length === 1) return theaters[0].name;
  const countLabel = formatCountLabel(theaters.length, 'theater', 'theaters');
  return countLabel;
}

/**
 * @param {{ showtimeCount?: number; theaters?: Array<{ name: string }> }} film
 */
export function formatRecentlyAddedFilmMeta(film) {
  const parts = [];
  const showtimeLabel = formatCountLabel(film.showtimeCount, 'showtime', 'showtimes');
  if (showtimeLabel) parts.push(showtimeLabel);

  const theaterSummary = formatTheaterSummary(film.theaters);
  if (theaterSummary) {
    if (film.theaters.length === 1) {
      parts.push(theaterSummary);
    } else if (showtimeLabel) {
      parts.push(theaterSummary);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * @param {number} count
 */
export function formatRecentlyAddedSectionCount(count) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? '1 film' : `${count} films`;
}

/**
 * @param {unknown} artifact
 * @param {Array<Record<string, string>>} rows
 */
export function buildRecentlyAddedSection(artifact, rows) {
  const films = buildRecentlyAddedFilms(artifact, rows);
  return {
    daysBack: daysBackFromArtifact(artifact),
    films,
    countLabel: formatRecentlyAddedSectionCount(films.length),
    subtitle: formatRecentlyAddedSubtitle(daysBackFromArtifact(artifact)),
  };
}
