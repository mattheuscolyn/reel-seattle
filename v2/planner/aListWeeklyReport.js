/**
 * Experimental AMC A-List weekly triage. No inferred end dates, credit usage,
 * or A-List eligibility claims: these require separate verified data.
 *
 * A credit week begins Friday 06:00 in America/Los_Angeles, regardless of DST.
 * All dates/times on opportunities are Seattle wall-clock timestamps.
 */
import { pacificDateString, addIsoDays } from '../explore/exploreCatalog.js';
import {
  opportunityDedupeKey,
  opportunitySortableKey,
  pacificSortableDateTime,
} from '../showtimes/showtimeEligibility.js';
import {
  filmsByKeyFromHomeData,
  isQualifyingFutureOpportunity,
} from '../showtimes/qualifyingShowtimes.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import { getSavedFilms, savedFilmRefsEqual } from '../stores/savedFilmsStore.js';
import { getSeenFilms } from '../stores/seenFilmsStore.js';
import { getNotInterestedFilms } from '../stores/notInterestedFilmsStore.js';

export const A_LIST_WEEKLY_ALLOWANCE = 4;
export const A_LIST_USAGE_STORAGE_PREFIX = 'reel-seattle.v2.aListUsed.';

function offsetIso(iso, days) {
  return addIsoDays(iso, days);
}

export function resolveAListCreditWeek(now = new Date(), weekOffset = 0) {
  const today = pacificDateString(now);
  const date = new Date(today + 'T12:00:00Z');
  const sinceFriday = (date.getUTCDay() + 2) % 7;
  let startDate = offsetIso(today, -sinceFriday);
  const nowKey = pacificSortableDateTime(now);
  if (nowKey < startDate + 'T06:00') {
    startDate = offsetIso(startDate, -7);
  }
  // Preview only the current cycle or its immediate successor. A future
  // cycle is bounded by its own Friday 06:00 start, never by today's clock.
  if (weekOffset === 1) startDate = offsetIso(startDate, 7);
  const endDate = offsetIso(startDate, 7);
  return {
    startDate,
    endDate,
    startKey: startDate + 'T06:00',
    endKey: endDate + 'T06:00',
    nowKey,
    afterNextKey: offsetIso(endDate, 7) + 'T06:00',
  };
}

export function clampAListUsed(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= A_LIST_WEEKLY_ALLOWANCE
    ? n : 0;
}

export function readAListUsed(storage, weekStart) {
  try {
    const raw = storage?.getItem(A_LIST_USAGE_STORAGE_PREFIX + weekStart);
    return raw === null || raw === undefined ? 0 : clampAListUsed(raw);
  } catch {
    return 0;
  }
}

export function writeAListUsed(storage, weekStart, used) {
  const normalized = clampAListUsed(used);
  try {
    storage?.setItem(A_LIST_USAGE_STORAGE_PREFIX + weekStart, String(normalized));
    return true;
  } catch {
    return false;
  }
}

function amcOpportunity(opp) {
  return String(opp?.source ?? '').toLowerCase() === 'amc' ||
    /^amc(?:-|$)/i.test(String(opp?.theaterId ?? ''));
}

function matchesPreference(refs, items) {
  return refs.some((ref) =>
    items.some((item) => savedFilmRefsEqual(ref, item.filmRef)));
}

function sortByScarcity(a, b) {
  // Both lack a *currently confirmed* subsequent-week listing. These are
  // weak scheduling indicators, NOT estimated probabilities of closing.
  return a.theaterCount - b.theaterCount ||
    a.thisWeekShowtimes - b.thisWeekShowtimes ||
    a.lastThisWeek.localeCompare(b.lastThisWeek) ||
    a.title.localeCompare(b.title);
}

/**
 * @param {{
 *   homeData?: object | null,
 *   storage?: Storage | null,
 *   now?: Date,
 *   creditsUsed?: number,
 *   priorityIds?: string[],
 *   weekOffset?: 0 | 1,
 * }} options
 */
export function buildAListWeeklyReport({
  homeData = null,
  storage = null,
  now = new Date(),
  creditsUsed = 0,
  priorityIds = [],
  weekOffset = 0,
} = {}) {
  const selectedOffset = weekOffset === 1 ? 1 : 0;
  const week = resolveAListCreditWeek(now, selectedOffset);
  const used = clampAListUsed(creditsUsed);
  const creditsRemaining = A_LIST_WEEKLY_ALLOWANCE - used;
  const filmsByKey = filmsByKeyFromHomeData(homeData);
  const groups = new Map();
  const priority = new Set(Array.isArray(priorityIds) ? priorityIds : []);
  const saved = getSavedFilms(storage);
  const seen = getSeenFilms(storage);
  const rejected = getNotInterestedFilms(storage);

  for (const opp of Array.isArray(homeData?.opportunities) ? homeData.opportunities : []) {
    if (!amcOpportunity(opp)) continue;
    if (!isQualifyingFutureOpportunity(opp, { filmsByKey, now })) continue;
    const key = opportunitySortableKey(opp);
    if (!key || key >= week.afterNextKey) continue;
    const film = filmsByKey.get(opp.filmKey);
    if (!film?.filmKey) continue;

    // Canonical identity first, then parent film key, never title alone.
    const identity = /^tmdb:[1-9]\d*$/.test(String(film.filmId ?? ''))
      ? film.filmId
      : film.parentFilmKey || film.filmKey;
    let group = groups.get(identity);
    if (!group) {
      group = {
        identity,
        filmKey: film.filmKey,
        filmId: film.filmId ?? null,
        title: film.parentDisplayTitle || film.title || opp.title || 'Untitled',
        posterUrl: film.posterUrl ?? null,
        refs: [],
        thisWeek: [],
        nextWeek: [],
        dedupe: new Set(),
      };
      groups.set(identity, group);
    }
    const ref = filmRefFromHomeFilm(film);
    if (ref) group.refs.push(ref);
    const dedupe = opportunityDedupeKey(opp);
    if (group.dedupe.has(dedupe)) continue;
    group.dedupe.add(dedupe);
    if (key >= (selectedOffset ? week.startKey : week.nowKey) && key < week.endKey) {
      group.thisWeek.push(opp);
    } else if (key >= week.endKey && key < week.afterNextKey) {
      group.nextWeek.push(opp);
    }
  }

  const rows = [];
  for (const group of groups.values()) {
    if (!group.thisWeek.length) continue;
    if (matchesPreference(group.refs, seen) ||
        matchesPreference(group.refs, rejected)) continue;
    const isSaved = matchesPreference(group.refs, saved);
    const mustSee = priority.has(group.identity);
    const sorted = group.thisWeek.sort((a, b) =>
      opportunitySortableKey(a).localeCompare(opportunitySortableKey(b)));
    const sortedNext = group.nextWeek.sort((a, b) =>
      opportunitySortableKey(a).localeCompare(opportunitySortableKey(b)));
    const theaters = [...new Set(sorted.map((opp) => opp.theaterId))];
    const nextConfirmed = sortedNext.length > 0;
    rows.push({
      identity: group.identity,
      filmKey: group.filmKey,
      filmId: group.filmId,
      title: group.title,
      posterUrl: group.posterUrl,
      saved: isSaved,
      mustSee,
      thisWeekShowtimes: sorted.length,
      nextWeekShowtimes: sortedNext.length,
      theaterCount: theaters.length,
      firstThisWeek: opportunitySortableKey(sorted[0]),
      lastThisWeek: opportunitySortableKey(sorted[sorted.length - 1]),
      nextWeekFirst: sortedNext[0] ? opportunitySortableKey(sortedNext[0]) : null,
      nextConfirmed,
      reason: nextConfirmed
        ? 'Also listed in the following credit week'
        : sorted.length <= 2
          ? 'Few remaining AMC showtimes listed'
          : 'No later AMC showtimes posted yet',
    });
  }
  // The user's explicit interest is the primary signal. When an unsaved film
  // is flagged must-see, treat it as a candidate. No speculative end dates.
  const candidates = rows.filter((r) => r.saved || r.mustSee);
  const atRisk = candidates.filter((r) => !r.nextConfirmed).sort((a, b) =>
    Number(b.mustSee) - Number(a.mustSee) || sortByScarcity(a, b));
  const confirmedNext = candidates.filter((r) => r.nextConfirmed).sort((a, b) =>
    Number(b.mustSee) - Number(a.mustSee) || sortByScarcity(a, b));
  const prioritize = atRisk.slice(0, creditsRemaining);
  const remainingToChoose = creditsRemaining - prioritize.length;
  const canWait = confirmedNext;
  const otherSaved = atRisk.slice(creditsRemaining);
  const discover = rows.filter((r) => !r.saved && !r.mustSee)
    .sort(sortByScarcity);

  return {
    week,
    weekOffset: selectedOffset,
    creditsUsed: used,
    creditsRemaining,
    remainingToChoose,
    prioritize,
    canWait,
    otherSaved,
    discover,
    eligibleAMCCount: rows.length,
    hasData: Boolean(homeData && Array.isArray(homeData.opportunities)),
  };
}
