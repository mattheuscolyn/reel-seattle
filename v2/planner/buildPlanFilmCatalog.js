/**
 * Live Build a Plan film-manage catalog (T-V2-LAUNCH-PLANNER-01).
 * Candidates come from HomeData films with eligible showtimes — not Saved-only.
 */

import {
  formatCompactDateLabel,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import {
  opportunitySortableKey,
  pacificSortableDateTime,
} from '../showtimes/showtimeEligibility.js';
import { isFilmSaved } from '../stores/savedFilmsStore.js';
import { isFilmNotInterested } from '../stores/notInterestedFilmsStore.js';
import { isFilmSeen } from '../stores/seenFilmsStore.js';
import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import { MUST_INCLUDE_MAX, WOULD_LOVE_MAX } from './buildPlanFilmManageConfig.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';

/**
 * Opportunity is eligible for the Manage catalog on a plan date:
 * same calendar day, resolvable film, parseable time, not already started if today.
 *
 * @param {object} opportunity
 * @param {{
 *   dateIso: string,
 *   filmsByKey: Map<string, object>,
 *   now?: Date | (() => Date),
 * }} options
 */
export function isEligiblePlannerCatalogOpportunity(opportunity, options) {
  if (!opportunity || typeof opportunity !== 'object') return false;
  const filmKey =
    typeof opportunity.filmKey === 'string' ? opportunity.filmKey.trim() : '';
  if (!filmKey || !options.filmsByKey.has(filmKey)) return false;

  const localDate = opportunity.localDate;
  if (localDate !== options.dateIso) return false;
  if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return false;
  }

  const sortable = opportunitySortableKey(opportunity);
  if (!sortable) return false;

  const now = options.now ?? new Date();
  const nowFn = typeof now === 'function' ? now : () => now;
  const today = pacificDateString(nowFn());
  if (localDate < today) return false;
  if (localDate === today && sortable < pacificSortableDateTime(nowFn)) {
    return false;
  }
  return true;
}

/**
 * @param {object | null | undefined} homeData
 * @param {{
 *   dateIso?: string | null,
 *   now?: Date | (() => Date),
 *   enrichmentIndex?: object | null,
 * }} [options]
 * @returns {object[]}
 */
export function listPlannerEligibleFilms(homeData, options = {}) {
  const now = options.now ?? new Date();
  const nowFn = typeof now === 'function' ? now : () => now;
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const dateIso =
    typeof options.dateIso === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.dateIso)
      ? options.dateIso
      : pacificDateString(nowFn());

  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const filmsByKey = new Map(films.map((f) => [f.filmKey, f]));

  /** @type {Map<string, object>} */
  const byFilm = new Map();

  for (const opp of opportunities) {
    if (
      !isEligiblePlannerCatalogOpportunity(opp, {
        dateIso,
        filmsByKey,
        now: nowFn,
      })
    ) {
      continue;
    }

    const film = filmsByKey.get(opp.filmKey);
    if (!film) continue;

    let entry = byFilm.get(opp.filmKey);
    if (!entry) {
      const enriched = enrichHomeFilm(film, enrichmentIndex, 'planner', homeData);
      entry = {
        filmKey: film.filmKey,
        filmId: enriched.filmId ?? film.filmId ?? null,
        parentFilmKey: film.parentFilmKey ?? null,
        title: enriched.displayTitle ?? film.title,
        canonicalTitle:
          enriched.canonicalTitle ??
          film.canonicalTitle ??
          film.parentDisplayTitle ??
          film.title,
        releaseYear: enriched.canonicalYear ?? film.releaseYear ?? film.year ?? null,
        source: film.source ?? null,
        sourceFilmId: film.sourceFilmId ?? null,
        posterUrl: enriched.posterUrl,
        runtimeMin: enriched.runtimeMin,
        rating: enriched.usCertification ?? film.rating ?? film.mpaaRating ?? null,
        genres: enriched.genres?.length
          ? enriched.genres
          : Array.isArray(film.genres)
            ? film.genres
            : [],
        theaters: new Map(),
        formats: new Map(),
        earliestSortable: null,
        earliestLabel: null,
      };
      byFilm.set(opp.filmKey, entry);
    }

    const sortable = opportunitySortableKey(opp);
    if (
      sortable &&
      (entry.earliestSortable == null || sortable < entry.earliestSortable)
    ) {
      entry.earliestSortable = sortable;
      entry.earliestLabel = [
        opp.theaterName,
        formatCompactDateLabel(opp.localDate),
        opp.timeDisplay ?? opp.localTime,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (opp.theaterId) {
      entry.theaters.set(opp.theaterId, opp.theaterName ?? opp.theaterId);
    }
    for (const raw of opp.formatLabels ?? []) {
      const facing = formatUserFacingFormatLabel(raw);
      const key = String(facing ?? raw)
        .trim()
        .toLowerCase();
      if (key) entry.formats.set(key, facing ?? String(raw));
    }
  }

  return [...byFilm.values()]
    .map((entry) => ({
      id: entry.filmKey,
      filmKey: entry.filmKey,
      filmId: entry.filmId,
      parentFilmKey: entry.parentFilmKey,
      showtimeFilmKey: entry.filmKey,
      title: entry.title,
      canonicalTitle: entry.canonicalTitle,
      releaseYear: entry.releaseYear,
      source: entry.source,
      sourceFilmId: entry.sourceFilmId,
      imageUrl: entry.posterUrl ?? '',
      posterUrl: entry.posterUrl ?? null,
      runtimeMin: entry.runtimeMin,
      runtimeLabel: formatRuntimeLabel(entry.runtimeMin),
      ratingLabel: entry.rating,
      genres: entry.genres,
      detailLabel: entry.earliestLabel ?? 'Any theater',
      theaterLabel: entry.earliestLabel ?? 'Any theater',
      theaterIds: [...entry.theaters.keys()],
      theaterNames: [...entry.theaters.values()],
      formatKeys: [...entry.formats.keys()],
      formatLabels: [...entry.formats.values()],
      earliestSortable: entry.earliestSortable,
    }))
    .sort((a, b) => {
      if (a.earliestSortable !== b.earliestSortable) {
        return (a.earliestSortable ?? '') < (b.earliestSortable ?? '') ? -1 : 1;
      }
      return String(a.title).localeCompare(String(b.title));
    });
}

/**
 * @param {object[]} candidates
 * @param {{
 *   query?: string,
 *   savedOnly?: boolean,
 *   theaterIds?: string[],
 *   formatKeys?: string[],
 *   storage?: Storage | null,
 * }} filters
 */
export function filterPlannerFilmCandidates(candidates, filters = {}) {
  const q = String(filters.query ?? '')
    .trim()
    .toLowerCase();
  const theaterIds = Array.isArray(filters.theaterIds)
    ? filters.theaterIds.filter(Boolean)
    : [];
  const formatKeys = Array.isArray(filters.formatKeys)
    ? filters.formatKeys.map((k) => String(k).toLowerCase())
    : [];
  const theaterSet = theaterIds.length ? new Set(theaterIds) : null;
  const formatSet = formatKeys.length ? new Set(formatKeys) : null;

  let savedCheck = null;
  if (filters.savedOnly) {
    savedCheck = (film) =>
      isFilmSaved(filters.storage, {
        filmKey: film.filmKey ?? film.id,
        showtimeFilmKey: film.filmKey ?? film.id,
        filmId: film.filmId,
      });
  }

  return candidates.filter((film) => {
    if (q && !String(film.title ?? '').toLowerCase().includes(q)) return false;
    if (savedCheck && !savedCheck(film)) return false;
    if (theaterSet && !film.theaterIds?.some((id) => theaterSet.has(id))) {
      return false;
    }
    if (formatSet && !film.formatKeys?.some((k) => formatSet.has(k))) {
      return false;
    }
    return true;
  });
}

/**
 * Conflict resolution across Must / Would Love / Not Interested buckets.
 *
 * - Must Include → removes from Would Love + Not Interested
 * - Would Love → removes from Not Interested; does not override Must Include
 * - Not Interested → removes from Must Include + Would Love
 *
 * @param {object} form
 * @param {'mustInclude' | 'wouldLove' | 'notInterested'} bucket
 * @param {object} filmCard
 * @returns {{
 *   mustInclude: object[],
 *   wouldLove: object[],
 *   notInterested: object[],
 *   rejected: null | 'cap' | 'must',
 * }}
 */
export function applyFilmBucketSelection(form, bucket, filmCard) {
  const id = String(filmCard.id ?? filmCard.filmKey ?? '');
  const card = {
    id,
    filmKey: filmCard.filmKey ?? id,
    filmId: filmCard.filmId ?? null,
    parentFilmKey: filmCard.parentFilmKey ?? null,
    showtimeFilmKey: filmCard.showtimeFilmKey ?? filmCard.filmKey ?? id,
    title: filmCard.title,
    canonicalTitle: filmCard.canonicalTitle ?? filmCard.title ?? null,
    releaseYear: filmCard.releaseYear ?? null,
    identityAliases: Array.isArray(filmCard.identityAliases)
      ? filmCard.identityAliases
      : undefined,
    source: filmCard.source ?? null,
    sourceFilmId: filmCard.sourceFilmId ?? null,
    detailLabel: filmCard.detailLabel ?? filmCard.theaterLabel ?? 'Any theater',
    theaterLabel: filmCard.theaterLabel ?? filmCard.detailLabel ?? 'Any theater',
    imageUrl: filmCard.imageUrl ?? filmCard.posterUrl ?? '',
  };

  let mustInclude = [...(form?.mustInclude ?? [])];
  let wouldLove = [...(form?.wouldLove ?? [])];
  let notInterested = [...(form?.notInterested ?? [])];

  const sameCard = (f) =>
    (card.filmId && f.filmId && f.filmId === card.filmId) ||
    f.id === id ||
    f.filmKey === id ||
    f.filmKey === card.filmKey ||
    (card.parentFilmKey &&
      (f.filmKey === card.parentFilmKey || f.parentFilmKey === card.parentFilmKey));

  const drop = (list) => list.filter((f) => !sameCard(f));

  if (bucket === 'mustInclude') {
    wouldLove = drop(wouldLove);
    notInterested = drop(notInterested);
    if (!mustInclude.some((f) => sameCard(f))) {
      if (mustInclude.length >= MUST_INCLUDE_MAX) {
        return { mustInclude, wouldLove, notInterested, rejected: 'cap' };
      }
      mustInclude = [...mustInclude, card];
    }
  } else if (bucket === 'wouldLove') {
    if (mustInclude.some((f) => sameCard(f))) {
      return { mustInclude, wouldLove, notInterested, rejected: 'must' };
    }
    notInterested = drop(notInterested);
    if (!wouldLove.some((f) => sameCard(f))) {
      if (wouldLove.length >= WOULD_LOVE_MAX) {
        return { mustInclude, wouldLove, notInterested, rejected: 'cap' };
      }
      wouldLove = [...wouldLove, card];
    }
  } else if (bucket === 'notInterested') {
    mustInclude = drop(mustInclude);
    wouldLove = drop(wouldLove);
    if (!notInterested.some((f) => sameCard(f))) {
      notInterested = [...notInterested, card];
    }
  }

  return { mustInclude, wouldLove, notInterested, rejected: null };
}

/**
 * Theater / format filter options from a candidate list.
 * @param {object[]} candidates
 */
export function listPlannerCatalogFilterOptions(candidates) {
  /** @type {Map<string, { id: string, label: string }>} */
  const theaters = new Map();
  /** @type {Map<string, { key: string, label: string }>} */
  const formats = new Map();
  for (const film of candidates) {
    for (let i = 0; i < (film.theaterIds?.length ?? 0); i += 1) {
      const id = film.theaterIds[i];
      if (!id || theaters.has(id)) continue;
      theaters.set(id, {
        id,
        label: film.theaterNames?.[i] ?? id,
      });
    }
    for (let i = 0; i < (film.formatKeys?.length ?? 0); i += 1) {
      const key = film.formatKeys[i];
      if (!key || formats.has(key)) continue;
      formats.set(key, {
        key,
        label: film.formatLabels?.[i] ?? key,
      });
    }
  }
  return {
    theaters: [...theaters.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    formats: [...formats.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  };
}

/**
 * Annotate candidates with Saved / Seen / NI flags for display.
 * @param {object[]} candidates
 * @param {Storage | null} [storage]
 */
export function annotatePlannerFilmCandidates(candidates, storage = null) {
  return candidates.map((film) => {
    const ref = filmRefFromHomeFilm(film) ?? {
      filmKey: film.filmKey ?? film.id,
      showtimeFilmKey: film.filmKey ?? film.id,
      filmId: film.filmId,
    };
    return {
      ...film,
      isSaved: isFilmSaved(storage, ref),
      isNotInterested: isFilmNotInterested(storage, ref),
      isSeen: isFilmSeen(storage, ref),
    };
  });
}
