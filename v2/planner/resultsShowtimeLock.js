/**
 * Results-side lock helpers — reuse Build-a-Plan lock path (RESULT-03).
 */

import {
  addLockedShowtimeToForm,
  removeLockedShowtimeFromForm,
} from './buildPlanPerformanceCatalog.js';
import { normalizeLockedShowtime } from './lockedShowtimes.js';

/**
 * Overlay Exact-screening copy from staged checked state (checked = locked).
 * @param {boolean} locked
 */
export function exactScreeningLockCopy(locked) {
  if (locked) {
    return {
      label: 'Unlock this showtime',
      support: 'Allow the planner to choose another screening.',
    };
  }
  return {
    label: 'Lock this showtime',
    support: 'Keep this exact screening in every regenerated plan.',
  };
}

/**
 * Exact performance lock check (performanceKey only — never film id).
 * @param {object | null | undefined} form
 * @param {object | null | undefined} film
 */
export function isResultsFilmPerformanceLocked(form, film) {
  const key =
    typeof film?.performanceKey === 'string'
      ? film.performanceKey.trim()
      : '';
  if (!key) return false;
  return (form?.lockedShowtimes ?? []).some(
    (lock) => lock?.performanceKey === key,
  );
}

/**
 * Apply staged lock intent using the Build-a-Plan lock helpers.
 * @param {object} form
 * @param {object} film
 * @param {boolean} wantLocked
 */
export function applyShowtimeLockToForm(form, film, wantLocked) {
  const key =
    typeof film?.performanceKey === 'string'
      ? film.performanceKey.trim()
      : '';
  if (!key) return form;
  const currentlyLocked = isResultsFilmPerformanceLocked(form, film);
  if (wantLocked === currentlyLocked) return form;
  if (wantLocked) {
    const payload = normalizeLockedShowtime(film) ?? film;
    return addLockedShowtimeToForm(form, payload).form;
  }
  return removeLockedShowtimeFromForm(form, key);
}
