/**
 * Saved Films to Plan queue — actionable saved films not yet scheduled.
 */

import {
  normalizeSavedFilmRef,
  savedFilmRefsEqual,
} from '../stores/savedFilmsStore.js';
import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';
import { partitionAcceptedPlans } from './planLifecycle.js';

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance} perf
 */
export function performanceToSavedFilmRef(perf) {
  if (!perf || typeof perf !== 'object') return null;
  /** @type {import('../stores/savedFilmsStore.js').SavedFilmRefInput} */
  const input = {
    filmId: perf.filmId,
    showtimeFilmKey: perf.filmKey,
  };
  if (perf.parentFilmKey) {
    input.aliasKeys = [perf.parentFilmKey];
  }
  return normalizeSavedFilmRef(input);
}

/**
 * Whether a saved film already has any future screening in Planner (film-level).
 *
 * @param {import('../stores/savedFilmsStore.js').SavedFilmRefInput | string | null | undefined} filmRef
 * @param {Storage | null | undefined} storage
 * @param {Date} [now]
 */
export function savedFilmRefHasFuturePlannedScreening(
  filmRef,
  storage,
  now = new Date(),
) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return false;
  const { upcoming } = partitionAcceptedPlans(getAcceptedPlans(storage), now);
  for (const plan of upcoming) {
    for (const perf of plan.performances ?? []) {
      const perfRef = performanceToSavedFilmRef(perf);
      if (perfRef && savedFilmRefsEqual(normalized, perfRef)) {
        return true;
      }
    }
  }
  return false;
}
