/**
 * One-shot reconciliation of Saved / Seen / Not Interested against live HomeData
 * film refs (T-FILMID-03). Deterministic key → filmId upgrade only; no title match.
 */

import { filmRefFromHomeFilm } from '../save/filmRefFromFilm.js';
import {
  getSavedFilms,
  reconcileSavedFilmsStore,
} from './savedFilmsStore.js';
import {
  getSeenFilms,
  reconcileSeenFilmsStore,
} from './seenFilmsStore.js';
import {
  getNotInterestedFilms,
  reconcileNotInterestedFilmsStore,
} from './notInterestedFilmsStore.js';

/**
 * @param {object | null | undefined} homeData
 * @returns {import('./savedFilmsStore.js').SavedFilmRefInput[]}
 */
export function liveFilmRefsFromHomeData(homeData) {
  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  /** @type {import('./savedFilmsStore.js').SavedFilmRefInput[]} */
  const refs = [];
  for (const film of films) {
    const ref = filmRefFromHomeFilm(film);
    if (ref) refs.push(ref);
  }
  return refs;
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} homeData
 */
export function reconcileUserFilmStores(storage, homeData) {
  const liveRefs = liveFilmRefsFromHomeData(homeData);
  const saved = reconcileSavedFilmsStore(storage, liveRefs);
  const seen = reconcileSeenFilmsStore(storage, liveRefs);
  const notInterested = reconcileNotInterestedFilmsStore(storage, liveRefs);
  const upgraded =
    (saved.upgraded ?? 0) + (seen.upgraded ?? 0) + (notInterested.upgraded ?? 0);
  const changed = Boolean(saved.changed || seen.changed || notInterested.changed);
  if (changed || upgraded > 0) {
    console.info('[v2 film stores] reconcile', {
      liveRefs: liveRefs.length,
      upgraded,
      savedChanged: Boolean(saved.changed),
      seenChanged: Boolean(seen.changed),
      notInterestedChanged: Boolean(notInterested.changed),
    });
  }
  return {
    saved,
    seen,
    notInterested,
    upgraded,
    changed,
    liveRefCount: liveRefs.length,
  };
}

/**
 * Developer audit counts (opaque — no titles).
 * @param {Storage | null | undefined} storage
 */
export function auditUserFilmStores(storage) {
  return {
    saved: summarize(getSavedFilms(storage)),
    seen: summarize(getSeenFilms(storage)),
    notInterested: summarize(getNotInterestedFilms(storage)),
  };
}

/**
 * @param {Array<{ filmRef?: { filmId?: string | null } }>} items
 */
function summarize(items) {
  let canonical = 0;
  let fallback = 0;
  for (const item of items) {
    if (item?.filmRef?.filmId) canonical += 1;
    else fallback += 1;
  }
  return { total: items.length, canonical, fallback };
}
