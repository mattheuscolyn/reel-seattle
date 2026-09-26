/**
 * Smart Save → Planner handoff eligibility (internal feature name).
 *
 * Pure threshold rules over qualifying future performances for a just-saved film.
 * User-facing UI must not say "Smart Save".
 */

import { listQualifyingFutureOpportunitiesForFilm } from '../showtimes/qualifyingShowtimes.js';
import {
  buildHomeFilmIdentityIndex,
  resolveHomeFilmForPreferenceRef,
} from '../collections/personalCollectionModel.js';
import {
  buildPerformanceKeyForOpportunity,
  listPlannedPerformanceKeys,
} from '../planner/addSavedFilmShowtimeToPlanner.js';
import { formatSavedFilmNextShowtimeLine } from '../planner/plannerSavedFilmsUrgency.js';
import { normalizeSavedFilmRef } from '../stores/savedFilmsStore.js';

export const SMART_SAVE_HANDOFF_MODE = Object.freeze({
  none: 'none',
  directAdd: 'direct-add',
  chooseShowtime: 'choose-showtime',
});

/** Inclusive max count that still opens Choose showtime. */
export const SMART_SAVE_CHOOSE_MAX = 3;

/**
 * @param {object[]} opportunities
 * @returns {{
 *   mode: 'none' | 'direct-add' | 'choose-showtime',
 *   opportunities: object[],
 *   opportunity: object | null,
 * }}
 */
export function evaluateSmartSaveHandoffMode(opportunities) {
  const list = Array.isArray(opportunities) ? opportunities : [];
  const count = list.length;
  if (count <= 0 || count > SMART_SAVE_CHOOSE_MAX) {
    return {
      mode: SMART_SAVE_HANDOFF_MODE.none,
      opportunities: [],
      opportunity: null,
    };
  }
  if (count === 1) {
    return {
      mode: SMART_SAVE_HANDOFF_MODE.directAdd,
      opportunities: list,
      opportunity: list[0],
    };
  }
  return {
    mode: SMART_SAVE_HANDOFF_MODE.chooseShowtime,
    opportunities: list,
    opportunity: null,
  };
}

/**
 * Resolve catalog filmKey for a saved filmRef (same as Planner Saved Films).
 *
 * @param {object | null | undefined} homeData
 * @param {object | null | undefined} filmRef
 * @returns {{ filmKey: string, film: object } | null}
 */
export function resolveSmartSaveFilmContext(homeData, filmRef) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return null;
  const index = buildHomeFilmIdentityIndex(homeData);
  const film = resolveHomeFilmForPreferenceRef(normalized, index);
  const filmKey =
    (typeof film?.filmKey === 'string' && film.filmKey.trim()) ||
    (typeof normalized.showtimeFilmKey === 'string' &&
      normalized.showtimeFilmKey.trim()) ||
    null;
  if (!filmKey || !film) return null;
  return { filmKey, film };
}

/**
 * Qualifying future performances not already in Planner (exact performance key).
 *
 * @param {{
 *   homeData?: object | null,
 *   filmKey: string,
 *   film: object,
 *   storage?: Storage | null,
 *   enrichmentIndex?: object | null,
 *   now?: Date,
 * }} params
 */
export function listSmartSaveEligiblePerformances({
  homeData = null,
  filmKey,
  film,
  storage = null,
  enrichmentIndex = null,
  now = new Date(),
} = {}) {
  const all = listQualifyingFutureOpportunitiesForFilm(homeData, filmKey, now);
  if (!all.length) return [];
  const planned = listPlannedPerformanceKeys(storage);
  if (planned.size === 0) return all;
  return all.filter((opp) => {
    const key = buildPerformanceKeyForOpportunity(
      opp,
      film,
      enrichmentIndex,
      homeData,
    );
    return !key || !planned.has(key);
  });
}

/**
 * Full evaluation for a save transition.
 *
 * @param {{
 *   homeData?: object | null,
 *   filmRef?: object | null,
 *   storage?: Storage | null,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 *   now?: Date,
 *   dismissed?: boolean,
 * }} params
 */
export function evaluateSmartSaveHandoff({
  homeData = null,
  filmRef = null,
  storage = null,
  enrichmentIndex = null,
  timeFormatId = '12h',
  now = new Date(),
  dismissed = false,
} = {}) {
  if (dismissed) {
    return {
      mode: SMART_SAVE_HANDOFF_MODE.none,
      reason: 'dismissed',
      filmKey: null,
      film: null,
      filmRef: normalizeSavedFilmRef(filmRef),
      opportunities: [],
      opportunity: null,
      rowLabel: null,
      title: null,
    };
  }

  const ctx = resolveSmartSaveFilmContext(homeData, filmRef);
  if (!ctx) {
    return {
      mode: SMART_SAVE_HANDOFF_MODE.none,
      reason: 'unresolved_film',
      filmKey: null,
      film: null,
      filmRef: normalizeSavedFilmRef(filmRef),
      opportunities: [],
      opportunity: null,
      rowLabel: null,
      title: null,
    };
  }

  const opportunities = listSmartSaveEligiblePerformances({
    homeData,
    filmKey: ctx.filmKey,
    film: ctx.film,
    storage,
    enrichmentIndex,
    now,
  });
  const evaluated = evaluateSmartSaveHandoffMode(opportunities);
  const opportunity = evaluated.opportunity;
  const rowLabel = opportunity
    ? formatSavedFilmNextShowtimeLine(opportunity, timeFormatId)
    : null;
  const title =
    typeof ctx.film.title === 'string' && ctx.film.title.trim()
      ? ctx.film.title.trim()
      : 'This film';

  return {
    mode: evaluated.mode,
    reason:
      evaluated.mode === SMART_SAVE_HANDOFF_MODE.none
        ? opportunities.length === 0
          ? 'no_eligible_showtimes'
          : 'too_many_showtimes'
        : evaluated.mode,
    filmKey: ctx.filmKey,
    film: ctx.film,
    filmRef: normalizeSavedFilmRef(filmRef),
    opportunities: evaluated.opportunities,
    opportunity,
    rowLabel,
    title,
  };
}
